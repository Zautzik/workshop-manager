'use client';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, Search, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useOtCostSummary, type OtCostSummaryRow } from '@/hooks/use-financial-queries';
import { marginConfidence } from '@/lib/margin-confidence';
import { RentabilidadPanorama } from '@/components/financial/RentabilidadPanorama';
import { useOTs } from '@/hooks/use-operations-queries';
import { formatCLP } from '@/lib/format';
import { useAnalyticsFilters } from '@/contexts/AnalyticsFiltersContext';

// Cost categories map 1:1 to the ledger's cost_line_category.
const COST_FIELDS = [
  { key: 'material',   label: 'Materiales (papel, tinta…)' },
  { key: 'labor',      label: 'Mano de obra' },
  { key: 'machine',    label: 'Máquina / energía' },
  { key: 'finishing',  label: 'Terminaciones' },
  { key: 'outsourced', label: 'Tercerizado' },
  { key: 'overhead',   label: 'Gastos generales' },
] as const;

type CostKey = (typeof COST_FIELDS)[number]['key'];

type SortKey = 'ot' | 'client' | 'material' | 'labor' | 'machine' | 'other' | 'estimated' | 'actual' | 'revenue' | 'margin' | 'pct';
type Enriched = { row: OtCostSummaryRow; v: ReturnType<typeof marginConfidence> };

function sortValue(item: Enriched, key: SortKey): number | string {
  const { row: r, v } = item;
  switch (key) {
    case 'ot': return r.ot_number ?? '';
    case 'client': return r.client_name ?? '';
    case 'material': return r.material_actual;
    case 'labor': return r.labor_actual;
    case 'machine': return r.machine_actual;
    case 'other': return r.other_actual;
    case 'estimated': return r.estimated_cost;
    case 'actual': return r.actual_cost;
    case 'revenue': return r.revenue;
    case 'margin': return v.confidence === 'medido' ? v.amount! : 0;
    case 'pct': return v.pct ?? 0;
    default: return '';
  }
}

/** Encabezado clickeable: ordena por su columna, invierte si ya es la activa. */
function SortTh({
  label, sortKey, active, dir, onClick, align = 'right', className = '',
}: {
  label: string; sortKey: SortKey; active: boolean; dir: 'asc' | 'desc';
  onClick: (k: SortKey) => void; align?: 'left' | 'right'; className?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`py-2 px-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 hover:opacity-80 ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? '' : 'opacity-30'}`} />
      </button>
    </th>
  );
}

export const OTFinancialTracking = () => {
  const queryClient = useQueryClient();
  const { range, comparison } = useAnalyticsFilters();

  // El período se filtra EN EL SERVIDOR (la ruta ya lo soporta) — no en el
  // cliente contra useOTs(), que trae como mucho 200 filas y ya se quedó
  // corta con 234 OT: una OT fuera de esas 200 pasaba el filtro de CUALQUIER
  // período, porque "sin fecha resuelta" se trataba como "siempre visible".
  // El segundo llamado (con el período de comparación) es lo que permite
  // decir "el margen subió 4 puntos" en vez de mostrar un número suelto.
  const { data: rows = [] } = useOtCostSummary({ from: range.from.toISOString(), to: range.to.toISOString() });
  const { data: comparisonRows = [] } = useOtCostSummary({ from: comparison.from.toISOString(), to: comparison.to.toISOString() });
  const { data: ots = [] } = useOTs();

  const [selectedOtId, setSelectedOtId] = useState('');
  const [amounts, setAmounts] = useState<Record<CostKey, number>>({
    material: 0, labor: 0, machine: 0, finishing: 0, outsourced: 0, overhead: 0,
  });
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Buscador único: filtra a la vez los gráficos de arriba (vía `visibleRows`
  // y `visibleComparisonRows`, que bajan como prop al panorama) y la tabla de
  // abajo — no hace falta un buscador por panel. Se aplica al período de
  // comparación también: si se busca un cliente, el delta compara peras con
  // peras — sus cifras de este mes contra las mismas de él el mes pasado.
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const matchesQuery = (r: OtCostSummaryRow, q: string) =>
    r.ot_number?.toLowerCase().includes(q) || r.client_name?.toLowerCase().includes(q);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => matchesQuery(r, q)) : rows;
  }, [rows, query]);

  const visibleComparisonRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? comparisonRows.filter((r) => matchesQuery(r, q)) : comparisonRows;
  }, [comparisonRows, query]);

  const enriched: Enriched[] = useMemo(
    () => visibleRows.map((r) => ({ row: r, v: marginConfidence(r) })),
    [visibleRows],
  );

  // Peor margen primero por defecto — lo que necesita atención no debería
  // requerir scroll para aparecer —, pero cualquier columna se ordena con un
  // clic en su encabezado. Las OT sin margen medido van siempre al final, sea
  // cual sea la columna: no hay valor que ordenar de una cifra que no existe.
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'margin', dir: 'asc' });
  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'margin' ? 'asc' : 'desc' }));
    setPage(0);
  };

  const sorted = useMemo(() => {
    const arr = [...enriched];
    arr.sort((a, b) => {
      const aMed = a.v.confidence === 'medido';
      const bMed = b.v.confidence === 'medido';
      if (aMed !== bMed) return aMed ? -1 : 1;
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      const cmp = typeof av === 'string' || typeof bv === 'string'
        ? String(av).localeCompare(String(bv))
        : (av as number) - (bv as number);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [enriched, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageClamped = Math.min(page, pageCount - 1);
  const paged = sorted.slice(pageClamped * PAGE_SIZE, (pageClamped + 1) * PAGE_SIZE);

  const resetForm = () => {
    setSelectedOtId('');
    setAmounts({ material: 0, labor: 0, machine: 0, finishing: 0, outsourced: 0, overhead: 0 });
  };

  const handleSubmit = async () => {
    if (!selectedOtId) { toast.error('Seleccione una OT'); return; }
    const lines = COST_FIELDS
      .filter((f) => Number(amounts[f.key]) > 0)
      .map((f) => ({ category: f.key, description: f.label, quantity: 1, unit: 'global', unit_cost: amounts[f.key] }));
    if (lines.length === 0) { toast.error('Ingrese al menos un costo'); return; }

    setSaving(true);
    const res = await fetch('/api/ots/cost-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ot_id: selectedOtId, lines }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? 'Error al registrar costos');
      return;
    }
    toast.success('Costos reales registrados en el ledger');
    setIsOpen(false);
    resetForm();
    queryClient.invalidateQueries({ queryKey: ['otCostSummary'] });
  };

  return (
    <div className="space-y-6">
      {/* Summary — straight from the unified cost ledger, ya recortado por
          período y por el buscador de la tabla de abajo. */}
      <RentabilidadPanorama
        rows={visibleRows as any}
        comparisonRows={visibleComparisonRows as any}
        onSelect={(q) => {
          setQuery(q);
          setPage(0);
          document.getElementById('detalle-completo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button onClick={() => { resetForm(); setIsOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Registrar costo real
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Registrar costo real (ledger)</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Orden de Trabajo</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2"
                value={selectedOtId}
                onChange={(e) => setSelectedOtId(e.target.value)}
              >
                <option value="">Seleccione una OT…</option>
                {ots.map((ot: any) => (
                  <option key={ot.id} value={ot.id}>{ot.ot_number} — {ot.client_name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {COST_FIELDS.map((f) => (
                <div key={f.key}>
                  <Label className="text-xs">{f.label} ($)</Label>
                  <Input
                    type="number" min="0"
                    value={amounts[f.key] || ''}
                    onChange={(e) => setAmounts({ ...amounts, [f.key]: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Cada monto se guarda como una línea <strong>actual</strong> en el ledger de costos de la OT.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setIsOpen(false); resetForm(); }}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Estimate vs Real per OT — el detalle completo de todo lo que arriba
          se muestra recortado: buscador, orden por columna y paginación en
          vez de volcar cientos de filas de una vez. */}
      <Card id="detalle-completo" className="scroll-mt-6">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Estimado vs Real por OT</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {sorted.length} de {rows.length} OT{query.trim() ? ` — coinciden con «${query.trim()}»` : ''}
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0); }}
              placeholder="Buscar OT o cliente…"
              className="h-8 pl-8 text-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <SortTh label="OT" sortKey="ot" align="left" active={sort.key === 'ot'} dir={sort.dir} onClick={toggleSort} />
                  <SortTh label="Cliente" sortKey="client" align="left" active={sort.key === 'client'} dir={sort.dir} onClick={toggleSort} />
                  {/* Vista de tabla del desglose: en claro, «Máquina» y «Otros»
                      quedan bajo 3:1 de contraste en el gráfico, y la regla de
                      relieve exige que su valor se pueda leer sin el tooltip. */}
                  <SortTh label="Materiales" sortKey="material" active={sort.key === 'material'} dir={sort.dir} onClick={toggleSort} />
                  <SortTh label="Mano de obra" sortKey="labor" active={sort.key === 'labor'} dir={sort.dir} onClick={toggleSort} />
                  <SortTh label="Máquina" sortKey="machine" active={sort.key === 'machine'} dir={sort.dir} onClick={toggleSort} />
                  <SortTh label="Otros" sortKey="other" active={sort.key === 'other'} dir={sort.dir} onClick={toggleSort} />
                  <SortTh label="Estimado" sortKey="estimated" className="text-amber-600" active={sort.key === 'estimated'} dir={sort.dir} onClick={toggleSort} />
                  <SortTh label="Real" sortKey="actual" className="text-destructive" active={sort.key === 'actual'} dir={sort.dir} onClick={toggleSort} />
                  <SortTh label="Ingresos" sortKey="revenue" className="text-primary" active={sort.key === 'revenue'} dir={sort.dir} onClick={toggleSort} />
                  <SortTh label="Margen" sortKey="margin" active={sort.key === 'margin'} dir={sort.dir} onClick={toggleSort} />
                  <SortTh label="%" sortKey="pct" active={sort.key === 'pct'} dir={sort.dir} onClick={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={11} className="py-8 text-center text-muted-foreground">Sin datos en el ledger todavía.</td></tr>
                )}
                {rows.length > 0 && paged.length === 0 && (
                  <tr><td colSpan={11} className="py-8 text-center text-muted-foreground">Ninguna OT coincide con el filtro actual.</td></tr>
                )}
                {paged.map(({ row: r, v }) => {
                  return (
                    <tr key={r.ot_id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3 font-medium">{r.ot_number}</td>
                      <td className="py-2 px-3 text-muted-foreground">{r.client_name}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{formatCLP(r.material_actual)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{formatCLP(r.labor_actual)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{formatCLP(r.machine_actual)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{formatCLP(r.other_actual)}</td>
                      <td className="py-2 px-3 text-right text-amber-600">{formatCLP(r.estimated_cost)}</td>
                      <td className="py-2 px-3 text-right text-destructive">{formatCLP(r.actual_cost)}</td>
                      <td className="py-2 px-3 text-right text-primary">{formatCLP(r.revenue)}</td>
                      <td className={`py-2 px-3 text-right font-semibold ${
                        v.confidence !== 'medido' ? 'text-muted-foreground' : v.amount! >= 0 ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {v.confidence === 'medido' ? formatCLP(v.amount!) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right" title={v.hint ?? undefined}>
                        {v.pct !== null
                          ? `${v.pct}%`
                          : <span className="text-muted-foreground text-xs italic">{v.label}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {sorted.length > PAGE_SIZE && (
            <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
              <span>
                {pageClamped * PAGE_SIZE + 1}–{Math.min((pageClamped + 1) * PAGE_SIZE, sorted.length)} de {sorted.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={pageClamped === 0}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="tabular-nums">{pageClamped + 1} / {pageCount}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={pageClamped >= pageCount - 1}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
