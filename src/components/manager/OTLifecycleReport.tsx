'use client';
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search, GitMerge, Clock, AlertTriangle, Layers, Activity, RotateCcw, CornerDownRight,
} from 'lucide-react';
import { format, parseISO, isValid, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useOTs } from '@/hooks/use-operations-queries';
import { useCycleAnalytics, useOTHistory } from '@/hooks/use-ot-cycle';
import { otStatusLabel, otStatusColor } from '@/lib/status-labels';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', supervisor: 'Supervisor', manager: 'Gerente',
  technician: 'Técnico', hr_manager: 'RR.HH.',
};
const roleLabel = (r: string | null | undefined) => (r ? ROLE_LABELS[r] ?? r : 'Sistema');

/** Human-friendly duration from a count of hours. */
function fmtDuration(hours: number | null | undefined): string {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} días`;
}

interface OtLite { id: string; ot_number: string | null; client_name: string | null; status: string | null; }

function KpiCard({ icon: Icon, label, value, hint, tone }: {
  icon: React.ElementType; label: string; value: string; hint?: string; tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
          <Icon className={`h-4 w-4 ${tone ?? ''}`} />{label}
        </div>
        <div className={`text-2xl font-bold mt-1 ${tone ?? 'text-foreground'}`}>{value}</div>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function OTLifecycleReport() {
  const { data: analytics, isLoading: loadingAnalytics } = useCycleAnalytics();
  const { data: otsData } = useOTs();
  const ots = (otsData ?? []) as OtLite[];

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: history, isLoading: loadingHistory } = useOTHistory(selectedId);

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return ots
      .filter((o) =>
        o.ot_number?.toLowerCase().includes(q) ||
        o.client_name?.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [ots, search]);

  const maxStageHours = analytics?.stage_stats.reduce((m, s) => Math.max(m, s.avg_hours), 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* ── Flow KPIs ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loadingAnalytics ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : (
          <>
            <KpiCard
              icon={Clock} label="Lead time promedio" tone="text-indigo-500"
              value={fmtDuration(analytics?.avg_lead_time_hours)}
              hint={`${analytics?.completed_count ?? 0} OTs completadas`}
            />
            <KpiCard
              icon={AlertTriangle} label="Cuello de botella" tone="text-amber-500"
              value={analytics?.bottleneck ? otStatusLabel(analytics.bottleneck.stage) : '—'}
              hint={analytics?.bottleneck ? `${fmtDuration(analytics.bottleneck.avg_hours)} en promedio` : 'Sin datos'}
            />
            <KpiCard
              icon={Layers} label="OTs en proceso (WIP)" tone="text-blue-500"
              value={String(analytics?.wip ?? 0)}
              hint="Órdenes sin completar"
            />
            <KpiCard
              icon={Activity} label="Movimientos registrados"
              value={String(analytics?.total_events ?? 0)}
              hint="Eventos de trazabilidad"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Bottleneck ranking: avg time-in-stage ───────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4" />Tiempo promedio por etapa
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAnalytics ? (
              <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
            ) : !analytics?.stage_stats.length ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <Layers className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Aún no hay suficiente historial de etapas.
              </div>
            ) : (
              <div className="space-y-2.5">
                {analytics.stage_stats.map((s, idx) => (
                  <div key={s.stage} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium">
                        <span className={`h-2 w-2 rounded-full ${otStatusColor(s.stage)}`} />
                        {otStatusLabel(s.stage)}
                        {idx === 0 && <Badge variant="outline" className="ml-1 text-[10px] border-amber-500/40 text-amber-500">cuello</Badge>}
                      </span>
                      <span className="text-muted-foreground">{fmtDuration(s.avg_hours)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${idx === 0 ? 'bg-amber-500' : 'bg-indigo-500/70'}`}
                        style={{ width: `${maxStageHours > 0 ? (s.avg_hours / maxStageHours) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Recent activity feed (who moved what) ───────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />Actividad reciente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAnalytics ? (
              <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : !analytics?.recent_activity.length ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Sin movimientos recientes.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
                {analytics.recent_activity.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => { setSelectedId(a.ot_id); setSearch(a.ot_number ?? ''); }}
                    className="w-full text-left flex items-center gap-3 rounded-lg p-2 hover:bg-muted/60 transition-colors"
                  >
                    <span className={`h-2 w-2 rounded-full shrink-0 ${otStatusColor(a.to_status)}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        <span className="font-mono">{a.ot_number ?? 'OT'}</span>
                        {a.client_name ? ` · ${a.client_name}` : ''}
                      </p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
                        {a.rollback && <RotateCcw className="h-3 w-3 text-rose-500" />}
                        {a.from_status ? otStatusLabel(a.from_status) : 'Inicio'}
                        <CornerDownRight className="h-3 w-3" />
                        {otStatusLabel(a.to_status)}
                        <span className="opacity-60">· {roleLabel(a.changed_by_role)}</span>
                      </p>
                    </div>
                    {isValid(parseISO(a.created_at)) && (
                      <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">
                        {formatDistanceToNow(parseISO(a.created_at), { addSuffix: true, locale: es })}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Per-OT lifecycle timeline ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitMerge className="h-4 w-4" />Línea de vida de una OT
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar OT por número o cliente…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); }}
            />
            {suggestions.length > 0 && selectedId === null && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden">
                {suggestions.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => { setSelectedId(o.id); setSearch(o.ot_number ?? ''); }}
                    className="w-full text-left px-3 py-2 hover:bg-muted/60 flex items-center gap-2 text-sm"
                  >
                    <span className={`h-2 w-2 rounded-full ${otStatusColor(o.status)}`} />
                    <span className="font-mono">{o.ot_number}</span>
                    <span className="text-muted-foreground truncate">{o.client_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedId && loadingHistory && (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          )}

          {selectedId && history && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono font-semibold">{history.ot.ot_number}</span>
                <span className="text-sm text-muted-foreground">{history.ot.client_name}</span>
                <Badge className={`${otStatusColor(history.ot.status)} text-white text-xs`}>
                  {otStatusLabel(history.ot.status)}
                </Badge>
                {history.current_dwell_hours != null && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {fmtDuration(history.current_dwell_hours)} en etapa actual
                  </span>
                )}
              </div>

              {history.events.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Esta OT aún no tiene transiciones registradas.
                </div>
              ) : (
                <ol className="relative border-l border-border ml-2 space-y-4">
                  {history.events.map((ev) => (
                    <li key={ev.id} className="ml-4">
                      <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${otStatusColor(ev.to_status)}`} />
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        {ev.rollback && <RotateCcw className="h-3.5 w-3.5 text-rose-500" />}
                        <span className="font-medium">{otStatusLabel(ev.to_status)}</span>
                        {ev.stage_left && (
                          <span className="text-xs text-muted-foreground">
                            (tras {fmtDuration(ev.dwell_hours)} en {otStatusLabel(ev.stage_left)})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {isValid(parseISO(ev.created_at)) && format(parseISO(ev.created_at), "PP · HH:mm", { locale: es })}
                        {' · '}{roleLabel(ev.changed_by_role)}
                        {ev.reason ? ` · "${ev.reason}"` : ''}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {!selectedId && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Busca una OT para ver su recorrido completo por el taller.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
