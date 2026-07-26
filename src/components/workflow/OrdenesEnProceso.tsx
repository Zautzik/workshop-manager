'use client';
import { useState, useRef, useCallback } from 'react';
import { otStatusLabel, otStatusBadgeClass } from '@/lib/status-labels';
import { useActiveOTs, queryKeys } from '@/hooks/use-workflow-queries';
import { useRealtimeProduction } from '@/hooks/use-realtime-production';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Printer, Search, RefreshCw, Edit2, Check, X, Wifi, WifiOff } from 'lucide-react';
import { AdvanceFlags } from '@/components/workflow/AdvanceFlags';

// ─── Helpers ────────────────────────────────────────────────────────────────

const COLOR_VALUE: Record<string, string> = {
  cmyk: '4',
  '1_color': '1',
  '2_color': '2',
  '3_color': '3',
  cmyk_pantone: '4+P',
  sin_impresion: '0',
};

function formatColor(front?: string | null, back?: string | null): string {
  const f = COLOR_VALUE[front ?? ''] ?? '—';
  const b = COLOR_VALUE[back ?? ''] ?? '0';
  if (!front) return '—';
  return `${f}/${b}`;
}

function formatDeadline(deadline?: string | null): string {
  if (!deadline) return '—';
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function isOverdue(deadline?: string | null): boolean {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

// ─── Inline editable cell ───────────────────────────────────────────────────

function InlineEditable({
  value,
  onSave,
  placeholder,
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commit = async () => {
    setEditing(false);
    if (draft !== value) await onSave(draft);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 min-w-[140px]">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
          }}
          className="h-7 text-base px-2 py-0"
        />
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={commit}>
          <Check className="h-3 w-3 text-green-600" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancel}>
          <X className="h-3 w-3 text-destructive" />
        </Button>
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className="group flex items-center gap-1 text-left text-base text-foreground hover:text-primary transition-colors"
    >
      <span className={value ? '' : 'text-muted-foreground italic'}>
        {value || placeholder || 'Sin nota'}
      </span>
      <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
    </button>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function OrdenesEnProceso() {
  const { data: ots = [], isLoading, refetch } = useActiveOTs();
  const { isConnected } = useRealtimeProduction();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── patch helper ──────────────────────────────────────────────────────────
  const patchOT = useCallback(
    async (id: string, fields: Record<string, unknown>) => {
      const res = await fetch(`/api/ots/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast({
          title: 'Error al guardar',
          description: body?.error ?? 'Request failed',
          variant: 'destructive',
        });
        return;
      }
      // Invalidate both OT caches so Kanban also refreshes
      queryClient.invalidateQueries({ queryKey: queryKeys.ots });
    },
    [queryClient, toast]
  );

  // ── filter ────────────────────────────────────────────────────────────────
  const filtered = ots.filter((ot) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      ot.ot_number?.toLowerCase().includes(q) ||
      ot.client_name?.toLowerCase().includes(q) ||
      (ot.product_name ?? '').toLowerCase().includes(q) ||
      (ot.description ?? '').toLowerCase().includes(q);
    const matchStatus = !statusFilter || ot.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // ── unique statuses present ───────────────────────────────────────────────
  const presentStatuses = Array.from(new Set(ots.map((o) => o.status))).filter(Boolean);

  // ── print handler ─────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <Card className="bg-card/80 border-border backdrop-blur-sm p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar OT, cliente, trabajo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground"
          >
            <option value="">Todos los estados</option>
            {presentStatuses.map((s) => (
              <option key={s} value={s}>
                {otStatusLabel(s)}
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="border-border bg-card/50 hover:bg-card gap-1.5"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="border-border bg-card/50 hover:bg-card gap-1.5 print:hidden"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>

            <div
              className={`flex items-center gap-1.5 text-xs font-medium ml-auto print:hidden ${
                isConnected ? 'text-emerald-600' : 'text-amber-500'
              }`}
              title={isConnected ? 'Actualizaciones en vivo activas' : 'Sin conexión en tiempo real'}
            >
              {isConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {isConnected ? 'En vivo' : 'Offline'}
            </div>

            <span className="text-sm text-muted-foreground print:ml-auto">
            {filtered.length} órden{filtered.length !== 1 ? 'es' : ''}
          </span>
        </div>
      </Card>

      {/* ── Print header (only visible when printing) ── */}
      <div className="hidden print:block text-center mb-4">
        <h1 className="text-xl font-bold uppercase tracking-wide">Órdenes en Proceso</h1>
        <p className="text-sm text-gray-600">
          {new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })}{' '}
          {new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {/* ── Table ── */}
      <Card className="bg-card/80 border-border backdrop-blur-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            Cargando órdenes…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            No hay órdenes activas
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-base border-collapse print:text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-muted-foreground text-base uppercase tracking-wide">
                  <th className="px-2 py-2.5 text-left font-medium w-[180px]" title="Orden confirmada → Prueba lista → Visto Bueno cliente → Programada → Papel en bodega">Avance</th>
                  <th className="px-3 py-2.5 text-left font-medium w-[90px]">OT</th>
                  <th className="px-3 py-2.5 text-left font-medium">Cliente</th>
                  <th className="px-3 py-2.5 text-left font-medium">Trabajo</th>
                  <th className="px-3 py-2.5 text-right font-medium w-[70px]">Cant.</th>
                  <th className="px-3 py-2.5 text-center font-medium w-[60px]">Color</th>
                  <th className="px-3 py-2.5 text-left font-medium min-w-[180px]">Procesos / Avance</th>
                  <th className="px-3 py-2.5 text-right font-medium w-[55px]">HRS</th>
                  <th className="px-3 py-2.5 text-center font-medium w-[80px]">Entrega</th>
                  <th className="px-3 py-2.5 text-left font-medium w-[120px]">MAQ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ot, idx) => {
                  const trabajo = ot.product_name || ot.description || '—';
                  const colorLabel = formatColor(ot.color_front, ot.color_back);
                  const deadlineLabel = formatDeadline(ot.deadline);
                  const overdue = isOverdue(ot.deadline);
                  const machineName = (ot as any).machine?.name ?? ot.workstation?.name ?? null;
                  const procesoActual: string = (ot as any).proceso_actual ?? '';

                  return (
                    <tr
                      key={ot.id}
                      className={`border-b border-border/50 transition-colors hover:bg-muted/20 ${
                          !(ot as any).flag_paper_arrived ? 'bg-amber-500/5' : idx % 2 === 0 ? '' : 'bg-muted/10'
                      }`}
                    >
                        {/* AVANCE — one control instead of 5 independent pills */}
                        <td className="px-2 py-2">
                          <AdvanceFlags
                            ot={ot as Record<string, unknown>}
                            onAdvance={(key) => patchOT(ot.id, { [key]: true })}
                            onUndo={(key) => patchOT(ot.id, { [key]: false })}
                          />
                        </td>

                        {/* OT # */}
                      <td className="px-3 py-2 font-mono font-semibold text-foreground whitespace-nowrap">
                        {ot.ot_number}
                      </td>

                      {/* CLIENTE */}
                      <td className="px-3 py-2 text-foreground">
                        <span className="font-medium">{ot.client_name}</span>
                      </td>

                      {/* TRABAJO */}
                      <td className="px-3 py-2 text-foreground max-w-[200px]">
                        <span className="line-clamp-2 leading-tight">{trabajo}</span>
                      </td>

                      {/* CANT. */}
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">
                        {ot.quantity != null ? ot.quantity.toLocaleString('es-CL') : '—'}
                      </td>

                      {/* COLOR */}
                      <td className="px-3 py-2 text-center font-mono text-foreground">
                        {colorLabel}
                      </td>

                      {/* PROCESOS / AVANCE */}
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant="outline"
                            className={`text-base px-2 py-0.5 border w-fit ${
                              otStatusBadgeClass(ot.status)
                            }`}
                          >
                            {otStatusLabel(ot.status)}
                          </Badge>
                          <InlineEditable
                            value={procesoActual}
                            placeholder="Agregar nota de avance…"
                            onSave={(val) =>
                              patchOT(ot.id, { proceso_actual: val || null })
                            }
                          />
                        </div>
                      </td>

                      {/* ENTREGA */}
                      {/* HRS */}
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground text-base">
                        {(ot as any).calc_print_hours != null || (ot as any).calc_finish_hours != null
                          ? (((ot as any).calc_print_hours ?? 0) + ((ot as any).calc_finish_hours ?? 0)).toFixed(1)
                          : '—'}
                      </td>

                      {/* ENTREGA */}
                      <td
                        className={`px-3 py-2 text-center tabular-nums whitespace-nowrap font-medium ${
                          overdue ? 'text-destructive' : 'text-foreground'
                        }`}
                      >
                        {deadlineLabel}
                      </td>

                      {/* MAQ */}
                      <td className="px-3 py-2 text-foreground text-base">
                        {machineName ? (
                          <span className="font-medium">{machineName}</span>
                        ) : (
                          <span className="text-muted-foreground italic text-base">Sin asignar</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .ordenes-print-root, .ordenes-print-root * { visibility: visible; }
          .ordenes-print-root { position: absolute; inset: 0; padding: 16px; }
          nav, header, aside, .print\\:hidden { display: none !important; }
          table { font-size: 10px !important; }
          th, td { padding: 4px 6px !important; }
        }
      `}</style>
    </div>
  );
}
