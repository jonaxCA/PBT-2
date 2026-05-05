import express from 'express';
import pool from '../db.js';

const router = express.Router();

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
      const data = {
        vpin: parseFloat(vpinMatch[1]),
        vreal: parseFloat(vrealMatch[1]),
        soc: parseInt(socMatch[1], 10),
      };
      if (tempMatch) data.temp = parseFloat(tempMatch[1]);
      return { success: true, data };
    }

    return {
      success: false,
      error: 'Formato no reconocido. Esperado: "Vpin: X.XXX V | Vreal: X.XXX V | %: XX | Temp: XX.XX C"',
    };
  } catch (error) {
    return {
      success: false,
      error: `Error parseando datos: ${error.message}`,
    };
  }
}

/**
 * Mapeo: Arduino Data → Database Fields
 * Conversiones:
 *   - vpin → voltaje (después del divisor)
 *   - vreal → voltaje (voltaje real de la batería)
 *   - soc → nivel_bateria (porcentaje)
 *   - Corriente, temperatura → calculadas o por defecto
 */
function mapArduinoToDatabase(arduinoData, additionalData = {}) {
  const ASSUMED_LOAD_RESISTANCE = 12; // Ohms

  // Calcular corriente basada en Vreal/R
  const corriente = arduinoData.vreal > 0.1
    ? (arduinoData.vreal / ASSUMED_LOAD_RESISTANCE)
    : 0;

  // Prioridad para la temperatura:
  // 1) la que el Arduino reportó dentro del frame BLE (LM35)
  // 2) la que venga en additionalData (override manual del cliente)
  // 3) fallback 25.0°C si no hay ninguna
  let temperatura;
  if (typeof arduinoData.temp === 'number') {
    temperatura = arduinoData.temp;
  } else if (additionalData.temperatura !== undefined && additionalData.temperatura !== null) {
    temperatura = parseFloat(additionalData.temperatura);
  } else {
    temperatura = 25.0;
  }

  return {
    voltaje: parseFloat(arduinoData.vreal).toFixed(4),
    corriente: parseFloat(corriente).toFixed(4),
    temperatura: parseFloat(temperatura).toFixed(2),
    nivel_bateria: parseInt(arduinoData.soc),
  };
}

/**
 * Validar datos antes de guardar
 */
function validateMeasurement(data) {
  const errors = [];

  if (typeof data.voltaje !== 'number' || data.voltaje < 0 || data.voltaje > 60) {
    errors.push('Voltaje inválido (debe estar entre 0-60V)');
  }

  if (typeof data.corriente !== 'number' || data.corriente < 0 || data.corriente > 100) {
    errors.push('Corriente inválida (debe estar entre 0-100A)');
  }

  if (typeof data.temperatura !== 'number' || data.temperatura < -40 || data.temperatura > 80) {
    errors.push('Temperatura inválida (debe estar entre -40 a 80°C)');
  }

  if (typeof data.nivel_bateria !== 'number' || data.nivel_bateria < 0 || data.nivel_bateria > 100) {
    errors.push('Nivel de batería inválido (debe estar entre 0-100%)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============ RUTAS ============

/**
 * POST /mediciones
 * Guardar nueva medición
 * 
 * Body esperado:
 * {
 *   "dispositivo_id": 1,
 *   "voltaje": 0.536,
 *   "corriente": 0.044,
 *   "temperatura": 25.0,
 *   "nivel_bateria": 4
 * }
 * 
 * O si viene del Arduino (formato string):
 * {
 *   "dispositivo_id": 1,
 *   "raw_arduino_data": "Vpin: 0.122 V | Vreal: 0.536 V | %: 4",
 *   "temperatura": 25.0
 * }
 */
router.post('/mediciones', async (req, res) => {
  try {
    const { dispositivo_id = 1, raw_arduino_data, voltaje, corriente, temperatura, nivel_bateria } = req.body;

    let measurement;

    // ✅ CASO 1: Datos crudos del Arduino (string)
    if (raw_arduino_data && typeof raw_arduino_data === 'string') {
      console.log('📡 Procesando datos crudos del Arduino:', raw_arduino_data);

      const parseResult = parseArduinoData(raw_arduino_data);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Error parseando datos del Arduino',
          details: parseResult.error,
        });
      }

      measurement = mapArduinoToDatabase(parseResult.data, { temperatura });
    }
    // ✅ CASO 2: Datos procesados (ya vienen parseados)
    else if (voltaje !== undefined && corriente !== undefined && nivel_bateria !== undefined) {
      console.log('📊 Procesando datos procesados:', { voltaje, corriente, temperatura, nivel_bateria });

      measurement = {
        voltaje: parseFloat(voltaje).toFixed(4),
        corriente: parseFloat(corriente).toFixed(4),
        temperatura: parseFloat(temperatura || 25.0).toFixed(2),
        nivel_bateria: parseInt(nivel_bateria),
      };
    } else {
      return res.status(400).json({
        error: 'Datos inválidos',
        message: 'Proporciona: raw_arduino_data O (voltaje, corriente, temperatura, nivel_bateria)',
      });
    }

    // Validar datos
    const validation = validateMeasurement({
      voltaje: parseFloat(measurement.voltaje),
      corriente: parseFloat(measurement.corriente),
      temperatura: parseFloat(measurement.temperatura),
      nivel_bateria: measurement.nivel_bateria,
    });

    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validación fallida',
        details: validation.errors,
      });
    }

    // ✅ Insertar en base de datos
    const query = `
      INSERT INTO mediciones 
        (dispositivo_id, voltaje, corriente, temperatura, nivel_bateria)
      VALUES 
        ($1, $2, $3, $4, $5)
      RETURNING id, dispositivo_id, voltaje, corriente, temperatura, nivel_bateria, timestamp
    `;

    const values = [
      dispositivo_id,
      measurement.voltaje,
      measurement.corriente,
      measurement.temperatura,
      measurement.nivel_bateria,
    ];

    const result = await pool.query(query, values);
    const saved = result.rows[0];

    console.log(`✅ Medición guardada (ID: ${saved.id}) para dispositivo ${dispositivo_id}`);

    res.status(201).json({
      success: true,
      message: 'Medición guardada exitosamente',
      data: {
        id: saved.id,
        dispositivo_id: saved.dispositivo_id,
        voltaje: parseFloat(saved.voltaje),
        corriente: parseFloat(saved.corriente),
        temperatura: parseFloat(saved.temperatura),
        nivel_bateria: saved.nivel_bateria,
        timestamp: saved.timestamp,
      },
    });
  } catch (error) {
    console.error('❌ Error en POST /mediciones:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * GET /mediciones
 * Obtener historial de mediciones
 * 
 * Query parameters:
 *   - dispositivo_id: ID del dispositivo (default: 1)
 *   - limit: Número máximo de resultados (default: 50, max: 1000)
 *   - offset: Saltar N registros para paginación (default: 0)
 * 
 * Ejemplos:
 *   GET /mediciones
 *   GET /mediciones?dispositivo_id=1&limit=100
 *   GET /mediciones?dispositivo_id=1&limit=50&offset=50
 */
router.get('/mediciones', async (req, res) => {
  try {
    const dispositivo_id = parseInt(req.query.dispositivo_id) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 1000); // Max 1000
    const offset = parseInt(req.query.offset) || 0;

    // ✅ Obtener mediciones del dispositivo ordenadas por timestamp DESC
    const query = `
      SELECT 
        id,
        dispositivo_id,
        voltaje,
        corriente,
        temperatura,
        nivel_bateria,
        timestamp
      FROM mediciones
      WHERE dispositivo_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
      OFFSET $3
    `;

    const result = await pool.query(query, [dispositivo_id, limit, offset]);

    // También obtener el total de registros (para paginación)
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM mediciones WHERE dispositivo_id = $1',
      [dispositivo_id]
    );

    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      pagination: {
        total,
        count: result.rows.length,
        limit,
        offset,
        hasMore: offset + result.rows.length < total,
      },
      data: result.rows.map(row => ({
        id: row.id,
        dispositivo_id: row.dispositivo_id,
        voltaje: parseFloat(row.voltaje),
        corriente: parseFloat(row.corriente),
        temperatura: parseFloat(row.temperatura),
        nivel_bateria: row.nivel_bateria,
        timestamp: row.timestamp,
      })),
    });
  } catch (error) {
    console.error('❌ Error en GET /mediciones:', error);
    res.status(500).json({
      error: 'Error obteniendo mediciones',
      message: error.message,
    });
  }
});

/**
 * GET /mediciones/latest
 * Obtener la última medición de un dispositivo
 * 
 * Query parameters:
 *   - dispositivo_id: ID del dispositivo (default: 1)
 */
router.get('/mediciones/latest', async (req, res) => {
  try {
    const dispositivo_id = parseInt(req.query.dispositivo_id) || 1;

    const query = `
      SELECT 
        id,
        dispositivo_id,
        voltaje,
        corriente,
        temperatura,
        nivel_bateria,
        timestamp
      FROM mediciones
      WHERE dispositivo_id = $1
      ORDER BY timestamp DESC
      LIMIT 1
    `;

    const result = await pool.query(query, [dispositivo_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No hay mediciones para este dispositivo',
        data: null,
      });
    }

    const row = result.rows[0];

    res.json({
      success: true,
      data: {
        id: row.id,
        dispositivo_id: row.dispositivo_id,
        voltaje: parseFloat(row.voltaje),
        corriente: parseFloat(row.corriente),
        temperatura: parseFloat(row.temperatura),
        nivel_bateria: row.nivel_bateria,
        vpin: 0.122, // TODO: Guardar este valor en la BD
        vreal: parseFloat(row.voltaje),
        soc: row.nivel_bateria,
        timestamp: new Date(row.timestamp).toLocaleTimeString('es-ES'),
      },
    });
  } catch (error) {
    console.error('❌ Error en GET /mediciones/latest:', error);
    res.status(500).json({
      error: 'Error obteniendo última medición',
      message: error.message,
    });
  }
});

/**
 * GET /mediciones/estadisticas
 * Obtener estadísticas de un dispositivo
 * 
 * Query parameters:
 *   - dispositivo_id: ID del dispositivo (default: 1)
 *   - horas: Últimas N horas a considerar (default: 24)
 */
router.get('/mediciones/estadisticas', async (req, res) => {
  try {
    const dispositivo_id = parseInt(req.query.dispositivo_id) || 1;
    const horas = parseInt(req.query.horas) || 24;

    const query = `
      SELECT 
        COUNT(*) as total_mediciones,
        AVG(voltaje)::numeric(10,4) as voltaje_promedio,
        MAX(voltaje)::numeric(10,4) as voltaje_maximo,
        MIN(voltaje)::numeric(10,4) as voltaje_minimo,
        AVG(corriente)::numeric(10,4) as corriente_promedio,
        MAX(corriente)::numeric(10,4) as corriente_maxima,
        AVG(temperatura)::numeric(10,2) as temperatura_promedio,
        MAX(temperatura)::numeric(10,2) as temperatura_maxima,
        MIN(temperatura)::numeric(10,2) as temperatura_minima,
        AVG(nivel_bateria)::numeric(10,2) as bateria_promedio,
        MAX(nivel_bateria) as bateria_maxima,
        MIN(nivel_bateria) as bateria_minima
      FROM mediciones
      WHERE dispositivo_id = $1
      AND timestamp > NOW() - INTERVAL '1 hour' * $2
    `;

    const result = await pool.query(query, [dispositivo_id, horas]);

    res.json({
      success: true,
      periodo: `${horas} horas`,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('❌ Error en GET /mediciones/estadisticas:', error);
    res.status(500).json({
      error: 'Error obteniendo estadísticas',
      message: error.message,
    });
  }
});

// ============ POST /mediciones/raw ============
// Recibe el string crudo del Arduino enviado desde el frontend via Web Bluetooth.
// El celular actúa como puente: lee BT y hace POST aquí.
// Esto permite que el dato persista en BD y llegue via WebSocket a otros clientes.
router.post('/mediciones/raw', async (req, res) => {
  const { rawData } = req.body;

  if (!rawData || typeof rawData !== 'string') {
    return res.status(400).json({ error: 'Se requiere el campo rawData (string)' });
  }

  const parsed = parseArduinoData(rawData);
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error });
  }

  try {
    const dbData = mapArduinoToDatabase(parsed.data);

    const result = await pool.query(
      `INSERT INTO mediciones (dispositivo_id, voltaje, corriente, temperatura, nivel_bateria)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, timestamp`,
      [
        dbData.dispositivo_id,
        dbData.voltaje,
        dbData.corriente,
        dbData.temperatura,
        dbData.nivel_bateria,
      ]
    );

    const saved = result.rows[0];

    res.status(201).json({
      success: true,
      id: saved.id,
      timestamp: saved.timestamp,
      parsed: parsed.data,
    });
  } catch (error) {
    console.error('❌ Error en POST /mediciones/raw:', error);
    res.status(500).json({ error: 'Error guardando medición', message: error.message });
  }
});

export default router;
