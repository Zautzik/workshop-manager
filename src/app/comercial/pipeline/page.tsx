'use client';
import { useMemo } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileSpreadsheet, PenLine, CheckCircle2, Factory } from 'lucide-react';
import { useVistosBuenos } from '@/hooks/use-commercial-queries';
import { useOTs } from '@/hooks/use-operations-queries';
import { formatCLP } from '@/lib/format';

const STAGE_BADGE: Record<string, string> = {
  draft: 'bg-slate-500/15 text-slate-500',
  sent: 'bg-sky-500/15 text-sky-500',
  signed: 'bg-amber-500/15 text-amber-600',
  converted: 'bg-green-500/15 text-green-600',
};

function PipelineInner() {
  const { data: vbs = [] } = useVistosBuenos();
  const { data: ots = [] } = useOTs();

  const f = useMemo(() => {
    const sum = (s: string) => vbs.filter((v) => v.status === s).reduce((a, v) => a + Number(v.total_price || 0), 0);
    const cnt = (s: string) => vbs.filter((v) => v.status === s).length;
    const open = vbs.filter((v) => ['draft', 'sent', 'signed'].includes(v.status));
    const activeOTs = (ots as any[]).filter((o) => o.status !== 'completed');
    return {
      stages: [
        { key: 'draft',     label: 'Borradores',   count: cnt('draft'),     total: sum('draft'),     bar: 'bg-slate-400' },
        { key: 'sent',      label: 'Enviadas',     count: cnt('sent'),      total: sum('sent'),      bar: 'bg-sky-500' },
        { key: 'signed',    label: 'Firmadas',     count: cnt('signed'),    total: sum('signed'),    bar: 'bg-amber-500' },
        { key: 'converted', label: 'OT generadas', count: cnt('converted'), total: sum('converted'), bar: 'bg-green-500' },
      ],
      openCount: open.length,
      openTotal: open.reduce((a, v) => a + Number(v.total_price || 0), 0),
      signedTotal: sum('signed'),
      convertedCount: cnt('converted'),
      activeCount: activeOTs.length,
      activeTotal: activeOTs.reduce((a, o) => a + Number(o.total_price || 0), 0),
    };
  }, [vbs, ots]);

  const maxCount = Math.max(1, ...f.stages.map((s) => s.count));
  const recent = [...vbs].slice(0, 12);

  return (
    <div className="space-y-6">
      {/* Funnel headline cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-cyan-500">
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> Cotizaciones abiertas</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCLP(f.openTotal)}</div><p className="text-xs text-muted-foreground mt-1">{f.openCount} en proceso</p></CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2"><PenLine className="h-4 w-4" /> Firmadas (por generar)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-600">{formatCLP(f.signedTotal)}</div><p className="text-xs text-muted-foreground mt-1">listas para OT</p></CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> OT generadas</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{f.convertedCount}</div><p className="text-xs text-muted-foreground mt-1">desde cotización</p></CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2"><Factory className="h-4 w-4" /> OT activas</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-600">{f.activeCount}</div><p className="text-xs text-muted-foreground mt-1">{formatCLP(f.activeTotal)} en planta</p></CardContent>
        </Card>
      </div>

      {/* Funnel */}
      <Card>
        <CardHeader><CardTitle className="text-base">Embudo de ventas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {f.stages.map((s) => (
            <div key={s.key} className="flex items-center gap-3">
              <span className="w-28 text-sm text-muted-foreground">{s.label}</span>
              <div className="flex-1 h-7 rounded bg-muted/40 overflow-hidden">
                <div className={`h-full ${s.bar} flex items-center justify-end px-2 text-xs font-semibold text-white transition-all`}
                  style={{ width: `${Math.max(8, (s.count / maxCount) * 100)}%` }}>
                  {s.count}
                </div>
              </div>
              <span className="w-36 text-right text-sm tabular-nums">{formatCLP(s.total)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Recent quotes */}
      <Card>
        <CardHeader><CardTitle className="text-base">Cotizaciones recientes</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium">N°</th>
                <th className="text-left py-2 px-3 font-medium">Cliente</th>
                <th className="text-left py-2 px-3 font-medium">Producto</th>
                <th className="text-right py-2 px-3 font-medium">Total</th>
                <th className="text-center py-2 px-3 font-medium">Estado</th>
              </tr></thead>
              <tbody>
                {recent.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Sin cotizaciones aún.</td></tr>}
                {recent.map((v) => (
                  <tr key={v.id} className="border-b hover:bg-muted/40">
                    {/* El número de la OT, no uno propio de la cotización. Un
                        trabajo tenía dos identidades —VB-00008 y 41232— para la
                        misma cosa, y había que cruzarlas a mano para seguirlo. */}
                    <td className="py-2 px-3 font-mono text-xs">
                      {v.ot_number ?? <span className="text-muted-foreground">sin OT</span>}
                    </td>
                    <td className="py-2 px-3">{v.client_name}</td>
                    <td className="py-2 px-3 text-muted-foreground truncate max-w-[220px]">{v.product_name}</td>
                    <td className="py-2 px-3 text-right font-semibold">{formatCLP(v.total_price)}</td>
                    <td className="py-2 px-3 text-center"><Badge className={STAGE_BADGE[v.status] ?? ''}>{v.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PipelineVentasPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pipeline de Ventas</h1>
          <p className="text-sm text-muted-foreground mt-1">El embudo completo: cotización → firma → OT → planta, de todos los vendedores.</p>
        </div>
        <PipelineInner />
      </div>
    </ProtectedRoute>
  );
}
