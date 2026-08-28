/**
 * @fileoverview Inventory Management Component
 * 
 * SYSTEM ROLE: Material & Supply Inventory Controller
 * 
 * Provides complete inventory management interface:
 * - Display list of all items in inventory table
 * - Add new inventory items with name, quantity, cost per unit
 * - Edit existing items
 * - Delete items from inventory
 * - Real-time updates to Supabase database
 * - Automatic sorting by item name
 * - Toast notifications for user feedback
 * 
 * Data Management:
 * - Reads/writes to 'inventory' table in database
 * - Tracks item_name, quantity, cost_per_unit
 * - Maintains inventory count for procurement decisions
 * 
 * Admin-only component, shown in Admin Dashboard.
 */
'use client';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, AlertTriangle, Calculator, Boxes, ChevronDown, Lock } from 'lucide-react';
import { certStatus } from '@/lib/purchasing';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatCLP } from '@/lib/format';
import {
  useInventoryItems,
  useInventoryLots,
  useInventoryTransactions,
  useInventoryLowStockAlerts,
} from '@/hooks/use-admin-queries';
import { useOTs } from '@/hooks/use-operations-queries';

const CATEGORY_OPTIONS = [
  { value: 'tool', label: 'Herramientas' },
  { value: 'supply', label: 'Insumos' },
  { value: 'product_input', label: 'Materias primas' },
  { value: 'spare_part', label: 'Repuestos' },
];

// `category` distingue durable de consumible; esto distingue papel de tinta
// de envase — la pregunta que category no contesta, porque papel y tinta son
// los dos 'product_input'. Mismo vocabulario que ot_requirements.kind en
// Compras (auditoría 2026-08).
const MATERIAL_KIND_OPTIONS = [
  { value: 'papel', label: 'Papel' },
  { value: 'tinta_especial', label: 'Tinta especial' },
  { value: 'envase', label: 'Envase y embalaje' },
  { value: 'servicio', label: 'Servicio externo' },
  { value: 'insumo', label: 'Insumo' },
  { value: 'herramental', label: 'Herramental' },
  { value: 'otro', label: 'Otro' },
];

// Spanish display labels for stock-alert severity (data values stay English).
const SEVERITY_LABELS: Record<string, string> = {
  critical: 'CRÍTICO',
  high: 'ALTO',
  medium: 'MEDIO',
  low: 'BAJO',
};

const TX_OPTIONS = [
  { value: 'purchase', label: 'Compra (+)' },
  { value: 'consumption', label: 'Consumo (-)' },
  { value: 'adjustment_in', label: 'Ajuste a favor (+)' },
  { value: 'adjustment_out', label: 'Ajuste en contra (-)' },
  { value: 'return_to_stock', label: 'Devolución a bodega (+)' },
];
const TX_TYPE_LABEL: Record<string, string> = Object.fromEntries(TX_OPTIONS.map((o) => [o.value, o.label]));

const getCategoryLabel = (value?: string | null) => {
  const found = CATEGORY_OPTIONS.find((option) => option.value === value);
  return found?.label || value || '-';
};

const getMaterialKindLabel = (value?: string | null) => {
  const found = MATERIAL_KIND_OPTIONS.find((option) => option.value === value);
  return found?.label || (value ? value : 'Sin clasificar');
};

/**
 * Tres estados, no uno. "Nunca recibido" y "agotado" se ven idénticos en el
 * número (0) pero significan cosas distintas — el primero es estructural
 * (nadie lo ha comprado todavía), el segundo es un evento real (se tenía y se
 * acabó). Tratarlos igual es cómo 29 de 37 ítems terminan con la misma
 * alarma roja y la alarma deja de servir (auditoría 2026-08).
 */
function stockState(current: number, min: number, everReceived: boolean) {
  if (current <= 0) {
    return everReceived
      ? { key: 'agotado' as const, label: 'Agotado', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' }
      : { key: 'nunca' as const, label: 'Nunca recibido', dot: 'bg-slate-400', text: 'text-muted-foreground' };
  }
  if (current < min) {
    return { key: 'bajo' as const, label: 'Bajo mínimo', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' };
  }
  return { key: 'ok' as const, label: 'Disponible', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' };
}

const InventoryManagement = () => {
  const { t } = useLanguage();
  const { data: items = [], refetch: refetchItems } = useInventoryItems();
  const { data: lots = [], refetch: refetchLots, isLoading: lotsLoading, isError: lotsError } = useInventoryLots();
  const { data: transactions = [], refetch: refetchTransactions } = useInventoryTransactions();
  const { data: alerts = [] } = useInventoryLowStockAlerts();
  const { data: ots = [] } = useOTs();

  const [showItemDialog, setShowItemDialog] = useState(false);
  const [showLotDialog, setShowLotDialog] = useState(false);
  const [showTxDialog, setShowTxDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [scanSearch, setScanSearch] = useState('');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [neverOpen, setNeverOpen] = useState(false);

  const [itemForm, setItemForm] = useState({
    sku: '',
    barcode_value: '',
    qr_value: '',
    name: '',
    category: 'tool',
    material_kind: '' as string,
    unit: 'unit',
    min_stock: 0,
    estimated_unit_cost: 0,
    is_certification_required: false,
    is_active: true,
    notes: '',
  });

  const [lotForm, setLotForm] = useState({
    item_id: '',
    lot_number: '',
    certification_code: '',
    certification_expires_on: '',
    supplier_name: '',
    received_date: '',
    unit_cost: 0,
    quantity_received: 0,
    quantity_available: 0,
  });

  const [txForm, setTxForm] = useState({
    item_id: '',
    lot_id: '',
    tx_type: 'consumption',
    quantity: 0,
    unit_cost: 0,
    work_order_id: '',
    reference_code: '',
    notes: '',
  });

  const [calculator, setCalculator] = useState({
    item_id: '',
    quantity: 0,
  });

  const filteredItems = useMemo(() => {
    const byCategory = categoryFilter === 'all'
      ? items
      : items.filter((item: any) => item.category === categoryFilter);

    const query = scanSearch.trim().toLowerCase();
    if (!query) return byCategory;

    return byCategory.filter((item: any) => {
      const sku = String(item.sku || '').toLowerCase();
      const name = String(item.name || '').toLowerCase();
      const barcode = String(item.barcode_value || '').toLowerCase();
      const qr = String(item.qr_value || '').toLowerCase();
      return sku.includes(query) || name.includes(query) || barcode.includes(query) || qr.includes(query);
    });
  }, [items, categoryFilter, scanSearch]);

  // Un ítem en 0 puede ser dos cosas muy distintas: nunca entró un lote suyo a
  // bodega (estructural — se resuelve con la primera OC), o entró y ya se
  // consumió del todo (evento real, alguien lo tenía y ahora no). El view de
  // severidad no distingue los dos casos —ambos son "critical"— porque no ve
  // el HISTORIAL de lotes, sólo la suma disponible. Acá sí se tiene la lista
  // completa de lotes en la misma pantalla, así que se cruza sin pedirle nada
  // nuevo a la base (auditoría 2026-08).
  const everReceivedIds = useMemo(
    () => new Set(lots.map((l: any) => l.item_id).filter(Boolean)),
    [lots],
  );

  // La misma alarma para "nunca se ha comprado" y "se agotó" es la que hace
  // que 29 de 37 ítems se vean igual de urgentes. Acá se separan en dos
  // grupos antes de mostrarlos: uno necesita una OC hoy, el otro es un hueco
  // del catálogo que puede esperar a la primera compra.
  const { needsAction, neverReceived } = useMemo(() => {
    const needsAction: any[] = [];
    const neverReceived: any[] = [];
    for (const a of alerts) {
      if (Number(a.current_stock) <= 0 && !everReceivedIds.has(a.id)) neverReceived.push(a);
      else needsAction.push(a);
    }
    return { needsAction, neverReceived };
  }, [alerts, everReceivedIds]);

  const totalStockValue = useMemo(() => {
    return items.reduce((sum: number, item: any) => {
      const stock = Number(item.current_stock || 0);
      const cost = Number(item.weighted_unit_cost || item.estimated_unit_cost || 0);
      return sum + stock * cost;
    }, 0);
  }, [items]);

  const estimatedSelection = useMemo(() => {
    const selected = items.find((item: any) => item.id === calculator.item_id);
    if (!selected) return null;
    const unitCost = Number(selected.weighted_unit_cost || selected.estimated_unit_cost || 0);
    const quantity = Number(calculator.quantity || 0);
    return {
      name: selected.name,
      unit: selected.unit,
      unitCost,
      quantity,
      total: unitCost * quantity,
      stock: Number(selected.current_stock || 0),
    };
  }, [calculator, items]);

  const filteredLots = useMemo(() => {
    if (!txForm.item_id) return lots;
    return lots.filter((lot: any) => lot.item_id === txForm.item_id);
  }, [lots, txForm.item_id]);

  const refetchAllInventoryData = () => {
    refetchItems();
    refetchLots();
    refetchTransactions();
  };

  const resetItemForm = () => {
    setItemForm({
      sku: '',
      barcode_value: '',
      qr_value: '',
      name: '',
      category: 'tool',
      material_kind: '',
      unit: 'unit',
      min_stock: 0,
      estimated_unit_cost: 0,
      is_certification_required: false,
      is_active: true,
      notes: '',
    });
    setEditingItem(null);
    setShowItemDialog(false);
  };

  const resetLotForm = () => {
    setLotForm({
      item_id: '',
      lot_number: '',
      certification_code: '',
      certification_expires_on: '',
      supplier_name: '',
      received_date: '',
      unit_cost: 0,
      quantity_received: 0,
      quantity_available: 0,
    });
    setShowLotDialog(false);
  };

  const resetTxForm = () => {
    setTxForm({
      item_id: '',
      lot_id: '',
      tx_type: 'consumption',
      quantity: 0,
      unit_cost: 0,
      work_order_id: '',
      reference_code: '',
      notes: '',
    });
    setShowTxDialog(false);
  };

  const handleSaveItem = async () => {
    if (!itemForm.sku.trim() || !itemForm.name.trim()) {
      toast.error('Indica el SKU y el nombre');
      return;
    }

    const payload = {
      ...itemForm,
      sku: itemForm.sku.trim(),
      barcode_value: itemForm.barcode_value.trim() || null,
      qr_value: itemForm.qr_value.trim() || null,
      name: itemForm.name.trim(),
      material_kind: itemForm.material_kind || null,
    };

    const res = editingItem
      ? await fetch(`/api/inventory/items?id=${encodeURIComponent(editingItem.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })
      : await fetch('/api/inventory/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error || (editingItem ? 'No se pudo actualizar el ítem' : 'No se pudo crear el ítem'));
      return;
    }

    toast.success(editingItem ? 'Ítem actualizado' : 'Ítem creado');
    refetchAllInventoryData();
    resetItemForm();
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm(t('confirmDelete'))) return;

    const res = await fetch(`/api/inventory/items?id=${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error || 'No se pudo eliminar el ítem');
      return;
    }

    toast.success('Ítem eliminado');
    refetchAllInventoryData();
  };

  const handleCreateLot = async () => {
    if (!lotForm.item_id || !lotForm.lot_number.trim()) {
      toast.error('Indica el ítem y el número de lote');
      return;
    }

    // quantity_available is deliberately not sent: the stock ledger is its only
    // writer (see /api/inventory/lots), so the lot opens at 0 and its opening
    // balance is credited by a real purchase transaction.
    const res = await fetch('/api/inventory/lots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        item_id: lotForm.item_id,
        lot_number: lotForm.lot_number.trim(),
        quantity_received: Number(lotForm.quantity_received) || 0,
        unit_cost: Number(lotForm.unit_cost) || 0,
        received_date: lotForm.received_date || new Date().toISOString().split('T')[0],
        supplier_name: lotForm.supplier_name || null,
        certification_code: lotForm.certification_code || null,
        certification_expires_on: lotForm.certification_expires_on || null,
      }),
    });

    const created = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(created?.error || 'No se pudo crear el lote');
      return;
    }

    if (Array.isArray(created?.warnings) && created.warnings.length > 0) {
      toast.warning(created.warnings.join(' · '));
    } else {
      toast.success('Lote creado');
    }
    refetchAllInventoryData();
    resetLotForm();
  };

  const openEditDialog = (item: any) => {
    setEditingItem(item);
    setItemForm({
      sku: item.sku,
      barcode_value: item.barcode_value || '',
      qr_value: item.qr_value || '',
      name: item.name,
      category: item.category,
      material_kind: item.material_kind || '',
      unit: item.unit,
      min_stock: Number(item.min_stock || 0),
      estimated_unit_cost: Number(item.estimated_unit_cost || 0),
      is_certification_required: Boolean(item.is_certification_required),
      is_active: Boolean(item.is_active),
      notes: item.notes || '',
    });
    setShowItemDialog(true);
  };

  const handleCreateTransaction = async () => {
    if (!txForm.item_id || !txForm.lot_id || Number(txForm.quantity) <= 0) {
      toast.error('Indica ítem, lote y una cantidad mayor a cero');
      return;
    }

    if (txForm.tx_type === 'consumption' && !txForm.work_order_id) {
      toast.error('Indica la OT que consume este material');
      return;
    }

    const payload = {
      item_id: txForm.item_id,
      lot_id: txForm.lot_id,
      tx_type: txForm.tx_type,
      quantity: Number(txForm.quantity),
      unit_cost: Number(txForm.unit_cost) > 0 ? Number(txForm.unit_cost) : null,
      work_order_id: txForm.work_order_id || null,
      reference_code: txForm.reference_code || null,
      notes: txForm.notes || null,
    };

    const res = await fetch('/api/inventory/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error || 'No se pudo registrar el movimiento');
      return;
    }

    toast.success('Movimiento de stock registrado');
    refetchAllInventoryData();
    resetTxForm();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard icon={Boxes} label="Total de SKUs" value={String(items.length)} tone="primary" />
        <KpiCard label="Valor estimado de stock" value={formatCLP(totalStockValue)} tone="primary" />
        <KpiCard
          icon={AlertTriangle}
          label="Necesita una OC"
          value={String(needsAction.length)}
          tone={needsAction.length > 0 ? 'critical' : 'primary'}
          hint={neverReceived.length > 0 ? `+ ${neverReceived.length} nunca recibidos (no es urgente, es un hueco del catálogo)` : undefined}
        />
      </div>

      {needsAction.length > 0 && (
        <Collapsible open={alertsOpen} onOpenChange={setAlertsOpen} className="ml-auto w-full sm:max-w-sm">
          <div className="rounded-md border border-destructive/40 bg-destructive/5">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {needsAction.length} {needsAction.length === 1 ? 'ítem necesita' : 'ítems necesitan'} una OC
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${alertsOpen ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="max-h-72 space-y-1.5 overflow-y-auto px-3 pb-3">
                {needsAction.map((alert: any) => (
                  <div key={alert.id} className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-background/60 px-2 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{alert.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {getCategoryLabel(alert.category)} • {Number(alert.current_stock).toFixed(0)}/{Number(alert.min_stock).toFixed(0)} {alert.unit ?? ''}
                      </p>
                    </div>
                    <Badge variant="destructive" className="shrink-0 text-[10px]">{SEVERITY_LABELS[String(alert.severity || 'medium')] ?? String(alert.severity || 'medium').toUpperCase()}</Badge>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {neverReceived.length > 0 && (
        <Collapsible open={neverOpen} onOpenChange={setNeverOpen} className="ml-auto w-full sm:max-w-sm">
          <div className="rounded-md border border-border bg-muted/30">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50">
              <span>{neverReceived.length} nunca recibidos</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${neverOpen ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="max-h-72 space-y-1.5 overflow-y-auto px-3 pb-3">
                {neverReceived.map((alert: any) => (
                  <div key={alert.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/60 px-2 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{alert.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{getCategoryLabel(alert.category)} • sin lotes registrados todavía</p>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-primary">Módulo de inventario</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="items" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="items">Ítems</TabsTrigger>
              <TabsTrigger value="lots">Lotes</TabsTrigger>
              <TabsTrigger value="transactions">Movimientos de stock</TabsTrigger>
              <TabsTrigger value="calculator">Estimador de costos</TabsTrigger>
            </TabsList>

            <TabsContent value="items" className="space-y-4">
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <div className="flex flex-wrap gap-2 items-center">
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Filtrar por categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las categorías</SelectItem>
                      {CATEGORY_OPTIONS.map((category) => (
                        <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={scanSearch}
                    onChange={(e) => setScanSearch(e.target.value)}
                    className="w-80"
                    placeholder="Escanee/Busque SKU, código de barras o QR"
                  />
                </div>

                <Button onClick={() => setShowItemDialog(true)} className="bg-primary hover:bg-primary/90">
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar ítem
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Código de barras</TableHead>
                    <TableHead>QR</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Familia</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Stock mínimo</TableHead>
                    <TableHead>Costo promedio</TableHead>
                    <TableHead>{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item: any) => {
                    const st = stockState(Number(item.current_stock || 0), Number(item.min_stock || 0), everReceivedIds.has(item.id));
                    return (
                    <TableRow key={item.id}>
                      <TableCell>{item.sku}</TableCell>
                      <TableCell>{item.barcode_value || '-'}</TableCell>
                      <TableCell>{item.qr_value || '-'}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{getCategoryLabel(item.category)}</TableCell>
                      <TableCell>{getMaterialKindLabel(item.material_kind)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} title={st.label} />
                          <span className={st.key === 'ok' ? '' : `${st.text} font-medium`}>
                            {Number(item.current_stock || 0).toFixed(3)} {item.unit}
                          </span>
                        </div>
                        {st.key !== 'ok' && <span className={`text-[11px] ${st.text}`}>{st.label}</span>}
                      </TableCell>
                      <TableCell>{Number(item.min_stock || 0).toFixed(3)} {item.unit}</TableCell>
                      <TableCell>{formatCLP(Number(item.weighted_unit_cost || item.estimated_unit_cost || 0))}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="icon" onClick={() => openEditDialog(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => handleDeleteItem(item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="lots" className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setShowLotDialog(true)} className="bg-primary hover:bg-primary/90">
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar lote
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ítem</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead>Certificado</TableHead>
                    <TableHead>Vence</TableHead>
                    {/* Recibido y disponible por separado — un lote a medio
                        consumir se veía tan lleno como uno intacto cuando sólo
                        se mostraba quantity_available (auditoría 2026-08). */}
                    <TableHead className="text-right">Recibido</TableHead>
                    <TableHead className="text-right">Disponible</TableHead>
                    <TableHead className="text-right">Costo unitario</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lotsLoading && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Cargando lotes…</TableCell></TableRow>
                  )}
                  {lotsError && (
                    <TableRow><TableCell colSpan={6} className="text-center text-red-600 py-8">
                      No se pudieron cargar los lotes. <button className="underline" onClick={() => refetchLots()}>Reintentar</button>
                    </TableCell></TableRow>
                  )}
                  {!lotsLoading && !lotsError && lots.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin lotes todavía.</TableCell></TableRow>
                  )}
                  {lots.map((lot: any) => {
                    const estado = certStatus(lot.certification_expires_on);
                    const bloqueado = !!lot.blocked_reason;
                    const disponible = Number(lot.libre ?? lot.quantity_available ?? 0);
                    return (
                      <TableRow key={lot.id} className={bloqueado ? 'bg-red-500/5' : undefined}>
                        <TableCell>{lot.inventory_items?.name || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">
                          <div className="flex items-center gap-1.5">
                            {lot.lot_number}
                            {bloqueado && (
                              <span title={lot.blocked_reason} className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-600 dark:text-red-400">
                                <Lock className="h-3 w-3" /> retenido
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{lot.certification_code || '-'}</TableCell>
                        <TableCell>
                          {lot.certification_expires_on ? (
                            <span className={estado === 'vencido' ? 'text-red-600 dark:text-red-400 font-medium' : estado === 'por_vencer' ? 'text-amber-600 dark:text-amber-400' : ''}>
                              {lot.certification_expires_on}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{Number(lot.quantity_received || 0).toFixed(3)}</TableCell>
                        <TableCell className={`text-right tabular-nums font-medium ${disponible <= 0 ? 'text-muted-foreground' : ''}`}>{disponible.toFixed(3)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCLP(Number(lot.unit_cost || 0))}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="transactions" className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setShowTxDialog(true)} className="bg-primary hover:bg-primary/90">
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar movimiento
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Ítem</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Orden de trabajo</TableHead>
                    <TableHead className="text-right">Costo estimado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell>{new Date(tx.created_at).toLocaleString('es-CL')}</TableCell>
                      <TableCell>{TX_TYPE_LABEL[tx.tx_type] ?? tx.tx_type}</TableCell>
                      <TableCell>{tx.item_name}</TableCell>
                      <TableCell>{tx.lot_number || '-'}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(tx.quantity).toFixed(3)} {tx.unit}</TableCell>
                      <TableCell>{tx.ot_number ? `${tx.ot_number} (${tx.client_name || 'Sin cliente'})` : '-'}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCLP(Number(tx.estimated_total_cost || 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="calculator" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calculator className="h-4 w-4" />
                    Calculadora de costo estimado
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Artículo de inventario</Label>
                      <Select
                        value={calculator.item_id}
                        onValueChange={(value) => setCalculator((prev) => ({ ...prev, item_id: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar artículo" />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((item: any) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.sku} - {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Cantidad</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.001"
                        value={calculator.quantity}
                        onChange={(e) => setCalculator((prev) => ({ ...prev, quantity: Number(e.target.value) }))}
                      />
                    </div>
                  </div>

                  {estimatedSelection && (
                    <div className="rounded-md border p-3 bg-muted/30 text-sm">
                      <p><strong>Item:</strong> {estimatedSelection.name}</p>
                      <p><strong>Available stock:</strong> {estimatedSelection.stock.toFixed(3)} {estimatedSelection.unit}</p>
                      <p><strong>Estimated unit cost:</strong> {formatCLP(estimatedSelection.unitCost)}</p>
                      <p className="text-base font-semibold mt-2">
                        Estimated total: {formatCLP(estimatedSelection.total)}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Editar ítem de inventario' : 'Crear ítem de inventario'}</DialogTitle>
            <DialogDescription>
              Herramientas, insumos, materias primas y repuestos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Barcode</Label>
                <Input value={itemForm.barcode_value} onChange={(e) => setItemForm({ ...itemForm, barcode_value: e.target.value })} placeholder="Valor del código de barras" />
              </div>
              <div className="space-y-2">
                <Label>QR Code</Label>
                <Input value={itemForm.qr_value} onChange={(e) => setItemForm({ ...itemForm, qr_value: e.target.value })} placeholder="Valor del QR" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select value={itemForm.category} onValueChange={(value) => setItemForm({ ...itemForm, category: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((category) => (
                      <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                {/* Distinto de Categoría: ahí es durable-vs-consumible, acá es
                    papel-vs-tinta-vs-envase — la pregunta que decide, por
                    ejemplo, si un lote de este ítem puede salir de bodega en
                    la etapa que sólo saca papel (auditoría 2026-08). */}
                <Label>Familia de material</Label>
                <Select
                  value={itemForm.material_kind || '__sin_clasificar__'}
                  onValueChange={(value) =>
                    setItemForm({ ...itemForm, material_kind: value === '__sin_clasificar__' ? '' : value })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__sin_clasificar__">Sin clasificar</SelectItem>
                    {MATERIAL_KIND_OPTIONS.map((kind) => (
                      <SelectItem key={kind.value} value={kind.value}>{kind.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unidad</Label>
                <Input value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Stock mínimo</Label>
                <Input type="number" step="0.001" value={itemForm.min_stock} onChange={(e) => setItemForm({ ...itemForm, min_stock: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Costo unitario estimado</Label>
                <Input type="number" step="0.0001" value={itemForm.estimated_unit_cost} onChange={(e) => setItemForm({ ...itemForm, estimated_unit_cost: Number(e.target.value) })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetItemForm}>{t('cancel')}</Button>
            <Button onClick={handleSaveItem}>{editingItem ? t('update') : t('create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLotDialog} onOpenChange={setShowLotDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear lote</DialogTitle>
            <DialogDescription>
              Register batch/lot data for certification traceability and costing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Ítem</Label>
              <Select value={lotForm.item_id} onValueChange={(value) => setLotForm({ ...lotForm, item_id: value })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar artículo" /></SelectTrigger>
                <SelectContent>
                  {items.map((item: any) => (
                    <SelectItem key={item.id} value={item.id}>{item.sku} - {item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Número de lote</Label>
                <Input value={lotForm.lot_number} onChange={(e) => setLotForm({ ...lotForm, lot_number: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Input value={lotForm.supplier_name} onChange={(e) => setLotForm({ ...lotForm, supplier_name: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Certification Code</Label>
                <Input value={lotForm.certification_code} onChange={(e) => setLotForm({ ...lotForm, certification_code: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Certification Expiry</Label>
                <Input type="date" value={lotForm.certification_expires_on} onChange={(e) => setLotForm({ ...lotForm, certification_expires_on: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Received Qty</Label>
                <Input type="number" step="0.001" value={lotForm.quantity_received} onChange={(e) => setLotForm({ ...lotForm, quantity_received: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Available Qty</Label>
                <Input type="number" step="0.001" value={lotForm.quantity_available} onChange={(e) => setLotForm({ ...lotForm, quantity_available: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Costo unitario</Label>
                <Input type="number" step="0.0001" value={lotForm.unit_cost} onChange={(e) => setLotForm({ ...lotForm, unit_cost: Number(e.target.value) })} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetLotForm}>{t('cancel')}</Button>
            <Button onClick={handleCreateLot}>Crear lote</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTxDialog} onOpenChange={setShowTxDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear movimiento de stock</DialogTitle>
            <DialogDescription>
              Track stock movements and link consumption to work orders.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Ítem</Label>
                <Select
                  value={txForm.item_id}
                  onValueChange={(value) => setTxForm({ ...txForm, item_id: value, lot_id: '' })}
                >
                  <SelectTrigger><SelectValue placeholder="Seleccionar artículo" /></SelectTrigger>
                  <SelectContent>
                    {items.map((item: any) => (
                      <SelectItem key={item.id} value={item.id}>{item.sku} - {item.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo de movimiento</Label>
                <Select value={txForm.tx_type} onValueChange={(value) => setTxForm({ ...txForm, tx_type: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TX_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Lote</Label>
                <Select value={txForm.lot_id} onValueChange={(value) => setTxForm({ ...txForm, lot_id: value })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar lote" /></SelectTrigger>
                  <SelectContent>
                    {filteredLots.map((lot: any) => (
                      <SelectItem key={lot.id} value={lot.id}>
                        {lot.lot_number} (avail {Number(lot.quantity_available || 0).toFixed(3)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cantidad</Label>
                <Input type="number" step="0.001" value={txForm.quantity} onChange={(e) => setTxForm({ ...txForm, quantity: Number(e.target.value) })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Costo unitario (opcional)</Label>
                <Input type="number" step="0.0001" value={txForm.unit_cost} onChange={(e) => setTxForm({ ...txForm, unit_cost: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Orden de trabajo (requerida para consumo)</Label>
                <Select value={txForm.work_order_id} onValueChange={(value) => setTxForm({ ...txForm, work_order_id: value })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar OT" /></SelectTrigger>
                  <SelectContent>
                    {ots.map((ot: any) => (
                      <SelectItem key={ot.id} value={ot.id}>{ot.ot_number} - {ot.client_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reference code</Label>
              <Input value={txForm.reference_code} onChange={(e) => setTxForm({ ...txForm, reference_code: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetTxForm}>{t('cancel')}</Button>
            <Button onClick={handleCreateTransaction}>Crear movimiento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryManagement;
