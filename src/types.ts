export type Page = 'dashboard' | 'support';

/**
 * Datos directos del Arduino via Bluetooth
 * Formato esperado: "Vpin: 0.122 V | Vreal: 0.536 V | %: 4"
 */
export interface ArduinoRawData {
  vpin: number;    // Voltaje del pin ADC (V) - antes del divisor de voltaje
  vreal: number;   // Voltaje real de la batería (V) - después del divisor
  soc: number;     // State of Charge (%) - porcentaje de carga
}

/**
 * Métricas de potencia procesadas y enriquecidas
 * Mapeo desde Arduino:
 * - voltage: Vreal (voltaje real medido)
 * - soc: porcentaje de carga del Arduino
 * - powerIn/powerOut: calculados o derivados
 * - temp, current, health: valores por defecto o sensores adicionales
 */
export interface PowerMetrics {
  // Datos directos del Arduino
  vpin: number;           // Voltaje del pin ADC (V) - raw measurement
  vreal: number;          // Voltaje real de la batería (V) - después del divisor
  
  // Datos derivados o calculados
  soc: number;            // State of Charge (%) - 0 a 100
  voltage: number;        // Voltaje efectivo (V) = vreal
  current: number;        // Corriente estimada (A)
  powerIn: number;        // Potencia de entrada (W) - calculado: voltage * current
  powerOut: number;       // Potencia de salida (W) - 0 si no hay carga
  
  // Datos del sistema
  temp: number;           // Temperatura (°C) - requiere sensor DHT22
  health: number;         // Salud de la batería (%) - 70-100
  cycles: number;         // Número de ciclos de carga/descarga
  
  // Metadata
  timestamp: string;      // ISO string o HH:mm:ss
  deviceId?: string;      // ID del dispositivo Bluetooth
  signalStrength?: number; // RSSI en dBm (-100 a 0)
}

/**
 * Datos que se envían desde el Backend al Frontend
 * Puede contener múltiples métricas o datos parseados del Arduino
 */
export interface SensorDataMessage {
  type: 'measurement' | 'error' | 'connection_status';
  data?: PowerMetrics;
  error?: string;
  timestamp: string;
}

export interface SupportTicket {
  id: string;
  subject: string;
  category: 'hardware' | 'software' | 'billing' | 'other';
  status: 'open' | 'resolved' | 'pending';
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
}
