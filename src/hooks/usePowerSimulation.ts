import { useState, useEffect, useCallback, useRef } from 'react';
import { PowerMetrics } from '../types';

interface ArduinoData {
  vpin: number;      // Voltaje del pin ADC (V)
  vreal: number;     // Voltaje real (V)
  soc: number;       // State of Charge (%)
}

export function usePowerSimulation() {
  const [metrics, setMetrics] = useState<PowerMetrics>({
    soc: 4,
    powerIn: 0.536,
    powerOut: 0,
    temp: 25.0,
    voltage: 0.536,
    current: 0,
    health: 100,
    cycles: 0,
    timestamp: new Date().toLocaleTimeString(),
  });

  const [history, setHistory] = useState<PowerMetrics[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  // Parsear datos del Arduino
  const parseArduinoData = useCallback((rawData: string): ArduinoData | null => {
    try {
      // Formato esperado: "Vpin: 0.122 V | Vreal: 0.536 V | %: 4"
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
      return null;
    } catch (error) {
      console.error('Error parsing Arduino data:', error);
      return null;
    }
  }, []);

  // Procesar datos del Arduino y mapear a PowerMetrics
  const processArduinoData = useCallback((arduinoData: ArduinoData) => {
    setMetrics(prev => {
      // Calcular corriente aproximada basada en Vreal y resistencia conocida
      // Vreal = Vbat, si asumimos una carga aproximada
      const approximateCurrent = arduinoData.vreal > 0 ? (arduinoData.vreal / 12) * 100 : 0;

      const newMetric: PowerMetrics = {
        soc: arduinoData.soc,
        powerIn: arduinoData.vreal, // Mapear Vreal al powerIn (en V, luego convertir si es necesario)
        powerOut: 0, // No disponible desde Arduino, podrá ser actualizado después
        temp: 25.0, // Placeholder - agregar sensor DHT22 si es necesario
        voltage: arduinoData.vreal,
        current: approximateCurrent,
        health: arduinoData.soc >= 80 ? 100 : Math.max(70, 100 - (100 - arduinoData.soc) / 2),
        cycles: prev.cycles, // Mantener ciclos anteriores
        timestamp: new Date().toLocaleTimeString(),
      };

      setHistory(h => [...h.slice(-60), newMetric]); // Mantener último 1 minuto (60 datos @ 1Hz)
      return newMetric;
    });
  }, []);

  // Conectar a WebSocket del Backend
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:4000';
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('✅ Conectado al backend (WebSocket)');
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Si recibimos datos parseados del backend
          if (data.vpin !== undefined && data.vreal !== undefined) {
            processArduinoData(data);
          } 
          // Si recibimos datos crudos (string)
          else if (data.raw) {
            const parsed = parseArduinoData(data.raw);
            if (parsed) {
              processArduinoData(parsed);
            }
          }
        } catch (error) {
          console.error('Error procesando mensaje WebSocket:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ Error WebSocket:', error);
      };

      ws.onclose = () => {
        console.log('⚠️ Desconectado del backend');
        wsRef.current = null;
        
        // Reconectar automáticamente
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          console.log(`🔄 Intentando reconectar en ${delay}ms...`);
          setTimeout(connectWebSocket, delay);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Error conectando WebSocket:', error);
    }
  }, [parseArduinoData, processArduinoData]);

  // Fallback a HTTP polling si WebSocket no está disponible
  const startHttpPolling = useCallback(() => {
    const pollInterval = setInterval(async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
        const response = await fetch(`${apiUrl}/mediciones/latest`);
        
        if (!response.ok) throw new Error('Failed to fetch data');
        
        const data = await response.json();
        
        if (data && data.vpin !== undefined) {
          processArduinoData({
            vpin: data.vpin,
            vreal: data.vreal,
            soc: data.soc,
          });
        }
      } catch (error) {
        console.warn('HTTP polling error:', error);
      }
    }, 200); // Cada 200ms como en Arduino

    return () => clearInterval(pollInterval);
  }, [processArduinoData]);

  useEffect(() => {
    // Intentar WebSocket primero
    connectWebSocket();

    // Fallback a HTTP polling después de 2 segundos
    const httpFallbackTimer = setTimeout(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        console.log('⚠️ WebSocket no disponible, usando HTTP polling...');
        return startHttpPolling();
      }
    }, 2000);

    return () => {
      clearTimeout(httpFallbackTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket, startHttpPolling]);

  return { metrics, history };
}
