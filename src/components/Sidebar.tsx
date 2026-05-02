import React from 'react';
import { motion } from 'motion/react';
import { LayoutDashboard, ChartArea, LifeBuoy, Zap, ShieldAlert, Cpu } from 'lucide-react';
import { Page } from '../types';
import { cn } from '../lib/utils';

interface NavItemProps {
  id: Page;
  active: boolean;
  onClick: (id: Page) => void;
  icon: typeof LayoutDashboard;
  label: string;
}

const NavItem = ({ id, active, onClick, icon: Icon, label }: NavItemProps) => (
  <button
    onClick={() => onClick(id)}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-3 transition-all duration-200 group relative",
      active ? "text-industrial-neon bg-industrial-neon/5" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
    )}
  >
    {active && (
      <motion.div
        layoutId="active-nav"
        className="absolute left-0 w-1 h-full bg-industrial-neon shadow-[0_0_8px_rgba(0,255,156,0.5)]"
      />
    )}
    <Icon size={20} className={cn("transition-transform group-hover:scale-110", active && "text-industrial-neon")} />
    <span className="font-mono text-xs uppercase tracking-widest">{label}</span>
  </button>
);

export const Sidebar = ({ activePage, setPage }: { activePage: Page, setPage: (p: Page) => void }) => {
  return (
    <aside className="w-64 border-r border-industrial-border bg-industrial-ink flex flex-col h-screen sticky top-0 overflow-hidden">
      <div className="p-6 border-b border-industrial-border bg-black/10">
        <div className="flex flex-col items-center gap-3 mb-2">
          <img 
            src="https://artifact.picoapps.xyz/pico-artifacts/1745887720925/input_file_0.png" 
            alt="BatteryLife Logo" 
            className="w-full h-auto object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className="h-1.5 w-1.5 rounded-full bg-industrial-neon animate-pulse" />
          <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-500">Sistema en Línea</span>
        </div>
      </div>

      <nav className="flex-1 py-4">
        <div className="px-4 mb-4">
          <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Panel de Control</span>
        </div>
        <NavItem id="dashboard" label="Control de Misión" icon={LayoutDashboard} active={activePage === 'dashboard'} onClick={setPage} />
        <div className="h-px bg-industrial-border my-4 mx-4" />
        <div className="px-4 mb-2">
          <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Operaciones</span>
        </div>
        <NavItem id="support" label="Soporte Técnico" icon={LifeBuoy} active={activePage === 'support'} onClick={setPage} />
      </nav>

      <div className="p-4 border-t border-industrial-border bg-black/20">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
             <span className="text-[10px] font-mono text-zinc-600 uppercase">Alertas</span>
             <span className="text-[10px] font-mono text-industrial-neon">0 Activas</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col items-center p-2 rounded bg-white/5 border border-white/5">
                <ShieldAlert size={14} className="text-zinc-600 mb-1" />
                <span className="text-[9px] font-mono uppercase text-zinc-500">Seguro</span>
            </div>
            <div className="flex flex-col items-center p-2 rounded bg-white/5 border border-white/5">
                <Cpu size={14} className="text-zinc-600 mb-1" />
                <span className="text-[9px] font-mono uppercase text-zinc-500">Opt. AI</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
