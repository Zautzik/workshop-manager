'use client';

import { useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HEADER_ICON, HEADER_ICON_BUTTON } from '@/components/shell/header-controls';
import { useToast } from '@/hooks/use-toast';

export function ReportingQuickActions({ isAdmin }: { isAdmin: boolean }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  if (!isAdmin) return null;

  const generateSnapshot = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reporting/snapshots', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'No se pudo generar snapshot');
      }
      toast({ title: 'Snapshot generado', description: 'KPIs diarios actualizados correctamente.' });
    } catch (error: any) {
      toast({
        title: 'Error al generar snapshot',
        description: error?.message ?? 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={generateSnapshot}
          disabled={loading}
          aria-label="Generar snapshot de KPIs"
          className={HEADER_ICON_BUTTON}
        >
          {loading ? (
            <Loader2 className={`${HEADER_ICON} animate-spin`} />
          ) : (
            <BarChart3 className={HEADER_ICON} />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {loading ? 'Generando snapshot…' : 'Generar snapshot de KPIs'}
      </TooltipContent>
    </Tooltip>
  );
}
