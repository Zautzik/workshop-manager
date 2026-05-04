'use client';
import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useOTs } from "@/hooks/use-workflow-queries";
import {
  Plus, ArrowRight, Edit2, Package, Clock, User, DollarSign,
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">Órdenes de Trabajo</h2>
          <p className="text-sm text-muted-foreground">{activeOTsCount} activas</p>
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
      <div className="space-y-3">
        {KANBAN_GROUPS.map(group => {
          const count      = groupCounts[group.id];
          const isCollapsed = collapsed[group.id];

          return (
            <Card key={group.id} className={`border ${group.borderColor} overflow-hidden`}>
              {/* Collapsible group header */}
              <button
                type="button"
                className={`w-full ${group.colorClass} px-4 py-2 flex items-center justify-between hover:brightness-110 transition-all duration-150 focus:outline-none`}
                onClick={() => setCollapsed(p => ({ ...p, [group.id]: !p[group.id] }))}
              >
                <div className="flex items-center gap-2">
                  {isCollapsed
                    ? <ChevronRight className="w-4 h-4 text-white/80" />
                    : <ChevronDown  className="w-4 h-4 text-white/80" />}
                  <span className="font-bold text-white text-sm tracking-wide">{group.label}</span>
                </div>
                {count > 0 && (
                  <Badge className="bg-white/20 text-white border-0 text-xs">{count} OT</Badge>
                )}
              </button>

              {/* Stage columns */}
              {!isCollapsed && (
                <div className={`${group.bgColor} flex gap-0 divide-x divide-border/60 overflow-x-auto`}>
                  {group.stages.map(stageKey => {
                    const stInfo   = getStatusInfo(stageKey);
                    const stageOTs = getByStatus(stageKey);
                    const isOpt    = 'optional' in stInfo && stInfo.optional;
                    const isOver   = dragOverCol === stageKey && !!draggingId;

                    return (
                      <div
                        key={stageKey}
                        className={`flex-1 min-w-[190px] flex flex-col transition-colors duration-150
                          ${isOver ? 'ring-2 ring-inset ring-primary/60 bg-primary/5' : ''}`}
                        onDragEnter={(e) => onColEnter(e, stageKey)}
                        onDragLeave={(e) => onColLeave(e, stageKey)}
                        onDragOver={onColOver}
                        onDrop={(e) => onColDrop(e, stageKey)}
                      >
                        {/* Column header */}
                        <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between bg-card/40">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${stInfo.color} ${isOver ? 'animate-pulse' : ''}`} />
                            <span className="text-xs font-semibold text-foreground">{stInfo.labelEs}</span>
                            {isOpt && <span className="text-[10px] text-muted-foreground italic">opt</span>}
                          </div>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] h-4 px-1.5 transition-all duration-150 ${isOver ? 'bg-primary text-primary-foreground scale-110' : ''}`}
                          >
                            {stageOTs.length}
                          </Badge>
                        </div>

                        {/* Animated drop-zone strip */}
                        <div className={`mx-2 mt-2 rounded-lg border-2 border-dashed text-center text-[10px] text-primary/70 font-medium
                          transition-all duration-200 overflow-hidden
                          ${isOver ? 'border-primary/50 bg-primary/5 py-2.5 opacity-100' : 'border-transparent py-0 opacity-0 h-0'}`}>
                          Soltar en <strong>{stInfo.labelEs}</strong>
                        </div>

                        {/* OT cards */}
                        <div className="p-2 space-y-2 min-h-[110px] flex-1">
                          {stageOTs.length === 0 && !isOver ? (
                            <div className="flex items-center justify-center h-[72px] text-muted-foreground/30 text-xs select-none">—</div>
                          ) : (
                            stageOTs.map(ot => {
                              const nextSt    = getAllNextStatuses(ot.status);
                              const isDragging = draggingId === ot.id;

                              return (
                                <Card
                                  key={ot.id}
                                  draggable
                                  onDragStart={(e) => onDragStart(e, ot)}
                                  onDragEnd={onDragEnd}
                                  className={[
                                    'bg-card border-border p-2.5 select-none',
                                    'transition-all duration-150',
                                    'cursor-grab active:cursor-grabbing',
                                    'hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5',
                                    isDragging ? `opacity-30 scale-95 rotate-1 ring-2 ${getPriorityRing(ot.priority)}` : '',
                                    !isDragging ? `hover:ring-1 ${getPriorityRing(ot.priority)}` : '',
                                  ].join(' ')}
                                  onClick={() => { if (!isDragging) onOTSelect(ot); }}
                                >
                                  {/* drag handle + title */}
                                  <div className="flex items-start gap-1.5 mb-1">
                                    <GripVertical className="w-3 h-3 text-muted-foreground/40 mt-0.5 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-bold text-foreground text-xs truncate">{ot.ot_number}</div>
                                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                                        <User className="w-2.5 h-2.5" />
                                        <span className="truncate">{ot.client_name}</span>
                                      </div>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-5 w-5 p-0 hover:bg-muted shrink-0"
                                      onClick={(e) => { e.stopPropagation(); setEditingOT(ot); setShowEditDialog(true); }}
                                    >
                                      <Edit2 className="h-2.5 w-2.5 text-muted-foreground" />
                                    </Button>
                                  </div>

                                  {/* meta */}
                                  <div className="flex items-center gap-2 mb-1.5 pl-4">
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                      <Package className="w-2.5 h-2.5" />
                                      <span>{ot.quantity.toLocaleString()}</span>
                                    </div>
                                    {ot.deadline && (
                                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <Clock className="w-2.5 h-2.5" />
                                        <span>{new Date(ot.deadline).toLocaleDateString('es', { day: '2-digit', month: 'short' })}</span>
                                      </div>
                                    )}
                                    <Badge className={`${getPriorityColor(ot.priority)} text-[9px] h-3.5 px-1 ml-auto`}>
                                      P{ot.priority}
                                    </Badge>
                                  </div>

                                  {/* budget button */}
                                  {(ot.status === 'pre_press' || ot.status === 'visto_bueno') && (
                                    <Button
                                      size="sm" variant="outline"
                                      className="w-full h-6 text-[10px] mb-1 border-amber-500/40 text-amber-500 hover:bg-amber-500 hover:text-white"
                                      onClick={(e) => { e.stopPropagation(); setBudgetEditOT(ot); }}
                                    >
                                      <DollarSign className="w-2.5 h-2.5 mr-1" />Presupuesto
                                    </Button>
                                  )}

                                  {/* advance buttons */}
                                  {nextSt.length === 1 && (
                                    <Button
                                      size="sm" variant="outline"
                                      className="w-full h-6 text-[10px] border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground"
                                      onClick={(e) => { e.stopPropagation(); requestAdvance(ot, nextSt[0].key, nextSt[0].labelEs); }}
                                    >
                                      <ArrowRight className="w-2.5 h-2.5 mr-1" />{nextSt[0].labelEs}
                                    </Button>
                                  )}
                                  {nextSt.length > 1 && (
                                    <div className="space-y-1">
                                      {nextSt.map(ns => (
                                        <Button
                                          key={ns.key} size="sm" variant="outline"
                                          className={`w-full h-6 text-[10px] ${(ns as any).optional
                                            ? 'border-muted-foreground/40 text-muted-foreground hover:bg-muted'
                                            : 'border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground'}`}
                                          onClick={(e) => { e.stopPropagation(); requestAdvance(ot, ns.key, ns.labelEs); }}
                                        >
                                          <ArrowRight className="w-2.5 h-2.5 mr-1" />{ns.labelEs}
                                        </Button>
                                      ))}
                                    </div>
                                  )}
                                </Card>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
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
