'use client';
import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useOTs } from "@/hooks/use-workflow-queries";
import {
  Plus, ArrowRight, Edit2, DollarSign,
  ChevronDown, ChevronRight, GripVertical, Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { UnifiedOTWizard } from "./UnifiedOTWizard";
import { EditBudgetWizard } from "./EditBudgetWizard";
import { EditOTDialog } from "./EditOTDialog";
import { RealCostEntryDialog } from "./RealCostEntryDialog";

interface OTManagementProps {
  onOTSelect: (ot: any) => void;
}

const STATUS_FLOW = [
  { key: 'pre_press',           label: 'Pre-Press',      labelEs: 'Pre-Prensa',   color: 'bg-violet-500',  rgb: '139 92 246',  description: 'Diseño y modelado' },
  { key: 'visto_bueno',         label: 'Approval',       labelEs: 'Visto Bueno',  color: 'bg-amber-500',   rgb: '245 158 11',  description: 'Confirmación del cliente' },
  { key: 'paper_purchase',      label: 'Paper Purchase', labelEs: 'Compra Papel', color: 'bg-slate-500',   rgb: '100 116 139', description: 'Pedido de materiales' },
  { key: 'in_storage',          label: 'In Storage',     labelEs: 'En Bodega',    color: 'bg-cyan-500',    rgb: '6 182 212',   description: 'Listo para producción' },
  { key: 'guillotine_first_cut',label: 'First Cut',      labelEs: 'Primer Corte', color: 'bg-orange-500',  rgb: '249 115 22',  description: 'Corte inicial guillotina' },
  { key: 'offset_printing',     label: 'Printing',       labelEs: 'Impresión',    color: 'bg-purple-500',  rgb: '168 85 247',  description: 'Impresión offset' },
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
  { id: 'diseno',      label: 'Diseño',           colorClass: 'bg-violet-600', borderColor: 'border-violet-500/40', bgColor: 'bg-violet-500/5',  stages: ['pre_press', 'visto_bueno'] },
  { id: 'compras',     label: 'Compras & Bodega', colorClass: 'bg-cyan-600',   borderColor: 'border-cyan-500/40',   bgColor: 'bg-cyan-500/5',    stages: ['paper_purchase', 'in_storage'] },
  { id: 'corte',       label: 'Corte Inicial',    colorClass: 'bg-orange-600', borderColor: 'border-orange-500/40', bgColor: 'bg-orange-500/5',  stages: ['guillotine_first_cut'] },
  { id: 'impresion',   label: 'Impresión',        colorClass: 'bg-purple-600', borderColor: 'border-purple-500/40', bgColor: 'bg-purple-500/5',  stages: ['offset_printing'] },
  { id: 'acabados',    label: 'Acabados',         colorClass: 'bg-pink-600',   borderColor: 'border-pink-500/40',   bgColor: 'bg-pink-500/5',    stages: ['die_cutting', 'guillotine_final_cut'] },
  { id: 'terminacion', label: 'Terminación',      colorClass: 'bg-indigo-600', borderColor: 'border-indigo-500/40', bgColor: 'bg-indigo-500/5',  stages: ['workshop', 'outsourced', 'workshop_revision'] },
  { id: 'despacho',    label: 'Despacho',         colorClass: 'bg-green-600',  borderColor: 'border-green-500/40',  bgColor: 'bg-green-500/5',   stages: ['ready_for_delivery', 'in_delivery', 'completed'] },
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
  if (currentStatus === 'guillotine_final_cut')
    return STATUS_FLOW.filter(s => ['workshop','outsourced','workshop_revision'].includes(s.key));
  if (currentStatus === 'workshop' || currentStatus === 'outsourced')
    return STATUS_FLOW.filter(s => s.key === 'workshop_revision');
  const next = STATUS_FLOW[idx + 1];
  if (next && (next.key === 'workshop' || next.key === 'outsourced'))
    return STATUS_FLOW.filter(s => s.key === 'workshop_revision');
  return next ? [next] : [];
}

export function OTManagement({ onOTSelect }: OTManagementProps) {
  const { data: ots = [], refetch: refetchOTs } = useOTs();
  const { toast } = useToast();

  const [createFlow,      setCreateFlow]      = useState<'none' | 'wizard'>('none');
  const [showEditDialog,  setShowEditDialog]  = useState(false);
  const [editingOT,       setEditingOT]       = useState<any>(null);
  const [budgetEditOT,    setBudgetEditOT]    = useState<any>(null);
  const [costEntryOT,     setCostEntryOT]     = useState<any>(null);
  const [costEntryTarget, setCostEntryTarget] = useState<{ key: string; label: string } | null>(null);
  const [searchTerm,      setSearchTerm]      = useState("");
  const [collapsed,       setCollapsed]       = useState<Record<string, boolean>>({});
  const [draggedOT,       setDraggedOT]       = useState<any>(null);
  const [dragOverCol,     setDragOverCol]     = useState<string | null>(null);
  const [draggingId,      setDraggingId]      = useState<string | null>(null);
  const dragCounter = useRef<Record<string, number>>({});

  const updateOTStatus = async (otId: string, newStatus: string) => {
    const res = await fetch(`/api/ots/${otId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_status: newStatus, reason: 'kanban_advance' }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast({ title: "Error al actualizar estado", description: body?.error ?? 'Request failed', variant: "destructive" });
      return;
    }
    toast({ title: "OT movida", description: `→ ${getStatusInfo(newStatus).labelEs}` });
    refetchOTs();
  };

  const requestAdvance = (ot: any, key: string, label: string) => {
    setCostEntryOT(ot); setCostEntryTarget({ key, label });
  };
  const confirmAdvance = () => {
    if (costEntryOT && costEntryTarget) updateOTStatus(costEntryOT.id, costEntryTarget.key);
    setCostEntryOT(null); setCostEntryTarget(null);
  };

  const filteredOTs = ots.filter(ot =>
    ot.ot_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ot.client_name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const getByStatus = (key: string) =>
    filteredOTs.filter(ot => ot.status === key).sort((a, b) => b.priority - a.priority);

  const activeOTsCount = filteredOTs.filter(ot => ot.status !== 'completed').length;

  const groupCounts = useMemo(() =>
    Object.fromEntries(KANBAN_GROUPS.map(g => [
      g.id, g.stages.reduce((s, k) => s + getByStatus(k).length, 0),
    ])), [filteredOTs]);

  // ── drag handlers ────────────────────────────────────────────────────────
  const onDragStart = (e: React.DragEvent, ot: any) => {
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
    requestAdvance(draggedOT, key, getStatusInfo(key).labelEs);
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
          <Button onClick={() => setCreateFlow('wizard')} className="bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-1" />Nueva OT
          </Button>
        </div>
      </div>

      {/* Floating drag hint */}
      {draggingId && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background text-xs font-semibold px-4 py-2 rounded-full shadow-xl pointer-events-none select-none">
          Arrastra a cualquier columna para mover la OT
        </div>
      )}

      {/* 7 Kanban groups */}
      <div className="space-y-1.5">
        {KANBAN_GROUPS.map(group => {
          const count      = groupCounts[group.id];
          const isCollapsed = collapsed[group.id];

          return (
            <div key={group.id} className={`rounded border ${group.borderColor} overflow-hidden`}>
              {/* Slim collapsible group header */}
              <button
                type="button"
                className={`w-full ${group.colorClass} px-3 py-[5px] flex items-center justify-between hover:brightness-110 transition-all duration-150 focus:outline-none`}
                onClick={() => setCollapsed(p => ({ ...p, [group.id]: !p[group.id] }))}
              >
                <div className="flex items-center gap-1.5">
                  {isCollapsed
                    ? <ChevronRight className="w-3 h-3 text-white/70" />
                    : <ChevronDown  className="w-3 h-3 text-white/70" />}
                  <span className="font-semibold text-white text-[11px] tracking-wide uppercase">{group.label}</span>
                </div>
                <Badge className="bg-white/25 text-white border-0 text-[10px] h-4 px-1.5">{count}</Badge>
              </button>

              {/* Stage columns */}
              {!isCollapsed && (
                <div className={`${group.bgColor} flex divide-x divide-border/50 overflow-x-auto`}>
                  {group.stages.map(stageKey => {
                    const stInfo   = getStatusInfo(stageKey);
                    const stageOTs = getByStatus(stageKey);
                    const isOpt    = 'optional' in stInfo && stInfo.optional;
                    const isOver   = dragOverCol === stageKey && !!draggingId;

                    return (
                      <div
                        key={stageKey}
                        className={`flex-1 min-w-[160px] flex flex-col transition-colors duration-100
                          ${isOver ? 'ring-2 ring-inset ring-primary/50 bg-primary/5' : ''}`}
                        onDragEnter={(e) => onColEnter(e, stageKey)}
                        onDragLeave={(e) => onColLeave(e, stageKey)}
                        onDragOver={onColOver}
                        onDrop={(e) => onColDrop(e, stageKey)}
                      >
                        {/* Slim column header */}
                        <div className="px-2 py-1 border-b border-border/50 flex items-center justify-between bg-card/30">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${stInfo.color} shrink-0 ${isOver ? 'animate-pulse' : ''}`} />
                            <span className="text-[10px] font-semibold text-foreground/80 truncate">{stInfo.labelEs}</span>
                            {isOpt && <span className="text-[9px] text-muted-foreground/60 italic">opt</span>}
                          </div>
                          <span className={`text-[10px] font-bold tabular-nums transition-colors duration-100 ${isOver ? 'text-primary' : 'text-muted-foreground/60'}`}>
                            {stageOTs.length}
                          </span>
                        </div>

                        {/* Cards */}
                        <div className={`p-1 space-y-1 flex-1 ${
                          stageOTs.length === 0 && !isOver ? 'min-h-[28px]' : 'min-h-[28px]'
                        }`}>
                          {/* drop hint shown only while dragging over empty col */}
                          {isOver && stageOTs.length === 0 && (
                            <div className="border border-dashed border-primary/40 rounded text-center text-[9px] text-primary/60 py-1.5">
                              ↓ {stInfo.labelEs}
                            </div>
                          )}

                          {stageOTs.map(ot => {
                            const nextSt     = getAllNextStatuses(ot.status);
                            const isDragging  = draggingId === ot.id;
                            const hasBudget   = ot.status === 'pre_press' || ot.status === 'visto_bueno';

                            return (
                              // group/hover pattern — actions revealed on hover
                              <div
                                key={ot.id}
                                draggable
                                onDragStart={(e) => onDragStart(e, ot)}
                                onDragEnd={onDragEnd}
                                className={[
                                  'group relative rounded border bg-card select-none',
                                  'transition-all duration-100 cursor-grab active:cursor-grabbing',
                                  'hover:shadow-sm hover:-translate-y-px',
                                  isDragging
                                    ? `opacity-30 scale-95 rotate-[0.5deg] border-primary/30`
                                    : `border-border/60 hover:border-primary/40`,
                                ].join(' ')}
                                onClick={() => { if (!isDragging) onOTSelect(ot); }}
                              >
                                {/* Priority left-bar */}
                                <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l ${
                                  ot.priority >= 8 ? 'bg-red-500' : ot.priority >= 5 ? 'bg-amber-500' : 'bg-blue-400'
                                }`} />

                                {/* Main card row */}
                                <div className="pl-2.5 pr-1 py-1 flex items-center gap-1.5">
                                  <GripVertical className="w-2.5 h-2.5 text-muted-foreground/25 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-foreground text-[11px] truncate leading-tight">{ot.ot_number}</div>
                                    <div className="text-[9px] text-muted-foreground/70 truncate leading-tight">{ot.client_name}</div>
                                  </div>
                                  {/* meta inline */}
                                  <div className="flex items-center gap-1 shrink-0">
                                    {ot.deadline && (
                                      <span className="text-[9px] text-muted-foreground/50 tabular-nums">
                                        {new Date(ot.deadline).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                                      </span>
                                    )}
                                    <span className={`text-[9px] font-bold px-1 py-0 rounded ${
                                      ot.priority >= 8 ? 'text-red-400' : ot.priority >= 5 ? 'text-amber-400' : 'text-blue-400'
                                    }`}>P{ot.priority}</span>
                                  </div>
                                  {/* edit icon — visible on hover */}
                                  <Button
                                    size="sm" variant="ghost"
                                    className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                    onClick={(e) => { e.stopPropagation(); setEditingOT(ot); setShowEditDialog(true); }}
                                  >
                                    <Edit2 className="h-2.5 w-2.5 text-muted-foreground" />
                                  </Button>
                                </div>

                                {/* Hover-reveal action row */}
                                <div className="overflow-hidden max-h-0 group-hover:max-h-20 transition-all duration-200 px-1.5 pb-0 group-hover:pb-1">
                                  <div className="flex flex-wrap gap-1 pt-0.5 border-t border-border/40">
                                    {hasBudget && (
                                      <button
                                        className="flex items-center gap-0.5 text-[9px] text-amber-500 hover:text-amber-400 font-medium"
                                        onClick={(e) => { e.stopPropagation(); setBudgetEditOT(ot); }}
                                      >
                                        <DollarSign className="w-2.5 h-2.5" />Presup.
                                      </button>
                                    )}
                                    {nextSt.map(ns => (
                                      <button
                                        key={ns.key}
                                        className={`flex items-center gap-0.5 text-[9px] font-medium ${
                                          (ns as any).optional
                                            ? 'text-muted-foreground hover:text-foreground'
                                            : 'text-primary hover:text-primary/70'
                                        }`}
                                        onClick={(e) => { e.stopPropagation(); requestAdvance(ot, ns.key, ns.labelEs); }}
                                      >
                                        <ArrowRight className="w-2.5 h-2.5" />{ns.labelEs}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

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
    </div>
  );
}
