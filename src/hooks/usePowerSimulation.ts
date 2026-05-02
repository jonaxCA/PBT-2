import { useState, useEffect, useCallback } from 'react';
import { PowerMetrics } from '../types';

export function usePowerSimulation() {
  const [metrics, setMetrics] = useState<PowerMetrics>({
    soc: 82.4,
    powerIn: 450.2,
    powerOut: 120.5,
    temp: 34.2,
    voltage: 480.1,
    current: 685.2,
    health: 98.2,
    cycles: 124,
    timestamp: new Date().toLocaleTimeString(),
  });

  const [history, setHistory] = useState<PowerMetrics[]>([]);

  const updateMetrics = useCallback(() => {
    setMetrics(prev => {
      // Logic to simulate fluctuations
      const nextSoc = Math.max(0, Math.min(100, prev.soc + (Math.random() - 0.5) * 0.1));
      const nextPowerIn = Math.max(0, prev.powerIn + (Math.random() - 0.5) * 20);
      const nextPowerOut = Math.max(0, prev.powerOut + (Math.random() - 0.5) * 15);
      const nextTemp = Math.max(20, Math.min(60, prev.temp + (Math.random() - 0.5) * 0.5));
      
      const newMetric = {
        ...prev,
        soc: nextSoc,
        powerIn: nextPowerIn,
        powerOut: nextPowerOut,
        temp: nextTemp,
        timestamp: new Date().toLocaleTimeString(),
      };

      setHistory(h => [...h.slice(-30), newMetric]);
      return newMetric;
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(updateMetrics, 2000);
    return () => clearInterval(interval);
  }, [updateMetrics]);

  return { metrics, history };
}
