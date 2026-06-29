'use client';
import { useMemo, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Factory, Package, MessageSquare, QrCode, CheckCircle2, XCircle, Clock, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { formatCLP } from '@/lib/format';
import { useCaptures, useReviewCapture, type CaptureEvent } from '@/hooks/use-captures';

const DOMAIN: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  production: { label: 'Producción', cls: 'bg-blue-500/15 text-blue-600', icon: Factory },
  warehouse:  { label: 'Bodega',     cls: 'bg-amber-500/15 text-amber-600', icon: Package },
  dispatch:   { label: 'Despacho',   cls: 'bg-teal-500/15 text-teal-600', icon: Package },
  receipt:    { label: 'Recepción',  cls: 'bg-indigo-500/15 text-indigo-600', icon: Package },
  other:      { label: 'Otro',       cls: 'bg-slate-500/15 text-slate-600', icon: Inbox },
};
const STATUS: Record<string, { label: string; cls: string }> = {
  pending:        { label: 'Pendiente',  cls: 'bg-amber-500/15 text-amber-600' },
  approved:       { label: 'Aprobada',   cls: 'bg-green-500/15 text-green-600' },
  auto_approved:  { label: 'Auto',       cls: 'bg-green-500/15 text-green-600' },
  rejected:       { label: 'Rechazada',  cls: 'bg-red-500/15 text-red-600' },
  needs_revision: { label: 'A revisar',  cls: 'bg-orange-500/15 text-orange-600' },
};
const CHANNEL_ICON: Record<string, React.ElementType> = {
  whatsapp: MessageSquare, qr: QrCode, manual: Inbox, photo: MessageSquare, system: Inbox,
};

type Tab = 'pending' | 'all' | 'production' | 'warehouse';

function CapturasInner() {
  const [tab, setTab] = useState<Tab>('pending');
  const filters = useMemo(() => {
    if (tab === 'pending') return { status: 'pending' };
    if (tab === 'production') return { domain: 'production' };
    if (tab === 'warehouse') return { domain: 'warehouse' };
    return {};
  }, [tab]);

  const { data, isLoading } = useCaptures(filters);
  const review = useReviewCapture();
  const counts = data?.counts;
  const rows = data?.data ?? [];

  const act = async (c: CaptureEvent, status: 'approved' | 'rejected') => {
    try {
      const res: any = await review.mutateAsync({ id: c.id, status });
      if (res?._warning) toast.warning(res._warning);
      else toast.success(status === 'approved' ? 'Aprobada y aplicada al sistema' : 'Rechazada');
    } catch (e: any) {
      toast.error(e?.message ?? 'Error');
    }
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total" value={String(counts?.total ?? 0)} tint="text-foreground" icon={Inbox} />
        <Kpi label="Pendientes" value={String(counts?.pending ?? 0)} tint="text-amber-600" icon={Clock} />
        <Kpi label="Producción" value={String(counts?.production ?? 0)} tint="text-blue-600" icon={Factory} />
        <Kpi label="Bodega" value={String(counts?.warehouse ?? 0)} tint="text-amber-600" icon={Package} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5">
        {([['pending', 'Pendientes'], ['all', 'Todas'], ['production', 'Producción'], ['warehouse', 'Bodega']] as [Tab, string][]).map(([k, label]) => (
          <Button key={k} size="sm" variant={tab === k ? 'default' : 'outline'} onClick={() => setTab(k)}>{label}</Button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bandeja de capturas</CardTitle>
          <p className="text-xs text-muted-foreground">Todo lo que el equipo reporta por WhatsApp / QR, en un solo lugar. Aprobar aplica el efecto al sistema (costos reales / inventario).</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground py-6 text-center">Cargando…</p>}
          {!isLoading && rows.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">Sin capturas en esta vista.</p>}
          {rows.map((c) => {
            const dom = DOMAIN[c.domain] ?? DOMAIN.other;
            const st = STATUS[c.status] ?? { label: c.status, cls: '' };
            const Chan = CHANNEL_ICON[c.channel] ?? MessageSquare;
            const DomIcon = dom.icon;
            return (
              <div key={c.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={dom.cls}><DomIcon className="h-3 w-3 mr-1" />{dom.label}</Badge>
                    <Badge variant="outline" className="text-[10px] uppercase">{c.event_type}</Badge>
                    <Badge className={st.cls}>{st.label}</Badge>
                    {c.applied && <Badge className="bg-emerald-500/15 text-emerald-600">aplicada</Badge>}
                    {c.ot_number && <span className="text-xs font-mono text-muted-foreground">{c.ot_number}</span>}
                  </div>
                  <p className="text-sm truncate">{c.raw_message || <span className="text-muted-foreground italic">(sin texto)</span>}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Chan className="h-3 w-3" />{c.operator_name || c.operator_phone || '—'}</span>
                    {c.quantity != null && <span>{Number(c.quantity).toLocaleString('es-CL')} {c.unit ?? 'u.'}</span>}
                    {c.unit_cost != null && c.unit_cost > 0 && <span>{formatCLP(c.unit_cost)}/u</span>}
                    <span>{new Date(c.message_timestamp).toLocaleString('es-CL')}</span>
                  </div>
                </div>
                {c.status === 'pending' && (
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" className="gap-1" onClick={() => act(c, 'approved')} disabled={review.isPending}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Aprobar
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => act(c, 'rejected')} disabled={review.isPending}>
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tint, icon: Icon }: { label: string; value: string; tint: string; icon: React.ElementType }) {
  return (
    <div className="rounded-lg border bg-card/60 p-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{label}</p>
      <p className={`text-2xl font-bold ${tint}`}>{value}</p>
    </div>
  );
}

export default function CapturasPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Capturas en Campo</h1>
          <p className="text-sm text-muted-foreground mt-1">Bandeja unificada de todo lo reportado por el equipo (producción y bodega) vía WhatsApp / QR.</p>
        </div>
        <CapturasInner />
      </div>
    </ProtectedRoute>
  );
}
