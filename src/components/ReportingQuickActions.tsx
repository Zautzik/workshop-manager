'use client';

import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    <Button
      variant="outline"
      size="sm"
      className="h-8"
      onClick={generateSnapshot}
      disabled={loading}
    >
      <BarChart3 className="h-4 w-4 mr-1" />
      {loading ? 'Generando...' : 'Generar Snapshot'}
    </Button>
  );
}
