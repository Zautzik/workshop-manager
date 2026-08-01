'use client';

/**
 * Anotar la lectura del contador, de pie frente a la máquina.
 *
 * A esta pantalla se llega escaneando el QR pegado en el equipo. Está pensada
 * para un teléfono en el taller: un dato, botones grandes, y listo. Todo lo que
 * no sea el número sobra.
 *
 * Por qué existe: sin dos lecturas no hay ritmo de uso, y sin ritmo la vida de
 * un repuesto es un porcentaje que nunca se convierte en fecha de compra. Pedir
 * que alguien entre a un formulario de escritorio a tipear eso es pedir algo
 * que no va a pasar dos veces. Escanear y anotar, sí.
 */

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Gauge, Check, ArrowLeft, Wrench, TriangleAlert } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { machineTypeLabel } from '@/types/machine-type';
import { usageUnitInline } from '@/types/machine-usage-unit';

const nf = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

interface UsageResponse {
  machine: {
    id: string; name: string; type: string; usage_unit: string;
    usage_counter: number; usage_counter_updated_at: string | null;
  };
  readings: Array<{ id: string; reading: number; read_at: string; source: string }>;
  rate: { uso_por_dia: number | null; lecturas: number } | null;
  rate_reason: string | null;
}

function LecturaScreen({ id }: { id: string }) {
  const qc = useQueryClient();
  const [valor, setValor] = useState('');
  const [guardada, setGuardada] = useState<{ reading: number; warning: string | null } | null>(null);

  const { data, isLoading, error } = useQuery<UsageResponse>({
    queryKey: ['machine-usage', id],
    queryFn: async () => {
      const res = await fetch(`/api/machines/${id}/usage`);
      if (!res.ok) throw new Error('No se pudo cargar la máquina');
      return res.json();
    },
  });

  const { data: partes } = useQuery<{ summary: Record<string, number> }>({
    queryKey: ['machine-parts', id, false],
    queryFn: async () => {
      const res = await fetch(`/api/machine-parts?machine_id=${id}`);
      if (!res.ok) throw new Error('x');
      return res.json();
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/machines/${id}/usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reading: Number(valor), source: 'qr' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar');
      return json;
    },
    onSuccess: (json) => {
      setGuardada({ reading: Number(valor), warning: json.warning ?? null });
      setValor('');
      qc.invalidateQueries({ queryKey: ['machine-usage', id] });
      qc.invalidateQueries({ queryKey: ['machine-parts'] });
    },
  });

  if (isLoading) return <div className="p-6"><Skeleton className="h-72 w-full" /></div>;

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <TriangleAlert className="mx-auto h-10 w-10 text-amber-500" />
        <p className="mt-3 font-medium">No se encontró esta máquina</p>
        <p className="mt-1 text-sm text-muted-foreground">
          El código QR puede ser de un equipo que ya no está registrado.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/equipos/mecanica">Ir a Mecánica</Link>
        </Button>
      </div>
    );
  }

  const { machine, rate, rate_reason } = data;
  const unidad = usageUnitInline(machine.usage_unit);
  const ultima = machine.usage_counter_updated_at
    ? new Date(machine.usage_counter_updated_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  // Retrocede: casi siempre es un dedo de más, pero un tablero cambiado también
  // reinicia el contador. Se avisa antes de guardar, no se bloquea.
  const retrocede = valor !== '' && Number(valor) < machine.usage_counter;
  const porPedir = (partes?.summary?.vencidas ?? 0) + (partes?.summary?.atrasadas ?? 0) + (partes?.summary?.por_pedir ?? 0);

  if (guardada) {
    return (
      <div className="mx-auto max-w-md space-y-6 p-6">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
          <Check className="mx-auto h-12 w-12 text-emerald-600 dark:text-emerald-400" />
          <p className="mt-3 text-lg font-semibold">Lectura anotada</p>
          <p className="font-mono text-3xl font-bold tabular-nums">
            {nf.format(guardada.reading)}
          </p>
          <p className="text-sm text-muted-foreground">{unidad} · {machine.name}</p>
        </div>

        {guardada.warning && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            {guardada.warning}
          </p>
        )}

        {/* Lo que la lectura acaba de comprar. */}
        {rate?.uso_por_dia != null ? (
          <p className="rounded-lg border bg-card p-4 text-sm">
            Con esta lectura el ritmo de la máquina queda en{' '}
            <strong>{nf.format(rate.uso_por_dia)} {unidad} por día</strong>. Desde ahora la vida
            de cada repuesto se puede expresar en fecha, y no sólo en porcentaje.
          </p>
        ) : (
          <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            Falta una lectura más, con algunos días de diferencia, para calcular el ritmo de uso.
            Con dos, la app puede decir en qué fecha se agota cada repuesto.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Button variant="outline" size="lg" onClick={() => setGuardada(null)}>
            Anotar otra lectura
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href={`/equipos/mecanica?maquina=${machine.id}`}>Ver piezas de esta máquina</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-5">
      <div>
        <Link href="/equipos/mecanica" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Equipos
        </Link>
        <h1 className="mt-2 text-2xl font-bold leading-tight">{machine.name}</h1>
        <p className="text-sm text-muted-foreground">{machineTypeLabel(machine.type)}</p>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Última lectura</p>
        <p className="font-mono text-4xl font-bold tabular-nums">
          {nf.format(machine.usage_counter)}
        </p>
        <p className="text-sm text-muted-foreground">
          {unidad}
          {ultima && <> · anotada el {ultima}</>}
        </p>
        {rate?.uso_por_dia != null && (
          <p className="mt-2 text-xs text-muted-foreground">
            ritmo actual ≈ {nf.format(rate.uso_por_dia)} {unidad}/día
          </p>
        )}
      </div>

      <div className="space-y-3">
        <label htmlFor="lectura" className="block text-base font-medium">
          ¿Qué marca el contador ahora?
        </label>
        <input
          id="lectura"
          type="number"
          inputMode="numeric"
          autoFocus
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={nf.format(machine.usage_counter)}
          className="w-full rounded-xl border-2 bg-background px-4 py-5 text-center font-mono text-3xl font-bold tabular-nums outline-none focus:border-primary"
        />

        {retrocede && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Es menor que la anterior. Si cambiaron el tablero y el contador volvió a cero,
            corresponde. Si fue un dedo de más, corrígelo antes de guardar.
          </p>
        )}

        {mut.isError && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
            {(mut.error as Error).message}
          </p>
        )}

        <Button
          size="lg"
          className="h-14 w-full text-base"
          disabled={valor === '' || mut.isPending}
          onClick={() => mut.mutate()}
        >
          {mut.isPending ? 'Guardando…' : 'Anotar lectura'}
        </Button>

        {!rate_reason && data.readings.length > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            {data.readings.length} lectura{data.readings.length === 1 ? '' : 's'} registrada{data.readings.length === 1 ? '' : 's'}
          </p>
        )}
      </div>

      {porPedir > 0 && (
        <Link
          href={`/equipos/mecanica?maquina=${machine.id}`}
          className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"
        >
          <Wrench className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-sm text-amber-800 dark:text-amber-200">
            <strong>{porPedir}</strong> pieza{porPedir === 1 ? '' : 's'} de esta máquina
            necesita{porPedir === 1 ? '' : 'n'} compra. Ver cuáles.
          </span>
        </Link>
      )}
    </div>
  );
}

export default function LecturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor', 'technician']}>
      <div className="min-h-screen bg-background">
        <LecturaScreen id={id} />
      </div>
    </ProtectedRoute>
  );
}
