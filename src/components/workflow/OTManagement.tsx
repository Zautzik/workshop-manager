'use client';
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from '@tanstack/react-query';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOTs } from "@/hooks/use-workflow-queries";
import { queryKeys } from "@/hooks/use-workflow-queries";
import {
  Plus, ArrowRight, Edit2, DollarSign,
  ChevronDown, ChevronRight, GripVertical, Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { UnifiedOTWizard } from "./UnifiedOTWizard";
import { EditBudgetWizard } from "./EditBudgetWizard";
import { EditOTDialog } from "./EditOTDialog";
import { RealCostEntryDialog } from "./RealCostEntryDialog";
import { OTHoverCard } from "./OTHoverCard";
import { SplitOTDialog } from "./SplitOTDialog";

interface OTManagementProps {
  onOTSelect: (ot: any) => void;
}

const STATUS_FLOW = [
  { key: 'pre_press',           label: 'Pre-Press',      labelEs: 'Pre-Prensa',   color: 'bg-violet-500',  rgb: '139 92 246',  description: 'Diseño y modelado' },
  { key: 'visto_bueno',         label: 'Approval',       labelEs: 'Visto Bueno',  color: 'bg-amber-500',   rgb: '245 158 11',  description: 'Confirmación del cliente' },
  { key: 'paper_purchase',      label: 'Paper Purchase', labelEs: 'Compra Papel', color: 'bg-slate-500',   rgb: '100 116 139', description: 'Pedido de materiales' },
  { key: 'in_storage',          label: 'In Storage',     labelEs: 'En Bodega',    color: 'bg-cyan-500',    rgb: '6 182 212',   description: 'Listo para producción' },
  { key: 'guillotine_first_cut',label: 'First Cut',       labelEs: 'Primer Corte',     color: 'bg-orange-500',  rgb: '249 115 22',  description: 'Corte inicial guillotina' },
  { key: 'offset_printing',     label: 'Offset Print',    labelEs: 'Offset', color: 'bg-purple-500',  rgb: '168 85 247',  description: 'Impresión offset' },
  { key: 'digital_printing',    label: 'Digital Print',   labelEs: 'Impresión Digital',color: 'bg-fuchsia-500', rgb: '217 70 239',  description: 'Impresión digital' },
  { key: 'die_cutting',         label: 'Die Cutting',    labelEs: 'Troquelado',   color: 'bg-pink-500',    rgb: '236 72 153',  description: 'Proceso de troquelado' },
  { key: 'guillotine_final_cut',label: 'Final Cut',      labelEs: 'Corte Final',  color: 'bg-red-500',     rgb: '239 68 68',   description: 'Corte guillotina final' },
  { key: 'workshop',            label: 'Workshop',       labelEs: 'Taller',       color: 'bg-indigo-500',  rgb: '99 102 241',  description: 'Taller interno', optional: true },
  { key: 'outsourced',          label: 'Outsourced',     labelEs: 'Tercerizado',  color: 'bg-yellow-500',  rgb: '234 179 8',   description: 'Procesado externo', optional: true },
  { key: 'workshop_revision',   label: 'Revision',       labelEs: 'Revisión',     color: 'bg-emerald-500', rgb: '16 185 129',  description: 'Control de calidad' },
  { key: 'ready_for_delivery',  label: 'Ready',          labelEs: 'Listo',        color: 'bg-green-500',   rgb: '34 197 94',   description: 'Listo para despacho' },
  { key: 'in_delivery',         label: 'In Delivery',    labelEs: 'En Entrega',   color: 'bg-teal-500',    rgb: '20 184 166',  description: 'En camino' },
  { key: 'completed',           label: 'Completed',      labelEs: 'Completado',   color: 'bg-gray-500',    rgb: '107 114 128', description: 'Orden finalizada' },
] satisfies { key: string; label: string; labelEs: string; color: string; rgb: string; description: string; optional?: boolean }[];

const KANBAN_GROUPS = [
  { id: 'diseno',      label: 'Diseño',           rgb: '139 92 246', borderColor: 'border-violet-500/30', bgColor: 'bg-violet-500/5',  stages: ['pre_press', 'visto_bueno'] },
  { id: 'compras',     label: 'Compras & Bodega', rgb: '6 182 212',  borderColor: 'border-cyan-500/30',   bgColor: 'bg-cyan-500/5',    stages: ['paper_purchase', 'in_storage'] },
  { id: 'produccion',  label: 'Corte & Impresión',rgb: '249 115 22', borderColor: 'border-orange-500/30', bgColor: 'bg-orange-500/5',  stages: ['guillotine_first_cut', 'offset_printing', 'digital_printing'] },
  { id: 'acabados',    label: 'Acabados',         rgb: '236 72 153', borderColor: 'border-pink-500/30',   bgColor: 'bg-pink-500/5',    stages: ['die_cutting', 'guillotine_final_cut'] },
  { id: 'terminacion', label: 'Terminación',      rgb: '99 102 241', borderColor: 'border-indigo-500/30', bgColor: 'bg-indigo-500/5',  stages: ['workshop', 'outsourced', 'workshop_revision'] },
  { id: 'despacho',    label: 'Despacho',         rgb: '34 197 94',  borderColor: 'border-green-500/30',  bgColor: 'bg-green-500/5',   stages: ['ready_for_delivery', 'in_delivery', 'completed'] },
] as const;

function getPriorityColor(p: number) {
  if (p >= 8) return 'bg-red-500/20 text-red-400 border-red-500/40';
  if (p >= 5) return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
  return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
}
function getPriorityRing(p: number) {
  if (p >= 8) return 'ring-red-500/50';
  if (p >= 5) return 'ring-amber-500/50';
  return 'ring-blue-500/30';
}
function getStatusInfo(key: string) { return STATUS_FLOW.find(s => s.key === key) ?? STATUS_FLOW[0]; }
function getAllNextStatuses(currentStatus: string) {
  const idx = STATUS_FLOW.findIndex(s => s.key === currentStatus);
  if (idx < 0 || idx >= STATUS_FLOW.length - 1) return [];
  // from first cut: offer both offset AND digital printing
  if (currentStatus === 'guillotine_first_cut')
    return STATUS_FLOW.filter(s => s.key === 'offset_printing' || s.key === 'digital_printing');
  // both printing types lead to die_cutting
  if (currentStatus === 'offset_printing' || currentStatus === 'digital_printing')
    return STATUS_FLOW.filter(s => s.key === 'die_cutting');
  if (currentStatus === 'guillotine_final_cut')
    return STATUS_FLOW.filter(s => ['workshop','outsourced','workshop_revision'].includes(s.key));
  if (currentStatus === 'workshop' || currentStatus === 'outsourced')
    return STATUS_FLOW.filter(s => s.key === 'workshop_revision');
  const next = STATUS_FLOW[idx + 1];
  // skip digital_printing in default flow (it's a fork, not linear)
  if (next && (next.key === 'digital_printing' || next.key === 'workshop' || next.key === 'outsourced'))
    return STATUS_FLOW.filter(s => s.key === 'workshop_revision');
  return next ? [next] : [];
}

export function OTManagement({ onOTSelect }: OTManagementProps) {
  const { data: ots = [], refetch: refetchOTs } = useOTs();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [createFlow,      setCreateFlow]      = useState<'none' | 'wizard'>('none');
  const [showEditDialog,  setShowEditDialog]  = useState(false);
  const [editingOT,       setEditingOT]       = useState<any>(null);
  const [budgetEditOT,    setBudgetEditOT]    = useState<any>(null);
  const [costEntryOT,     setCostEntryOT]     = useState<any>(null);
  const [costEntryTarget, setCostEntryTarget] = useState<{ key: string; label: string } | null>(null);
  const [splitOT,         setSplitOT]         = useState<any>(null);
  const [splitTarget,     setSplitTarget]     = useState<{ key: string; label: string } | null>(null);
  const [rollbackTarget,  setRollbackTarget]  = useState<{ ot: any; key: string; labelEs: string; fromLabelEs: string } | null>(null);
  const [searchTerm,      setSearchTerm]      = useState("");
  const [showCompleted,   setShowCompleted]   = useState(false);
  const [collapsed,       setCollapsed]       = useState<Record<string, boolean>>({});
  const [draggedOT,       setDraggedOT]       = useState<any>(null);
  const [dragOverCol,     setDragOverCol]     = useState<string | null>(null);
  const [draggingId,      setDraggingId]      = useState<string | null>(null);
  const [hoveredOT,       setHoveredOT]       = useState<{ ot: any; rect: DOMRect } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragCounter = useRef<Record<string, number>>({});

  const updateOTStatus = async (otId: string, newStatus: string, rollback = false) => {
    // 1. Snapshot the current list before we touch anything.
    const previousOTs = queryClient.getQueryData<any[]>(queryKeys.ots);

    // 2. Move the card immediately — 0 ms perceived latency.
    queryClient.setQueryData<any[]>(queryKeys.ots, (old = []) =>
      old.map(ot => ot.id === otId ? { ...ot, status: newStatus } : ot)
    );

    const res = await fetch(`/api/ots/${otId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_status: newStatus, reason: rollback ? 'kanban_rollback' : 'kanban_advance', rollback }),
    });

    if (!res.ok) {
      // 3. Server rejected the transition — snap back to the previous state.
      queryClient.setQueryData(queryKeys.ots, previousOTs);
      const body = await res.json().catch(() => null);
      toast({ title: "Error al actualizar estado", description: body?.error ?? 'Request failed', variant: "destructive" });
      return;
    }

    toast({ title: rollback ? "OT retrocedida" : "OT avanzada", description: `→ ${getStatusInfo(newStatus).labelEs}` });
    // 4. Background refetch to pull any server-computed fields (updated_at, etc.).
    refetchOTs();
  };

  const requestAdvance = (ot: any, key: string, label: string) => {
    setCostEntryOT(ot); setCostEntryTarget({ key, label });
  };
  const confirmAdvance = async (movedQuantity: number) => {
    if (!costEntryOT || !costEntryTarget) return;

    const totalQty = Number(costEntryOT.quantity ?? 0);
    const shouldSplit = totalQty > 0 && movedQuantity > 0 && movedQuantity < totalQty;

    if (shouldSplit) {
      const res = await fetch(`/api/ots/${costEntryOT.id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          advance_quantity: movedQuantity,
          target_status: costEntryTarget.key,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast({ title: 'Error al dividir OT', description: body?.error ?? 'Request failed', variant: 'destructive' });
        return;
      }

      toast({
        title: 'OT dividida y avanzada',
        description: `${costEntryOT.ot_number}: ${movedQuantity} uds. → ${costEntryTarget.label}`,
      });
      refetchOTs();
    } else {
      await updateOTStatus(costEntryOT.id, costEntryTarget.key);
    }

    setCostEntryOT(null);
    setCostEntryTarget(null);
  };
  const confirmRollback = () => {
    if (rollbackTarget) updateOTStatus(rollbackTarget.ot.id, rollbackTarget.key, true);
    setRollbackTarget(null);
  };

  const filteredOTs = (ots as any[]).filter((ot: any) => {
    if (!showCompleted && ot.status === 'completed') return false;

    return (
      ot.ot_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ot.client_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });
  const getByStatus = (key: string) =>
    filteredOTs.filter(ot => ot.status === key).sort((a, b) => b.priority - a.priority);

  const activeOTsCount = filteredOTs.filter(ot => ot.status !== 'completed').length;

  const groupCounts = useMemo(() =>
    Object.fromEntries(KANBAN_GROUPS.map(g => [
      g.id, g.stages.reduce((s, k) => s + getByStatus(k).length, 0),
    ])), [filteredOTs]);

  const splitGroupTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    (ots as any[]).forEach((ot: any) => {
      if (!ot?.split_group_id) return;
      totals[ot.split_group_id] = (totals[ot.split_group_id] ?? 0) + Number(ot.quantity ?? 0);
    });
    return totals;
  }, [ots]);

  // ── drag handlers ────────────────────────────────────────────────────────
  const onDragStart = (e: React.DragEvent, ot: any) => {
    setHoveredOT(null);
    setDraggedOT(ot);
    setDraggingId(ot.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ot.id);
    const ghost = document.createElement('div');
    ghost.textContent = ot.ot_number;
    ghost.style.cssText = 'padding:6px 14px;background:#6366f1;color:#fff;border-radius:8px;font-size:12px;font-weight:700;position:fixed;top:-999px;left:-999px;';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 40, 16);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  };

  const onDragEnd = () => {
    setDraggedOT(null); setDraggingId(null); setDragOverCol(null);
    dragCounter.current = {};
  };

  const onColEnter = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    dragCounter.current[key] = (dragCounter.current[key] ?? 0) + 1;
    setDragOverCol(key);
  };
  const onColLeave = (e: React.DragEvent, key: string) => {
    dragCounter.current[key] = Math.max(0, (dragCounter.current[key] ?? 1) - 1);
    if (dragCounter.current[key] === 0) setDragOverCol(p => p === key ? null : p);
  };
  const onColOver  = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const onColDrop  = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    dragCounter.current[key] = 0; setDragOverCol(null);
    if (!draggedOT || draggedOT.status === key) return;
    const fromIdx = STATUS_FLOW.findIndex(s => s.key === draggedOT.status);
    const toIdx   = STATUS_FLOW.findIndex(s => s.key === key);
    const isBackward = toIdx < fromIdx;
    if (isBackward) {
      setRollbackTarget({
        ot: draggedOT,
        key,
        labelEs: getStatusInfo(key).labelEs,
        fromLabelEs: getStatusInfo(draggedOT.status).labelEs,
      });
    } else {
      requestAdvance(draggedOT, key, getStatusInfo(key).labelEs);
    }
    setDraggedOT(null); setDraggingId(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-bold text-foreground">Órdenes de Trabajo</h2>
          <span className="text-xs text-muted-foreground">{activeOTsCount} activas</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar OT o cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-input border-border placeholder:text-muted-foreground w-52 pl-8"
            />
          </div>
          <Button
            variant={showCompleted ? 'default' : 'outline'}
            onClick={() => setShowCompleted(prev => !prev)}
          >
            {showCompleted ? 'Ocultar completadas' : 'Mostrar completadas'}
          </Button>
          <Button onClick={() => setCreateFlow('wizard')} className="bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-1" />Nueva OT
          </Button>
        </div>
      </div>

      {/* Floating drag hint */}
      {draggingId && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background text-xs font-semibold px-4 py-2 rounded-full shadow-xl pointer-events-none select-none">
          Arrastra adelante para avanzar · Arrastra atrás para retroceder (preserva costos)
        </div>
      )}

      {/* ── Honeycomb Beehive Kanban ──
          Flat-top hex: flat top/bottom sides, pointed left/right.
          clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)
          Column-based formation — 2 cols of 2 with staggered single between each:
            same-column vertical step = HEX_H  (flat edges share directly)
            staggered column: x += 0.75×W, y = 0.5×H  (interlocked centred)
          Formation (left → right):
            [Diseño]              [Acabados]
                     [Corte]                [Despacho]
            [Compras]             [Terminación]
      ── */}
      {(() => {
        const HEX_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
        const HEX_W = 280;
        const HEX_H = 240;

        // Flat-top: points are on left/right — inset more horizontally, less vertically
        const INSET_X = Math.round(HEX_W * 0.16); // 45px — closer to edges for more content area
        const INSET_Y = Math.round(HEX_H * 0.04); // 10px — flat top/bottom, minimal gap

        const X_STEP = HEX_W * 0.75; // 210 — staggered column x offset
        const Y_STEP = HEX_H * 0.5;  // 120 — staggered column y offset (midpoint)

        const POSITIONS = [
          { x: 0,            y: 0 },       // 0: Diseño       col-1 top
          { x: 0,            y: HEX_H },   // 1: Compras      col-1 bottom (flat edge sharing)
          { x: X_STEP,       y: Y_STEP },  // 2: Corte        staggered between col-1
          { x: X_STEP * 2,   y: 0 },       // 3: Acabados     col-3 top
          { x: X_STEP * 2,   y: HEX_H },   // 4: Terminación  col-3 bottom
          { x: X_STEP * 3,   y: Y_STEP },  // 5: Despacho     staggered between col-3
        ];
        const CANVAS_W = X_STEP * 3 + HEX_W; // 910
        const CANVAS_H = HEX_H * 2;           // 480

        return (
          <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
            <div style={{ position: 'relative', width: CANVAS_W, height: CANVAS_H, margin: '0 auto' }}>
              {/* Flow arrows between process hexes */}
              <svg
                width={CANVAS_W}
                height={CANVAS_H}
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, opacity: 0.85 }}
              >
                <defs>
                  <marker id="flowArrowHead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                    <polygon points="0 0, 6 3, 0 6" fill="rgba(148,163,184,0.8)" />
                  </marker>
                </defs>
                {[
                  [0, 2], // Diseño -> Corte
                  [1, 2], // Compras -> Corte
                  [2, 3], // Corte -> Acabados
                  [2, 4], // Corte -> Terminación
                  [3, 5], // Acabados -> Despacho
                  [4, 5], // Terminación -> Despacho
                ].map(([from, to], idx) => {
                  const fromPos = POSITIONS[from as number];
                  const toPos = POSITIONS[to as number];
                  const x1 = fromPos.x + HEX_W / 2;
                  const y1 = fromPos.y + HEX_H / 2;
                  const x2 = toPos.x + HEX_W / 2;
                  const y2 = toPos.y + HEX_H / 2;

                  // Pull endpoints inward so arrows don't sit directly on top of labels
                  const dx = x2 - x1;
                  const dy = y2 - y1;
                  const len = Math.hypot(dx, dy) || 1;
                  const pad = 56;
                  const sx = x1 + (dx / len) * pad;
                  const sy = y1 + (dy / len) * pad;
                  const ex = x2 - (dx / len) * pad;
                  const ey = y2 - (dy / len) * pad;

                  return (
                    <line
                      key={`flow-${idx}`}
                      x1={sx}
                      y1={sy}
                      x2={ex}
                      y2={ey}
                      stroke="rgba(148,163,184,0.8)"
                      strokeWidth="2.5"
                      strokeDasharray="6 5"
                      markerEnd="url(#flowArrowHead)"
                    />
                  );
                })}
              </svg>
              {KANBAN_GROUPS.map((group, idx) => {
                const { x, y } = POSITIONS[idx];
                const count = groupCounts[group.id];
                const isCollapsed = collapsed[group.id];

                return (
                  <div
                    key={group.id}
                    style={{
                      position: 'absolute', left: x, top: y,
                      width: HEX_W, height: HEX_H,
                      zIndex: 2,
                      filter: `drop-shadow(0 4px 16px rgb(${group.rgb} / 0.42))`,
                      transition: 'filter 0.18s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.filter = `drop-shadow(0 6px 22px rgb(${group.rgb} / 0.68))`; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.filter = `drop-shadow(0 4px 16px rgb(${group.rgb} / 0.42))`; }}
                  >
                    {/* ── Hex border: outer hex = border color, inner hex = fill ── */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      clipPath: HEX_CLIP,
                      background: `rgb(${group.rgb})`,
                    }}>
                      {/* Inner hex fill — inset 8px to expose the outer as a border */}
                      <div style={{
                        position: 'absolute',
                        inset: '8px',
                        clipPath: HEX_CLIP,
                        background: 'var(--hex-fill, #ffffff)',
                      }}>
                    {/* ── Content ── */}
                    <div style={{
                      position: 'absolute',
                      left: INSET_X - 8, right: INSET_X - 8,
                      top: INSET_Y - 8, bottom: INSET_Y - 8,
                      display: 'flex', flexDirection: 'column',
                      overflow: 'hidden',
                    }}>
                      {/* Title + count — centered */}
                      <div style={{
                        flexShrink: 0,
                        textAlign: 'center',
                        padding: '5px 4px 3px',
                        borderBottom: `3px solid rgb(${group.rgb})`,
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: `rgb(${group.rgb})`, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {group.label}
                        </div>
                        <div style={{ fontSize: 9, fontWeight: 600, color: `rgb(${group.rgb} / 0.70)`, lineHeight: 1.2, marginTop: 1 }}>
                          {count} {count === 1 ? 'orden' : 'órdenes'}
                        </div>
                      </div>

                      {/* Stage columns — colored header tab + white body */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
                        {(group.stages as readonly string[]).map((stageKey, sIdx) => {
                          const stInfo   = getStatusInfo(stageKey);
                          const stageOTs = getByStatus(stageKey);
                          const isOver   = dragOverCol === stageKey && !!draggingId;
                          return (
                            <div
                              key={stageKey}
                              style={{
                                flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0,
                                borderLeft: sIdx > 0 ? `1px solid rgb(${group.rgb} / 0.25)` : 'none',
                                background: isOver ? `rgb(${group.rgb} / 0.08)` : 'transparent',
                                transition: 'background 0.1s',
                              }}
                              onDragEnter={e => onColEnter(e, stageKey)}
                              onDragLeave={e => onColLeave(e, stageKey)}
                              onDragOver={onColOver}
                              onDrop={e => onColDrop(e, stageKey)}
                            >
                              {/* Colored tab header */}
                              <div style={{
                                flexShrink: 0, textAlign: 'center',
                                background: `rgb(${group.rgb})`,
                                padding: '2px 2px',
                              }}>
                                <div style={{ fontSize: 8, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                                  {stInfo.labelEs}
                                </div>
                                <div style={{ fontSize: 7, fontWeight: 600, color: 'rgba(255,255,255,0.75)', lineHeight: 1 }}>
                                  {stageOTs.length}
                                </div>
                              </div>
                              {/* OT cards hex grid in this column */}
                              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 3px', display: 'flex', flexWrap: 'wrap', gap: 3, alignContent: 'flex-start' }}>
                                {isOver && stageOTs.length === 0 && (
                                  <div style={{ border: `1px dashed rgb(${group.rgb} / 0.5)`, borderRadius: 2, textAlign: 'center', fontSize: 7, color: `rgb(${group.rgb})`, padding: '2px 0', marginTop: 2 }}>↓</div>
                                )}
                                {stageOTs.map(ot => {
                                  const isDragging  = draggingId === ot.id;
                                  const isPartial   = !!ot.is_partial;
                                  const splitTotal = ot.split_group_id ? Number(splitGroupTotals[ot.split_group_id] ?? 0) : 0;
                                  const splitPct = isPartial && splitTotal > 0
                                    ? Math.max(1, Math.min(100, Math.round((Number(ot.quantity ?? 0) / splitTotal) * 100)))
                                    : null;
                                  const priDot      = ot.priority >= 8 ? '#ef4444' : ot.priority >= 5 ? '#f59e0b' : `rgb(${group.rgb})`;
                                  const HEX_MINI_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
                                  const MINI_W = 48;
                                  const MINI_H = 42;
                                  return (
                                    <div
                                      key={ot.id}
                                      draggable
                                      onDragStart={e => onDragStart(e, ot)}
                                      onDragEnd={onDragEnd}
                                      onMouseEnter={e => {
                                        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                        hoverTimerRef.current = setTimeout(() => setHoveredOT({ ot, rect }), 220);
                                      }}
                                      onMouseLeave={() => {
                                        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                                        hoverTimerRef.current = setTimeout(() => setHoveredOT(p => p?.ot.id === ot.id ? null : p), 80);
                                      }}
                                      style={{
                                        width: MINI_W, height: MINI_H,
                                        clipPath: HEX_MINI_CLIP,
                                        background: isDragging
                                          ? `rgb(${group.rgb} / 0.10)`
                                          : isPartial
                                            ? `rgb(${group.rgb} / 0.09)`
                                            : `rgb(${group.rgb} / 0.18)`,
                                        cursor: 'grab',
                                        opacity: isDragging ? 0.30 : isPartial ? 0.60 : 1,
                                        transition: 'opacity 0.1s, transform 0.1s',
                                        display: 'flex', flexDirection: 'column',
                                        alignItems: 'center', justifyContent: 'center',
                                        position: 'relative', flexShrink: 0,
                                        outline: isPartial ? `1.5px dashed rgb(${group.rgb} / 0.55)` : 'none',
                                      }}
                                      onClick={() => { if (!isDragging) onOTSelect(ot); }}
                                    >
                                      {/* Priority dot top-center */}
                                      <div style={{
                                        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
                                        width: 4, height: 4, borderRadius: '50%', background: priDot,
                                      }} />
                                      <span style={{
                                        fontSize: 7.5, fontWeight: 800,
                                        color: `rgb(${group.rgb})`,
                                        textAlign: 'center', lineHeight: 1.1,
                                        padding: '0 6px', marginTop: 4,
                                        overflow: 'hidden', maxWidth: '100%',
                                        wordBreak: 'break-all',
                                      }}>
                                        {ot.ot_number.replace(/^OT-?/i, '')}
                                      </span>
                                      {isPartial && (
                                        <span style={{ fontSize: 6, fontWeight: 800, color: '#f59e0b', lineHeight: 1 }}>
                                          {splitPct !== null ? `${splitPct}%` : 'PAR'}
                                        </span>
                                      )}
                                      {ot.product_image_url && (
                                        <div style={{
                                          position: 'absolute', inset: 0, clipPath: HEX_MINI_CLIP,
                                          backgroundImage: `url(${ot.product_image_url})`,
                                          backgroundSize: 'cover', backgroundPosition: 'center',
                                          opacity: 0.18,
                                        }} />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Fast Lane: Urgent OTs ── */}
      {(() => {
        const urgentOTs = filteredOTs.filter(ot => ot.priority >= 8 && ot.status !== 'completed');
        const LANE_W = 910;
        return (
          <div style={{ width: LANE_W, margin: '10px auto 0' }}>
            <div style={{
              background: 'linear-gradient(90deg, rgba(239,68,68,0.13) 0%, rgba(234,179,8,0.10) 100%)',
              border: '1.5px solid rgba(239,68,68,0.50)',
              borderRadius: 10, padding: '6px 12px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#fca5a5', letterSpacing: '0.07em', marginBottom: urgentOTs.length ? 6 : 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                ⚡ Vía Rápida para OT's Urgentes
              </div>
              {urgentOTs.length === 0 ? (
                <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.30)', fontStyle: 'italic' }}>Sin OTs urgentes</span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {urgentOTs.map(ot => {
                    const stInfo    = getStatusInfo(ot.status);
                    const isDragging = draggingId === ot.id;
                    return (
                      <div
                        key={ot.id}
                        draggable
                        onDragStart={e => onDragStart(e, ot)}
                        onDragEnd={onDragEnd}
                        style={{
                          background: isDragging ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.22)',
                          border: '1px solid rgba(239,68,68,0.55)',
                          borderRadius: 5, padding: '3px 8px', cursor: 'grab',
                          opacity: isDragging ? 0.3 : 1,
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}
                        onClick={() => { if (!isDragging) onOTSelect(ot); }}
                      >
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#fca5a5' }}>{ot.ot_number}</span>
                        <span style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.55)' }}>{stInfo.labelEs}</span>
                        <span style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.38)' }}>{ot.client_name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Rollback confirmation dialog */}
      {rollbackTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-amber-500/40 rounded-xl shadow-2xl p-5 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shrink-0">
                <ArrowRight className="w-4 h-4 text-amber-400 rotate-180" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-sm">Retroceder OT</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-semibold text-foreground">{rollbackTarget.ot.ot_number}</span>
                  {' '}—{' '}{rollbackTarget.ot.client_name}
                </p>
              </div>
            </div>
            <div className="bg-amber-500/8 border border-amber-500/25 rounded-lg p-3 mb-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">De:</span>
                <span className="font-semibold text-foreground">{rollbackTarget.fromLabelEs}</span>
                <ArrowRight className="w-3 h-3 text-amber-400 rotate-180" />
                <span className="font-semibold text-amber-400">{rollbackTarget.labelEs}</span>
              </div>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-snug">
                ⚠️ Los costos ya registrados en esta OT serán preservados. Solo se cambia el estado del proceso.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setRollbackTarget(null)}>
                Cancelar
              </Button>
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={confirmRollback}>
                Confirmar Retroceso
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Dialogs */}
      {createFlow === 'wizard' && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <UnifiedOTWizard onClose={() => setCreateFlow('none')} onSuccess={() => { refetchOTs(); setCreateFlow('none'); }} />
        </div>
      )}
      {budgetEditOT && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <EditBudgetWizard ot={budgetEditOT} onClose={() => setBudgetEditOT(null)} onSuccess={() => { refetchOTs(); setBudgetEditOT(null); }} />
        </div>
      )}
      {editingOT && (
        <EditOTDialog ot={editingOT} open={showEditDialog} onOpenChange={setShowEditDialog} onSuccess={refetchOTs} />
      )}
      {costEntryOT && costEntryTarget && (
        <RealCostEntryDialog
          open={!!costEntryOT}
          onOpenChange={(open) => { if (!open) { setCostEntryOT(null); setCostEntryTarget(null); } }}
          ot={costEntryOT}
          targetStatus={costEntryTarget.key}
          targetStatusLabel={costEntryTarget.label}
          onConfirm={confirmAdvance}
        />
      )}
      {/* OT Hover Card overlay */}
      {hoveredOT && !draggingId && (
        <OTHoverCard
          ot={hoveredOT.ot}
          anchorRect={hoveredOT.rect}
          onClose={() => setHoveredOT(null)}
          nextStatuses={getAllNextStatuses(hoveredOT.ot.status)}
          onAdvance={(ot, key, label) => requestAdvance(ot, key, label)}
          onSplit={(ot, key, label) => { setSplitOT(ot); setSplitTarget({ key, label }); }}
          onEdit={(ot) => { setEditingOT(ot); setShowEditDialog(true); }}
        />
      )}
      {splitOT && splitTarget && (
        <SplitOTDialog
          open={!!splitOT}
          onOpenChange={(open) => { if (!open) { setSplitOT(null); setSplitTarget(null); } }}
          ot={splitOT}
          targetStatus={splitTarget.key}
          targetStatusLabel={splitTarget.label}
          onSuccess={() => { refetchOTs(); setSplitOT(null); setSplitTarget(null); }}
        />
      )}
    </div>
  );
}
