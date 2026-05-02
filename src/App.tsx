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
  BatteryMedium
} from 'lucide-react';
import { MetricCard } from './components/MetricCard';
import { BatteryVisual } from './components/BatteryVisual';
import { Sidebar } from './components/Sidebar';
import { MainChart } from './components/MainChart';
import { SupportTicket, Page } from './types';
import { usePowerSimulation } from './hooks/usePowerSimulation';
import { useState } from 'react';
import { cn } from './lib/utils';

// --- Dashboard Sub-component ---
const DashboardView = ({ metrics, history }: { metrics: any, history: any[] }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
       <div className="lg:col-span-1">
          <BatteryVisual soc={metrics.soc} />
       </div>
       <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6">
          <MetricCard label="Consumo" value={metrics.powerIn * 1000} unit=" W" icon={Zap} trend={2.4} />
          <MetricCard label="Voltaje" value={metrics.voltage} unit=" V" icon={Activity} trend={-1.2} />
          <MetricCard label="Amperaje" value={metrics.current} unit=" A" icon={Thermometer} trend={0.5} />
          <MetricCard label="Temperatura" value={metrics.temp} unit=" °C" icon={Heart} />
       </div>
    </div>

    <div className="grid grid-cols-1 gap-6">
       <div className="bg-industrial-card border border-industrial-border p-6 rounded-sm">
          <h4 className="text-white font-mono text-sm uppercase tracking-widest mb-6">Diagnósticos de la Unidad</h4>
          <div className="space-y-4">
             {[
               { label: 'Estabilizador de Voltaje', status: 'En Línea', val: metrics.voltage.toFixed(1) + ' V' },
               { label: 'Filtro de Corriente', status: 'Óptimo', val: metrics.current.toFixed(1) + ' A' },
               { label: 'Conteo de Ciclos', status: 'Normal', val: metrics.cycles },
               { label: 'Temp. del Rack', status: 'Nominal', val: metrics.temp.toFixed(1) + ' °C' },
             ].map((item, idx) => (
               <div key={idx} className="flex items-center justify-between p-3 border border-white/5 bg-white/5 rounded-sm">
                  <div>
                    <p className="text-[10px] text-zinc-500 font-mono uppercase">{item.label}</p>
                    <p className="text-xs text-white font-mono font-bold tracking-tight">{item.val}</p>
                  </div>
                  <span className="text-[10px] font-mono text-industrial-neon bg-industrial-neon/10 px-2 py-0.5 rounded">
                    {item.status}
                  </span>
               </div>
             ))}
          </div>
       </div>
    </div>
  </div>
);

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
                      <input type="text" className="w-full bg-black/40 border border-zinc-800 rounded px-4 py-2 font-mono text-sm text-white focus:outline-none focus:border-industrial-neon transition-colors" placeholder="Su nombre" />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase">ID del Activo</label>
                      <input type="text" className="w-full bg-black/40 border border-zinc-800 rounded px-4 py-2 font-mono text-sm text-white focus:outline-none focus:border-industrial-neon transition-colors" placeholder="VC-BESS-04-A" />
                   </div>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-mono text-zinc-500 uppercase">Descripción detallada</label>
                   <textarea rows={6} className="w-full bg-black/40 border border-zinc-800 rounded px-4 py-2 font-mono text-sm text-white focus:outline-none focus:border-industrial-neon transition-colors" placeholder="Describa el comportamiento o cualquier falla observada..." />
                </div>
                <button className="bg-industrial-neon text-industrial-ink font-mono text-xs font-bold uppercase tracking-widest px-8 py-3 rounded hover:opacity-90 transition-opacity">Enviar Reporte</button>
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
}

// --- Main App Entry ---
export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const { metrics, history } = usePowerSimulation();

  return (
    <div className="flex min-h-screen bg-industrial-ink font-sans">
      <Sidebar activePage={page} setPage={setPage} />
      
      <main className="flex-1 p-8 lg:p-12 max-w-7xl mx-auto w-full">
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
              <div className="w-10 h-10 rounded-sm bg-gradient-to-br from-industrial-neon/20 to-industrial-neon/5 border border-industrial-neon/30 flex items-center justify-center text-industrial-neon">
                 <Zap size={20} />
              </div>
           </div>
        </header>

        <motion.div
          key={page}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative min-h-[600px]"
        >
          {page === 'dashboard' && <DashboardView metrics={metrics} history={history} />}
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
