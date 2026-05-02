import React from 'react';
import { motion } from 'motion/react';
import { 
  LayoutDashboard, 
  ChartArea, 
  LifeBuoy, 
  Zap, 
  Activity, 
  Thermometer, 
  Heart, 
  RefreshCcw,
  Clock,
  BatteryMedium,
  AlertCircle,
  Wifi,
  WifiOff
} from 'lucide-react';
import { MetricCard } from './components/MetricCard';
import { BatteryVisual } from './components/BatteryVisual';
import { Sidebar } from './components/Sidebar';
import { MainChart } from './components/MainChart';
import { Page, PowerMetrics } from './types';
import { usePowerSimulation } from './hooks/usePowerSimulation';
import { useState, useEffect } from 'react';
import { cn } from './lib/utils';

interface DashboardViewProps {
  metrics: PowerMetrics;
  history: PowerMetrics[];
  isConnected: boolean;
}

// --- Dashboard Sub-component ---
const DashboardView = ({ metrics, history, isConnected }: DashboardViewProps) => {
  // Calcular potencia en W (voltage en V * current en A)
  const powerInWatts = metrics.voltage * metrics.current;
  
  // Determinar estado de salud basado en voltaje y SOC
  const getHealthStatus = (soc: number, voltage: number): { status: string; color: string } => {
    if (voltage < 0.3) return { status: 'Crítico', color: 'text-red-500' };
    if (soc < 10) return { status: 'Bajo', color: 'text-yellow-500' };
    if (soc > 80) return { status: 'Óptimo', color: 'text-green-500' };
    return { status: 'Normal', color: 'text-blue-500' };
  };

  const healthStatus = getHealthStatus(metrics.soc, metrics.voltage);

  // Datos para gráficos
  const chartData = history.length > 0 ? history : [metrics];

  return (
    <div className="space-y-6">
      {/* Panel Superior: Batería + Métricas Principales */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <BatteryVisual soc={metrics.soc} />
        </div>
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Potencia en Watts */}
          <MetricCard 
            label="Potencia" 
            value={powerInWatts} 
            unit=" W" 
            icon={Zap} 
            trend={powerInWatts > 1 ? 2.4 : -1.2} 
          />
          
          {/* Voltaje Real (del Arduino) */}
          <MetricCard 
            label="Voltaje Real" 
            value={metrics.voltage} 
            unit=" V" 
            icon={Activity} 
            trend={metrics.voltage > 0.5 ? 0.5 : -0.5}
            className="border-l-2 border-l-industrial-neon/50"
          />
          
          {/* Corriente Estimada */}
          <MetricCard 
            label="Corriente" 
            value={metrics.current} 
            unit=" A" 
            icon={Thermometer} 
            trend={metrics.current > 0 ? 1.2 : -0.5}
          />
          
          {/* Temperatura */}
          <MetricCard 
            label="Temperatura" 
            value={metrics.temp} 
            unit=" °C" 
            icon={Heart}
            trend={metrics.temp > 30 ? 0.8 : -0.3}
          />
        </div>
      </div>

      {/* Panel de Gráficos Históricos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico SOC vs Tiempo */}
        <div className="bg-industrial-card border border-industrial-border p-6 rounded-sm">
          <h4 className="text-white font-mono text-sm uppercase tracking-widest mb-4">
            Historial de Carga (SOC %)
          </h4>
          <MainChart 
            data={chartData} 
            dataKey="soc" 
            color="#00FF00" 
            type="area"
          />
        </div>

        {/* Gráfico Voltaje vs Tiempo */}
        <div className="bg-industrial-card border border-industrial-border p-6 rounded-sm">
          <h4 className="text-white font-mono text-sm uppercase tracking-widest mb-4">
            Voltaje en Tiempo Real (V)
          </h4>
          <MainChart 
            data={chartData} 
            dataKey="voltage" 
            color="#00CCFF" 
            type="line"
          />
        </div>
      </div>

      {/* Panel de Diagnósticos de la Unidad */}
      <div className="grid grid-cols-1 gap-6">
        <div className="bg-industrial-card border border-industrial-border p-6 rounded-sm">
          <h4 className="text-white font-mono text-sm uppercase tracking-widest mb-6">
            Diagnósticos de la Unidad
          </h4>
          
          <div className="space-y-4">
            {[
              { 
                label: 'Voltaje (Vreal)', 
                status: metrics.voltage > 0.3 ? 'En Línea' : 'Crítico', 
                val: metrics.voltage.toFixed(3) + ' V',
                color: metrics.voltage > 0.3 ? 'industrial-neon' : 'red-500'
              },
              { 
                label: 'Voltaje Pin ADC (Vpin)', 
                status: 'Normal', 
                val: metrics.vpin.toFixed(3) + ' V',
                color: 'industrial-neon'
              },
              { 
                label: 'Estado de Carga', 
                status: healthStatus.status, 
                val: metrics.soc + ' %',
                color: healthStatus.color.replace('text-', '')
              },
              { 
                label: 'Temperatura del Sistema', 
                status: metrics.temp < 40 ? 'Nominal' : 'Elevada', 
                val: metrics.soc.toFixed(1) + ' °C',
                color: metrics.temp < 40 ? 'industrial-neon' : 'yellow-500'
              },
              {
                label: 'Conexión Bluetooth',
                status: isConnected ? 'Conectado' : 'Desconectado',
                val: isConnected ? '✓ Activo' : '✗ Inactivo',
                color: isConnected ? 'industrial-neon' : 'red-500'
              },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 border border-white/5 bg-white/5 rounded-sm hover:border-white/10 transition-colors">
                <div>
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">{item.label}</p>
                  <p className="text-xs text-white font-mono font-bold tracking-tight">{item.val}</p>
                </div>
                <span className={cn(
                  "text-[10px] font-mono bg-opacity-10 px-3 py-1 rounded",
                  `text-${item.color} bg-${item.color}`
                )}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>

          {/* Info adicional de depuración */}
          <div className="mt-6 pt-6 border-t border-white/5">
            <p className="text-[9px] text-zinc-600 font-mono uppercase mb-3">Información Técnica:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[9px]">
              <div>
                <span className="text-zinc-600">Ciclos:</span>
                <p className="text-white font-mono">{metrics.cycles}</p>
              </div>
              <div>
                <span className="text-zinc-600">Salud:</span>
                <p className="text-white font-mono">{metrics.health.toFixed(1)}%</p>
              </div>
              <div>
                <span className="text-zinc-600">Potencia:</span>
                <p className="text-white font-mono">{powerInWatts.toFixed(2)} W</p>
              </div>
              <div>
                <span className="text-zinc-600">Timestamp:</span>
                <p className="text-white font-mono">{metrics.timestamp}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alerta si hay desconexión o bajo voltaje */}
      {(!isConnected || metrics.voltage < 0.3) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-500/10 border border-red-500/30 p-4 rounded-sm flex items-start gap-3"
        >
          <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-500 font-mono text-sm font-bold">⚠️ Alerta del Sistema</p>
            <p className="text-red-500/80 text-xs font-mono">
              {!isConnected 
                ? 'Desconexión detectada. Intenta reconectar...'
                : 'Voltaje crítico. Revisa la conexión del Arduino.'}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
};

// --- Support Sub-component ---
const SupportView = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-industrial-card border border-industrial-border p-8 rounded-sm">
          <h3 className="text-xl font-mono text-white uppercase mb-6 flex items-center gap-3">
            <LifeBuoy className="text-industrial-neon" size={24} />
            Reportar Problema
          </h3>
          <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-zinc-500 uppercase">Nombre Completo</label>
                <input type="text" placeholder="Tu nombre" className="w-full bg-black/40 border border-zinc-800 rounded px-4 py-2 font-mono text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-industrial-neon transition-colors" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-zinc-500 uppercase">ID del Activo</label>
                <input type="text" placeholder="04-A" className="w-full bg-black/40 border border-zinc-800 rounded px-4 py-2 font-mono text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-industrial-neon transition-colors" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono text-zinc-500 uppercase">Descripción detallada</label>
              <textarea rows={6} placeholder="Describe el problema..." className="w-full bg-black/40 border border-zinc-800 rounded px-4 py-2 font-mono text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-industrial-neon transition-colors" />
            </div>
            <button className="bg-industrial-neon text-industrial-ink font-mono text-xs font-bold uppercase tracking-widest px-8 py-3 rounded hover:opacity-90 transition-opacity">
              Enviar Reporte
            </button>
          </form>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-industrial-card border border-industrial-border p-6 rounded-sm">
          <h4 className="text-white font-mono text-[10px] uppercase tracking-widest mb-4">Línea de Atención</h4>
          <div className="space-y-4">
            <div className="p-4 border border-zinc-800 rounded-sm bg-black/20">
              <p className="text-xs text-white font-mono mb-1">Centro de Soporte 24/7</p>
              <p className="text-industrial-neon font-mono text-sm tracking-widest">+1 (800) VOLT-CMS</p>
            </div>
            <div className="p-4 border border-zinc-800 rounded-sm bg-black/20 text-zinc-400 text-[11px] font-mono leading-relaxed italic">
              Para emergencias críticas relacionadas con la integridad del sistema, utilice la línea directa. Para otros reportes, utilice el formulario de contacto.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main App Entry ---
export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const { metrics, history, isConnected } = usePowerSimulation();

  return (
    <div className="flex min-h-screen bg-industrial-ink font-sans">
      <Sidebar activePage={page} setPage={setPage} />
      
      <main className="flex-1 p-8 lg:p-12 max-w-7xl mx-auto w-full">
        {/* Header con estado de conexión */}
        <header className="flex justify-between items-start mb-12">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            key={page}
          >
            <h1 className="text-3xl font-mono font-bold text-white tracking-widest uppercase mb-2">
              {page === 'dashboard' ? 'CONTROL DE MISIÓN' : 'CENTRO DE SOPORTE'}
            </h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <BatteryMedium size={14} className="text-industrial-neon" />
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Rack Activo: 04-A</span>
              </div>
              <div className="flex items-center gap-2 border-l border-zinc-800 pl-4">
                {isConnected ? (
                  <>
                    <Wifi size={14} className="text-green-500 animate-pulse" />
                    <span className="text-[10px] font-mono text-green-500 uppercase tracking-widest">Conectado</span>
                  </>
                ) : (
                  <>
                    <WifiOff size={14} className="text-red-500" />
                    <span className="text-[10px] font-mono text-red-500 uppercase tracking-widest">Desconectado</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 border-l border-zinc-800 pl-4">
                <RefreshCcw size={14} className="text-zinc-600" />
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Última Actualización: {metrics.timestamp}</span>
              </div>
            </div>
          </motion.div>

          <div className="flex gap-4">
            <div className="text-right">
              <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Estado</p>
              <p className="text-[11px] font-mono text-white uppercase tracking-tight">Usuario Registrado</p>
            </div>
            <div className={cn(
              "w-10 h-10 rounded-sm flex items-center justify-center text-white border",
              isConnected 
                ? "bg-gradient-to-br from-green-500/20 to-green-500/5 border-green-500/30"
                : "bg-gradient-to-br from-red-500/20 to-red-500/5 border-red-500/30"
            )}>
              {isConnected ? <Zap size={20} /> : <AlertCircle size={20} />}
            </div>
          </div>
        </header>

        {/* Contenido principal */}
        <motion.div
          key={page}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative min-h-[600px]"
        >
          {page === 'dashboard' && (
            <DashboardView 
              metrics={metrics} 
              history={history}
              isConnected={isConnected}
            />
          )}
          {page === 'support' && <SupportView />}
        </motion.div>

        <footer className="mt-20 border-t border-industrial-border pt-8 pb-12 flex justify-between items-center opacity-30 text-[9px] font-mono uppercase tracking-[0.3em] text-zinc-600">
          <span>CONTROL BATTERYLIFE BESS v2.4.0</span>
          <span>© 2026 ENERGÍA DE SEGUNDA VIDA</span>
        </footer>
      </main>

      {/* Global Background Scanlines Effect */}
      <div className="fixed inset-0 pointer-events-none z-50 opacity-[0.03] overflow-hidden">
        <div className="absolute inset-x-0 h-px bg-white animate-scan" style={{ top: '50%' }} />
      </div>
    </div>
  );
}
