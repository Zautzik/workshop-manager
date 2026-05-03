'use client';
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useOTs } from "@/hooks/use-workflow-queries";
import { Plus, ArrowRight, Edit2, Info, Package, Clock, User, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { UnifiedOTWizard } from "./UnifiedOTWizard";
import { EditBudgetWizard } from "./EditBudgetWizard";
import { EditOTDialog } from "./EditOTDialog";
import { RealCostEntryDialog } from "./RealCostEntryDialog";

interface OTManagementProps {
  onOTSelect: (ot: any) => void;
}

const STATUS_FLOW = [
  { key: 'pre_press',           label: 'Pre-Press',      labelEs: 'Pre-Prensa',     color: 'bg-violet-500',  rgb: '139 92 246',  description: 'Design & Modeling' },
  { key: 'visto_bueno',         label: 'Approval',       labelEs: 'Visto Bueno',    color: 'bg-amber-500',   rgb: '245 158 11',  description: 'Customer Confirmation' },
  { key: 'paper_purchase',      label: 'Paper Purchase', labelEs: 'Compra Papel',   color: 'bg-slate-500',   rgb: '100 116 139', description: 'Ordering materials' },
  { key: 'in_storage',          label: 'In Storage',     labelEs: 'En Bodega',      color: 'bg-cyan-500',    rgb: '6 182 212',   description: 'Ready for production' },
  { key: 'guillotine_first_cut',label: 'First Cut',      labelEs: 'Primer Corte',   color: 'bg-orange-500',  rgb: '249 115 22',  description: 'Guillotine initial cut' },
  { key: 'offset_printing',     label: 'Printing',       labelEs: 'Impresión',      color: 'bg-purple-500',  rgb: '168 85 247',  description: 'Offset printing' },
  { key: 'die_cutting',         label: 'Die Cutting',    labelEs: 'Troquelado',     color: 'bg-pink-500',    rgb: '236 72 153',  description: 'Die cutting process' },
  { key: 'guillotine_final_cut',label: 'Final Cut',      labelEs: 'Corte Final',    color: 'bg-red-500',     rgb: '239 68 68',   description: 'Final guillotine cut' },
  { key: 'workshop',            label: 'Workshop',       labelEs: 'Taller',         color: 'bg-indigo-500',  rgb: '99 102 241',  description: 'Internal workshop', optional: true },
  { key: 'outsourced',          label: 'Outsourced',     labelEs: 'Tercerizado',    color: 'bg-yellow-500',  rgb: '234 179 8',   description: 'External processing', optional: true },
  { key: 'workshop_revision',   label: 'Revision',       labelEs: 'Revisión',       color: 'bg-emerald-500', rgb: '16 185 129',  description: 'Quality check & packaging' },
  { key: 'ready_for_delivery',  label: 'Ready',          labelEs: 'Listo',          color: 'bg-green-500',   rgb: '34 197 94',   description: 'Ready for delivery' },
  { key: 'in_delivery',         label: 'In Delivery',    labelEs: 'En Entrega',     color: 'bg-teal-500',    rgb: '20 184 166',  description: 'Out for delivery' },
  { key: 'completed',           label: 'Completed',      labelEs: 'Completado',     color: 'bg-gray-500',    rgb: '107 114 128', description: 'Order finished' },
] satisfies { key: string; label: string; labelEs: string; color: string; rgb: string; description: string; optional?: boolean }[];

export function OTManagement({ onOTSelect }: OTManagementProps) {
  const { data: ots = [], refetch: refetchOTs } = useOTs();
  const [activeStage, setActiveStage] = useState<string>(STATUS_FLOW[0].key);
  const [createFlow, setCreateFlow] = useState<'none' | 'wizard'>('none');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingOT, setEditingOT] = useState<any>(null);
  const [budgetEditOT, setBudgetEditOT] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [costEntryOT, setCostEntryOT] = useState<any>(null);
  const [costEntryTarget, setCostEntryTarget] = useState<{ key: string; label: string } | null>(null);
  const { toast } = useToast();

  const updateOTStatus = async (otId: string, newStatus: string) => {
    const response = await fetch(`/api/ots/${otId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to_status: newStatus,
        reason: 'kanban_advance',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      toast({
        title: "Error al actualizar estado",
        description: errorBody?.error || 'Request failed',
        variant: "destructive",
      });
      return;
    }
    
    toast({ title: "OT avanzada a la siguiente estación" });
    refetchOTs();
  };

  const filteredOTs = ots.filter(ot => 
    ot.ot_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ot.client_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const stageStats = useMemo(
    () => STATUS_FLOW.map((stage) => ({
      ...stage,
      count: filteredOTs.filter((ot) => ot.status === stage.key).length,
    })),
    [filteredOTs]
  );

  const getOTsByStatus = (statusKey: string) => {
    return filteredOTs
      .filter(ot => ot.status === statusKey)
      .sort((a, b) => b.priority - a.priority);
  };

  const getStatusInfo = (status: string) => {
    return STATUS_FLOW.find(s => s.key === status) || STATUS_FLOW[0];
  };

  useEffect(() => {
    if (!STATUS_FLOW.some((stage) => stage.key === activeStage)) {
      setActiveStage(STATUS_FLOW[0].key);
      return;
    }

    const currentStageCount = stageStats.find((stage) => stage.key === activeStage)?.count ?? 0;
    if (currentStageCount === 0) {
      const firstWithOrders = stageStats.find((stage) => stage.count > 0);
      if (firstWithOrders) setActiveStage(firstWithOrders.key);
    }
  }, [activeStage, stageStats]);

  const getNextStatuses = (currentStatus: string) => {
    const currentIndex = STATUS_FLOW.findIndex(s => s.key === currentStatus);
    if (currentIndex >= STATUS_FLOW.length - 1) return [];

    // From guillotine_final_cut: offer Workshop, Outsourced, or skip to Revision
    if (currentStatus === 'guillotine_final_cut') {
      return STATUS_FLOW.filter(s => 
        s.key === 'workshop' || s.key === 'outsourced' || s.key === 'workshop_revision'
      );
    }

    // From workshop or outsourced: go to Revision
    if (currentStatus === 'workshop' || currentStatus === 'outsourced') {
      return STATUS_FLOW.filter(s => s.key === 'workshop_revision');
    }

    // Default: next step in flow (skip optional steps)
    const next = STATUS_FLOW[currentIndex + 1];
    if (next && (next.key === 'workshop' || next.key === 'outsourced')) {
      return STATUS_FLOW.filter(s => s.key === 'workshop_revision');
    }

    return next ? [next] : [];
  };

  const handleEditOT = (ot: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingOT(ot);
    setShowEditDialog(true);
  };

  /** Open the real-cost dialog before advancing an OT */
  const requestAdvance = (ot: any, targetStatusKey: string, targetStatusLabel: string) => {
    setCostEntryOT(ot);
    setCostEntryTarget({ key: targetStatusKey, label: targetStatusLabel });
  };

  /** Actually advance (called from the dialog after costs are saved or skipped) */
  const confirmAdvance = () => {
    if (costEntryOT && costEntryTarget) {
      updateOTStatus(costEntryOT.id, costEntryTarget.key);
    }
    setCostEntryOT(null);
    setCostEntryTarget(null);
  };

  const activeOTsCount = filteredOTs.filter(ot => ot.status !== 'completed').length;
  const activeStageInfo = getStatusInfo(activeStage);
  const activeStageOTs = getOTsByStatus(activeStage);

  const getPriorityColor = (priority: number) => {
    if (priority >= 8) return 'bg-red-500/20 text-red-400 border-red-500/40';
    if (priority >= 5) return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
    return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
  };

  return (
    <div className="space-y-4">
      {/* Instructions */}
      <Alert className="bg-card/60 border border-border">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm text-muted-foreground">
          Las OTs avanzan de izquierda a derecha por estación. Use <strong className="text-foreground">Avanzar</strong> para mover al siguiente paso.
        </AlertDescription>
      </Alert>

      {/* Header — title + controls + mini process map side-by-side */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {/* Left: title, search, new button */}
        <div className="flex flex-col gap-2">
          <div>
            <h2 className="text-xl font-bold text-foreground">Órdenes de Trabajo</h2>
            <p className="text-sm text-muted-foreground">{activeOTsCount} activas</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar OT o cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-input border-border placeholder:text-muted-foreground w-52"
            />
            <Button
              onClick={() => setCreateFlow('wizard')}
              className="bg-primary hover:bg-primary/90"
            >
              <Plus className="w-4 h-4 mr-1" />
              Nueva OT
            </Button>
          </div>
        </div>

        {/* Right: compact honeycomb process map */}
        {(() => {
          const HEX_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
          const HW = 108;   // hex width px
          const HH = 96;    // hex height px
          const GAP = 5;    // gap between hexes px
          const COL_STEP = HW + GAP;              // 113 px
          const V_STEP   = Math.round(HH * 0.76); // 73 px — rows overlap ¼

          // [5, 5, 4] honeycomb — 3 rows fit all 14 stages
          const ROWS = [
            stageStats.slice(0, 5),    // row 0 — no offset
            stageStats.slice(5, 10),   // row 1 — offset right
            stageStats.slice(10, 14),  // row 2 — no offset
          ];

          const containerW = 5 * COL_STEP + Math.round(COL_STEP / 2) + 4; // ≈ 622 px
          const containerH = HH + 2 * V_STEP + 10;                         // ≈ 252 px

          return (
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Mapa de Proceso</span>
              <div style={{ position: 'relative', width: containerW, height: containerH }}>
                {ROWS.map((row, rowIdx) => {
                  const isOffsetRow = rowIdx % 2 === 1;
                  const xBase = isOffsetRow ? Math.round(COL_STEP / 2) : 0;
                  const y = rowIdx * V_STEP;
                  return row.map((stage, colIdx) => {
                    const x = xBase + colIdx * COL_STEP;
                    const isActive = stage.key === activeStage;
                    const activeFill   = isDark ? { c: 0.88, m: 0.50, e: 0.70 } : { c: 0.78, m: 0.50, e: 0.66 };
                    const inactiveFill = isDark ? { c: 0.55, m: 0.22, e: 0.40 } : { c: 0.68, m: 0.38, e: 0.54 };
                    const fill         = isActive ? activeFill : inactiveFill;
                    const shadowActive = isDark ? 0.80 : 0.50;
                    const shadowIdle   = isDark ? 0.30 : 0.20;
                    const labelColor   = isDark ? '#fff' : `rgb(${stage.rgb})`;
                    const labelFilter  = isDark ? 'none' : 'brightness(0.5)';
                    return (
                      <div
                        key={stage.key}
                        title={`${stage.labelEs}${stage.count > 0 ? ` — ${stage.count} OT` : ''}`}
                        onClick={() => setActiveStage(stage.key)}
                        style={{
                          position: 'absolute', left: x, top: y,
                          width: HW, height: HH, cursor: 'pointer',
                          filter: isActive
                            ? `drop-shadow(0 4px 10px rgb(${stage.rgb} / ${shadowActive}))`
                            : `drop-shadow(0 2px 5px rgb(${stage.rgb} / ${shadowIdle}))`,
                          transform: isActive ? 'scale(1.15)' : 'scale(1)',
                          transition: 'filter 0.18s, transform 0.18s',
                          zIndex: isActive ? 2 : 1,
                        }}
                        onMouseEnter={e => {
                          if (!isActive) {
                            (e.currentTarget as HTMLDivElement).style.filter = `drop-shadow(0 3px 8px rgb(${stage.rgb} / 0.55))`;
                            (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.08)';
                          }
                        }}
                        onMouseLeave={e => {
                          if (!isActive) {
                            (e.currentTarget as HTMLDivElement).style.filter = `drop-shadow(0 2px 5px rgb(${stage.rgb} / ${shadowIdle}))`;
                            (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)';
                          }
                        }}
                      >
                        <div style={{
                          width: '100%', height: '100%', clipPath: HEX_CLIP, position: 'relative',
                          background: `radial-gradient(ellipse 65% 60% at 38% 28%, rgb(${stage.rgb} / ${fill.c}) 0%, rgb(${stage.rgb} / ${fill.m}) 55%, rgb(${stage.rgb} / ${fill.e}) 100%)`,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                        }}>
                          {/* Gleam */}
                          <div style={{
                            position: 'absolute', inset: 0, clipPath: HEX_CLIP, pointerEvents: 'none',
                            background: `radial-gradient(ellipse 50% 38% at 30% 20%, rgba(255,255,255,${isDark ? 0.20 : 0.32}) 0%, transparent 65%)`,
                          }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: labelColor, filter: labelFilter, textAlign: 'center', lineHeight: 1.25, maxWidth: '86%', zIndex: 1 }}>
                              {stage.labelEs}
                            </span>
                          {stage.count > 0 && (
                            <span style={{
                              fontSize: 15, fontWeight: 800, lineHeight: 1, zIndex: 1,
                              color: `rgb(${stage.rgb})`,
                              filter: isDark ? 'brightness(1.9)' : 'brightness(0.6)',
                            }}>
                              {stage.count}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Focused stage board */}
      <div className="space-y-4">
        <div className="w-full">
          <div className={`${activeStageInfo.color} rounded-t-lg p-3`}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-sm">{activeStageInfo.labelEs}</h3>
              <Badge variant="secondary" className="bg-white/20 text-white border-0">{activeStageOTs.length}</Badge>
            </div>
            <p className="text-white/70 text-xs mt-1">{activeStageInfo.description}</p>
          </div>

          <div className="bg-muted/30 border border-t-0 border-border rounded-b-lg min-h-[420px] max-h-[70vh] overflow-y-auto p-2 space-y-2">
            {activeStageOTs.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">Sin órdenes</div>
            ) : (
              activeStageOTs.map((ot) => {
                const nextStatuses = getNextStatuses(ot.status);

                return (
                  <Card
                    key={ot.id}
                    className="bg-card border-border p-3 hover:border-primary/50 transition-all cursor-pointer"
                    onClick={() => onOTSelect(ot)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-foreground text-sm truncate">{ot.ot_number}</h4>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="w-3 h-3" />
                          <span className="truncate">{ot.client_name}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 hover:bg-muted flex-shrink-0"
                        onClick={(e) => handleEditOT(ot, e)}
                      >
                        <Edit2 className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Package className="w-3 h-3" />
                        <span>{ot.quantity.toLocaleString()}</span>
                      </div>
                      {ot.deadline && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(ot.deadline).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>

                    <Badge className={`${getPriorityColor(ot.priority)} text-xs mb-2`}>P{ot.priority}</Badge>

                    {(ot.status === 'pre_press' || ot.status === 'visto_bueno') && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-7 text-xs mb-1 border-amber-500/40 text-amber-400 hover:bg-amber-500 hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBudgetEditOT(ot);
                        }}
                      >
                        <DollarSign className="w-3 h-3 mr-1" />
                        Modificar Presupuesto
                      </Button>
                    )}

                    {nextStatuses.length === 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-7 text-xs border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestAdvance(ot, nextStatuses[0].key, nextStatuses[0].labelEs);
                        }}
                      >
                        <ArrowRight className="w-3 h-3 mr-1" />
                        {nextStatuses[0].labelEs}
                      </Button>
                    )}
                    {nextStatuses.length > 1 && (
                      <div className="space-y-1">
                        {nextStatuses.map((ns) => (
                          <Button
                            key={ns.key}
                            size="sm"
                            variant="outline"
                            className={`w-full h-7 text-xs ${
                              ns.optional
                                ? 'border-muted-foreground/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                                : 'border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground'
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              requestAdvance(ot, ns.key, ns.labelEs);
                            }}
                          >
                            <ArrowRight className="w-3 h-3 mr-1" />
                            {ns.labelEs}
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
      </div>

      {/* Unified creation wizard */}
      {createFlow === 'wizard' && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <UnifiedOTWizard
            onClose={() => setCreateFlow('none')}
            onSuccess={() => {
              refetchOTs();
              setCreateFlow('none');
            }}
          />
        </div>
      )}

      {/* Budget edit wizard (full-screen) */}
      {budgetEditOT && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <EditBudgetWizard
            ot={budgetEditOT}
            onClose={() => setBudgetEditOT(null)}
            onSuccess={() => {
              refetchOTs();
              setBudgetEditOT(null);
            }}
          />
        </div>
      )}

      {editingOT && (
        <EditOTDialog
          ot={editingOT}
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          onSuccess={refetchOTs}
        />
      )}

      {/* Real Cost Entry Dialog (before advancing) */}
      {costEntryOT && costEntryTarget && (
        <RealCostEntryDialog
          open={!!costEntryOT}
          onOpenChange={(open) => {
            if (!open) {
              setCostEntryOT(null);
              setCostEntryTarget(null);
            }
          }}
          ot={costEntryOT}
          targetStatus={costEntryTarget.key}
          targetStatusLabel={costEntryTarget.label}
          onConfirm={confirmAdvance}
        />
      )}
    </div>
  );
}
