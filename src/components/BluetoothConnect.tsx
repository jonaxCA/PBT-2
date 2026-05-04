import React, { useState } from 'react';
import { Bluetooth, BluetoothOff, BluetoothSearching, Zap, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface BluetoothConnectProps {
  isConnected: boolean;
  connectionMethod: 'websocket' | 'polling' | 'bluetooth' | 'none';
  bluetoothDevice: string | null;
  onConnect: () => Promise<void>;
  onDisconnect: () => void;
}

export const BluetoothConnect = ({
  isConnected,
  connectionMethod,
  bluetoothDevice,
  onConnect,
  onDisconnect,
}: BluetoothConnectProps) => {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'connecting' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isBluetooth = connectionMethod === 'bluetooth';
  const btSupported = typeof navigator !== 'undefined' && !!navigator.bluetooth;

  const handleConnect = async () => {
    setStatus('scanning');
    setErrorMsg(null);
    try {
      setStatus('connecting');
      await onConnect();
      setStatus('idle');
    } catch (err: unknown) {
      // El usuario canceló el selector — no es un error real
      if (err instanceof Error && err.name === 'NotFoundError') {
        setStatus('idle');
        return;
      }
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  const handleDisconnect = () => {
    onDisconnect();
    setStatus('idle');
    setErrorMsg(null);
  };

  // ── Ícono dinámico según estado ──
  const Icon = isBluetooth && isConnected
    ? Bluetooth
    : status === 'scanning' || status === 'connecting'
      ? BluetoothSearching
      : BluetoothOff;

  return (
    <div className="bg-industrial-card border border-industrial-border rounded-sm p-5 space-y-4">

      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={16} className={cn(
            isBluetooth && isConnected ? 'text-industrial-neon' : 'text-zinc-500',
            (status === 'scanning' || status === 'connecting') && 'animate-pulse text-blue-400'
          )} />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
            Conexión Bluetooth
          </span>
        </div>

        {/* Badge de método activo */}
        {isConnected && (
          <span className={cn(
            'text-[10px] font-mono px-2 py-0.5 rounded',
            isBluetooth
              ? 'text-industrial-neon bg-industrial-neon/10'
              : 'text-zinc-400 bg-zinc-800'
          )}>
            {connectionMethod === 'bluetooth' ? `BT · ${bluetoothDevice}` :
             connectionMethod === 'websocket' ? 'WebSocket' : 'HTTP Polling'}
          </span>
        )}
      </div>

      {/* Descripción del estado */}
      {!btSupported ? (
        <div className="flex items-start gap-2 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-sm">
          <AlertCircle size={14} className="text-yellow-500 mt-0.5 shrink-0" />
          <p className="text-[11px] font-mono text-zinc-400 leading-relaxed">
            Web Bluetooth no está disponible en este navegador.{' '}
            <span className="text-yellow-400">Usa Chrome o Edge en Android.</span>{' '}
            En iPhone no está soportado.
          </p>
        </div>
      ) : isBluetooth && isConnected ? (
        // Estado conectado via BT
        <div className="flex items-center gap-3 p-3 bg-industrial-neon/5 border border-industrial-neon/20 rounded-sm">
          <CheckCircle size={14} className="text-industrial-neon shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-white">
              {bluetoothDevice ?? 'ESP32'} conectado
            </p>
            <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
              Datos en tiempo real desde el hardware
            </p>
          </div>
          <button
            onClick={handleDisconnect}
            className="text-[10px] font-mono text-zinc-400 hover:text-red-400 transition-colors px-2 py-1 border border-zinc-700 hover:border-red-500/40 rounded"
          >
            Desconectar
          </button>
        </div>
      ) : status === 'error' ? (
        <div className="flex items-start gap-2 p-3 bg-red-500/5 border border-red-500/20 rounded-sm">
          <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-[11px] font-mono text-red-400">Error de conexión</p>
            <p className="text-[10px] font-mono text-zinc-500 mt-0.5">{errorMsg}</p>
          </div>
        </div>
      ) : (
        // Estado desconectado — instrucciones + botón
        <div className="space-y-3">
          <ol className="space-y-1.5">
            {[
              'Enciende el ESP32 y conecta la batería al divisor de voltaje',
              'Asegúrate de que el Bluetooth del celular esté activo',
              'Toca "Buscar ESP32" — aparecerá el selector del navegador',
              'Selecciona "BF15" en la lista de dispositivos',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="text-[9px] font-mono text-zinc-600 mt-0.5 shrink-0 w-3">
                  {i + 1}.
                </span>
                <span className="text-[11px] font-mono text-zinc-400 leading-relaxed">
                  {step}
                </span>
              </li>
            ))}
          </ol>

          <button
            onClick={handleConnect}
            disabled={status === 'scanning' || status === 'connecting'}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-2.5 px-4',
              'text-[11px] font-mono uppercase tracking-wider rounded-sm',
              'border transition-all duration-200',
              status === 'scanning' || status === 'connecting'
                ? 'border-blue-500/40 text-blue-400 bg-blue-500/5 cursor-not-allowed'
                : 'border-industrial-neon/30 text-industrial-neon bg-industrial-neon/5 hover:bg-industrial-neon/10 hover:border-industrial-neon/60'
            )}
          >
            {status === 'scanning' || status === 'connecting' ? (
              <>
                <BluetoothSearching size={13} className="animate-pulse" />
                {status === 'scanning' ? 'Buscando...' : 'Conectando...'}
              </>
            ) : (
              <>
                <Zap size={13} />
                Buscar ESP32 (BF15)
              </>
            )}
          </button>

          {/* Nota sobre compatibilidad */}
          <p className="text-[10px] font-mono text-zinc-600 text-center">
            Requiere Chrome · Android o escritorio · HTTPS o localhost
          </p>
        </div>
      )}
    </div>
  );
};
