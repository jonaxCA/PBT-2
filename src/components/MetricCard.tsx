import React from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import { cn, formatValue } from '../lib/utils';

interface MetricCardProps {
  label: string;
  value: number;
  unit: string;
  trend?: number;
  icon?: React.ElementType;
  className?: string;
}

export const MetricCard = ({ label, value, unit, trend, icon: Icon, className }: MetricCardProps) => {
  return (
    <div className={cn("bg-industrial-card border border-industrial-border p-5 rounded-sm relative overflow-hidden group hover:border-zinc-700 transition-colors", className)}>
      <div className="flex justify-between items-start mb-4">
        <div>
           <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-1">{label}</p>
           <h3 className="text-2xl font-mono font-bold text-white tracking-tight">
             {formatValue(value, unit)}
           </h3>
        </div>
        {Icon && (
          <div className="text-zinc-700 p-2 border border-zinc-800 rounded bg-black/20 group-hover:text-industrial-neon transition-colors duration-500">
            <Icon size={18} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {trend !== undefined && (
          <div className={cn(
            "flex items-center text-[11px] font-mono px-1.5 py-0.5 rounded",
            trend >= 0 ? "bg-industrial-neon/10 text-industrial-neon" : "bg-industrial-danger/10 text-industrial-danger"
          )}>
            {trend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            <span>{Math.abs(trend)}%</span>
          </div>
        )}
        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
           <motion.div 
             initial={{ width: 0 }}
             animate={{ width: "65%" }}
             className="h-full bg-zinc-800"
           />
        </div>
      </div>

      {/* Background Graphic */}
      <div className="absolute -bottom-2 -right-2 opacity-[0.03] text-white">
        <Activity size={80} />
      </div>
    </div>
  );
};
