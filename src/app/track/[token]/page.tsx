'use client';

/**
 * Public order tracker — /track/[share_token]. No auth.
 *
 * This is the only screen a client's client ever sees, so it carries the
 * brand: watercolor washes (ink on paper) and a calm five-phase timeline.
 * The 15 internal workflow statuses are deliberately grouped into phases a
 * customer understands — plant internals stay internal.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2, Circle, Loader2, PackageX } from 'lucide-react';
import WatercolorBackdrop from '@/components/branding/WatercolorBackdrop';
import { ForgeHexLogo } from '@/components/branding/ForgeHexLogo';

/** Internal status → client-facing phase (0-based). */
const PHASE_OF: Record<string, number> = {
  pre_press: 0, visto_bueno: 0,
  paper_purchase: 1, in_storage: 1,
  guillotine_first_cut: 2, offset_printing: 2, digital_printing: 2,
  die_cutting: 2, guillotine_final_cut: 2,
  workshop: 3, outsourced: 3, workshop_revision: 3,
  ready_for_delivery: 4, in_delivery: 4, completed: 4,
};

const PHASES = [
  { label: 'Preparación',   detail: 'Diseño y aprobación de arte' },
  { label: 'Materiales',    detail: 'Papel certificado en bodega' },
  { label: 'Impresión',     detail: 'Tu pedido está en prensa' },
  { label: 'Terminaciones', detail: 'Troquelado, plegado y acabados' },
  { label: 'Entrega',       detail: 'Camino a tus manos' },
];

const PHASE_COLORS = ['249 115 90', '251 191 36', '45 212 191', '56 189 248', '167 139 250'];

interface TrackData {
  ot_number: string;
  client_name: string;
  product_name: string | null;
  quantity: number;
  status: string;
  deadline: string | null;
  created_at: string;
  history: Array<{ status: string; at: string }>;
}

export default function TrackPage() {
  const params = useParams();
  const token = params?.token as string;
  const [data, setData] = useState<TrackData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/track/${token}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError('No pudimos cargar tu pedido. Intenta de nuevo.'))
      .finally(() => setLoading(false));
  }, [token]);

  const currentPhase = data ? (PHASE_OF[data.status] ?? 0) : 0;
  const isDone = data?.status === 'completed';

  // First date each phase was entered, from the (already sorted) history.
  const phaseDates: (string | null)[] = PHASES.map((_, i) => {
    const hit = data?.history.find((h) => (PHASE_OF[h.status] ?? -1) === i);
    return hit?.at ?? null;
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <WatercolorBackdrop intensity="hero" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-2xl flex-col px-5 py-10">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <ForgeHexLogo size={40} showWordmark={false} />
          <div>
            <p className="text-sm font-semibold tracking-tight text-foreground">GonsAdmin</p>
            <p className="text-xs text-muted-foreground">Seguimiento de tu pedido</p>
          </div>
        </div>

        {loading && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <PackageX className="h-10 w-10 text-muted-foreground/60" />
            <p className="text-lg font-medium text-foreground">{error}</p>
            <p className="text-sm text-muted-foreground">
              Si el enlace venía de tu proveedor, pídele uno nuevo — puede haber sido renovado.
            </p>
          </div>
        )}

        {data && !loading && (
          <div className="mt-10 space-y-8">
            {/* Header card */}
            <div className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-lg backdrop-blur-sm">
              <p className="text-sm text-muted-foreground">Pedido</p>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  N° {data.ot_number}
                </h1>
                {isDone ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" /> Entregado
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium"
                    style={{
                      background: `rgb(${PHASE_COLORS[currentPhase]} / 0.15)`,
                      color: `rgb(${PHASE_COLORS[currentPhase]})`,
                    }}
                  >
                    {PHASES[currentPhase].label}
                  </span>
                )}
              </div>
              <p className="mt-3 text-base text-foreground">
                {data.product_name ?? 'Trabajo de imprenta'}
                <span className="text-muted-foreground"> · {data.quantity.toLocaleString('es-CL')} unidades</span>
              </p>
              <p className="text-sm text-muted-foreground">{data.client_name}</p>
              {data.deadline && !isDone && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Entrega estimada:{' '}
                  <span className="font-medium text-foreground">
                    {format(new Date(data.deadline), "d 'de' MMMM", { locale: es })}
                  </span>
                </p>
              )}
            </div>

            {/* Phase timeline */}
            <div className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-lg backdrop-blur-sm">
              <ol className="space-y-0">
                {PHASES.map((phase, i) => {
                  const reached = i <= currentPhase;
                  const isCurrent = i === currentPhase && !isDone;
                  const done = i < currentPhase || isDone;
                  const rgb = PHASE_COLORS[i];
                  return (
                    <li key={phase.label} className="relative flex gap-4 pb-7 last:pb-0">
                      {/* connector */}
                      {i < PHASES.length - 1 && (
                        <span
                          aria-hidden
                          className="absolute left-[13px] top-7 h-full w-0.5"
                          style={{ background: reached && i < currentPhase ? `rgb(${rgb} / 0.5)` : 'hsl(var(--border))' }}
                        />
                      )}
                      {/* node */}
                      <span
                        className="relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2"
                        style={{
                          borderColor: reached ? `rgb(${rgb})` : 'hsl(var(--border))',
                          background: done ? `rgb(${rgb} / 0.15)` : 'hsl(var(--card))',
                          boxShadow: isCurrent ? `0 0 0 5px rgb(${rgb} / 0.15)` : undefined,
                        }}
                      >
                        {done ? (
                          <CheckCircle2 className="h-4 w-4" style={{ color: `rgb(${rgb})` }} />
                        ) : (
                          <Circle
                            className={isCurrent ? 'h-3 w-3 animate-pulse' : 'h-3 w-3'}
                            style={{ color: reached ? `rgb(${rgb})` : 'hsl(var(--muted-foreground))' }}
                            fill={isCurrent ? `rgb(${rgb})` : 'transparent'}
                          />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-base font-semibold ${reached ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {phase.label}
                        </p>
                        <p className="text-sm text-muted-foreground">{phase.detail}</p>
                        {phaseDates[i] && (
                          <p className="mt-0.5 text-xs text-muted-foreground/80">
                            {format(new Date(phaseDates[i]!), "d MMM yyyy, HH:mm", { locale: es })}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            <p className="pb-4 text-center text-xs text-muted-foreground">
              Pedido iniciado el {format(new Date(data.created_at), "d 'de' MMMM yyyy", { locale: es })} ·
              Impreso con tinta y cuidado 🖋
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
