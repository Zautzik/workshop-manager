'use client';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  HeartHandshake, HeartPulse, Droplets, Flame, Cog, Zap, AlertTriangle,
} from 'lucide-react';
import { useVitals, type FlowStatus, type VitalsResponse } from '@/hooks/use-vitals';

const FLOW_TEXT: Record<FlowStatus, string> = {
  flowing: 'text-emerald-500',
  stagnant: 'text-amber-500',
  clotted: 'text-rose-500',
};
const FLOW_STROKE: Record<FlowStatus, string> = {
  flowing: 'rgb(16 185 129)',
  stagnant: 'rgb(245 158 11)',
  clotted: 'rgb(244 63 94)',
};

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 56, h = 16;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface VitalDef {
  key: keyof VitalsResponse['vitals'];
  label: string;
  icon: React.ElementType;
  fmt: (v: VitalsResponse['vitals'][keyof VitalsResponse['vitals']]) => string;
  sub?: (v: VitalsResponse['vitals'][keyof VitalsResponse['vitals']]) => string | undefined;
  accent?: boolean;
}

// Human contribution leads — the body is alive because people fed it.
const DEFS: VitalDef[] = [
  { key: 'humano', label: 'Capturas', icon: HeartHandshake, accent: true,
    fmt: (v) => `${v.value} hoy`, sub: (v) => `${(v as { activeOperators: number }).activeOperators} operarios activos` },
  { key: 'pulso', label: 'Actividad', icon: HeartPulse,
    fmt: (v) => `${v.value}${v.unit ?? ''}` },
  { key: 'circulacion', label: 'Integridad', icon: Droplets,
    fmt: (v) => `${v.value}%`, sub: (v) => { const c = v as { resolved: number; total: number }; return `${c.resolved}/${c.total} asignaciones`; } },
  { key: 'agni', label: 'Validadas', icon: Flame,
    fmt: (v) => `${v.value}%`, sub: (v) => { const a = v as { pending: number }; return a.pending ? `${a.pending} por revisar` : undefined; } },
  { key: 'carga', label: 'Máquinas', icon: Cog,
    fmt: (v) => `${v.value}%`, sub: (v) => { const c = v as { running: number; total: number }; return `${c.running}/${c.total} en uso`; } },
  { key: 'reflejos', label: 'Alertas', icon: Zap,
    fmt: (v) => `${v.value}`, sub: () => '7 días' },
  { key: 'toxinas', label: 'Pendientes', icon: AlertTriangle,
    fmt: (v) => `${v.value}`, sub: (v) => {
      const t = v as { unmappedAssignments: number; certIssues?: number };
      if (t.certIssues) return `${t.certIssues} cert. FSSC vencidos`;
      return t.unmappedAssignments ? `${t.unmappedAssignments} sin mapear` : 'al día';
    } },
];

function HealthBadge({ score, label }: { score: number; label: string }) {
  const tone = score >= 80 ? FLOW_TEXT.flowing : score >= 60 ? FLOW_TEXT.stagnant : FLOW_TEXT.clotted;
  return (
    <div className="flex items-center gap-3 pr-4 border-r border-border/60">
      <div className="relative flex h-14 w-14 items-center justify-center">
        <span className={cn('text-2xl font-bold', tone)}>{score}</span>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Salud</p>
        <p className={cn('text-sm font-semibold', tone)}>{label}</p>
      </div>
    </div>
  );
}

export default function VitalStrip() {
  const { data, isLoading, isError } = useVitals();

  if (isError) return null; // graceful: roles without access simply don't see it
  if (isLoading || !data) {
    return <Skeleton className="h-24 w-full max-w-6xl rounded-xl" />;
  }

  return (
    <Card className="w-full max-w-6xl px-4 py-3">
      <div className="flex items-center gap-4 overflow-x-auto">
        <HealthBadge score={data.health.score} label={data.health.label} />
        <div className="flex items-stretch gap-3">
          {DEFS.map((def) => {
            const v = data.vitals[def.key];
            const Icon = def.icon;
            const sub = def.sub?.(v);
            return (
              <div
                key={def.key}
                className={cn(
                  'flex min-w-[96px] flex-col rounded-lg px-3 py-1.5',
                  def.accent && 'bg-primary/5 ring-1 ring-primary/15'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <Icon className={cn('h-3.5 w-3.5', FLOW_TEXT[v.status])} />
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{def.label}</span>
                  <span className={cn('ml-auto h-1.5 w-1.5 rounded-full', {
                    'bg-emerald-500': v.status === 'flowing',
                    'bg-amber-500': v.status === 'stagnant',
                    'bg-rose-500': v.status === 'clotted',
                  })} />
                </div>
                <div className="flex items-end justify-between gap-2">
                  <span className="text-base font-bold text-foreground whitespace-nowrap">{def.fmt(v)}</span>
                  {v.series && <Sparkline data={v.series} color={FLOW_STROKE[v.status]} />}
                </div>
                {sub && <span className="text-[10px] text-muted-foreground truncate">{sub}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
