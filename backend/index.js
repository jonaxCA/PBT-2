import express from 'express';
import pkg from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

dotenv.config();

const { Pool } = pkg;
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// ============ MIDDLEWARE ============
app.use(cors());
app.use(express.json());

// ============ DATABASE CONNECTION ============
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Verificar conexión a BD
pool.on('connect', () => {
  console.log('✅ Pool de conexión establecido con PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Error en pool de PostgreSQL:', err);
});

// ============ VARIABLES GLOBALES ============
let connectedDevices = new Map(); // Rastrear dispositivos conectados
const DEVICE_ID_DEFAULT = 1; // ID del dispositivo "powerbank test"

// ============ FUNCIONES AUXILIARES ============

/**
 * Parsea datos crudos del Arduino
 * Formato esperado: "Vpin: 0.122 V | Vreal: 0.536 V | %: 4"
 */
function parseArduinoData(rawData) {
  try {
    const vpinMatch = rawData.match(/Vpin:\s*([\d.]+)\s*V/);
    const vrealMatch = rawData.match(/Vreal:\s*([\d.]+)\s*V/);
    const socMatch = rawData.match(/%:\s*(\d+)/);

    if (vpinMatch && vrealMatch && socMatch) {
      return {
        vpin: parseFloat(vpinMatch[1]),
        vreal: parseFloat(vrealMatch[1]),
        soc: parseInt(socMatch[1], 10),
      };
    }

    console.warn('⚠️ Formato de datos no reconocido:', rawData);
    return null;
  } catch (error) {
    console.error('❌ Error parsing Arduino data:', error);
    return null;
  }
}

/**
 * Calcula campos derivados
 */
function calculateDerivedMetrics(arduinoData) {
  const ASSUMED_LOAD_RESISTANCE = 12; // Ohms

  const corriente = arduinoData.vreal > 0.1 
    ? arduinoData.vreal / ASSUMED_LOAD_RESISTANCE 
    : 0;

  const potencia = arduinoData.vreal * corriente;

  return {
    voltaje: arduinoData.vreal,
    corriente: corriente,
    temperatura: 25.0, // Placeholder
    nivel_bateria: arduinoData.soc,
    potencia: potencia,
  };
}

/**
 * Valida datos antes de guardar en BD
 */
function validateMeasurement(data) {
  const errors = [];

  if (typeof data.voltaje !== 'number' || data.voltaje < 0 || data.voltaje > 60) {
    errors.push('Voltaje inválido (0-60V)');
  }

  if (typeof data.corriente !== 'number' || data.corriente < 0 || data.corriente > 100) {
    errors.push('Corriente inválida (0-100A)');
  }

  if (typeof data.temperatura !== 'number' || data.temperatura < -40 || data.temperatura > 80) {
    errors.push('Temperatura inválida (-40 a 80°C)');
  }

  if (typeof data.nivel_bateria !== 'number' || data.nivel_bateria < 0 || data.nivel_bateria > 100) {
    errors.push('Nivel de batería inválido (0-100%)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============ RUTAS PRINCIPALES ============

/**
 * GET / - Health check
 */
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend PBT-2 corriendo ✅',
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /mediciones - Guardar medición individual
 * Body: { dispositivo_id, voltaje, corriente, temperatura, nivel_bateria }
 */
app.post('/mediciones', async (req, res) => {
  const { dispositivo_id = DEVICE_ID_DEFAULT, voltaje, corriente, temperatura, nivel_bateria } = req.body;

  try {
    // Validar datos
    const validation = validateMeasurement({
      voltaje,
      corriente,
      temperatura,
      nivel_bateria,
    });

    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validación fallida',
        details: validation.errors,
      });
    }

    // Insertar en BD
    const result = await pool.query(
      `INSERT INTO mediciones 
       (dispositivo_id, voltaje, corriente, temperatura, nivel_bateria)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, timestamp`,
      [dispositivo_id, voltaje, corriente, temperatura, nivel_bateria]
    );

    const measurement = result.rows[0];

    console.log(`✅ Medición guardada (ID: ${measurement.id})`);

    // Emitir a clientes conectados via WebSocket
    io.emit('nueva_medicion', {
      id: measurement.id,
      dispositivo_id,
      voltaje,
      corriente,
      temperatura,
      nivel_bateria,
      timestamp: measurement.timestamp,
    });

    res.status(201).json({
      success: true,
      data: measurement,
    });
  } catch (error) {
    console.error('❌ Error en POST /mediciones:', error);
    res.status(500).json({
      error: 'Error al guardar medición',
      message: error.message,
    });
  }
});

/**
 * GET /mediciones - Obtener últimas mediciones
 * Query: ?limit=50&dispositivo_id=1
 */
app.get('/mediciones', async (req, res) => {
  const { limit = 50, dispositivo_id = DEVICE_ID_DEFAULT } = req.query;

  try {
    const result = await pool.query(
      `SELECT * FROM mediciones 
       WHERE dispositivo_id = $1
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [dispositivo_id, Math.min(parseInt(limit), 1000)]
    );

    res.json({
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error('❌ Error en GET /mediciones:', error);
    res.status(500).json({
      error: 'Error al obtener mediciones',
      message: error.message,
    });
  }
});

/**
 * GET /mediciones/latest - Obtener última medición
 * Query: ?dispositivo_id=1
 */
app.get('/mediciones/latest', async (req, res) => {
  const { dispositivo_id = DEVICE_ID_DEFAULT } = req.query;

  try {
    const result = await pool.query(
      `SELECT * FROM mediciones 
       WHERE dispositivo_id = $1
       ORDER BY timestamp DESC 
       LIMIT 1`,
      [dispositivo_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'No hay mediciones',
        data: null,
      });
    }

    const row = result.rows[0];

    // Transformar para compatibilidad con frontend
    res.json({
      vpin: 0.122, // Placeholder
      vreal: row.voltaje,
      soc: row.nivel_bateria,
      voltaje: row.voltaje,
      corriente: row.corriente,
      temperatura: row.temperatura,
      timestamp: new Date(row.timestamp).toLocaleTimeString('es-ES'),
    });
  } catch (error) {
    console.error('❌ Error en GET /mediciones/latest:', error);
    res.status(500).json({
      error: 'Error al obtener última medición',
      message: error.message,
    });
  }
});

/**
 * GET /dispositivos - Listar dispositivos
 */
app.get('/dispositivos', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nombre, tipo, capacidad_mah FROM dispositivos');

    res.json({
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error('❌ Error en GET /dispositivos:', error);
    res.status(500).json({
      error: 'Error al obtener dispositivos',
      message: error.message,
    });
  }
});

/**
 * POST /dispositivos - Crear dispositivo
 * Body: { nombre, tipo, capacidad_mah, usuario_id }
 */
app.post('/dispositivos', async (req, res) => {
  const { nombre, tipo, capacidad_mah, usuario_id } = req.body;

  try {
    if (!nombre || !tipo) {
      return res.status(400).json({
        error: 'Nombre y tipo son requeridos',
      });
    }

    const result = await pool.query(
      `INSERT INTO dispositivos (nombre, tipo, capacidad_mah, usuario_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [nombre, tipo, capacidad_mah || null, usuario_id || null]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('❌ Error en POST /dispositivos:', error);
    res.status(500).json({
      error: 'Error al crear dispositivo',
      message: error.message,
    });
  }
});

// ============ WEBSOCKET (SOCKET.IO) ============

io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);

  connectedDevices.set(socket.id, {
    id: socket.id,
    conectadoEn: new Date(),
  });

  // Enviar estado actual
  socket.emit('conexion_establecida', {
    message: 'Conectado al servidor',
    timestamp: new Date().toISOString(),
  });

  // Evento: Cliente entra a una sala de dispositivo
  socket.on('subscribe_device', (deviceId) => {
    socket.join(`device_${deviceId}`);
    console.log(`Cliente ${socket.id} suscrito a dispositivo ${deviceId}`);

    socket.emit('subscribed', {
      deviceId,
      message: `Suscrito a dispositivo ${deviceId}`,
    });
  });

  // Evento: Recibir datos del Arduino (via mensaje manual)
  socket.on('arduino_data', (data) => {
    console.log('📡 Datos del Arduino recibidos via WebSocket:', data);

    // Si es string, parsear
    if (typeof data === 'string') {
      const parsed = parseArduinoData(data);
      if (parsed) {
        const derived = calculateDerivedMetrics(parsed);
        handleArduinoData(parsed, derived, socket);
      }
    } else if (data.vreal !== undefined) {
      const derived = calculateDerivedMetrics(data);
      handleArduinoData(data, derived, socket);
    }
  });

  // Evento: Cliente desconectado
  socket.on('disconnect', () => {
    console.log(`🔌 Cliente desconectado: ${socket.id}`);
    connectedDevices.delete(socket.id);
  });
});

/**
 * Procesar datos del Arduino
 */
async function handleArduinoData(arduinoData, derivedMetrics, socket) {
  try {
    // Validar
    const validation = validateMeasurement(derivedMetrics);
    if (!validation.isValid) {
      socket.emit('error', {
        message: 'Datos inválidos',
        details: validation.errors,
      });
      return;
    }

    // Guardar en BD
    const result = await pool.query(
      `INSERT INTO mediciones 
       (dispositivo_id, voltaje, corriente, temperatura, nivel_bateria)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        DEVICE_ID_DEFAULT,
        derivedMetrics.voltaje,
        derivedMetrics.corriente,
        derivedMetrics.temperatura,
        derivedMetrics.nivel_bateria,
      ]
    );

    const saved = result.rows[0];

    console.log(`Medición guardada desde Arduino (${saved.id})`);

    // Emitir a todos los clientes conectados
    io.emit('nueva_medicion', {
      id: saved.id,
      vpin: arduinoData.vpin,
      vreal: arduinoData.vreal,
      soc: arduinoData.soc,
      voltaje: saved.voltaje,
      corriente: saved.corriente,
      temperatura: saved.temperatura,
      nivel_bateria: saved.nivel_bateria,
      timestamp: saved.timestamp,
    });
  } catch (error) {
    console.error('❌ Error procesando datos del Arduino:', error);
    socket.emit('error', {
      message: 'Error guardando medición',
      error: error.message,
    });
  }
}

// ============ MANEJO DE ERRORES ============

app.use((err, req, res, next) => {
  console.error('❌ Error no manejado:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: err.message,
  });
});

// ============ INICIAR SERVIDOR ============

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║         Backend PBT-2 Iniciado         ║
╚════════════════════════════════════════╝

📡 Servidor: http://localhost:${PORT}
🌐 WebSocket: ws://localhost:${PORT}
📊 Base de datos: ${process.env.DATABASE_URL ? '✅ Conectada' : '❌ No configurada'}

Endpoints disponibles:
  POST   /mediciones            - Guardar medición
  GET    /mediciones            - Obtener mediciones
  GET    /mediciones/latest     - Última medición
  GET    /dispositivos          - Listar dispositivos
  POST   /dispositivos          - Crear dispositivo

WebSocket eventos:
  subscribe_device             - Suscribirse a dispositivo
  arduino_data                 - Enviar datos del Arduino
  nueva_medicion              - Recibir nueva medición (broadcast)
  
`);
});
