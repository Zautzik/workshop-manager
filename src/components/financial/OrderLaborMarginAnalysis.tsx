'use client';

import Link from 'next/link';

import { useState } from 'react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrderLaborMargin } from '@/hooks/use-financial-queries';
import { useOTs } from '@/hooks/use-operations-queries';
import { ArrowRight, Info, Loader2, DollarSign, Percent, Clock } from 'lucide-react';

export function OrderLaborMarginAnalysis() {
  const { data: ots, isLoading: otsLoading } = useOTs();

  // State
  const [selectedOtId, setSelectedOtId] = useState<string>('all');
  const [rangeMonths, setRangeMonths] = useState<number>(6);

  // Calculate date range
  const endDate = endOfMonth(new Date());
  const startDate = startOfMonth(subMonths(endDate, rangeMonths - 1));

  // El endpoint devuelve las filas Y el diagnóstico de por qué no hay filas,
  // cuando no las hay. Mostrar "sin datos disponibles" y callarse deja al
  // usuario adivinando si el período está vacío o si algo está roto.
  const { data: marginData, isLoading: marginsLoading } = useOrderLaborMargin(
    selectedOtId === 'all' ? undefined : selectedOtId,
    format(startDate, 'yyyy-MM-dd'),
    format(endDate, 'yyyy-MM-dd')
  );
  const margins = marginData?.rows;
  const diagnostics = marginData?.diagnostics;

  // Sólo lo que el libro tiene: horas y plata de mano de obra por OT. El margen
  // completo (material + máquina + gente contra el precio) vive en la pestaña
  // "Margen por trabajo"; acá se mira la parte de la gente.
  const summary = margins?.reduce(
    (acc, row) => ({
      revenue: acc.revenue + (row.revenue ?? 0),
      laborCost: acc.laborCost + (row.total_labor_cost ?? 0),
      hours: acc.hours + (row.total_hours ?? 0),
    }),
    { revenue: 0, laborCost: 0, hours: 0 },
  );

  const formatCurrency = (value: number) =>
    `$${Math.round(value).toLocaleString('es-CL')}`;

  const formatHours = (value: number) =>
    `${value.toLocaleString('es-CL', { maximumFractionDigits: 1 })} h`;

  // Una fecha que no se puede leer se muestra como "—", no tumba la tabla.
  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : format(d, 'd MMM yyyy');
  };

  // Qué tanto del precio se come la gente. Umbrales de imprenta: bajo 15% sano,
  // 15–30% a mirar, sobre 30% la mano de obra ya se comió el trabajo.
  const pctTone = (pct: number | null) => {
    if (pct == null) return 'text-muted-foreground';
    if (pct > 30) return 'text-red-600 dark:text-red-400';
    if (pct > 15) return 'text-amber-600 dark:text-amber-400';
    return 'text-emerald-600 dark:text-emerald-400';
  };

  const totalPct = summary && summary.revenue > 0 ? (summary.laborCost / summary.revenue) * 100 : null;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Margen laboral por orden</CardTitle>
          <CardDescription>
            Cuánto costó la gente en cada trabajo: las horas que Planta tenía asignadas a la máquina mientras la OT pasaba, a su tarifa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                Orden de trabajo
              </label>
              <Select value={selectedOtId} onValueChange={setSelectedOtId}>
                <SelectTrigger>
                  <SelectValue placeholder={otsLoading ? 'Cargando...' : 'Todas las órdenes'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las órdenes</SelectItem>
                  {ots?.map((ot) => (
                    <SelectItem key={ot.id} value={ot.id}>
                      {ot.ot_number} - {ot.client_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Período
              </label>
              <Select value={rangeMonths.toString()} onValueChange={(v) => setRangeMonths(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Últimos 3 meses</SelectItem>
                  <SelectItem value="6">Últimos 6 meses</SelectItem>
                  <SelectItem value="12">Últimos 12 meses</SelectItem>
                  <SelectItem value="24">Últimos 24 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tres cifras, todas del libro. Sin "incentivos" ni "sobretiempo":
          nada los separa todavía, y una tarjeta en $0 se lee como un hecho. */}
      {margins && margins.length > 0 && summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Costo de mano de obra</CardTitle>
              <DollarSign className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">{formatCurrency(summary.laborCost)}</div>
              <p className="text-xs text-muted-foreground">
                en {margins.length} {margins.length === 1 ? 'OT' : 'OTs'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Parte del precio</CardTitle>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold tabular-nums ${pctTone(totalPct)}`}>
                {totalPct == null ? '—' : `${totalPct.toFixed(1)}%`}
              </div>
              <p className="text-xs text-muted-foreground">
                de {formatCurrency(summary.revenue)} vendidos en esas OTs
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Horas cargadas</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">{formatHours(summary.hours)}</div>
              <p className="text-xs text-muted-foreground">
                {summary.hours > 0 ? `${formatCurrency(summary.laborCost / summary.hours)} por hora en promedio` : 'sin horas'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Margin Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detalle por orden</CardTitle>
        </CardHeader>
        <CardContent>
          {marginsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !margins || margins.length === 0 ? (
            /* El diagnóstico ya decía qué falta; faltaba ofrecer el sitio donde
               se arregla. Alineado a la izquierda y con acción, como el panorama:
               un texto centrado en medio de una tarjeta vacía se lee como un
               error, no como una instrucción. */
            <div className="flex max-w-2xl flex-col items-start gap-3 py-6">
              {diagnostics?.blocked && diagnostics.reasons.length > 0 ? (
                <>
                  <div className="flex items-center gap-2 text-foreground">
                    <Info className="h-4 w-4 shrink-0 text-amber-500" />
                    <span className="font-semibold">No se puede calcular el margen laboral todavía</span>
                  </div>
                  {diagnostics.reasons.map((r) => (
                    <p key={r} className="text-sm leading-relaxed text-muted-foreground">{r}</p>
                  ))}

                  {/* Las tres cifras que explican el bloqueo, cada una con su
                      nombre: antes iban en una línea monoespaciada seguida. */}
                  <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                    {[
                      { k: 'Etapas cerradas con horas', v: String(diagnostics.passes_with_hours), mal: diagnostics.passes_with_hours === 0 },
                      { k: 'Con gente en Planta', v: `${diagnostics.passes_with_labor} de ${diagnostics.passes_with_hours}`, mal: diagnostics.passes_with_labor === 0 },
                      { k: 'Tarifas cargadas', v: String(diagnostics.rates), mal: diagnostics.rates === 0 },
                    ].map((d) => (
                      <div key={d.k}>
                        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{d.k}</dt>
                        <dd className={`text-sm font-semibold tabular-nums ${d.mal ? 'text-destructive' : 'text-foreground'}`}>{d.v}</dd>
                      </div>
                    ))}
                  </dl>

                  <Link
                    href="/operaciones/planta"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Asignar personal a una OT en Planta <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No hay horas atribuidas a ninguna OT en el período elegido.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OT</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Última carga</TableHead>
                    <TableHead>Quiénes</TableHead>
                    <TableHead className="text-right">Horas</TableHead>
                    <TableHead className="text-right">Mano de obra</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">% del precio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {margins.map((row) => (
                    <TableRow key={row.ot_id}>
                      <TableCell className="font-medium">{row.ot_number ?? '—'}</TableCell>
                      <TableCell>{row.client_name ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(row.last_labor_at)}</TableCell>
                      <TableCell className="max-w-[16rem] truncate text-sm" title={row.people.join(', ')}>
                        {row.people.length > 0 ? row.people.join(', ') : '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{formatHours(row.total_hours)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{formatCurrency(row.total_labor_cost)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                        {row.revenue > 0 ? formatCurrency(row.revenue) : 'sin precio'}
                      </TableCell>
                      <TableCell className={`text-right font-semibold tabular-nums ${pctTone(row.labor_pct_of_revenue)}`}>
                        {row.labor_pct_of_revenue == null ? '—' : `${row.labor_pct_of_revenue.toFixed(1)}%`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
