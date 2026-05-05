import { useState, useEffect, useCallback, useRef } from 'react';
import { PowerMetrics, ArduinoRawData } from '../types';

interface ConnectionState {
  isConnected: boolean;
  method: 'websocket' | 'polling' | 'bluetooth' | 'none';
  lastMessageTime: number | null;
  bluetoothDevice: string | null;
}

export function usePowerSimulation() {
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

  const [history, setHistory] = useState<PowerMetrics[]>([]);

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    method: 'none',
    lastMessageTime: null,
    bluetoothDevice: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageTimeRef = useRef<number>(Date.now());
  const btCharRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const btDeviceRef = useRef<BluetoothDevice | null>(null);
  const maxReconnectAttempts = 5;
  const connectionTimeoutMs = 5000;

  // ============ PARSING ============

  const parseArduinoData = useCallback((rawData: string): ArduinoRawData | null => {
    try {
      const vpinMatch = rawData.match(/Vpin:\s*([\d.]+)\s*V/);
      const vrealMatch = rawData.match(/Vreal:\s*([\d.]+)\s*V/);
      const socMatch = rawData.match(/%:\s*(\d+)/);
      // Temp es opcional — el Arduino puede o no incluir el sensor LM35
      const tempMatch = rawData.match(/Temp:\s*(-?[\d.]+)\s*C/);

      if (vpinMatch && vrealMatch && socMatch) {
        const parsed: ArduinoRawData = {
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
  }, []);

  // ============ PROCESAMIENTO ============

  const calculateDerivedMetrics = useCallback((arduinoData: ArduinoRawData): PowerMetrics => {
    const MIN_VOLTAGE = 9.0;
    const ASSUMED_LOAD_RESISTANCE = 12;

    const approximateCurrent = arduinoData.vreal > 0.1
      ? arduinoData.vreal / ASSUMED_LOAD_RESISTANCE
      : 0;

    const powerInWatts = arduinoData.vreal * approximateCurrent;

    let health: number;
    if (arduinoData.soc >= 80) {
      health = 100;
    } else if (arduinoData.soc >= 50) {
      health = 90;
    } else if (arduinoData.soc >= 20) {
      health = 85;
    } else {
      health = 70 + (arduinoData.soc / 20) * 15;
    }

    if (arduinoData.vreal < MIN_VOLTAGE) {
      health = Math.max(40, health - 30);
    }

    return {
      vpin: arduinoData.vpin,
      vreal: arduinoData.vreal,
      soc: arduinoData.soc,
      voltage: arduinoData.vreal,
      current: approximateCurrent,
      powerIn: powerInWatts,
      powerOut: 0,
      health,
      // Si el Arduino reportó temperatura usamos esa; si no, fallback a 25°C
      temp: arduinoData.temp ?? 25.0,
      cycles: 0,
      timestamp: new Date().toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };
  }, []);

  const processArduinoData = useCallback((arduinoData: ArduinoRawData) => {
    lastMessageTimeRef.current = Date.now();
    const newMetric = calculateDerivedMetrics(arduinoData);
    setMetrics(newMetric);
    setHistory(h => [...h.slice(-299), newMetric]);
    setConnectionState(prev => ({
      ...prev,
      isConnected: true,
      lastMessageTime: Date.now(),
    }));
  }, [calculateDerivedMetrics]);

  // ============ CONEXIÓN WEBSOCKET ============

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:4000';
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setConnectionState(prev => ({ ...prev, isConnected: true, method: 'websocket' }));
        ws.send(JSON.stringify({ type: 'identify', client: 'pbt-dashboard' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.vpin !== undefined && data.vreal !== undefined && data.soc !== undefined) {
            processArduinoData(data);
          } else if (data.raw && typeof data.raw === 'string') {
            const parsed = parseArduinoData(data.raw);
            if (parsed) processArduinoData(parsed);
          } else if (data.type === 'measurement' && data.data) {
            const { vpin, vreal, soc } = data.data;
            if (vpin !== undefined) processArduinoData({ vpin, vreal, soc });
          }
        } catch (error) {
          console.error('❌ Error procesando mensaje WebSocket:', error);
        }
      };

      ws.onerror = () => {
        setConnectionState(prev => ({ ...prev, isConnected: false }));
      };

      ws.onclose = () => {
        wsRef.current = null;
        setConnectionState(prev => ({ ...prev, isConnected: false, method: 'none' }));

        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          setTimeout(connectWebSocket, delay);
        } else {
          startHttpPolling();
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('❌ Error conectando WebSocket:', error);
    }
  }, [parseArduinoData, processArduinoData]);

  // ============ HTTP POLLING (FALLBACK) ============

  const startHttpPolling = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
        const response = await fetch(`${apiUrl}/mediciones/latest`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (data?.vpin !== undefined && data?.vreal !== undefined) {
          processArduinoData({ vpin: data.vpin, vreal: data.vreal, soc: data.soc });
          setConnectionState(prev => ({ ...prev, isConnected: true, method: 'polling' }));
        }
      } catch {
        if (Date.now() - lastMessageTimeRef.current > connectionTimeoutMs) {
          setConnectionState(prev => ({ ...prev, isConnected: false }));
        }
      }
    }, 200);
  }, [processArduinoData]);

  // ============ BLUETOOTH (Web Bluetooth API) ============

  /**
   * Se conecta al ESP32 via Web Bluetooth (Nordic UART Service).
   * El ESP32 expone un servicio UART BLE con characteristic de notificación.
   * Cada notificación contiene una línea del formato "Vpin: X V | Vreal: X V | %: X"
   * Los datos se envían también al backend via POST /mediciones/raw para
   * persistirlos y que otros clientes conectados via WebSocket los vean.
   *
   * IMPORTANTE: Web Bluetooth solo funciona en Chrome/Edge en HTTPS o localhost.
   * En iOS Safari no está disponible — en iPhone usar Chrome.
   */
  const connectBluetooth = useCallback(async (): Promise<void> => {
    // Nordic UART Service (NUS) — el UUID estándar que usa ESP32 BLE Serial
    const UART_SERVICE = '6e400001-b5b3-f393-e0a9-e50e24dcca9e';
    const UART_TX_CHAR = '6e400003-b5b3-f393-e0a9-e50e24dcca9e'; // TX del ESP32 = RX del browser

    if (!navigator.bluetooth) {
      throw new Error('Este navegador no soporta Web Bluetooth. Usa Chrome o Edge en Android.');
    }

    // Desconectar dispositivo anterior si existe
    if (btDeviceRef.current?.gatt?.connected) {
      btDeviceRef.current.gatt.disconnect();
    }

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ name: 'BF15' }],          // Nombre del ESP32 en el sketch
      optionalServices: [UART_SERVICE],
    });

    setConnectionState(prev => ({
      ...prev,
      bluetoothDevice: device.name ?? 'ESP32',
    }));

    device.addEventListener('gattserverdisconnected', () => {
      console.warn('⚠️ Bluetooth desconectado');
      btCharRef.current = null;
      setConnectionState(prev => ({
        ...prev,
        isConnected: false,
        method: 'none',
        bluetoothDevice: null,
      }));
      // Volver a WebSocket/polling si el BT se cae
      connectWebSocket();
    });

    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(UART_SERVICE);
    const characteristic = await service.getCharacteristic(UART_TX_CHAR);

    btDeviceRef.current = device;
    btCharRef.current = characteristic;

    // Buffer para acumular fragmentos de línea (BLE puede partir el string)
    let lineBuffer = '';

    characteristic.addEventListener('characteristicvaluechanged', async (event) => {
      const target = event.target as BluetoothRemoteGATTCharacteristic;
      const value = target.value!;
      const chunk = new TextDecoder().decode(value);
      lineBuffer += chunk;

      // Procesar líneas completas
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? ''; // El último fragmento puede estar incompleto

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.includes('Vpin')) continue;

        const parsed = parseArduinoData(trimmed);
        if (!parsed) continue;

        // 1. Actualizar la UI inmediatamente
        processArduinoData(parsed);

        // 2. Enviar al backend para persistir y broadcast a otros clientes
        try {
          const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
          await fetch(`${apiUrl}/mediciones/raw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawData: trimmed }),
          });
        } catch (err) {
          console.warn('⚠️ No se pudo enviar al backend:', err);
          // No es fatal — los datos ya se muestran en la UI
        }
      }
    });

    await characteristic.startNotifications();

    setConnectionState(prev => ({
      ...prev,
      isConnected: true,
      method: 'bluetooth',
      bluetoothDevice: device.name ?? 'ESP32',
    }));

    console.log(`✅ Bluetooth conectado: ${device.name}`);
  }, [parseArduinoData, processArduinoData, connectWebSocket]);

  const disconnectBluetooth = useCallback(() => {
    if (btDeviceRef.current?.gatt?.connected) {
      btDeviceRef.current.gatt.disconnect();
    }
    btCharRef.current = null;
    btDeviceRef.current = null;
    setConnectionState(prev => ({
      ...prev,
      isConnected: false,
      method: 'none',
      bluetoothDevice: null,
    }));
  }, []);

  // ============ CICLO DE VIDA ============

  useEffect(() => {
    connectWebSocket();

    const httpFallbackTimer = setTimeout(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        startHttpPolling();
      }
    }, 3000);

    return () => {
      clearTimeout(httpFallbackTimer);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (btDeviceRef.current?.gatt?.connected) btDeviceRef.current.gatt.disconnect();
    };
  }, [connectWebSocket, startHttpPolling]);

  useEffect(() => {
    const timeoutCheck = setInterval(() => {
      if (connectionState.isConnected && connectionState.method !== 'bluetooth'
          && Date.now() - lastMessageTimeRef.current > connectionTimeoutMs) {
        setConnectionState(prev => ({ ...prev, isConnected: false }));
      }
    }, 1000);
    return () => clearInterval(timeoutCheck);
  }, [connectionState.isConnected, connectionState.method]);

  return {
    metrics,
    history,
    isConnected: connectionState.isConnected,
    connectionMethod: connectionState.method,
    bluetoothDevice: connectionState.bluetoothDevice,
    lastMessageTime: connectionState.lastMessageTime,
    connectBluetooth,
    disconnectBluetooth,
  };
}
