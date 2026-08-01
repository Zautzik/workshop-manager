'use client';

/**
 * Hoja de etiquetas QR para pegar en las máquinas.
 *
 * El QR sirve de poco mientras viva dentro de la app: tiene que estar pegado en
 * el equipo. Esta pantalla existe para imprimir una vez, recortar y pegar, y
 * que después anotar una lectura sea escanear en vez de sentarse a tipear.
 */

import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Printer } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { machineTypeLabel } from '@/types/machine-type';
import { usageUnitInline } from '@/types/machine-usage-unit';

interface MachineRow {
  id: string; name: string; type: string; usage_unit: string; is_active: boolean;
}

function Etiquetas() {
  const { data: machines, isLoading } = useQuery<MachineRow[]>({
    queryKey: ['machines', 'etiquetas'],
    queryFn: async () => {
      const res = await fetch('/api/machines');
      if (!res.ok) throw new Error('No se pudieron cargar las máquinas');
      const json = await res.json();
      const list: MachineRow[] = Array.isArray(json) ? json : (json.machines ?? []);
      return list.filter((m) => m.is_active);
    },
  });

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Etiquetas QR de las máquinas</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Imprime, recorta y pega una en cada equipo, a la altura del contador. Quien pase
            por ahí escanea y anota la lectura desde el teléfono — que es lo que convierte la
            vida de un repuesto en una fecha de compra.
          </p>
        </div>
        <Button onClick={() => window.print()} className="gap-2">
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3 print:gap-3">
        {(machines ?? []).map((m) => (
          <div
            key={m.id}
            className="flex break-inside-avoid flex-col items-center gap-2 rounded-lg border-2 border-dashed p-4 print:border-solid print:border-black/40"
          >
            <div className="rounded bg-white p-2">
              <QRCodeSVG value={`${origin}/equipos/lectura/${m.id}`} size={128} level="M" />
            </div>
            <p className="text-center text-sm font-bold leading-tight">{m.name}</p>
            <p className="text-center text-[11px] text-muted-foreground print:text-black/60">
              {machineTypeLabel(m.type)} · se mide en {usageUnitInline(m.usage_unit)}
            </p>
            <p className="text-center text-[10px] text-muted-foreground print:text-black/60">
              Escanear para anotar la lectura
            </p>
          </div>
        ))}
      </div>

      {(machines?.length ?? 0) === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No hay máquinas activas.
        </p>
      )}
    </div>
  );
}

export default function EtiquetasPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <div className="p-6 print:p-0">
        <Etiquetas />
      </div>
    </ProtectedRoute>
  );
}
