'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useOTs } from '@/hooks/use-operations-queries';
import {
  FileText,
  Printer,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  BarChart3,
  AlertCircle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types for the cost-analysis API response                          */
/* ------------------------------------------------------------------ */
interface CostLineItem {
  code: string;
  description: string;
  category: string;
  estimated_qty: number;
  estimated_unit: string;
  estimated_unit_cost: number;
  estimated_cost: number;
  actual_qty: number | null;
  actual_unit: string;
  actual_unit_cost: number | null;
  actual_cost: number;
  deviation_pct: number | null;
  has_actual: boolean;
  workflow_steps: string[];
}

interface CostAnalysis {
  ot: {
    id: string;
    ot_number: string;
    client_name: string;
    product_name: string | null;
    quantity: number;
    status: string;
    created_at: string;
    budget_amount: number;
  };
  summary: {
    total_estimated: number;
    total_actual: number;
    overall_deviation_pct: number | null;
    line_item_count: number;
    items_with_actuals: number;
    items_over_budget: number;
    items_under_budget: number;
  };
  line_items: CostLineItem[];
  workflow_steps_reported: string[];
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function OTCostAnalysisReport() {
  const { data: ots = [] } = useOTs();
  const [selectedOTId, setSelectedOTId] = useState<string>('');
  const [analysis, setAnalysis] = useState<CostAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  // Filter OTs for selector
  const filteredOTs = ots.filter(
    (o) =>
      o.ot_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.client_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const fetchAnalysis = async (otId: string) => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch(`/api/ots/${otId}/cost-analysis`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Error al cargar análisis');
      }
      const data: CostAnalysis = await res.json();
      setAnalysis(data);
    } catch (err: any) {
      setError(err.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedOTId) fetchAnalysis(selectedOTId);
  }, [selectedOTId]);

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
      <head>
        <title>Análisis de Costos - ${analysis?.ot.ot_number}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          h2 { font-size: 14px; color: #666; margin-bottom: 16px; }
          .header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
          .header-item { font-size: 12px; }
          .header-item strong { display: inline-block; min-width: 100px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 12px; }
          th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: right; }
          th { background: #f5f5f5; font-weight: bold; }
          td:nth-child(1), td:nth-child(2), td:nth-child(3), th:nth-child(1), th:nth-child(2), th:nth-child(3) { text-align: left; }
          .positive { color: #dc2626; }
          .negative { color: #16a34a; }
          tfoot td { font-weight: bold; background: #f9f9f9; }
          .summary-boxes { display: flex; gap: 12px; margin-bottom: 12px; }
          .summary-box { border: 1px solid #ccc; border-radius: 6px; padding: 8px 12px; flex: 1; text-align: center; }
          .summary-box .value { font-size: 16px; font-weight: bold; }
          .summary-box .label { font-size: 10px; color: #888; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>${printRef.current.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const devIcon = (pct: number | null) => {
    if (pct === null) return <Minus className="h-3 w-3 text-muted-foreground" />;
    if (pct > 0) return <TrendingUp className="h-3 w-3 text-red-400" />;
    if (pct < 0) return <TrendingDown className="h-3 w-3 text-green-400" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  const devColor = (pct: number | null) => {
    if (pct === null) return 'text-muted-foreground';
    if (pct > 5) return 'text-red-400 font-semibold';
    if (pct < -5) return 'text-green-400 font-semibold';
    return 'text-muted-foreground';
  };

  const devBg = (pct: number | null) => {
    if (pct === null) return '';
    if (pct > 10) return 'bg-red-500/10';
    if (pct < -10) return 'bg-green-500/10';
    return '';
  };

  const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`;

  return (
    <div className="space-y-6">
      {/* OT Selector */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Análisis de Costos por OT
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-xs">
              <Label className="text-xs text-muted-foreground">Buscar OT</Label>
              <Input
                placeholder="Nº OT o cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="flex-1 max-w-md">
              <Label className="text-xs text-muted-foreground">Seleccionar OT</Label>
              <Select value={selectedOTId} onValueChange={setSelectedOTId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccione una OT..." />
                </SelectTrigger>
                <SelectContent>
                  <ScrollArea className="max-h-60">
                    {filteredOTs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.ot_number} — {o.client_name}
                      </SelectItem>
                    ))}
                  </ScrollArea>
                </SelectContent>
              </Select>
            </div>
            {analysis && (
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" />
                Imprimir
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Cargando análisis de costos...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 p-4 rounded-md bg-red-500/10 border border-red-500/30">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Analysis Report */}
      {analysis && (
        <div ref={printRef}>
          {/* Report Header */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <FileText className="h-5 w-5 text-primary" />
                    Análisis de Costos
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Comparación presupuesto vs. costos reales
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    (analysis.summary.overall_deviation_pct ?? 0) > 0
                      ? 'border-red-500/50 text-red-400'
                      : 'border-green-500/50 text-green-400'
                  }
                >
                  {analysis.summary.items_with_actuals} / {analysis.summary.line_item_count} ítems
                  con datos reales
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {/* OT Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                <div>
                  <span className="text-muted-foreground">OT Nº:</span>{' '}
                  <strong>{analysis.ot.ot_number}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Cliente:</span>{' '}
                  <strong>{analysis.ot.client_name}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Producto:</span>{' '}
                  <strong>{analysis.ot.product_name || '—'}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Cantidad:</span>{' '}
                  <strong>{analysis.ot.quantity?.toLocaleString()}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Fecha:</span>{' '}
                  <strong>
                    {new Date(analysis.ot.created_at).toLocaleDateString('es-CL')}
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Estado:</span>{' '}
                  <Badge variant="outline" className="ml-1">
                    {analysis.ot.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Presupuesto:</span>{' '}
                  <strong>{fmtMoney(analysis.ot.budget_amount)}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Etapas reportadas:</span>{' '}
                  <strong>{analysis.workflow_steps_reported.length}</strong>
                </div>
              </div>

              <Separator className="my-4" />

              {/* Summary Boxes */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <Card className="bg-blue-500/10 border-blue-500/30">
                  <CardContent className="p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Valor Previsto
                    </p>
                    <p className="text-lg font-bold text-blue-400">
                      {fmtMoney(analysis.summary.total_estimated)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-primary/10 border-primary/30">
                  <CardContent className="p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Valor Real
                    </p>
                    <p className="text-lg font-bold text-primary">
                      {fmtMoney(analysis.summary.total_actual)}
                    </p>
                  </CardContent>
                </Card>
                <Card
                  className={`${
                    (analysis.summary.overall_deviation_pct ?? 0) > 0
                      ? 'bg-red-500/10 border-red-500/30'
                      : 'bg-green-500/10 border-green-500/30'
                  }`}
                >
                  <CardContent className="p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Desvío General
                    </p>
                    <p
                      className={`text-lg font-bold ${
                        (analysis.summary.overall_deviation_pct ?? 0) > 0
                          ? 'text-red-400'
                          : 'text-green-400'
                      }`}
                    >
                      {analysis.summary.overall_deviation_pct !== null
                        ? `${analysis.summary.overall_deviation_pct > 0 ? '+' : ''}${Math.round(analysis.summary.overall_deviation_pct)}%`
                        : '—'}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-amber-500/10 border-amber-500/30">
                  <CardContent className="p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Sobre Presup.
                    </p>
                    <p className="text-lg font-bold text-amber-400">
                      {analysis.summary.items_over_budget} /{' '}
                      {analysis.summary.line_item_count}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Cost Analysis Table */}
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[60px]">Código</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right w-[80px]">Cant. Est.</TableHead>
                      <TableHead className="w-[60px]">Unidad</TableHead>
                      <TableHead className="text-right w-[80px]">Cant. Real</TableHead>
                      <TableHead className="text-right w-[100px]">Costo Est.</TableHead>
                      <TableHead className="text-right w-[100px]">Costo Real</TableHead>
                      <TableHead className="text-right w-[80px]">Desvío %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analysis.line_items.map((item) => (
                      <TableRow key={item.code} className={devBg(item.deviation_pct)}>
                        <TableCell className="font-mono text-xs">{item.code}</TableCell>
                        <TableCell className="font-medium text-sm">
                          {item.description}
                          {!item.has_actual && item.estimated_cost > 0 && (
                            <Badge
                              variant="outline"
                              className="ml-2 text-[10px] border-muted-foreground/30"
                            >
                              Sin datos reales
                            </Badge>
                          )}
                          {item.estimated_cost === 0 && item.has_actual && (
                            <Badge
                              variant="outline"
                              className="ml-2 text-[10px] border-amber-500/40 text-amber-400"
                            >
                              No presupuestado
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {item.estimated_qty > 0 ? item.estimated_qty.toLocaleString() : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.estimated_unit || item.actual_unit}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {item.actual_qty !== null ? item.actual_qty.toLocaleString() : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {item.estimated_cost > 0 ? fmtMoney(item.estimated_cost) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {item.actual_cost > 0 ? fmtMoney(item.actual_cost) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`flex items-center justify-end gap-1 text-sm ${devColor(item.deviation_pct)}`}>
                            {devIcon(item.deviation_pct)}
                            {item.deviation_pct !== null
                              ? `${item.deviation_pct > 0 ? '+' : ''}${Math.round(item.deviation_pct)}%`
                              : '—'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-muted/70 font-bold">
                      <TableCell colSpan={5} className="text-right">
                        TOTALES
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtMoney(analysis.summary.total_estimated)}
                      </TableCell>
                      <TableCell className="text-right text-primary">
                        {fmtMoney(analysis.summary.total_actual)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={devColor(analysis.summary.overall_deviation_pct)}>
                          {analysis.summary.overall_deviation_pct !== null
                            ? `${analysis.summary.overall_deviation_pct > 0 ? '+' : ''}${Math.round(analysis.summary.overall_deviation_pct)}%`
                            : '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              {/* Workflow Steps Legend */}
              {analysis.workflow_steps_reported.length > 0 && (
                <div className="mt-4 text-xs text-muted-foreground">
                  <span className="font-medium">Etapas con costos reportados:</span>{' '}
                  {analysis.workflow_steps_reported.map((step) => (
                    <Badge key={step} variant="outline" className="ml-1 text-[10px]">
                      {step}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty State */}
      {!selectedOTId && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Search className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg font-medium">Seleccione una OT</p>
          <p className="text-sm">
            Elija una orden de trabajo para ver el análisis de costos estimados vs. reales.
          </p>
        </div>
      )}
    </div>
  );
}
