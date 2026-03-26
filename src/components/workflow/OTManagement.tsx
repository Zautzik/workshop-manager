'use client';
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useOTs } from "@/hooks/use-queries";
import { Plus, ArrowRight, Edit2, Info, Package, Clock, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { UnifiedOTWizard } from "./UnifiedOTWizard";
import { EditOTDialog } from "./EditOTDialog";
import { useTranslation } from "react-i18next";

interface OTManagementProps {
  onOTSelect: (ot: any) => void;
}

const STATUS_FLOW = [
  { key: 'pre_press', label: 'Pre-Press', labelEs: 'Pre-Prensa', color: 'bg-violet-500', description: 'Design & Modeling' },
  { key: 'visto_bueno', label: 'Approval', labelEs: 'Visto Bueno', color: 'bg-amber-500', description: 'Customer Confirmation' },
  { key: 'paper_purchase', label: 'Paper Purchase', labelEs: 'Compra Papel', color: 'bg-slate-500', description: 'Ordering materials' },
  { key: 'in_storage', label: 'In Storage', labelEs: 'En Bodega', color: 'bg-cyan-500', description: 'Ready for production' },
  { key: 'guillotine_first_cut', label: 'First Cut', labelEs: 'Primer Corte', color: 'bg-orange-500', description: 'Guillotine initial cut' },
  { key: 'offset_printing', label: 'Printing', labelEs: 'Impresión', color: 'bg-purple-500', description: 'Offset printing' },
  { key: 'die_cutting', label: 'Die Cutting', labelEs: 'Troquelado', color: 'bg-pink-500', description: 'Die cutting process' },
  { key: 'guillotine_final_cut', label: 'Final Cut', labelEs: 'Corte Final', color: 'bg-red-500', description: 'Final guillotine cut' },
  { key: 'workshop', label: 'Workshop', labelEs: 'Taller', color: 'bg-indigo-500', description: 'Internal workshop processing', optional: true },
  { key: 'outsourced', label: 'Outsourced', labelEs: 'Tercerizado', color: 'bg-yellow-500', description: 'External processing', optional: true },
  { key: 'workshop_revision', label: 'Revision', labelEs: 'Revisión', color: 'bg-emerald-500', description: 'Quality check & packaging' },
  { key: 'ready_for_delivery', label: 'Ready', labelEs: 'Listo', color: 'bg-green-500', description: 'Ready for delivery' },
  { key: 'in_delivery', label: 'In Delivery', labelEs: 'En Entrega', color: 'bg-teal-500', description: 'Out for delivery' },
  { key: 'completed', label: 'Completed', labelEs: 'Completado', color: 'bg-gray-500', description: 'Order finished' },
];

export function OTManagement({ onOTSelect }: OTManagementProps) {
  const { data: ots = [], refetch: refetchOTs } = useOTs();
  const [createFlow, setCreateFlow] = useState<'none' | 'wizard'>('none');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingOT, setEditingOT] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const { t, i18n } = useTranslation();

  const updateOTStatus = async (otId: string, newStatus: string) => {
    const response = await fetch(`/api/ots/${otId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      toast({
        title: "Error updating OT status",
        description: errorBody?.error || 'Request failed',
        variant: "destructive",
      });
      return;
    }
    
    toast({ title: "OT advanced to next station" });
    refetchOTs();
  };

  const filteredOTs = ots.filter(ot => 
    ot.ot_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ot.client_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getOTsByStatus = (statusKey: string) => {
    return filteredOTs
      .filter(ot => ot.status === statusKey)
      .sort((a, b) => b.priority - a.priority);
  };

  const getStatusInfo = (status: string) => {
    return STATUS_FLOW.find(s => s.key === status) || STATUS_FLOW[0];
  };

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

  const activeOTsCount = filteredOTs.filter(ot => ot.status !== 'completed').length;
  const isSpanish = i18n.language === 'es';

  const getPriorityColor = (priority: number) => {
    if (priority >= 8) return 'bg-red-500/20 text-red-400 border-red-500/40';
    if (priority >= 5) return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
    return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
  };

  return (
    <div className="space-y-4">
      {/* Instructions */}
      <Alert className="bg-card/80 border-2 border-border backdrop-blur-sm">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-foreground">
          <strong className="text-primary">{isSpanish ? 'Flujo de trabajo:' : 'Workflow:'}</strong>{' '}
          {isSpanish 
            ? 'Las OTs avanzan de izquierda a derecha. Ordenadas por prioridad en cada estación. Haga clic en "Avanzar" para mover al siguiente paso.'
            : 'OTs advance left to right. Sorted by priority in each station. Click "Advance" to move to next step.'}
        </AlertDescription>
      </Alert>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t('ot.title')}</h2>
          <p className="text-muted-foreground">{activeOTsCount} {isSpanish ? 'órdenes activas' : 'active orders'}</p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            placeholder={t('ot.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-input border-border placeholder:text-muted-foreground w-64"
          />
          <Button
            onClick={() => setCreateFlow('wizard')}
            className="bg-primary hover:bg-primary/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('ot.new')}
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <ScrollArea className="w-full">
        <div className="flex gap-4 pb-4 min-w-max">
          {STATUS_FLOW.map((status) => {
            const statusOTs = getOTsByStatus(status.key);
            const isCompleted = status.key === 'completed';
            
            return (
              <div 
                key={status.key}
                className={`flex-shrink-0 w-72 ${isCompleted ? 'opacity-60' : ''}`}
              >
                {/* Column Header */}
                <div className={`${status.color} rounded-t-lg p-3`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-white text-sm">
                      {isSpanish ? status.labelEs : status.label}
                    </h3>
                    <Badge variant="secondary" className="bg-white/20 text-white border-0">
                      {statusOTs.length}
                    </Badge>
                  </div>
                  <p className="text-white/70 text-xs mt-1">{status.description}</p>
                </div>

                {/* Column Content */}
                <div className="bg-muted/30 border border-t-0 border-border rounded-b-lg min-h-[400px] p-2 space-y-2">
                  {statusOTs.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                      {isSpanish ? 'Sin órdenes' : 'No orders'}
                    </div>
                  ) : (
                    statusOTs.map((ot) => {
                      const nextStatuses = getNextStatuses(ot.status);
                      
                      return (
                        <Card 
                          key={ot.id}
                          className="bg-card border-border p-3 hover:border-primary/50 transition-all cursor-pointer"
                          onClick={() => onOTSelect(ot)}
                        >
                          {/* OT Header */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-bold text-foreground text-sm truncate">
                                {ot.ot_number}
                              </h4>
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

                          {/* OT Details */}
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
                          
                          {/* Priority Badge */}
                          <Badge className={`${getPriorityColor(ot.priority)} text-xs mb-2`}>
                            {isSpanish ? 'Prioridad' : 'Priority'} {ot.priority}
                          </Badge>

                          {/* Advance Button(s) */}
                          {nextStatuses.length === 1 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-7 text-xs border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateOTStatus(ot.id, nextStatuses[0].key);
                              }}
                            >
                              <ArrowRight className="w-3 h-3 mr-1" />
                              {isSpanish ? nextStatuses[0].labelEs : nextStatuses[0].label}
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
                                    updateOTStatus(ot.id, ns.key);
                                  }}
                                >
                                  <ArrowRight className="w-3 h-3 mr-1" />
                                  {isSpanish ? ns.labelEs : ns.label}
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
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

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

      {editingOT && (
        <EditOTDialog
          ot={editingOT}
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          onSuccess={refetchOTs}
        />
      )}
    </div>
  );
}
