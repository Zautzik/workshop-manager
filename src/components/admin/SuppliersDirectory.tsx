'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Truck, Building2 } from 'lucide-react';
import { formatCLP } from '@/lib/format';
import { useSuppliers } from '@/hooks/use-procurement-queries';

export function SuppliersDirectory() {
  const { data, isLoading } = useSuppliers();
  const suppliers = data?.data ?? [];
  const totals = data?.totals;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi label="Proveedores" value={String(totals?.count ?? 0)} hint="con órdenes de compra" tint="text-foreground" />
        <Kpi label="Comprado (histórico)" value={formatCLP(totals?.spend ?? 0)} hint="suma de OCs" tint="text-orange-600" />
        <Kpi label="OCs abiertas" value={String(totals?.open ?? 0)} hint="sin cerrar/anular" tint="text-sky-600" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" /> Directorio de proveedores</CardTitle>
          <p className="text-xs text-muted-foreground">Derivado de las órdenes de compra — proveedor, RUT, giro y volumen comprado.</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-muted-foreground">
                <th className="text-left py-2 px-2 font-medium">Proveedor</th>
                <th className="text-left py-2 px-2 font-medium">RUT</th>
                <th className="text-left py-2 px-2 font-medium">Giro</th>
                <th className="text-center py-2 px-2 font-medium">OCs</th>
                <th className="text-right py-2 px-2 font-medium">Total comprado</th>
                <th className="text-right py-2 px-2 font-medium">Última compra</th>
              </tr></thead>
              <tbody>
                {isLoading && <tr><td colSpan={6} className="text-center text-muted-foreground py-8">Cargando…</td></tr>}
                {!isLoading && suppliers.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-muted-foreground py-8">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Sin proveedores aún. Crea una OC en la pestaña Compras.
                  </td></tr>
                )}
                {suppliers.map((s) => (
                  <tr key={s.supplier} className="border-b hover:bg-muted/40">
                    <td className="py-2 px-2 font-medium">{s.supplier}</td>
                    <td className="py-2 px-2 font-mono text-xs text-muted-foreground">{s.supplier_rut ?? '—'}</td>
                    <td className="py-2 px-2 text-muted-foreground truncate max-w-[220px]">{s.supplier_giro ?? '—'}</td>
                    <td className="py-2 px-2 text-center">
                      {s.oc_count}
                      {s.open_count > 0 && <Badge className="ml-1.5 bg-sky-500/15 text-sky-600 text-[10px]">{s.open_count} abiertas</Badge>}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-semibold">{formatCLP(s.total_spend)}</td>
                    <td className="py-2 px-2 text-right text-muted-foreground">{s.last_purchase_date ? new Date(s.last_purchase_date).toLocaleDateString('es-CL') : '—'}</td>
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

function Kpi({ label, value, hint, tint }: { label: string; value: string; hint: string; tint: string }) {
  return (
    <div className="rounded-lg border bg-card/60 p-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${tint}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
    </div>
  );
}
