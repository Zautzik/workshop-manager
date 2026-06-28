'use client';

/**
 * @fileoverview Floor Mode — Big-screen display for the production floor
 * Fullscreen layout (no AppShell nav) with live Kanban columns.
 * Meant to run on a large monitor or TV in the workshop.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { useOTs } from '@/hooks/use-operations-queries';
import { useRealtimeProduction } from '@/hooks/use-realtime-production';
import { cn } from '@/lib/utils';
import { Wifi, WifiOff, ArrowLeft, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const STATUS_COLUMNS: { key: string; label: string; color: string; bg: string }[] = [
  { key: 'pending',     label: 'Pendiente',    color: 'text-slate-400',  bg: 'bg-slate-900/60'  },
  { key: 'in_progress', label: 'En Proceso',   color: 'text-blue-400',   bg: 'bg-blue-900/30'   },
  { key: 'review',      label: 'Revisión',     color: 'text-amber-400',  bg: 'bg-amber-900/30'  },
  { key: 'completed',   label: 'Completado',   color: 'text-green-400',  bg: 'bg-green-900/30'  },
];

const PRIORITY_BADGE: Record<string, string> = {
  high:   'bg-red-500/20 text-red-300 border-red-500/30',
  medium: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  low:    'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

function Clock24() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span>{format(time, 'HH:mm:ss', { locale: es })}</span>
  );
}

export default function FloorPage() {
  const router = useRouter();
  const { data: otsRaw = [] } = useOTs();
  const { isConnected } = useRealtimeProduction();
  const ots = otsRaw as any[];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800">
        <button
          onClick={() => router.push('/operaciones')}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Salir del Modo Planta
        </button>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <Clock className="h-4 w-4" />
          <Clock24 />
          {isConnected
            ? <span className="flex items-center gap-1 text-green-400"><Wifi className="h-3 w-3" /> En vivo</span>
            : <span className="flex items-center gap-1 text-red-400"><WifiOff className="h-3 w-3" /> Desconectado</span>
          }
        </div>
      </header>

      {/* Kanban columns */}
      <div className="flex-1 grid grid-cols-4 gap-0 overflow-hidden">
        {STATUS_COLUMNS.map(col => {
          const colOTs = ots.filter(ot => ot.status === col.key);
          return (
            <div key={col.key} className={cn('flex flex-col border-r border-gray-800 last:border-r-0', col.bg)}>
              {/* Column header */}
              <div className="px-4 py-3 border-b border-gray-700/60 flex items-center justify-between">
                <span className={cn('text-sm font-bold uppercase tracking-wider', col.color)}>{col.label}</span>
                <span className={cn('text-xs font-mono px-2 py-0.5 rounded-full border', col.color, 'border-current/30')}>
                  {colOTs.length}
                </span>
              </div>

              {/* OT cards */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {colOTs.length === 0 && (
                  <p className="text-center text-gray-600 text-xs mt-8">— vacío —</p>
                )}
                {colOTs.map(ot => (
                  <div
                    key={ot.id}
                    className="bg-gray-800/80 rounded-lg p-3 border border-gray-700/50 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-white">{ot.ot_number ?? ot.id}</span>
                      {ot.priority && (
                        <Badge className={cn('text-[10px] border', PRIORITY_BADGE[ot.priority] ?? PRIORITY_BADGE.low)}>
                          {ot.priority}
                        </Badge>
                      )}
                    </div>
                    {ot.client_name && (
                      <p className="text-xs text-gray-400 truncate">{ot.client_name}</p>
                    )}
                    {ot.due_date && (
                      <p className="text-[10px] text-gray-500">
                        Entrega: {format(new Date(ot.due_date), 'dd MMM', { locale: es })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
