import { useState, useEffect, useCallback, useRef } from 'react';
import { PowerMetrics, ArduinoRawData } from '../types';

interface ConnectionState {
  isConnected: boolean;
  method: 'websocket' | 'polling' | 'none';
  lastMessageTime: number | null;
}

export function usePowerSimulation() {
  // Estado de métricas
  const [metrics, setMetrics] = useState<PowerMetrics>({
    vpin: 0.122,
    vreal: 0.536,
    soc: 4,
    voltage: 0.536,
    current: 0.044,
    powerIn: 0.024,
    powerOut: 0,
    temp: 25.0,
    health: 75,
    cycles: 0,
    timestamp: new Date().toLocaleTimeString(),
  });

  // Estado del historial
  const [history, setHistory] = useState<PowerMetrics[]>([]);

  // Estado de conexión
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    method: 'none',
    lastMessageTime: null,
  });

  // Referencias
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageTimeRef = useRef<number>(Date.now());
  const maxReconnectAttempts = 5;
  const connectionTimeoutMs = 5000; // Timeout para considerar desconectado

  // ============ PARSING ============

  /**
   * Parsea datos crudos del Arduino
   * Formato esperado: "Vpin: 0.122 V | Vreal: 0.536 V | %: 4"
   */
  const parseArduinoData = useCallback((rawData: string): ArduinoRawData | null => {
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
  }, []);

  // ============ PROCESAMIENTO ============

  /**
   * Calcula los campos derivados a partir de datos del Arduino
   * Fórmulas:
   * - Corriente: I = Vreal / R_carga (asumiendo carga de ~12Ω)
   * - Potencia: P = Vreal * I (en watts)
   * - Salud: Basado en SOC y voltaje
   */
  const calculateDerivedMetrics = useCallback((arduinoData: ArduinoRawData): PowerMetrics => {
    // Constantes del sistema
    const NOMINAL_VOLTAGE = 12.6; // Voltaje nominal del LiPo 3S
    const MIN_VOLTAGE = 9.0; // Voltaje mínimo seguro
    const ASSUMED_LOAD_RESISTANCE = 12; // Ohms asumido

    // Calcular corriente aproximada (I = V/R)
    const approximateCurrent = arduinoData.vreal > 0.1 
      ? (arduinoData.vreal / ASSUMED_LOAD_RESISTANCE) 
      : 0;

    // Calcular potencia en watts (P = V * I)
    const powerInWatts = arduinoData.vreal * approximateCurrent;

    // Calcular salud de la batería
    let health = 100;
    if (arduinoData.soc < 20) {
      health = 70 + (arduinoData.soc / 20) * 30; // 70-100% cuando SOC 0-20%
    } else if (arduinoData.soc < 50) {
      health = 85;
    } else if (arduinoData.soc >= 80) {
      health = 100;
    } else {
      health = 90;
    }

    // Si voltaje es muy bajo, considerar batería dañada
    if (arduinoData.vreal < MIN_VOLTAGE) {
      health = Math.max(40, health - 30);
    }

    return {
      // Datos directos del Arduino
      vpin: arduinoData.vpin,
      vreal: arduinoData.vreal,
      soc: arduinoData.soc,

      // Datos derivados
      voltage: arduinoData.vreal, // Mismo que vreal
      current: approximateCurrent,
      powerIn: powerInWatts,
      powerOut: 0, // No disponible desde Arduino simple
      health: health,

      // Datos por defecto/placeholders
      temp: 25.0, // TODO: Agregar sensor DHT22 al Arduino
      cycles: 0, // TODO: Almacenar en EEPROM del Arduino

      // Metadata
      timestamp: new Date().toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };
  }, []);

  /**
   * Procesa datos del Arduino y actualiza el estado
   */
  const processArduinoData = useCallback((arduinoData: ArduinoRawData) => {
    lastMessageTimeRef.current = Date.now();

    const newMetric = calculateDerivedMetrics(arduinoData);

    setMetrics(newMetric);
    setHistory(h => [...h.slice(-299), newMetric]); // Mantener últimos 5 minutos @ 1Hz

    setConnectionState(prev => ({
      ...prev,
      isConnected: true,
      lastMessageTime: Date.now(),
    }));
  }, [calculateDerivedMetrics]);

  // ============ CONEXIÓN WEBSOCKET ============

  const connectWebSocket = useCallback(() => {
    // No reconectar si ya estamos conectados
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:4000';
      console.log(`🔌 Intentando conectar a WebSocket: ${wsUrl}`);

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('✅ WebSocket conectado');
        reconnectAttemptsRef.current = 0;

        setConnectionState(prev => ({
          ...prev,
          isConnected: true,
          method: 'websocket',
        }));

        // Enviar mensaje de identificación (opcional)
        ws.send(JSON.stringify({ type: 'identify', client: 'pbt-dashboard' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Caso 1: Datos parseados del backend
          if (data.vpin !== undefined && data.vreal !== undefined && data.soc !== undefined) {
            processArduinoData(data);
          }
          // Caso 2: Datos crudos del Arduino (string)
          else if (data.raw && typeof data.raw === 'string') {
            const parsed = parseArduinoData(data.raw);
            if (parsed) {
              processArduinoData(parsed);
            }
          }
          // Caso 3: Mensaje tipo measurement
          else if (data.type === 'measurement' && data.data) {
            const { vpin, vreal, soc } = data.data;
            if (vpin !== undefined && vreal !== undefined && soc !== undefined) {
              processArduinoData({ vpin, vreal, soc });
            }
          }
        } catch (error) {
          console.error('❌ Error procesando mensaje WebSocket:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ Error WebSocket:', error);
        setConnectionState(prev => ({
          ...prev,
          isConnected: false,
        }));
      };

      ws.onclose = () => {
        console.log('⚠️ WebSocket desconectado');
        wsRef.current = null;

        setConnectionState(prev => ({
          ...prev,
          isConnected: false,
          method: 'none',
        }));

        // Intentar reconectar con backoff exponencial
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          console.log(`🔄 Reconexión en ${delay}ms (intento ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          setTimeout(connectWebSocket, delay);
        } else {
          console.log('⚠️ Máximo de intentos de reconexión alcanzado. Usando HTTP polling...');
          startHttpPolling();
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('❌ Error conectando WebSocket:', error);
      setConnectionState(prev => ({
        ...prev,
        isConnected: false,
      }));
    }
  }, [parseArduinoData, processArduinoData]);

  // ============ HTTP POLLING (FALLBACK) ============

  const startHttpPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    console.log('📡 Iniciando HTTP polling cada 200ms');

    pollIntervalRef.current = setInterval(async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
        const response = await fetch(`${apiUrl}/mediciones/latest`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data && data.vpin !== undefined && data.vreal !== undefined) {
          processArduinoData({
            vpin: data.vpin,
            vreal: data.vreal,
            soc: data.soc,
          });

          // Actualizar estado si no estaba conectado
          setConnectionState(prev => ({
            ...prev,
            isConnected: true,
            method: 'polling',
          }));
        }
      } catch (error) {
        console.warn('⚠️ HTTP polling error:', error);

        // Marcar como desconectado si no hay respuesta
        if (Date.now() - lastMessageTimeRef.current > connectionTimeoutMs) {
          setConnectionState(prev => ({
            ...prev,
            isConnected: false,
          }));
        }
      }
    }, 200); // Cada 200ms como en el Arduino
  }, [processArduinoData]);

  // ============ CICLO DE VIDA ============

  useEffect(() => {
    console.log('🚀 Inicializando usePowerSimulation...');

    // Intentar WebSocket primero
    connectWebSocket();

    // Fallback a HTTP polling después de 3 segundos
    const httpFallbackTimer = setTimeout(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        console.log('⚠️ WebSocket no disponible después de 3s, iniciando HTTP polling...');
        startHttpPolling();
      }
    }, 3000);

    // Limpiar en desmontaje
    return () => {
      clearTimeout(httpFallbackTimer);

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [connectWebSocket, startHttpPolling]);

  // Monitorear timeout de conexión
  useEffect(() => {
    const timeoutCheck = setInterval(() => {
      if (connectionState.isConnected && Date.now() - lastMessageTimeRef.current > connectionTimeoutMs) {
        console.warn('⚠️ Timeout: No hay datos desde hace 5 segundos');
        setConnectionState(prev => ({
          ...prev,
          isConnected: false,
        }));
      }
    }, 1000);

    return () => clearInterval(timeoutCheck);
  }, [connectionState.isConnected]);

  return {
    metrics,
    history,
    isConnected: connectionState.isConnected,
    connectionMethod: connectionState.method,
    lastMessageTime: connectionState.lastMessageTime,
  };
}
