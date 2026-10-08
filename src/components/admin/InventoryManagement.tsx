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
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { formatCLP } from '@/lib/format';
import {
  useInventoryItems,
  useInventoryLots,
  useInventoryTransactions,
} from '@/hooks/use-admin-queries';
import { useOTs } from '@/hooks/use-operations-queries';
import { useMovementTypes } from '@/hooks/use-movement-types';
import { useAuth } from '@/contexts/AuthContext';
import { MovementTypesManager } from './MovementTypesManager';
import {
  VALID_TABS, InventoryTab, FALLBACK_TX_OPTIONS, FALLBACK_TX_TYPE_LABEL, MATERIAL_KIND_OPTIONS, familyStyle,
} from './inventory/constants';
import { ItemsTab } from './inventory/ItemsTab';
import { LotsTab } from './inventory/LotsTab';
import { TransactionsTab } from './inventory/TransactionsTab';
import { CalculatorTab } from './inventory/CalculatorTab';
import { ImportDialog } from './inventory/ImportDialog';
import { ItemDialog, type ItemFormState } from './inventory/ItemDialog';
import { LotDialog, type LotFormState } from './inventory/LotDialog';
import { TxDialog, type TxFormState } from './inventory/TxDialog';

const InventoryManagement = () => {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: items = [], refetch: refetchItems } = useInventoryItems();
  const { data: lots = [], refetch: refetchLots, isLoading: lotsLoading, isError: lotsError } = useInventoryLots();
  const { data: transactions = [], refetch: refetchTransactions } = useInventoryTransactions();
  const { data: ots = [] } = useOTs();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const { data: movementTypes = [] } = useMovementTypes();
  const txOptions = movementTypes.length > 0
    ? movementTypes.filter((t) => t.active).map((t) => ({ value: t.code, label: t.label }))
    : FALLBACK_TX_OPTIONS;
  const txTypeLabel = movementTypes.length > 0
    ? Object.fromEntries(movementTypes.map((t) => [t.code, t.label]))
    : FALLBACK_TX_TYPE_LABEL;

  // `?tab=` como fuente de verdad — así /operaciones/lotes puede redirigir
  // acá con la pestaña Lotes ya abierta, en vez de dejar al usuario en
  // Ítems y obligarlo a hacer un clic más (mismo patrón que Compras).
  const requestedTab = searchParams.get('tab');
  const activeTab: InventoryTab = (VALID_TABS as readonly string[]).includes(requestedTab ?? '')
    ? (requestedTab as InventoryTab)
    : 'items';
  const setActiveTab = (value: string) => {
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    sp.set('tab', value);
    router.replace(`/operaciones/inventario?${sp.toString()}`, { scroll: false });
  };
  // Fijo al montar: una ventana de "últimos 30 días" no necesita
  // recalcularse en cada render, y leer Date.now() dentro de un useMemo es
  // impuro para el compilador de React — el inicializador perezoso de
  // useState corre una sola vez, así que es el lugar correcto para leerlo.
  const [now] = useState(() => Date.now());

  const [showItemDialog, setShowItemDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showLotDialog, setShowLotDialog] = useState(false);
  const [showTxDialog, setShowTxDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const [itemForm, setItemForm] = useState<ItemFormState>({
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

  const [lotForm, setLotForm] = useState<LotFormState>({
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

  const [txForm, setTxForm] = useState<TxFormState>({
    item_id: '',
    lot_id: '',
    tx_type: 'consumption',
    quantity: 0,
    unit_cost: 0,
    work_order_id: '',
    reference_code: '',
    notes: '',
  });

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

  // Cobertura estimada: cuántos días dura el stock actual al ritmo real de
  // consumo — el reorder point de la industria (lead time × consumo diario)
  // en vez de un mínimo fijo que no sabe si el papel se mueve rápido o
  // lleva meses quieto. Se calcula sobre el consumo real de los últimos 30
  // días; sin consumo reciente, no se muestra número — mejor nada que una
  // cifra inventada (auditoría 2026-08, principio de reorder point de la
  // industria de impresión: consumo real + lead time, no un umbral estático).
  const dailyConsumptionByItem = useMemo(() => {
    const WINDOW_DAYS = 30;
    const cutoff = now - WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const totals = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.tx_type !== 'consumption') continue;
      const ts = new Date(tx.created_at).getTime();
      if (Number.isNaN(ts) || ts < cutoff) continue;
      totals.set(tx.item_id, (totals.get(tx.item_id) || 0) + Number(tx.quantity || 0));
    }
    const rates = new Map<string, number>();
    for (const [itemId, total] of totals) rates.set(itemId, total / WINDOW_DAYS);
    return rates;
  }, [transactions, now]);

  // Conteo de ítems por familia, sin filtrar — el panel lateral es un
  // resumen persistente del catálogo completo, no de lo que está visible
  // bajo el filtro/búsqueda activos en la pestaña Ítems.
  const familyBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = item.material_kind || 'otro';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return MATERIAL_KIND_OPTIONS
      .map((k) => ({ key: k.value, label: k.label, count: counts.get(k.value) || 0 }))
      .filter((f) => f.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [items]);

  const totalStockValue = useMemo(() => {
    return items.reduce((sum: number, item: any) => {
      const stock = Number(item.current_stock || 0);
      const cost = Number(item.weighted_unit_cost || item.estimated_unit_cost || 0);
      return sum + stock * cost;
    }, 0);
  }, [items]);

  // Rotación de inventario y DIO (Days Inventory Outstanding) — los dos KPI
  // que cualquier framework de control de inventario "elite" (APICS SCOR,
  // la jerarquía de Gartner) pone primero. Se aproxima con el valor de
  // stock ACTUAL como base (no hay snapshots históricos de valor para
  // promediar) — es una aproximación estándar cuando no existe ese
  // histórico, no un número inventado.
  const turnoverMetrics = useMemo(() => {
    const WINDOW_DAYS = 30;
    const cutoff = now - WINDOW_DAYS * 24 * 60 * 60 * 1000;
    let consumptionValue = 0;
    for (const tx of transactions) {
      if (tx.tx_type !== 'consumption') continue;
      const ts = new Date(tx.created_at).getTime();
      if (Number.isNaN(ts) || ts < cutoff) continue;
      consumptionValue += Number(tx.estimated_total_cost || 0);
    }
    const dailyValue = consumptionValue / WINDOW_DAYS;
    const annualTurnover = totalStockValue > 0 && dailyValue > 0 ? (dailyValue * 365) / totalStockValue : null;
    const dio = dailyValue > 0 ? totalStockValue / dailyValue : null;
    return { consumptionValue, annualTurnover, dio };
  }, [transactions, now, totalStockValue]);

  // Lead time real: días entre orden (purchase_date) y recepción
  // (received_date) de cada lote con una OC vinculada — no un supuesto, el
  // promedio de lo que de verdad ha tardado en llegar.
  const avgLeadTime = useMemo(() => {
    const diffs: number[] = [];
    for (const lot of lots) {
      const purchaseDate = lot.purchases?.purchase_date;
      if (!purchaseDate || !lot.received_date) continue;
      const d = (new Date(lot.received_date).getTime() - new Date(purchaseDate).getTime()) / (24 * 60 * 60 * 1000);
      if (d >= 0 && d < 120) diffs.push(d);
    }
    if (!diffs.length) return null;
    return { days: diffs.reduce((a, b) => a + b, 0) / diffs.length, sampleSize: diffs.length };
  }, [lots]);

  // Punto de reorden real = lead time real × consumo real diario — el
  // reemplazo "elite" de un mínimo fijo puesto a ojo. Sólo se calcula para
  // ítems con consumo reciente registrado; sin eso no hay una tasa real que
  // multiplicar (mejor no mostrar el ítem que inventarle un punto de
  // reorden).
  const belowRealReorderPoint = useMemo(() => {
    if (!avgLeadTime) return [];
    return items.filter((item: any) => {
      const rate = dailyConsumptionByItem.get(item.id);
      if (!rate || rate <= 0) return false;
      const reorderPoint = avgLeadTime.days * rate;
      return Number(item.current_stock || 0) < reorderPoint;
    });
  }, [items, dailyConsumptionByItem, avgLeadTime]);

  // FIFO: el lote más viejo de un ítem sigue intacto mientras uno más nuevo
  // ya se consumió — exactamente el riesgo que importa en papel/tinta, que
  // se degradan con el tiempo guardados. Se detecta con el estado ACTUAL de
  // los lotes (recibido vs. disponible), sin necesitar un historial de
  // saldos por fecha que la base no guarda.
  const fifoViolations = useMemo(() => {
    const byItem = new Map<string, any[]>();
    for (const lot of lots) {
      if (!lot.item_id) continue;
      if (!byItem.has(lot.item_id)) byItem.set(lot.item_id, []);
      byItem.get(lot.item_id)!.push(lot);
    }
    const violations: { itemId: string; oldestLot: string }[] = [];
    for (const [itemId, itemLots] of byItem) {
      if (itemLots.length < 2) continue;
      const sorted = [...itemLots].sort((a, b) => new Date(a.received_date).getTime() - new Date(b.received_date).getTime());
      const oldest = sorted[0];
      const oldestUntouched = Number(oldest.quantity_available) >= Number(oldest.quantity_received);
      const newerConsumed = sorted.slice(1).some((l) => Number(l.quantity_available) < Number(l.quantity_received));
      if (oldestUntouched && newerConsumed) violations.push({ itemId, oldestLot: oldest.lot_number });
    }
    return violations;
  }, [lots]);

  // Costeo por trabajo: % del consumo real que quedó asociado a una OT.
  // La API ya exige la OT para consumos nuevos, pero la mayoría del
  // historial real no pasó por ese camino — vale la pena verlo, no darlo
  // por hecho.
  const jobCostingCoverage = useMemo(() => {
    const consumptions = transactions.filter((tx: any) => tx.tx_type === 'consumption');
    if (!consumptions.length) return null;
    const withOt = consumptions.filter((tx: any) => tx.work_order_id).length;
    return { pct: (withOt / consumptions.length) * 100, withOt, total: consumptions.length };
  }, [transactions]);

  // Cuánto valor hay por familia — la barra que llena de contenido real la
  // tarjeta de "valor estimado", no sólo un número suelto (feedback directo).
  const valueByFamily = useMemo(() => {
    const values = new Map<string, number>();
    for (const item of items) {
      const key = item.material_kind || 'otro';
      const stock = Number(item.current_stock || 0);
      const cost = Number(item.weighted_unit_cost || item.estimated_unit_cost || 0);
      values.set(key, (values.get(key) || 0) + stock * cost);
    }
    const total = Array.from(values.values()).reduce((s, v) => s + v, 0) || 1;
    return MATERIAL_KIND_OPTIONS
      .map((k) => ({ key: k.value, label: k.label, value: values.get(k.value) || 0, pct: ((values.get(k.value) || 0) / total) * 100 }))
      .filter((f) => f.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [items]);

  const filteredLots = useMemo(() => {
    if (!txForm.item_id) return lots;
    return lots.filter((lot: any) => lot.item_id === txForm.item_id);
  }, [lots, txForm.item_id]);

  const refetchAllInventoryData = () => {
    refetchItems();
    refetchLots();
    refetchTransactions();
  };

  const resetImportState = () => {
    setImportFile(null);
    setImportPreview(null);
    setImportResult(null);
    setImportError(null);
    setImportLoading(false);
  };

  const handleImportFileChange = async (file: File | null) => {
    setImportFile(file);
    setImportPreview(null);
    setImportResult(null);
    setImportError(null);
    if (!file) return;

    setImportLoading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/inventory/import/preview', { method: 'POST', credentials: 'include', body });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setImportError(json?.error || 'No se pudo leer el archivo');
        return;
      }
      setImportPreview(json);
    } catch {
      setImportError('No se pudo leer el archivo');
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportCommit = async () => {
    if (!importFile) return;
    setImportLoading(true);
    setImportError(null);
    try {
      const body = new FormData();
      body.append('file', importFile);
      const res = await fetch('/api/inventory/import/commit', { method: 'POST', credentials: 'include', body });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setImportError(json?.error || 'No se pudo completar la importación');
        return;
      }
      setImportResult(json);
      refetchAllInventoryData();
      toast.success(`Importación completa: ${json.created} nuevos, ${json.updated} actualizados`);
    } catch {
      setImportError('No se pudo completar la importación');
    } finally {
      setImportLoading(false);
    }
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
      toast.error('Indica el código y el nombre');
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
      {/* Panel lateral persistente, no una barra que se pierde al scrollear
          — pedido directo: "el panel de KPIs y métricas corre a lo largo de
          toda la página, siempre visible junto al árbol". */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-primary">Módulo de inventario</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={cn('grid w-full', isAdmin ? 'grid-cols-5' : 'grid-cols-4')}>
              <TabsTrigger value="items">Ítems</TabsTrigger>
              <TabsTrigger value="lots">Lotes</TabsTrigger>
              <TabsTrigger value="transactions">Movimientos de stock</TabsTrigger>
              <TabsTrigger value="calculator">Estimador de costos</TabsTrigger>
              {isAdmin && <TabsTrigger value="movement-types">Tipos de movimiento</TabsTrigger>}
            </TabsList>

            <TabsContent value="items" className="space-y-4">
              <ItemsTab
                items={items}
                everReceivedIds={everReceivedIds}
                dailyConsumptionByItem={dailyConsumptionByItem}
                onEdit={openEditDialog}
                onDelete={handleDeleteItem}
                onImport={() => setShowImportDialog(true)}
                onAddItem={() => setShowItemDialog(true)}
              />
            </TabsContent>

            <TabsContent value="lots" className="space-y-4">
              <LotsTab
                lots={lots}
                lotsLoading={lotsLoading}
                lotsError={lotsError}
                refetchLots={refetchLots}
                onAddLot={() => setShowLotDialog(true)}
              />
            </TabsContent>

            <TabsContent value="transactions" className="space-y-4">
              <TransactionsTab
                transactions={transactions}
                txTypeLabel={txTypeLabel}
                onAddTransaction={() => setShowTxDialog(true)}
              />
            </TabsContent>

            <TabsContent value="calculator" className="space-y-4">
              <CalculatorTab items={items} />
            </TabsContent>

            {isAdmin && (
              <TabsContent value="movement-types" className="space-y-4">
                <MovementTypesManager />
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4">
          <div className="space-y-3 rounded-lg border border-primary/20 bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">KPIs y métricas</p>

            <div>
              <p className="text-xs text-muted-foreground">Valor estimado de stock</p>
              <p className="text-2xl font-bold text-primary">{formatCLP(totalStockValue)}</p>
            </div>

            <div>
              <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                {valueByFamily.map((f) => (
                  <span key={f.key} className={familyStyle(f.key).bar} style={{ width: `${f.pct}%` }} title={`${f.label}: ${formatCLP(f.value)}`} />
                ))}
              </div>
              <div className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
                {valueByFamily.map((f) => (
                  <div key={f.key} className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${familyStyle(f.key).dot}`} />
                      {f.label}
                    </span>
                    <span>{f.pct.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 border-t pt-3 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Control de inventario</p>

              <div
                className="flex items-center justify-between"
                title="Consumo real (en valor) de los últimos 30 días, anualizado, sobre el valor de stock actual — aproximación estándar cuando no hay snapshots históricos de valor para promediar."
              >
                <span className="text-muted-foreground">Rotación anual</span>
                <span className="font-semibold">{turnoverMetrics.annualTurnover != null ? `${turnoverMetrics.annualTurnover.toFixed(1)}×` : '—'}</span>
              </div>

              <div
                className="flex items-center justify-between"
                title="Días que duraría el valor de stock actual al ritmo de consumo real de los últimos 30 días (DIO)."
              >
                <span className="text-muted-foreground">Cobertura total (DIO)</span>
                <span className="font-semibold">{turnoverMetrics.dio != null ? `≈${Math.round(turnoverMetrics.dio)}d` : '—'}</span>
              </div>

              <div
                className="flex items-center justify-between"
                title={
                  avgLeadTime
                    ? `Punto de reorden = lead time real (${avgLeadTime.days.toFixed(1)}d, de ${avgLeadTime.sampleSize} recepciones) × consumo real diario. Sólo cuenta ítems con consumo reciente registrado.`
                    : 'Sin lotes con OC vinculada todavía para calcular un lead time real.'
                }
              >
                <span className="text-muted-foreground">Bajo punto de reorden real</span>
                <span className={`font-semibold ${belowRealReorderPoint.length > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {avgLeadTime ? belowRealReorderPoint.length : '—'}
                </span>
              </div>

              <div
                className="flex items-center justify-between"
                title="Ítems con un lote más viejo intacto mientras uno más nuevo ya se consumió — el riesgo real de guardar papel/tinta más tiempo del necesario."
              >
                <span className="text-muted-foreground">Fuera de orden FIFO</span>
                <span className={`font-semibold ${fifoViolations.length > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {fifoViolations.length}
                </span>
              </div>

              <div
                className="flex items-center justify-between"
                title="Porcentaje del consumo real que quedó asociado a una orden de trabajo — la base de un costeo real por trabajo, no una tarifa estimada."
              >
                <span className="text-muted-foreground">Consumo con OT asociada</span>
                <span
                  className={`font-semibold ${
                    jobCostingCoverage == null ? '' : jobCostingCoverage.pct < 50 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {jobCostingCoverage ? `${jobCostingCoverage.pct.toFixed(0)}%` : '—'}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 border-t pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Por familia</p>
              {familyBreakdown.map((f) => (
                <div key={f.key} className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${familyStyle(f.key).dot}`} />
                    {f.label}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{f.count}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <ImportDialog
        open={showImportDialog}
        onOpenChange={(open) => {
          setShowImportDialog(open);
          if (!open) resetImportState();
        }}
        onCancel={() => setShowImportDialog(false)}
        importPreview={importPreview}
        importResult={importResult}
        importLoading={importLoading}
        importError={importError}
        onFileChange={handleImportFileChange}
        onCommit={handleImportCommit}
      />

      <ItemDialog
        open={showItemDialog}
        onOpenChange={setShowItemDialog}
        editingItem={editingItem}
        itemForm={itemForm}
        setItemForm={setItemForm}
        onCancel={resetItemForm}
        onSave={handleSaveItem}
        t={t}
      />

      <LotDialog
        open={showLotDialog}
        onOpenChange={setShowLotDialog}
        items={items}
        lotForm={lotForm}
        setLotForm={setLotForm}
        onCancel={resetLotForm}
        onCreate={handleCreateLot}
        t={t}
      />

      <TxDialog
        open={showTxDialog}
        onOpenChange={setShowTxDialog}
        items={items}
        ots={ots}
        filteredLots={filteredLots}
        txOptions={txOptions}
        txForm={txForm}
        setTxForm={setTxForm}
        onCancel={resetTxForm}
        onCreate={handleCreateTransaction}
        t={t}
      />
    </div>
  );
};

export default InventoryManagement;
