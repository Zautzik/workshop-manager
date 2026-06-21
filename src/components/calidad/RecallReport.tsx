'use client';
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search, Boxes, AlertTriangle, Users, ClipboardList, Printer, Building2, FileWarning,
} from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useRecallLots, useRecall } from '@/hooks/use-recall';
import { otStatusLabel, otStatusColor } from '@/lib/status-labels';

const fmtDate = (s: string | null | undefined) =>
  s && isValid(parseISO(s)) ? format(parseISO(s), 'PP', { locale: es }) : '—';

const isExpired = (s: string | null | undefined) =>
  !!s && isValid(parseISO(s)) && parseISO(s).getTime() < Date.now();

function Stat({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string | number; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className={cn('h-4 w-4', tone)} />{label}
        </div>
        <div className={cn('mt-1 text-2xl font-bold', tone ?? 'text-foreground')}>{value}</div>
      </CardContent>
    </Card>
  );
}

export default function RecallReport() {
  const { data: lotsData } = useRecallLots();
  const lots = lotsData?.lots ?? [];
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: trace, isLoading } = useRecall(selectedId);

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return lots.filter((l) =>
      l.lot_number?.toLowerCase().includes(q) ||
      l.supplier_name?.toLowerCase().includes(q) ||
      l.item?.name?.toLowerCase().includes(q)
    ).slice(0, 7);
  }, [lots, search]);

  return (
    <div className="space-y-6">
      <Card className="print:hidden">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar lote por número, proveedor o insumo para simular un retiro…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {suggestions.length > 0 && selectedId === null && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden">
                {suggestions.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => { setSelectedId(l.id); setSearch(l.lot_number); }}
                    className="w-full text-left px-3 py-2 hover:bg-muted/60 flex items-center gap-2 text-sm"
                  >
                    <Boxes className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-mono">{l.lot_number}</span>
                    <span className="text-muted-foreground truncate">{l.item?.name}</span>
                    {isExpired(l.certification_expires_on) && (
                      <Badge variant="outline" className="ml-auto text-[10px] border-rose-500/40 text-rose-500">cert. vencido</Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedId && isLoading && (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      )}

      {!selectedId && (
        <div className="text-center py-16 text-muted-foreground">
          <FileWarning className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Selecciona un lote para simular su retiro y ver el impacto aguas abajo.</p>
        </div>
      )}

      {selectedId && trace && (
        <div className="space-y-5">
          {/* Lot header */}
          <Card className={cn('border-l-4', isExpired(trace.lot.certification_expires_on) ? 'border-l-rose-500' : 'border-l-amber-500')}>
            <CardContent className="p-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Boxes className="h-5 w-5 text-muted-foreground" />
                  <span className="font-mono text-lg font-bold">{trace.lot.lot_number}</span>
                  {isExpired(trace.lot.certification_expires_on) && (
                    <Badge className="bg-rose-500 text-white text-xs">Certificado vencido</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{trace.lot.item?.name} · {trace.lot.supplier_name ?? 'Proveedor s/d'}</p>
                <div className="flex gap-4 text-xs text-muted-foreground mt-2 flex-wrap">
                  {trace.lot.certification_code && <span>Cert. {trace.lot.certification_code}</span>}
                  <span>Vence {fmtDate(trace.lot.certification_expires_on)}</span>
                  <span>Recibido {fmtDate(trace.lot.received_date)}</span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5 print:hidden" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" /> Exportar
              </Button>
            </CardContent>
          </Card>

          {/* Impact summary */}
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={ClipboardList} label="OTs afectadas" value={trace.summary.ot_count} tone="text-amber-500" />
            <Stat icon={Users} label="Clientes afectados" value={trace.summary.customer_count} tone="text-rose-500" />
            <Stat icon={Boxes} label="Cantidad consumida" value={trace.summary.total_consumed.toLocaleString()} tone="text-indigo-500" />
          </div>

          {trace.summary.ot_count === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
              Este lote no fue consumido por ninguna OT — sin impacto aguas abajo.
            </CardContent></Card>
          ) : (
            <>
              {/* Customers to notify */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4" />Clientes a notificar ({trace.customers.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {trace.customers.map((c) => (
                      <span key={c} className="rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 px-3 py-1 text-sm font-medium">{c}</span>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Affected OTs */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />Órdenes que consumieron el lote
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground border-b">
                          <th className="py-2 pr-3">OT</th>
                          <th className="py-2 pr-3">Cliente</th>
                          <th className="py-2 pr-3">Estado</th>
                          <th className="py-2 pr-3">Fecha</th>
                          <th className="py-2 pr-3 text-right">Consumido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trace.affected_ots.map((ot) => (
                          <tr key={ot.id} className="border-b border-border/50">
                            <td className="py-2 pr-3 font-mono">{ot.ot_number}</td>
                            <td className="py-2 pr-3">{ot.client_name}</td>
                            <td className="py-2 pr-3">
                              <Badge className={cn('text-white text-xs', otStatusColor(ot.status))}>{otStatusLabel(ot.status)}</Badge>
                            </td>
                            <td className="py-2 pr-3 text-xs text-muted-foreground">{fmtDate(ot.created_at)}</td>
                            <td className="py-2 pr-3 text-right">{ot.consumed_quantity.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
