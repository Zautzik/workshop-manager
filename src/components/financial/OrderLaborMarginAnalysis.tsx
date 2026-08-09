'use client';

import Link from 'next/link';

import { useState } from 'react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrderLaborMargin } from '@/hooks/use-financial-queries';
import { useOTs } from '@/hooks/use-operations-queries';
import { ArrowRight, Info, Loader2, TrendingUp, TrendingDown, DollarSign, AlertCircle, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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

  // Calculate summary stats
  const summary = margins?.reduce(
    (acc, row) => ({
      totalRevenue: acc.totalRevenue + row.revenue,
      totalLaborCost: acc.totalLaborCost + row.total_labor_cost,
      totalIncentiveCost: acc.totalIncentiveCost + row.incentive_cost,
      totalCost: acc.totalCost + row.total_cost,
      totalMargin: acc.totalMargin + row.gross_margin,
      totalHours: acc.totalHours + row.labor_hours,
      totalOTHours: acc.totalOTHours + row.overtime_hours,
    }),
    { 
      totalRevenue: 0, 
      totalLaborCost: 0, 
      totalIncentiveCost: 0, 
      totalCost: 0, 
      totalMargin: 0,
      totalHours: 0,
      totalOTHours: 0,
    }
  );

  const avgMarginPercentage = summary && summary.totalRevenue > 0 
    ? (summary.totalMargin / summary.totalRevenue) * 100 
    : 0;

  const formatCurrency = (value: number) =>
    `$${Math.round(value).toLocaleString('es-CL')}`;

  const formatPercentage = (value: number) => `${Math.round(value)}%`;

  const formatHours = (value: number) => `${Math.round(value)}h`;

  const getMarginStatus = (percentage: number) => {
    if (percentage >= 30) return { label: 'Excellent', color: 'bg-green-500', icon: CheckCircle };
    if (percentage >= 20) return { label: 'Good', color: 'bg-blue-500', icon: TrendingUp };
    if (percentage >= 10) return { label: 'Fair', color: 'bg-yellow-500', icon: AlertCircle };
    if (percentage >= 0) return { label: 'Low', color: 'bg-orange-500', icon: AlertCircle };
    return { label: 'Loss', color: 'bg-red-500', icon: TrendingDown };
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Margen laboral por orden</CardTitle>
          <CardDescription>
            Cuánto queda de cada trabajo después de pagar las horas de la gente que lo hizo, incluidos sobretiempo e incentivos.
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

      {/* Summary Cards */}
      {margins && margins.length > 0 && summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ingresos totales</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(summary.totalRevenue / margins.length)} prom/orden
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Costo de mano de obra</CardTitle>
              <DollarSign className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.totalLaborCost)}</div>
              <p className="text-xs text-muted-foreground">
                {((summary.totalLaborCost / summary.totalRevenue) * 100).toFixed(1)}% de ingresos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Costo de incentivos</CardTitle>
              <DollarSign className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.totalIncentiveCost)}</div>
              <p className="text-xs text-muted-foreground">
                {((summary.totalIncentiveCost / summary.totalRevenue) * 100).toFixed(1)}% de ingresos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Margen bruto</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.totalMargin)}</div>
              <p className="text-xs text-muted-foreground">
                {formatPercentage(avgMarginPercentage)} de margen
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Horas de mano de obra</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatHours(summary.totalHours)}</div>
              <p className="text-xs text-muted-foreground">
                {formatPercentage((summary.totalOTHours / summary.totalHours) * 100)} OT
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
                      { k: 'Partes con OT', v: `${diagnostics.assignments_with_ot} de ${diagnostics.assignments_total}`, mal: diagnostics.assignments_with_ot === 0 },
                      { k: 'Marcas de reloj', v: String(diagnostics.clock_events), mal: diagnostics.clock_events === 0 },
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
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Ingresos</TableHead>
                    <TableHead className="text-right">Mano de obra</TableHead>
                    <TableHead className="text-right">Sobretiempo</TableHead>
                    <TableHead className="text-right">Incentivos</TableHead>
                    <TableHead className="text-right">Costo total</TableHead>
                    <TableHead className="text-right">Margen</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-right">Horas</TableHead>
                    <TableHead className="text-right">$/hora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {margins.map((row) => {
                    const status = getMarginStatus(row.margin_percentage);
                    const StatusIcon = status.icon;
                    return (
                      <TableRow key={row.ot_id}>
                        <TableCell className="font-medium">{row.ot_number}</TableCell>
                        <TableCell>{row.client_name}</TableCell>
                        <TableCell>{format(new Date(row.order_date), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="text-right font-semibold text-green-700">
                          {formatCurrency(row.revenue)}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(row.base_labor_cost)}</TableCell>
                        <TableCell className="text-right text-orange-600">
                          {formatCurrency(row.overtime_premium)}
                        </TableCell>
                        <TableCell className="text-right text-blue-600">
                          {formatCurrency(row.incentive_cost)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(row.total_cost)}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          <div>{formatCurrency(row.gross_margin)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatPercentage(row.margin_percentage)}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`${status.color} text-white border-none`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          <div>{formatHours(row.labor_hours)}</div>
                          <div className="text-xs text-orange-600">
                            {formatHours(row.overtime_hours)} OT
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(row.cost_per_hour)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
