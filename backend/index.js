import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import pool from './db.js';
import medicionesRouter from './routes/mediciones.js';

dotenv.config();

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

// ============ VARIABLES GLOBALES ============
const DEVICE_ID_DEFAULT = 1;

// ============ FUNCIONES AUXILIARES ============

/**
 * Parsea datos crudos del Arduino
 * Formato esperado: "Vpin: 0.122 V | Vreal: 0.536 V | %: 4 | Temp: 24.50 C"
 * El campo Temp es opcional — sketches sin sensor pueden omitirlo.
 */
function parseArduinoData(rawData) {
  try {
    const vpinMatch = rawData.match(/Vpin:\s*([\d.]+)\s*V/);
    const vrealMatch = rawData.match(/Vreal:\s*([\d.]+)\s*V/);
    const socMatch = rawData.match(/%:\s*(\d+)/);
    const tempMatch = rawData.match(/Temp:\s*(-?[\d.]+)\s*C/);

    if (vpinMatch && vrealMatch && socMatch) {
      const parsed = {
        vpin: parseFloat(vpinMatch[1]),
        vreal: parseFloat(vrealMatch[1]),
        soc: parseInt(socMatch[1], 10),
      };
      if (tempMatch) parsed.temp = parseFloat(tempMatch[1]);
      return parsed;
    }

    console.warn('⚠️ Formato de datos no reconocido:', rawData);
    return null;
  } catch (error) {
    console.error('❌ Error parsing Arduino data:', error);
    return null;
  }
}

/**
 * Calcula campos derivados a partir de datos del Arduino
 */
function calculateDerivedMetrics(arduinoData) {
  const ASSUMED_LOAD_RESISTANCE = 12; // Ohms

  const corriente = arduinoData.vreal > 0.1
    ? arduinoData.vreal / ASSUMED_LOAD_RESISTANCE
    : 0;

  return {
    voltaje: arduinoData.vreal,
    corriente,
    // Temperatura real del LM35 si vino en el frame; si no, fallback 25°C
    temperatura: typeof arduinoData.temp === 'number' ? arduinoData.temp : 25.0,
    nivel_bateria: arduinoData.soc,
    potencia: arduinoData.vreal * corriente,
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

  return { isValid: errors.length === 0, errors };
}

// ============ RUTAS PROPIAS DE ESTE SERVIDOR ============

// GET / - Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend PBT-2 corriendo ✅',
    timestamp: new Date().toISOString(),
  });
});

// GET /dispositivos - Listar dispositivos
app.get('/dispositivos', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nombre, tipo, capacidad_mah FROM dispositivos');
    res.json({ count: result.rows.length, data: result.rows });
  } catch (error) {
    console.error('❌ Error en GET /dispositivos:', error);
    res.status(500).json({ error: 'Error al obtener dispositivos', message: error.message });
  }
});

// POST /dispositivos - Crear dispositivo
app.post('/dispositivos', async (req, res) => {
  const { nombre, tipo, capacidad_mah, usuario_id } = req.body;

  try {
    if (!nombre || !tipo) {
      return res.status(400).json({ error: 'Nombre y tipo son requeridos' });
    }

    const result = await pool.query(
      `INSERT INTO dispositivos (nombre, tipo, capacidad_mah, usuario_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [nombre, tipo, capacidad_mah || null, usuario_id || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Error en POST /dispositivos:', error);
    res.status(500).json({ error: 'Error al crear dispositivo', message: error.message });
  }
});

// ============ ROUTERS ============
// Montado después de las rutas propias para que GET / no sea interceptado por el router
app.use('/', medicionesRouter);

// ============ WEBSOCKET (SOCKET.IO) ============

io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);

  socket.emit('conexion_establecida', {
    message: 'Conectado al servidor',
    timestamp: new Date().toISOString(),
  });

  // Cliente se suscribe a un dispositivo específico
  socket.on('subscribe_device', (deviceId) => {
    socket.join(`device_${deviceId}`);
    console.log(`Cliente ${socket.id} suscrito a dispositivo ${deviceId}`);
    socket.emit('subscribed', { deviceId, message: `Suscrito a dispositivo ${deviceId}` });
  });

  // Recibir datos del Arduino via WebSocket
  socket.on('arduino_data', (data) => {
    console.log('📡 Datos del Arduino recibidos via WebSocket:', data);

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

  socket.on('disconnect', () => {
    console.log(`🔌 Cliente desconectado: ${socket.id}`);
  });
});

/**
 * Guarda medición desde Arduino en BD y hace broadcast a todos los clientes
 */
async function handleArduinoData(arduinoData, derivedMetrics, socket) {
  try {
    const validation = validateMeasurement(derivedMetrics);
    if (!validation.isValid) {
      socket.emit('error', { message: 'Datos inválidos', details: validation.errors });
      return;
    }

    const result = await pool.query(
      `INSERT INTO mediciones (dispositivo_id, voltaje, corriente, temperatura, nivel_bateria)
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
    console.log(`✅ Medición guardada desde Arduino (ID: ${saved.id})`);

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
    socket.emit('error', { message: 'Error guardando medición', error: error.message });
  }
}

// ============ MANEJO DE ERRORES ============

app.use((err, req, res, next) => {
  console.error('❌ Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor', message: err.message });
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
  GET    /                        - Health check
  POST   /mediciones              - Guardar medición
  GET    /mediciones              - Obtener mediciones
  GET    /mediciones/latest       - Última medición
  GET    /mediciones/estadisticas - Estadísticas
  GET    /dispositivos            - Listar dispositivos
  POST   /dispositivos            - Crear dispositivo

WebSocket eventos:
  subscribe_device               - Suscribirse a dispositivo
  arduino_data                   - Enviar datos del Arduino
  nueva_medicion                 - Recibir nueva medición (broadcast)
  `);
});
