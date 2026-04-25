'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Package,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  RotateCcw,
  QrCode,
  Eye,
  Search,
  ThumbsUp,
  ThumbsDown,
  BarChart3,
  Clipboard,
  Truck,
  Activity,
} from 'lucide-react';
import {
  useWarehouseSummary,
  useWarehousePendingReviews,
  useWarehouseLogs,
  useReviewWarehouseLog,
  useBatchReviewWarehouse,
  useGenerateWarehouseQR,
} from '@/hooks/use-warehouse';
import { useInventoryItems } from '@/hooks/use-workflow-queries';
import { useToast } from '@/hooks/use-toast';
import type { WhatsAppWarehouseLog } from '@/types/whatsapp-warehouse';

/* ─── Action Badge ───────────────────────────────────────────── */

function ActionBadge({ action }: { action: string }) {
  const map: Record<string, { label: string; className: string; icon: typeof Package }> = {
    receive: { label: 'Recepción', className: 'bg-green-500/20 text-green-400 border-green-500/40', icon: ArrowDownToLine },
    use: { label: 'Consumo', className: 'bg-blue-500/20 text-blue-400 border-blue-500/40', icon: ArrowUpFromLine },
    return: { label: 'Devolución', className: 'bg-amber-500/20 text-amber-400 border-amber-500/40', icon: RotateCcw },
    check: { label: 'Consulta', className: 'bg-gray-500/20 text-gray-400 border-gray-500/40', icon: Eye },
  };
  const config = map[action] ?? { label: action, className: 'bg-gray-500/20 text-gray-400', icon: Package };
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={config.className}>
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </Badge>
  );
}

/* ─── Status Badge ───────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pendiente', className: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
    approved: { label: 'Aprobado', className: 'bg-green-500/20 text-green-400 border-green-500/40' },
    rejected: { label: 'Rechazado', className: 'bg-red-500/20 text-red-400 border-red-500/40' },
    needs_revision: { label: 'Revisar', className: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
    auto_approved: { label: 'Auto', className: 'bg-slate-500/20 text-slate-400 border-slate-500/40' },
  };
  const config = map[status] ?? { label: status, className: 'bg-gray-500/20 text-gray-400' };
  return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
}

/* ─── Main Dashboard ─────────────────────────────────────────── */

export default function WarehouseDashboard() {
  const { toast } = useToast();
  const { data: summary } = useWarehouseSummary();
  const { data: pendingLogs = [] } = useWarehousePendingReviews();
  const [historyFilter, setHistoryFilter] = useState<string>('all');
  const [historyPage, setHistoryPage] = useState(0);
  const { data: historyLogs = [] } = useWarehouseLogs({
    status: historyFilter === 'all' ? undefined : historyFilter,
    limit: 20,
    offset: historyPage * 20,
  });

  const reviewMutation = useReviewWarehouseLog();
  const batchMutation = useBatchReviewWarehouse();
  const qrMutation = useGenerateWarehouseQR();
  const { data: inventoryItems = [] } = useInventoryItems();

  // Review dialog state
  const [reviewLog, setReviewLog] = useState<WhatsAppWarehouseLog | null>(null);
  const [reviewComments, setReviewComments] = useState('');
  const [correctedQty, setCorrectedQty] = useState('');
  const [correctedCost, setCorrectedCost] = useState('');

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // QR dialog
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [qrItems, setQrItems] = useState<string[]>([]);
  const [qrAction, setQrAction] = useState<string>('');
  const [qrResults, setQrResults] = useState<Array<{ value: string; label: string }>>([]);

  /* ── Handlers ──────────────────────────────────────────────── */

  const handleReview = useCallback(async (status: 'approved' | 'rejected' | 'needs_revision') => {
    if (!reviewLog) return;

    try {
      const result = await reviewMutation.mutateAsync({
        id: reviewLog.id,
        review_status: status,
        review_comments: reviewComments || undefined,
        corrected_quantity: correctedQty ? Number(correctedQty) : undefined,
        corrected_unit_cost: correctedCost ? Number(correctedCost) : undefined,
      });

      if (result._warning) {
        toast({ title: '⚠️ Advertencia', description: result._warning, variant: 'destructive' });
      } else {
        toast({ title: status === 'approved' ? '✅ Aprobado' : status === 'rejected' ? '❌ Rechazado' : '🔄 Revisión solicitada' });
      }

      setReviewLog(null);
      setReviewComments('');
      setCorrectedQty('');
      setCorrectedCost('');
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    }
  }, [reviewLog, reviewComments, correctedQty, correctedCost, reviewMutation, toast]);

  const handleBatch = useCallback(async (status: 'approved' | 'rejected') => {
    if (selectedIds.size === 0) return;

    try {
      const result = await batchMutation.mutateAsync({
        ids: Array.from(selectedIds),
        review_status: status,
      });

      toast({
        title: `${status === 'approved' ? '✅' : '❌'} ${result.successes}/${result.total} procesados`,
        description: result.failures > 0 ? `${result.failures} fallaron` : undefined,
      });

      setSelectedIds(new Set());
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    }
  }, [selectedIds, batchMutation, toast]);

  const handleGenerateQR = useCallback(async () => {
    if (qrItems.length === 0) return;

    try {
      const result = await qrMutation.mutateAsync({
        item_ids: qrItems,
        action: qrAction as 'receive' | 'use' | 'return' | 'check' | undefined || undefined,
      });

      setQrResults(result.qr_codes.map((qr) => ({ value: qr.value, label: qr.label })));
      toast({ title: `✅ ${result.count} códigos QR generados` });
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    }
  }, [qrItems, qrAction, qrMutation, toast]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pendingLogs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingLogs.map((l) => l.id)));
    }
  };

  /* ── Render ────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bodega WhatsApp</h1>
          <p className="text-muted-foreground">
            Gestión de inventario vía escaneo QR/código de barras por WhatsApp
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowQRDialog(true)}>
          <QrCode className="w-4 h-4 mr-2" />
          Generar QR
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="w-5 h-5 mx-auto mb-1 text-amber-400" />
            <div className="text-2xl font-bold">{summary?.pending_reviews ?? 0}</div>
            <div className="text-xs text-muted-foreground">Pendientes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-green-400" />
            <div className="text-2xl font-bold">{summary?.approved_today ?? 0}</div>
            <div className="text-xs text-muted-foreground">Aprobados Hoy</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <XCircle className="w-5 h-5 mx-auto mb-1 text-red-400" />
            <div className="text-2xl font-bold">{summary?.rejected_today ?? 0}</div>
            <div className="text-xs text-muted-foreground">Rechazados</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ArrowDownToLine className="w-5 h-5 mx-auto mb-1 text-emerald-400" />
            <div className="text-2xl font-bold">{summary?.receives_today ?? 0}</div>
            <div className="text-xs text-muted-foreground">Recepciones</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ArrowUpFromLine className="w-5 h-5 mx-auto mb-1 text-blue-400" />
            <div className="text-2xl font-bold">{summary?.consumptions_today ?? 0}</div>
            <div className="text-xs text-muted-foreground">Consumos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <RotateCcw className="w-5 h-5 mx-auto mb-1 text-amber-400" />
            <div className="text-2xl font-bold">{summary?.returns_today ?? 0}</div>
            <div className="text-xs text-muted-foreground">Devoluciones</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Activity className="w-5 h-5 mx-auto mb-1 text-purple-400" />
            <div className="text-2xl font-bold">{summary?.total_today ?? 0}</div>
            <div className="text-xs text-muted-foreground">Total Hoy</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pendientes ({summary?.pending_reviews ?? 0})
          </TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
          <TabsTrigger value="qr">Códigos QR</TabsTrigger>
        </TabsList>

        {/* Pending Reviews Tab */}
        <TabsContent value="pending" className="space-y-4">
          {/* Batch actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">{selectedIds.size} seleccionados</span>
              <Button size="sm" variant="default" onClick={() => handleBatch('approved')} disabled={batchMutation.isPending}>
                <ThumbsUp className="w-3 h-3 mr-1" /> Aprobar
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleBatch('rejected')} disabled={batchMutation.isPending}>
                <ThumbsDown className="w-3 h-3 mr-1" /> Rechazar
              </Button>
            </div>
          )}

          {pendingLogs.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No hay movimientos pendientes de revisión</p>
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedIds.size === pendingLogs.length && pendingLogs.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>OT</TableHead>
                    <TableHead>Operador</TableHead>
                    <TableHead>Escaneado</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(log.id)}
                          onCheckedChange={() => toggleSelect(log.id)}
                        />
                      </TableCell>
                      <TableCell><ActionBadge action={log.action_type} /></TableCell>
                      <TableCell>
                        <div className="font-medium">{log.item_name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{log.item_sku ?? ''}</div>
                      </TableCell>
                      <TableCell>
                        {log.quantity != null ? `${log.quantity} ${log.unit ?? ''}` : '—'}
                      </TableCell>
                      <TableCell>{log.ot_number ?? '—'}</TableCell>
                      <TableCell>
                        <div className="text-sm">{log.operator_name ?? log.operator_phone}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {log.parsed_data?.scan_type === 'qr' ? 'QR' :
                           log.parsed_data?.scan_type === 'barcode' ? 'Barcode' : 'Manual'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(log.message_timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setReviewLog(log); setReviewComments(''); setCorrectedQty(String(log.quantity ?? '')); setCorrectedCost(String(log.unit_cost ?? '')); }}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={historyFilter} onValueChange={(v) => { setHistoryFilter(v); setHistoryPage(0); }}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="approved">Aprobados</SelectItem>
                <SelectItem value="rejected">Rechazados</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="needs_revision">En Revisión</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1 ml-auto">
              <Button size="sm" variant="outline" disabled={historyPage === 0} onClick={() => setHistoryPage((p) => p - 1)}>
                ← Anterior
              </Button>
              <span className="text-sm text-muted-foreground px-2">Pág {historyPage + 1}</span>
              <Button size="sm" variant="outline" disabled={historyLogs.length < 20} onClick={() => setHistoryPage((p) => p + 1)}>
                Siguiente →
              </Button>
            </div>
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Acción</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>OT</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell><ActionBadge action={log.action_type} /></TableCell>
                    <TableCell><StatusBadge status={log.review_status} /></TableCell>
                    <TableCell>
                      <div className="font-medium">{log.item_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{log.item_sku ?? ''}</div>
                    </TableCell>
                    <TableCell>
                      {log.corrected_quantity != null ? (
                        <span className="text-amber-400">{log.corrected_quantity} {log.unit ?? ''} (corregido)</span>
                      ) : log.quantity != null ? (
                        `${log.quantity} ${log.unit ?? ''}`
                      ) : '—'}
                    </TableCell>
                    <TableCell>{log.ot_number ?? '—'}</TableCell>
                    <TableCell className="text-sm">{log.operator_name ?? log.operator_phone}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleDateString('es-CL')}
                    </TableCell>
                  </TableRow>
                ))}
                {historyLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Sin registros
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* QR Codes Tab */}
        <TabsContent value="qr" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5" />
                Generar Códigos QR para Bodega
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Selecciona productos del inventario para generar códigos QR imprimibles.
                Los operadores de bodega los escanean con su teléfono y envían por WhatsApp
                para registrar recepciones, consumos y devoluciones.
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Productos</label>
                  <Select
                    value=""
                    onValueChange={(v) => {
                      if (v && !qrItems.includes(v)) setQrItems([...qrItems, v]);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Agregar producto..." />
                    </SelectTrigger>
                    <SelectContent>
                      {inventoryItems
                        .filter((item: { is_active: boolean }) => item.is_active)
                        .map((item: { id: string; sku: string; name: string }) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.sku} — {item.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>

                  {qrItems.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {qrItems.map((id) => {
                        const item = inventoryItems.find((i: { id: string }) => i.id === id);
                        return (
                          <Badge key={id} variant="secondary" className="cursor-pointer" onClick={() => setQrItems(qrItems.filter((i) => i !== id))}>
                            {(item as { sku?: string })?.sku ?? id} ✕
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">Acción Preconfigurada (opcional)</label>
                  <Select value={qrAction} onValueChange={setQrAction}>
                    <SelectTrigger>
                      <SelectValue placeholder="Genérico (cualquier acción)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Genérico</SelectItem>
                      <SelectItem value="receive">Recepción</SelectItem>
                      <SelectItem value="use">Consumo</SelectItem>
                      <SelectItem value="return">Devolución</SelectItem>
                      <SelectItem value="check">Consulta Stock</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={handleGenerateQR}
                disabled={qrItems.length === 0 || qrMutation.isPending}
              >
                <QrCode className="w-4 h-4 mr-2" />
                Generar {qrItems.length} Código{qrItems.length !== 1 ? 's' : ''} QR
              </Button>

              {/* Generated QR Results */}
              {qrResults.length > 0 && (
                <div className="mt-4 border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium">Códigos QR Generados</h4>
                  <p className="text-sm text-muted-foreground">
                    Copia estos valores para generar las etiquetas QR con tu impresora de etiquetas.
                    Cada valor se codifica en un QR que el operador escanea con su celular.
                  </p>
                  <div className="grid gap-2">
                    {qrResults.map((qr, i) => (
                      <div key={i} className="flex items-center justify-between bg-muted rounded p-3">
                        <div>
                          <div className="font-mono text-sm">{qr.value}</div>
                          <div className="text-xs text-muted-foreground">{qr.label}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(qr.value);
                            toast({ title: '📋 Copiado al portapapeles' });
                          }}
                        >
                          <Clipboard className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={!!reviewLog} onOpenChange={(open) => { if (!open) setReviewLog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Revisar Movimiento de Bodega</DialogTitle>
            <DialogDescription>
              {reviewLog?.item_name} ({reviewLog?.item_sku})
            </DialogDescription>
          </DialogHeader>

          {reviewLog && (
            <div className="space-y-4">
              {/* Details */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Acción:</span>
                  <div className="mt-1"><ActionBadge action={reviewLog.action_type} /></div>
                </div>
                <div>
                  <span className="text-muted-foreground">Operador:</span>
                  <div className="mt-1 font-medium">{reviewLog.operator_name ?? reviewLog.operator_phone}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Escaneado:</span>
                  <div className="mt-1 font-mono text-xs">{reviewLog.scanned_value || '—'}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">OT:</span>
                  <div className="mt-1">{reviewLog.ot_number ?? '—'}</div>
                </div>
                {reviewLog.supplier_name && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Proveedor:</span>
                    <div className="mt-1 flex items-center gap-1">
                      <Truck className="w-3 h-3" />
                      {reviewLog.supplier_name}
                    </div>
                  </div>
                )}
              </div>

              {/* Raw message */}
              <div>
                <span className="text-sm text-muted-foreground">Mensaje original:</span>
                <div className="mt-1 p-2 bg-muted rounded text-sm font-mono whitespace-pre-wrap">
                  {reviewLog.raw_message}
                </div>
              </div>

              {/* Editable fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Cantidad</label>
                  <Input
                    type="number"
                    value={correctedQty}
                    onChange={(e) => setCorrectedQty(e.target.value)}
                    placeholder="Cantidad"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo Unitario (CLP)</label>
                  <Input
                    type="number"
                    value={correctedCost}
                    onChange={(e) => setCorrectedCost(e.target.value)}
                    placeholder="Costo c/u"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Comentarios</label>
                <Textarea
                  value={reviewComments}
                  onChange={(e) => setReviewComments(e.target.value)}
                  placeholder="Observaciones del supervisor..."
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button variant="destructive" onClick={() => handleReview('rejected')} disabled={reviewMutation.isPending}>
              <ThumbsDown className="w-4 h-4 mr-1" /> Rechazar
            </Button>
            <Button variant="outline" onClick={() => handleReview('needs_revision')} disabled={reviewMutation.isPending}>
              <RotateCcw className="w-4 h-4 mr-1" /> Pedir Corrección
            </Button>
            <Button onClick={() => handleReview('approved')} disabled={reviewMutation.isPending}>
              <ThumbsUp className="w-4 h-4 mr-1" /> Aprobar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Generation Dialog */}
      <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generación Rápida de QR</DialogTitle>
            <DialogDescription>
              Genera códigos QR para pegar en estanterías, cajas o máquinas.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Usa la pestaña &quot;Códigos QR&quot; en el panel principal para seleccionar productos
            y generar códigos QR listos para imprimir.
          </p>
          <DialogFooter>
            <Button onClick={() => setShowQRDialog(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
