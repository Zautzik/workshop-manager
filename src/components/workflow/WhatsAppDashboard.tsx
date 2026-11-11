'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Phone,
  User,
  FileText,
  DollarSign,
  Timer,
  Send,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  Activity,
  TrendingUp,
  BarChart3,
  Search,
  Pencil,
  X,
} from 'lucide-react';
import {
  useWhatsAppSummary,
  useWhatsAppPendingReviews,
  useWhatsAppLogs,
  useManualWhatsAppEntry,
} from '@/hooks/use-whatsapp';
import { useToast } from '@/hooks/use-toast';
import { useReviewCapture, useReviewCaptures } from '@/hooks/use-captures';
import type { InferredCostData, WhatsAppProductionLog } from '@/types/whatsapp-production';
import {
  toEditableData, toDraftLines, toCorrections,
  type EditableData, type DraftLine,
} from '@/lib/review-edits';
import { formatCLP } from '@/lib/whatsapp-cost-inference';
import { ConfidenceBadge } from './ConfidenceBadge';
import { StatusBadge } from './StatusBadge';
import { CostLineTable } from './CostLineTable';
import { ReviewCard } from './ReviewCard';
import { EditableCostLineTable } from './EditableCostLineTable';
import { EditableParsedData } from './EditableParsedData';
import { ReviewPaperIssue } from './ReviewPaperIssue';
import type { SalidaDePapelState } from './SalidaDePapel';

const PAPEL_VACIO: SalidaDePapelState = { loading: false, required: false, lines: null, problem: null };

/** Lo que el supervisor está corrigiendo, y contra qué se recalcula. */
interface ReviewDraft {
  baseData: EditableData;
  baseLines: DraftLine[];
  data: EditableData;
  lines: DraftLine[];
}

/* ================================================================ */
/*  MAIN DASHBOARD COMPONENT                                        */
/* ================================================================ */

export default function WhatsAppDashboard() {
  const { data: summary } = useWhatsAppSummary();
  const { data: pendingData } = useWhatsAppPendingReviews();
  const reviewMutation = useReviewCapture();
  const batchReview = useReviewCaptures();
  const manualEntry = useManualWhatsAppEntry();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('pending');
  const [reviewingLog, setReviewingLog] = useState<WhatsAppProductionLog | null>(null);
  const [reviewComments, setReviewComments] = useState('');
  // null = viendo; un borrador = el supervisor está corrigiendo la interpretación.
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  // El papel que sale si aprobar mueve la OT a la primera etapa de su ruta.
  const [papel, setPapel] = useState<SalidaDePapelState>(PAPEL_VACIO);
  const [manualMessage, setManualMessage] = useState('');
  const [manualName, setManualName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const ITEMS_PER_PAGE = 50;

  const { data: allLogsData } = useWhatsAppLogs({
    limit: ITEMS_PER_PAGE,
    offset: (historyPage - 1) * ITEMS_PER_PAGE,
  });

  const pendingLogs = pendingData?.data ?? [];
  const allLogs = allLogsData?.data ?? [];
  const totalLogs = allLogsData?.total ?? 0;

  const filteredLogs = allLogs.filter(log =>
    log.ot_number.includes(searchTerm) ||
    (log.operator_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.raw_message.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === pendingLogs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingLogs.map(l => l.id)));
    }
  };

  const handleBatchReview = async (action: 'approve' | 'reject') => {
    if (selectedIds.size === 0) return;
    try {
      const results = await batchReview.mutateAsync({
        source: 'whatsapp',
        ids: Array.from(selectedIds),
        decision: action,
      });
      const hechos = results.filter(r => r.ok).length;
      const avisos = results.filter(r => r.warning || !r.ok);
      toast({
        title: action === 'approve' ? '✅ Aprobados en lote' : '❌ Rechazados en lote',
        description: `${hechos} de ${results.length} registros ${action === 'approve' ? 'aprobados' : 'rechazados'}`
          + (avisos.length > 0 ? ` · ${avisos.length} con aviso: ${avisos[0].warning ?? avisos[0].error}` : ''),
        variant: avisos.length > 0 ? 'destructive' : 'default',
      });
      setSelectedIds(new Set());
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  /* ─── Review Actions ─────────────────────────────────────── */

  const closeReview = () => {
    setPapel(PAPEL_VACIO);
    setReviewingLog(null);
    setReviewComments('');
    setDraft(null);
  };

  /** «Editar e Integrar»: parte de lo último que se dejó como cierto. */
  const startEditing = () => {
    if (!reviewingLog) return;
    const parsed = (reviewingLog.corrected_data ?? reviewingLog.parsed_data) as Record<string, unknown> | null;
    const costs = (reviewingLog.corrected_costs ?? reviewingLog.inferred_costs) as InferredCostData | null;
    const data = toEditableData(parsed);
    const lines = toDraftLines(costs?.cost_lines ?? []);
    setDraft({ baseData: data, baseLines: lines, data, lines });
  };

  // Un dato ya no arrastra ninguna línea: los pliegos y las horas van a la
  // pasada, que es la que valoriza la máquina (review-edits.ts).
  const setDraftData = (data: EditableData) => setDraft(d => d && { ...d, data });

  // «Solicitar revisión» y «Rechazar» eran la misma decisión con dos nombres:
  // el parte no se integra. Queda una sola.
  const handleReview = async (action: 'approve' | 'reject') => {
    if (!reviewingLog) return;

    // Con edición, viajan los datos corregidos (deciden etapa, horas y destino
    // de la OT) y las líneas de costo; apply_capture_event integra lo corregido.
    // Y si aprobar hace entrar la OT a la primera etapa de su ruta, el papel
    // que sale: sin él, la OT no avanza (moveOT lo exige igual que el Tablero).
    if (action === 'approve' && papel.loading) {
      toast({ title: 'Un momento', description: 'Todavía se está calculando el papel que sale.' });
      return;
    }
    if (action === 'approve' && papel.required && !papel.lines) {
      toast({ title: 'Falta el papel que sale', description: papel.problem ?? 'Indicá de qué lote y cuántos pliegos.', variant: 'destructive' });
      return;
    }
    const paperIssue = action === 'approve' && papel.required && papel.lines ? papel.lines : undefined;
    const edited = action === 'approve' && draft ? toCorrections(draft.data, draft.lines) : undefined;
    const corrections = edited || paperIssue ? { ...(edited ?? {}), ...(paperIssue ? { paperIssue } : {}) } : undefined;

    try {
      const result = await reviewMutation.mutateAsync({
        source: 'whatsapp',
        id: reviewingLog.id,
        decision: action,
        comments: reviewComments || undefined,
        corrections,
      });

      const hasWarning = !!result?.warning;

      toast({
        title: hasWarning
          ? '⚠️ Aprobado con advertencia'
          : action === 'approve' ? (corrections ? '✅ Corregido e integrado' : '✅ Aprobado') : '❌ Rechazado',
        description: hasWarning
          ? result.warning
          : `OT-${reviewingLog.ot_number} ${
            action === 'approve'
              ? (corrections ? 'corregido e integrado al sistema' : 'aprobado y costos integrados al sistema')
              : 'rechazado'
          }`,
        variant: hasWarning ? 'destructive' : 'default',
      });

      closeReview();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  /* ─── Manual Entry ───────────────────────────────────────── */

  const handleManualEntry = async () => {
    if (!manualMessage.trim()) return;

    try {
      await manualEntry.mutateAsync({
        message: manualMessage,
        operator_name: manualName || undefined,
      });

      toast({
        title: '✅ Mensaje registrado',
        description: 'El mensaje ha sido procesado y registrado',
      });

      setManualMessage('');
      setManualName('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Clock className="h-5 w-5 text-amber-500" />
              <span className="text-2xl font-bold">{summary?.pending_reviews ?? 0}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Pendientes</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">{summary?.approved_today ?? 0}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Aprobados hoy</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <XCircle className="h-5 w-5 text-red-500" />
              <span className="text-2xl font-bold">{summary?.rejected_today ?? 0}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Rechazados</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Activity className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">{summary?.active_sessions ?? 0}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">En producción</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              <span className="text-2xl font-bold">{summary?.total_today ?? 0}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Mensajes hoy</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-cyan-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <BarChart3 className="h-5 w-5 text-cyan-500" />
              <span className="text-2xl font-bold">{summary?.avg_confidence ?? 0}%</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Confianza prom.</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Main Content ───────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-lg">
          <TabsTrigger value="pending" className="gap-1">
            <Clock className="h-4 w-4" />
            Pendientes
            {pendingLogs.length > 0 && (
              <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">
                {pendingLogs.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1">
            <FileText className="h-4 w-4" />
            Historial
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-1">
            <Send className="h-4 w-4" />
            Entrada Manual
          </TabsTrigger>
        </TabsList>

        {/* ── Pending Reviews ──────────────────────────────── */}
        <TabsContent value="pending" className="space-y-4 mt-4">
          {pendingLogs.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500/50 mb-3" />
                <h3 className="text-lg font-semibold">Todo al día</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  No hay reportes pendientes de revisión
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Batch actions bar */}
              <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3 border">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === pendingLogs.length && pendingLogs.length > 0}
                    onChange={selectAll}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-muted-foreground">
                    {selectedIds.size > 0 ? `${selectedIds.size} seleccionados` : 'Seleccionar todos'}
                  </span>
                </div>
                {selectedIds.size > 0 && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleBatchReview('reject')}
                      disabled={batchReview.isPending}
                      className="gap-1"
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                      Rechazar ({selectedIds.size})
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleBatchReview('approve')}
                      disabled={batchReview.isPending}
                      className="gap-1 bg-green-600 hover:bg-green-700"
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                      Aprobar ({selectedIds.size})
                    </Button>
                  </div>
                )}
              </div>

              {pendingLogs.map(log => (
                <div key={log.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(log.id)}
                    onChange={() => toggleSelection(log.id)}
                    className="h-4 w-4 mt-5 rounded border-gray-300"
                  />
                  <div className="flex-1">
                    <ReviewCard
                      log={log}
                      onReview={setReviewingLog}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── History ──────────────────────────────────────── */}
        <TabsContent value="history" className="space-y-4 mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por OT, operario o mensaje..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-[600px]">
            <div className="space-y-2">
              {filteredLogs.map(log => (
                <Card key={log.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          OT-{log.ot_number}
                        </Badge>
                        <StatusBadge status={log.review_status} />
                        <Badge variant="secondary" className="text-xs">
                          {log.message_type === 'start' ? '▶ Inicio' : log.message_type === 'cancel' ? '🚫 Cancelado' : '⏹ Fin'}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleString('es-CL')}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{log.operator_name || log.operator_phone}</span>
                      {log.elapsed_minutes && (
                        <span className="flex items-center gap-1">
                          <Timer className="h-3 w-3" /> {Math.round(log.elapsed_minutes)} min
                        </span>
                      )}
                      {(log.inferred_costs as any)?.total_inferred_cost > 0 && (
                        <span className="flex items-center gap-1 text-blue-500">
                          <DollarSign className="h-3 w-3" />
                          {formatCLP((log.inferred_costs as any).total_inferred_cost)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-muted-foreground mt-1 truncate">
                      &quot;{log.raw_message}&quot;
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-muted-foreground">
              {totalLogs > 0
                ? `${(historyPage - 1) * ITEMS_PER_PAGE + 1}–${Math.min(historyPage * ITEMS_PER_PAGE, totalLogs)} de ${totalLogs}`
                : 'Sin registros'}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={historyPage <= 1}
                onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
              >
                ← Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={historyPage * ITEMS_PER_PAGE >= totalLogs}
                onClick={() => setHistoryPage(p => p + 1)}
              >
                Siguiente →
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── Manual Entry ─────────────────────────────────── */}
        <TabsContent value="manual" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Send className="h-5 w-5 text-green-500" />
                Entrada Manual de Mensaje
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="bg-green-500/5 border-green-500/20">
                <MessageSquare className="h-4 w-4 text-green-500" />
                <AlertDescription className="text-sm">
                  Simula un mensaje de WhatsApp. Usa el mismo formato que los operarios:
                  <br />
                  <code className="text-xs bg-muted px-1 rounded">INICIO OT-1234</code> — para iniciar producción
                  <br />
                  <code className="text-xs bg-muted px-1 rounded">FIN OT-1234 500 pliegos, 3 merma, doblado ok</code> — para finalizar
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Nombre del operario (opcional)</label>
                  <Input
                    placeholder="ej: Juan Pérez"
                    value={manualName}
                    onChange={e => setManualName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">Mensaje</label>
                  <Textarea
                    placeholder='ej: "fin ot 1234 hice 500 pliegos 3 de merma doblado y corchetes ok"'
                    value={manualMessage}
                    onChange={e => setManualMessage(e.target.value)}
                    rows={3}
                    className="font-mono"
                  />
                </div>

                <Button
                  onClick={handleManualEntry}
                  disabled={!manualMessage.trim() || manualEntry.isPending}
                  className="w-full gap-2"
                >
                  <Send className="h-4 w-4" />
                  {manualEntry.isPending ? 'Procesando...' : 'Enviar y Procesar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Review Dialog ──────────────────────────────────── */}
      <Dialog open={!!reviewingLog} onOpenChange={(open) => !open && closeReview()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {reviewingLog && (() => {
            const parsedData = reviewingLog.parsed_data as any;
            const inferredCosts = reviewingLog.inferred_costs as any;

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Revisar Reporte — OT-{reviewingLog.ot_number}
                  </DialogTitle>
                  <DialogDescription>
                    Revisa los datos extraídos y costos inferidos. Puedes rechazarlo, integrarlo tal cual, o corregir la interpretación (datos y costos) e integrarla.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  {/* Operator & Time Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Operario</p>
                      <p className="text-sm flex items-center gap-1">
                        <User className="h-4 w-4" />
                        {reviewingLog.operator_name || 'Sin nombre'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Teléfono</p>
                      <p className="text-sm flex items-center gap-1">
                        <Phone className="h-4 w-4" />
                        {reviewingLog.operator_phone}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Hora del mensaje</p>
                      <p className="text-sm">
                        {new Date(reviewingLog.message_timestamp).toLocaleString('es-CL')}
                      </p>
                    </div>
                    {reviewingLog.elapsed_minutes && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">Tiempo transcurrido</p>
                        <p className="text-sm flex items-center gap-1">
                          <Timer className="h-4 w-4 text-blue-500" />
                          <span className="font-semibold">{Math.round(reviewingLog.elapsed_minutes)} min</span>
                          <span className="text-muted-foreground">
                            ({(reviewingLog.elapsed_minutes / 60).toFixed(1)} hrs)
                          </span>
                        </p>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Raw Message */}
                  <div className="bg-muted/50 rounded-lg p-3 border">
                    <p className="text-xs text-muted-foreground mb-1">📱 Mensaje original</p>
                    <p className="text-sm font-mono">&quot;{reviewingLog.raw_message}&quot;</p>
                  </div>

                  {/* Parsed Data */}
                  {draft ? (
                    <>
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <Pencil className="h-4 w-4 text-amber-500" />
                        Editando datos extraídos
                      </h4>
                      <EditableParsedData data={draft.data} onChange={setDraftData} />
                    </>
                  ) : parsedData && (
                    <>
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-sm">Datos Extraídos</h4>
                        <ConfidenceBadge confidence={parsedData.confidence ?? 0} />
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        {parsedData.pliegos_produced !== null && (
                          <Card>
                            <CardContent className="p-3 text-center">
                              <p className="text-2xl font-bold">
                                {parsedData.pliegos_produced?.toLocaleString('es-CL')}
                              </p>
                              <p className="text-xs text-muted-foreground">Pliegos producidos</p>
                            </CardContent>
                          </Card>
                        )}
                        {parsedData.merma !== null && (
                          <Card className="border-amber-500/30">
                            <CardContent className="p-3 text-center">
                              <p className="text-2xl font-bold text-amber-500">
                                {parsedData.merma?.toLocaleString('es-CL')}
                              </p>
                              <p className="text-xs text-muted-foreground">Merma</p>
                            </CardContent>
                          </Card>
                        )}
                        {parsedData.buenos !== null && (
                          <Card className="border-green-500/30">
                            <CardContent className="p-3 text-center">
                              <p className="text-2xl font-bold text-green-500">
                                {parsedData.buenos?.toLocaleString('es-CL')}
                              </p>
                              <p className="text-xs text-muted-foreground">Buenos</p>
                            </CardContent>
                          </Card>
                        )}
                      </div>

                      {/* Processes */}
                      {parsedData.processes_mentioned?.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Procesos identificados</p>
                          <div className="flex flex-wrap gap-1">
                            {parsedData.processes_mentioned.map((p: string) => (
                              <Badge key={p} variant="secondary">{p}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Problems */}
                      {parsedData.problems_reported?.length > 0 && (
                        <Alert variant="destructive">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            <strong>Problemas reportados:</strong>
                            <ul className="list-disc list-inside mt-1">
                              {parsedData.problems_reported.map((p: string, i: number) => (
                                <li key={i} className="text-sm">{p}</li>
                              ))}
                            </ul>
                          </AlertDescription>
                        </Alert>
                      )}
                    </>
                  )}

                  <Separator />

                  {/* Inferred Costs */}
                  {draft ? (
                    <>
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <Pencil className="h-4 w-4 text-amber-500" />
                        Editando costos inferidos
                      </h4>
                      <EditableCostLineTable
                        lines={draft.lines}
                        onChange={lines => setDraft(d => d && { ...d, lines })}
                      />
                    </>
                  ) : (() => {
                    const displayedCosts = reviewingLog.corrected_costs ?? inferredCosts;
                    const hasCorrected = !!reviewingLog.corrected_costs;
                    return displayedCosts?.cost_lines?.length > 0 ? (
                      <>
                        <h4 className="font-semibold text-sm flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-blue-500" />
                          {hasCorrected ? 'Costos Corregidos' : 'Costos Inferidos'}
                        </h4>
                        {hasCorrected && (
                          <Alert className="bg-blue-500/10 border-blue-500/20 py-2">
                            <AlertDescription className="text-xs">
                              El supervisor ha realizado correcciones a los costos originales.
                            </AlertDescription>
                          </Alert>
                        )}
                        <CostLineTable
                          lines={displayedCosts.cost_lines}
                          confidence={parsedData?.confidence ?? 50}
                        />
                      </>
                    ) : null;
                  })()}

                  <Separator />

                  {/* El papel, si aprobar hace entrar la OT a la primera etapa de su ruta. */}
                  <ReviewPaperIssue
                    source="whatsapp"
                    id={reviewingLog.id}
                    data={draft ? toCorrections(draft.data, draft.lines).data : undefined}
                    onChange={setPapel}
                  />

                  {/* Review Comments */}
                  <div>
                    <label className="text-sm font-medium mb-1 block">Comentarios del supervisor</label>
                    <Textarea
                      placeholder="Notas opcionales sobre esta revisión..."
                      value={reviewComments}
                      onChange={e => setReviewComments(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>

                <DialogFooter className="flex flex-wrap gap-2 sm:gap-2">
                  {draft ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setDraft(null)}
                        disabled={reviewMutation.isPending}
                        className="gap-1"
                      >
                        <X className="h-4 w-4" />
                        Descartar cambios
                      </Button>
                      <Button
                        onClick={() => handleReview('approve')}
                        disabled={reviewMutation.isPending}
                        className="gap-1 bg-green-600 hover:bg-green-700"
                      >
                        <ThumbsUp className="h-4 w-4" />
                        {reviewMutation.isPending ? 'Procesando...' : 'Guardar e Integrar'}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="destructive"
                        onClick={() => handleReview('reject')}
                        disabled={reviewMutation.isPending}
                        className="gap-1"
                      >
                        <ThumbsDown className="h-4 w-4" />
                        Rechazar
                      </Button>
                      <Button
                        variant="outline"
                        onClick={startEditing}
                        disabled={reviewMutation.isPending}
                        className="gap-1"
                      >
                        <Pencil className="h-4 w-4" />
                        Editar e Integrar
                      </Button>
                      <Button
                        onClick={() => handleReview('approve')}
                        disabled={reviewMutation.isPending}
                        className="gap-1 bg-green-600 hover:bg-green-700"
                      >
                        <ThumbsUp className="h-4 w-4" />
                        {reviewMutation.isPending ? 'Procesando...' : 'Aprobar e Integrar'}
                      </Button>
                    </>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
