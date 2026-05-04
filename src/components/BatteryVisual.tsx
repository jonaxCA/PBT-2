import React from 'react';
import { motion } from 'motion/react';

export const BatteryVisual = ({ soc }: { soc: number }) => {
  return (
    <div className="bg-industrial-card border border-industrial-border p-6 rounded-sm flex flex-col items-center justify-center relative overflow-hidden h-full">
      <div className="absolute top-4 left-4">
         <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Unit Status</span>
      </div>
      
      <div className="relative w-24 h-48 border-2 border-zinc-700 rounded-md p-1 mb-6 flex items-end">
        {/* Battery Cap */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-2 bg-zinc-700 rounded-t-sm" />
        
        {/* Fill */}
        <motion.div 
          className="w-full bg-industrial-neon rounded-[2px] relative z-10 glow-neon"
          initial={{ height: 0 }}
          animate={{ height: `${soc}%` }}
          transition={{ type: 'spring', stiffness: 50 }}
        >
          {/* Liquid reflection effect */}
           <div className="absolute top-0 left-0 w-full h-2 bg-white/30" />
           <div className="absolute bottom-0 right-0 w-1/3 h-full bg-black/10" />
        </motion.div>

        {/* Levels labels */}
        <div className="absolute inset-0 flex flex-col justify-between py-2 items-center pointer-events-none opacity-20 text-[8px] font-mono text-white">
            <span>MAX</span>
            <span>75%</span>
            <span>MID</span>
            <span>25%</span>
            <span>CRIT</span>
        </div>
      </div>

      <div className="text-center">
        <span className="block text-4xl font-mono font-bold text-white mb-1 tracking-tighter">
          {soc.toFixed(1)}%
        </span>
        <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest">Battery Charged</span>
      </div>

      {/* Grid pattern background */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
    </div>
  );
};
