export type Page = 'dashboard' | 'support';

export interface PowerMetrics {
  soc: number; // State of Charge (%)
  powerIn: number; // kW
  powerOut: number; // kW
  temp: number; // Celsius
  voltage: number; // V
  current: number; // A
  health: number; // (%)
  cycles: number;
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
