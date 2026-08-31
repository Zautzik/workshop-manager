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
import type { ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, AlertTriangle, Calculator, ChevronDown, Lock, Printer, ShieldAlert, Upload } from 'lucide-react';
import { certStatus } from '@/lib/purchasing';
import { EtiquetaLote } from '@/components/bodega/EtiquetaLote';
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

const VALID_TABS = ['items', 'lots', 'transactions', 'calculator', 'movement-types'] as const;
type InventoryTab = (typeof VALID_TABS)[number];

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

// Red de seguridad mientras carga (o si falla) useMovementTypes() — la
// fuente real es la tabla movement_types, editable en la pestaña "Tipos de
// movimiento" sin tocar código. Ver src/hooks/use-movement-types.ts.
const FALLBACK_TX_OPTIONS = [
  { value: 'purchase', label: 'Compra (+)' },
  { value: 'consumption', label: 'Consumo (-)' },
  { value: 'adjustment_in', label: 'Ajuste a favor (+)' },
  { value: 'adjustment_out', label: 'Ajuste en contra (-)' },
  { value: 'return_to_stock', label: 'Devolución a bodega (+)' },
];
const FALLBACK_TX_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  FALLBACK_TX_OPTIONS.map((o) => [o.value, o.label]),
);

const getCategoryLabel = (value?: string | null) => {
  const found = CATEGORY_OPTIONS.find((option) => option.value === value);
  return found?.label || value || '-';
};

const getMaterialKindLabel = (value?: string | null) => {
  const found = MATERIAL_KIND_OPTIONS.find((option) => option.value === value);
  return found?.label || (value ? value : 'Sin clasificar');
};

// Colores por familia, deliberadamente lejos de rojo/ámbar/verde — esos tres
// ya significan algo (agotado/bajo/disponible) y una familia con el mismo
// tono se leería como una alarma de stock que no es.
const FAMILY_STYLES: Record<string, { chip: string; dot: string; bar: string; border: string }> = {
  papel: { chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', dot: 'bg-sky-500', bar: 'bg-sky-500', border: 'border-l-sky-500' },
  tinta_especial: { chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-300', dot: 'bg-violet-500', bar: 'bg-violet-500', border: 'border-l-violet-500' },
  envase: { chip: 'bg-teal-500/15 text-teal-700 dark:text-teal-300', dot: 'bg-teal-500', bar: 'bg-teal-500', border: 'border-l-teal-500' },
  servicio: { chip: 'bg-slate-500/15 text-slate-700 dark:text-slate-300', dot: 'bg-slate-500', bar: 'bg-slate-500', border: 'border-l-slate-500' },
  insumo: { chip: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300', dot: 'bg-fuchsia-500', bar: 'bg-fuchsia-500', border: 'border-l-fuchsia-500' },
  herramental: { chip: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500', bar: 'bg-indigo-500', border: 'border-l-indigo-500' },
  otro: { chip: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300', dot: 'bg-zinc-500', bar: 'bg-zinc-500', border: 'border-l-zinc-500' },
};
const familyStyle = (kind?: string | null) => FAMILY_STYLES[String(kind)] ?? FAMILY_STYLES.otro;

/**
 * "Couche sheet 115gsm" y "Couche sheet 150gsm" son el mismo producto en dos
 * gramajes — no dos productos que compiten por atención en la grilla. Se
 * corta el nombre en el primer token que empieza con un dígito: todo lo de
 * antes es el producto, todo lo de después es lo que lo distingue de sus
 * hermanos (auditoría 2026-08, feedback directo: "buscar un couche 150 entre
 * couches que se ven idénticos es una misión").
 */
function splitVariant(name: string): { base: string; spec: string } {
  const tokens = String(name || '').trim().split(/\s+/);
  const idx = tokens.findIndex((t) => /^[0-9]/.test(t));
  if (idx <= 0) return { base: name.trim(), spec: '' };
  const base = tokens.slice(0, idx).join(' ');
  const spec = tokens.slice(idx).join(' ');
  if (base.length < 3) return { base: name.trim(), spec: '' };
  return { base, spec };
}

/**
 * "Couche 200 g" y "Papel Couché 150g 70×100" son el mismo papel — uno
 * catalogado con el prefijo genérico "Papel", el otro sin él, y con/sin
 * tilde en "Couché". Sin normalizar esto quedan como dos productos
 * distintos bajo la misma familia "Papel", que es justo la redundancia que
 * el prefijo debería evitar (feedback directo: "ambos deberían estar bajo
 * el paraguas Couche"). Mismo bug afecta "Papel Bond" / "Bond".
 */
function normalizeBaseKey(base: string): string {
  const noAccents = base.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const stripped = noAccents.startsWith('papel ') ? noAccents.slice('papel '.length) : noAccents;
  return stripped.trim() || noAccents;
}

function specNumber(spec: string): number | null {
  const m = spec.match(/[0-9]+(?:[.,][0-9]+)?/);
  return m ? parseFloat(m[0].replace(',', '.')) : null;
}

function specUnit(spec: string): string {
  const m = spec.match(/[0-9](?:[.,][0-9]+)?\s*([a-zA-Zµ×]+)/);
  return m ? m[1] : '';
}

/**
 * Un tercer nivel, sólo donde el papel realmente lo tiene: gramaje primero,
 * tamaño después ("150g 70×100" → peso "150g", tamaño "70×100"). Lo que no
 * empieza con un número seguido de g/gsm/grs (tubos en mm, cajas en cm,
 * Pantone) se queda en dos niveles — inventar un peso ahí sería ruido, no
 * jerarquía (pedido directo: "de Couche vamos a gramaje, y de ahí a tamaño").
 */
function parseWeight(spec: string): { weight: string | null; rest: string | null } {
  const m = spec.match(/^([0-9]+(?:[.,][0-9]+)?\s*(?:gsm|grs|gr|g))(?=[\s)]|$)/i);
  if (!m) return { weight: null, rest: spec || null };
  const weight = m[1].trim();
  const rest = spec.slice(m[0].length).trim();
  return { weight, rest: rest || null };
}

/**
 * Las tintas no traen un número en el nombre para partir como el papel
 * ("Tinta Black CMYK offset" no tiene dígitos) — se agrupan por lo que son:
 * cuatricromía (los 4 colores de proceso) o Pantone (color directo). Dentro
 * de cuatricromía el mismo color puede venir de más de una marca — la marca
 * real, cuando está registrada, vive en las notas del ítem como
 * "Proveedor: X.", no en el nombre (pedido directo: "manejamos distintas
 * marcas para cada color, primero por cuatricromía, luego color, luego
 * marca").
 */
function inkColor(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes('yellow')) return 'Yellow';
  if (n.includes('magenta')) return 'Magenta';
  if (n.includes('cyan')) return 'Cyan';
  if (n.includes('black')) return 'Black';
  return null;
}

function inkBrand(notes?: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/Proveedor:\s*([^.]+)\.?/i);
  return m ? m[1].trim() : null;
}

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
    return { key: 'bajo' as const, label: 'Bajo mínimo', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' };
  }
  return { key: 'ok' as const, label: 'Disponible', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' };
}

const STOCK_ORDER: Record<string, number> = { nunca: 0, agotado: 0, bajo: 1, ok: 2 };

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
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [materialFilter, setMaterialFilter] = useState<string>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [collapsedFamilies, setCollapsedFamilies] = useState<Set<string>>(new Set());
  const [scanSearch, setScanSearch] = useState('');
  const [selectedLots, setSelectedLots] = useState<Set<string>>(new Set());
  const [lotSearch, setLotSearch] = useState('');
  const [lotOnlyProblem, setLotOnlyProblem] = useState(false);

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
    let out = categoryFilter === 'all'
      ? items
      : items.filter((item: any) => item.category === categoryFilter);

    if (materialFilter !== 'all') out = out.filter((item: any) => item.material_kind === materialFilter);

    const query = scanSearch.trim().toLowerCase();
    if (!query) return out;

    return out.filter((item: any) => {
      const sku = String(item.sku || '').toLowerCase();
      const name = String(item.name || '').toLowerCase();
      const barcode = String(item.barcode_value || '').toLowerCase();
      const qr = String(item.qr_value || '').toLowerCase();
      return sku.includes(query) || name.includes(query) || barcode.includes(query) || qr.includes(query);
    });
  }, [items, categoryFilter, materialFilter, scanSearch]);

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

  // Ordenado por urgencia, no por SKU — lo que necesita atención sube solo
  // arriba en vez de esperar en la fila 24 a que alguien scrollee hasta ahí.
  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a: any, b: any) => {
      const sa = stockState(Number(a.current_stock || 0), Number(a.min_stock || 0), everReceivedIds.has(a.id));
      const sb = stockState(Number(b.current_stock || 0), Number(b.min_stock || 0), everReceivedIds.has(b.id));
      const oa = sa.key === 'agotado' ? -1 : STOCK_ORDER[sa.key];
      const ob = sb.key === 'agotado' ? -1 : STOCK_ORDER[sb.key];
      if (oa !== ob) return oa - ob;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [filteredItems, everReceivedIds]);

  // La franja de arriba respeta el filtro activo — buscar "cartulina" no debe
  // seguir mostrando la urgencia de la tinta que ya no aparece en la grilla.
  const urgentInView = useMemo(
    () => sortedItems.filter((item: any) =>
      stockState(Number(item.current_stock || 0), Number(item.min_stock || 0), everReceivedIds.has(item.id)).key === 'agotado'),
    [sortedItems, everReceivedIds],
  );

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

  // Agrupar variantes de un mismo producto (mismo nombre base, misma
  // familia) para que "Couche 150" y "Couche 200" sean una tarjeta que se
  // abre, no dos tarjetas casi idénticas compitiendo por el ojo. Se
  // desactiva mientras se busca texto: ahí la búsqueda ya hace el trabajo de
  // encontrar el ítem exacto, agrupar sólo estorbaría.
  const itemGroups = useMemo(() => {
    type Group = { key: string; base: string; familia: string; items: any[] };
    const map = new Map<string, Group>();
    for (const item of sortedItems) {
      let { base } = splitVariant(item.name);
      // Cuatricromía y Pantones no tienen un dígito que las una por el
      // mecanismo genérico — se reconocen por lo que dicen, no por su forma.
      if (item.material_kind === 'tinta_especial') {
        if (inkColor(item.name)) base = 'Cuatricromía';
        else if (item.name.toLowerCase().includes('pantone')) base = 'Pantones';
      }
      const key = `${item.material_kind || 'otro'}::${normalizeBaseKey(base)}`;
      if (!map.has(key)) map.set(key, { key, base, familia: item.material_kind, items: [] });
      const g = map.get(key)!;
      g.items.push(item);
      // "Papel Couché" y "Couche" caen en la misma llave — se muestra la
      // más corta como nombre del producto, sin el prefijo redundante
      // (ya está bajo la sección de la familia "Papel").
      if (base.length < g.base.length) g.base = base;
    }
    for (const g of map.values()) {
      g.items.sort((a, b) => {
        const na = specNumber(splitVariant(a.name).spec);
        const nb = specNumber(splitVariant(b.name).spec);
        if (na != null && nb != null && na !== nb) return na - nb;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
    }
    return Array.from(map.values());
  }, [sortedItems]);

  // El contenedor grande que pidió el feedback: Papel, Tinta, Envase... cada
  // uno con sus productos adentro, en vez de una grilla plana de 37
  // tarjetas del mismo tamaño. Las familias con algo realmente agotado
  // suben arriba; el resto sigue el orden declarado en MATERIAL_KIND_OPTIONS.
  const familyGroups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; groups: any[] }>();
    for (const g of itemGroups) {
      const key = g.familia || 'otro';
      if (!map.has(key)) map.set(key, { key, label: getMaterialKindLabel(key), groups: [] });
      map.get(key)!.groups.push(g);
    }
    const hasUrgent = (groups: any[]) =>
      groups.some((g) => g.items.some((it: any) =>
        stockState(Number(it.current_stock || 0), Number(it.min_stock || 0), everReceivedIds.has(it.id)).key === 'agotado'));
    return MATERIAL_KIND_OPTIONS
      .map((k) => map.get(k.value))
      .filter((f): f is { key: string; label: string; groups: any[] } => !!f)
      .sort((a, b) => Number(hasUrgent(b.groups)) - Number(hasUrgent(a.groups)));
  }, [itemGroups, everReceivedIds]);

  const isSearching = scanSearch.trim().length > 0;

  const toggleGroup = (key: string) =>
    setExpandedGroups((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const toggleFamily = (key: string) =>
    setCollapsedFamilies((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  // Una fila, no una tarjeta: el nombre y el código ya dicen qué es, la
  // familia ya la dice el contenedor que lo envuelve — no hace falta
  // repetirla en cada línea. "Pack it in": 37 ítems tienen que entrar en la
  // pantalla, no en 37 tarjetas de 140px de alto (feedback directo).
  const renderItemRow = (item: any, level: 0 | 1 | 2 = 0, label?: string) => {
    const st = stockState(Number(item.current_stock || 0), Number(item.min_stock || 0), everReceivedIds.has(item.id));
    const min = Number(item.min_stock || 0);
    const stock = Number(item.current_stock || 0);
    const rate = dailyConsumptionByItem.get(item.id);
    const coverageDays = rate && rate > 0 ? Math.floor(stock / rate) : null;
    const coverageTone = coverageDays == null
      ? 'text-muted-foreground/50'
      : coverageDays < 7
        ? 'text-destructive font-semibold'
        : coverageDays < 14
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-muted-foreground';
    const padClass = level === 0 ? 'pl-2' : level === 1 ? 'pl-7' : 'pl-12';
    return (
      <div key={item.id} className={`flex items-center gap-2 py-1.5 pr-1 text-sm ${padClass}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`} />
        <div className="min-w-0 flex-1">
          <span className="truncate font-medium" title={item.name}>{label ?? item.name}</span>
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">{item.sku}</span>
        </div>
        <span className={`w-28 shrink-0 text-right font-mono text-[11px] ${st.key === 'ok' ? 'text-muted-foreground' : `${st.text} font-semibold`}`}>
          {stock.toLocaleString('es-CL')}/{min.toLocaleString('es-CL')} {item.unit}
        </span>
        <span
          className={`w-16 shrink-0 text-right font-mono text-[11px] ${coverageTone}`}
          title={coverageDays == null ? 'Sin consumo registrado en los últimos 30 días' : `≈${coverageDays} días de cobertura al ritmo de consumo de los últimos 30 días`}
        >
          {coverageDays == null ? '—' : `≈${coverageDays}d`}
        </span>
        <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
          {formatCLP(Number(item.weighted_unit_cost || item.estimated_unit_cost || 0))}
        </span>
        <div className="flex shrink-0 items-center">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditDialog(item)}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteItem(item.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  };

  // El peor estado entre un grupo de ítems, para que una fila cerrada no
  // esconda una emergencia detrás de un "N variantes" neutro.
  const worstStateOf = (items: any[]) => {
    let worst = stockState(Number(items[0].current_stock || 0), Number(items[0].min_stock || 0), everReceivedIds.has(items[0].id));
    let worstOrder = worst.key === 'agotado' ? -1 : STOCK_ORDER[worst.key];
    for (const it of items) {
      const s = stockState(Number(it.current_stock || 0), Number(it.min_stock || 0), everReceivedIds.has(it.id));
      const order = s.key === 'agotado' ? -1 : STOCK_ORDER[s.key];
      if (order < worstOrder) { worst = s; worstOrder = order; }
    }
    return worst;
  };

  // Tercer nivel genérico: una etiqueta intermedia (gramaje para papel,
  // color para tinta) que se abre a una hoja por variante (tamaño, marca).
  // Sin nada detrás no hay nada que abrir — no se inventa un nivel vacío
  // (pedido directo: "de Couche vamos a gramaje, y de ahí a tamaño"; "de
  // cuatricromía vamos a color, y de ahí a marca").
  const renderMidTierRow = (groupKey: string, tierLabel: string, items: any[], countWord: string, leafLabelFor: (item: any) => string) => {
    const tierKey = `${groupKey}::${tierLabel}`;
    const expanded = expandedGroups.has(tierKey);
    const worst = worstStateOf(items);
    return (
      <div key={tierKey}>
        <button type="button" onClick={() => toggleGroup(tierKey)} className="flex w-full items-center gap-2 rounded py-1.5 pl-7 pr-1 text-left text-sm hover:bg-muted/50">
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${worst.dot}`} />
          <span className="min-w-0 flex-1 font-medium">{tierLabel}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{items.length} {countWord}{items.length === 1 ? '' : 's'}</span>
        </button>
        {expanded && (
          <div className="border-l ml-9 border-border/60">
            {items.map((it) => renderItemRow(it, 2, leafLabelFor(it)))}
          </div>
        )}
      </div>
    );
  };

  const renderProductRow = (group: { key: string; base: string; familia: string; items: any[] }) => {
    if (group.items.length === 1) return renderItemRow(group.items[0]);

    const expanded = expandedGroups.has(group.key);
    const worst = worstStateOf(group.items);

    const specs = group.items
      .map((it) => specNumber(splitVariant(it.name).spec))
      .filter((n): n is number => n != null)
      .sort((a, b) => a - b);
    const unit = specUnit(splitVariant(group.items[0].name).spec);
    const specLabel = specs.length
      ? (specs[0] === specs[specs.length - 1] ? `${specs[0]}${unit}` : `${specs[0]}–${specs[specs.length - 1]}${unit}`)
      : null;

    let body: ReactNode;
    if (group.base === 'Cuatricromía') {
      // Color primero, marca después — no hay dígito que partir acá, la
      // clasificación ya viene hecha desde itemGroups.
      const byColor = new Map<string, any[]>();
      for (const it of group.items) {
        const color = inkColor(it.name) ?? 'Otro';
        if (!byColor.has(color)) byColor.set(color, []);
        byColor.get(color)!.push(it);
      }
      const COLOR_ORDER = ['Yellow', 'Magenta', 'Cyan', 'Black'];
      const colorEntries = Array.from(byColor.entries()).sort((a, b) => COLOR_ORDER.indexOf(a[0]) - COLOR_ORDER.indexOf(b[0]));
      body = (
        <div className="border-l ml-4 border-border/60">
          {colorEntries.map(([color, colorItems]) =>
            colorItems.length === 1
              ? renderItemRow(colorItems[0], 1, color)
              : renderMidTierRow(group.key, color, colorItems, 'marca', (it) => inkBrand(it.notes) ?? 'Sin marca registrada'))}
        </div>
      );
    } else {
      // Partir por gramaje: cada peso con algo detrás (un tamaño) se abre a
      // un tercer nivel; sin nada detrás, es una hoja directa como antes.
      const byWeight = new Map<string, any[]>();
      const flatLeaves: any[] = [];
      for (const it of group.items) {
        const { weight, rest } = parseWeight(splitVariant(it.name).spec);
        if (weight != null && rest != null) {
          if (!byWeight.has(weight)) byWeight.set(weight, []);
          byWeight.get(weight)!.push(it);
        } else {
          flatLeaves.push(it);
        }
      }
      body = (
        <div className="border-l ml-4 border-border/60">
          {Array.from(byWeight.entries()).map(([weight, items]) => renderMidTierRow(group.key, weight, items, 'tamaño', (it) => parseWeight(splitVariant(it.name).spec).rest ?? it.name))}
          {flatLeaves.map((it) => renderItemRow(it, 1, splitVariant(it.name).spec || it.name))}
        </div>
      );
    }

    return (
      <div key={group.key}>
        <button type="button" onClick={() => toggleGroup(group.key)} className="flex w-full items-center gap-2 rounded py-1.5 pl-2 pr-1 text-left text-sm hover:bg-muted/50">
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${worst.dot}`} />
          <div className="min-w-0 flex-1">
            <span className="font-medium">{group.base}</span>
            {specLabel && <span className="ml-2 font-mono text-[11px] text-muted-foreground">{specLabel}</span>}
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">{group.items.length} variantes</span>
        </button>
        {expanded && body}
      </div>
    );
  };

  const renderFamilySection = (fam: { key: string; label: string; groups: any[] }) => {
    const fs = familyStyle(fam.key);
    const collapsed = collapsedFamilies.has(fam.key);
    const count = fam.groups.reduce((n, g) => n + g.items.length, 0);
    return (
      <div key={fam.key} className="overflow-hidden rounded-lg border">
        <button
          type="button"
          onClick={() => toggleFamily(fam.key)}
          className={`flex w-full items-center justify-between gap-2 px-3 py-2 ${fs.chip}`}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className={`h-2 w-2 rounded-full ${fs.dot}`} />
            {fam.label}
            <span className="font-normal opacity-70">{count}</span>
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        </button>
        {!collapsed && (
          <div className="divide-y divide-border/40 bg-card px-1">
            {fam.groups.map((g) => renderProductRow(g))}
          </div>
        )}
      </div>
    );
  };

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

  // Lo que no se puede usar arriba: es trabajo, no información — mismo
  // criterio que la pantalla de impresión que se fusiona acá.
  const lotsConProblema = useMemo(() => {
    return lots.filter((lot: any) => {
      const estado = certStatus(lot.certification_expires_on);
      return estado === 'vencido' || estado === 'sin_certificado' || !!lot.blocked_reason;
    });
  }, [lots]);
  const idsConProblema = useMemo(() => new Set(lotsConProblema.map((l: any) => l.id)), [lotsConProblema]);

  // Hasta 500 lotes en una sola tabla: sin buscador esto es puro scroll.
  const lotsVisibles = useMemo(() => {
    const query = lotSearch.trim().toLowerCase();
    return lots.filter((lot: any) => {
      if (lotOnlyProblem && !idsConProblema.has(lot.id)) return false;
      if (!query) return true;
      const numero = String(lot.lot_number ?? '').toLowerCase();
      const nombre = String(lot.inventory_items?.name ?? '').toLowerCase();
      const proveedor = String(lot.supplier_name ?? '').toLowerCase();
      return numero.includes(query) || nombre.includes(query) || proveedor.includes(query);
    });
  }, [lots, lotSearch, lotOnlyProblem, idsConProblema]);

  const toggleLotSelection = (id: string) =>
    setSelectedLots((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const allVisibleLotsSelected = lotsVisibles.length > 0 && lotsVisibles.every((l: any) => selectedLots.has(l.id));
  const toggleSelectAllVisibleLots = () =>
    setSelectedLots((s) => {
      const n = new Set(s);
      if (allVisibleLotsSelected) {
        for (const l of lotsVisibles) n.delete(l.id);
      } else {
        for (const l of lotsVisibles) n.add(l.id);
      }
      return n;
    });

  const lotsParaImprimir = useMemo(() => lots.filter((l: any) => selectedLots.has(l.id)), [lots, selectedLots]);

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
                    placeholder="Escanee/Busque por nombre, código, código de barras o QR"
                  />
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowImportDialog(true)}>
                    <Upload className="mr-2 h-4 w-4" />
                    Importar Excel
                  </Button>
                  <Button onClick={() => setShowItemDialog(true)} className="bg-primary hover:bg-primary/90">
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar ítem
                  </Button>
                </div>
              </div>

              {/* Familia, aparte de Categoría: son dos preguntas distintas
                  (durable-vs-consumible contra papel-vs-tinta-vs-envase), y
                  cruzarlas acá es exactamente lo que el catálogo ahora sabe
                  hacer (auditoría 2026-08). */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setMaterialFilter('all')}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    materialFilter === 'all' ? 'border-foreground bg-foreground text-background' : 'border-input text-muted-foreground hover:border-foreground/40'
                  }`}
                >
                  Todas las familias
                </button>
                {MATERIAL_KIND_OPTIONS.map((k) => {
                  const fs = familyStyle(k.value);
                  const active = materialFilter === k.value;
                  return (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => setMaterialFilter(k.value)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        active ? `border-transparent ${fs.chip}` : 'border-input text-muted-foreground hover:border-foreground/40'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${fs.dot}`} />
                      {k.label}
                    </button>
                  );
                })}
              </div>

              {/* Lo urgente, antes que nada — y respeta el filtro activo: si
                  se busca "cartulina", acá no aparece la tinta que ya no se
                  ve en la grilla de abajo. */}
              {urgentInView.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-destructive mb-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Necesita atención ahora ({urgentInView.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {urgentInView.map((item: any) => (
                      <span key={item.id} className="rounded-md border border-destructive/40 bg-background px-2 py-0.5 text-[11px] font-mono text-destructive">
                        {item.sku}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {sortedItems.length === 0 && (
                <p className="py-12 text-center text-sm text-muted-foreground">Nada calza con ese filtro o búsqueda.</p>
              )}

              {sortedItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span className="flex-1">Ítem</span>
                    <span className="w-28 shrink-0 text-right">Stock / mín.</span>
                    <span className="w-16 shrink-0 text-right" title="Días de cobertura al ritmo de consumo real de los últimos 30 días">Cobertura</span>
                    <span className="w-20 shrink-0 text-right">Costo</span>
                    <span className="w-14 shrink-0" />
                  </div>
                  {isSearching ? (
                    <div className="divide-y divide-border/40 rounded-lg border bg-card px-1">
                      {sortedItems.map((item: any) => renderItemRow(item))}
                    </div>
                  ) : (
                    familyGroups.map((fam) => renderFamilySection(fam))
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="lots" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
                <Input
                  value={lotSearch}
                  onChange={(e) => setLotSearch(e.target.value)}
                  className="w-80"
                  placeholder="Buscar por número de lote, ítem o proveedor…"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={selectedLots.size === 0}
                    onClick={() => window.print()}
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimir {selectedLots.size > 0 ? `${selectedLots.size} ` : ''}
                    {selectedLots.size === 1 ? 'etiqueta' : 'etiquetas'}
                  </Button>
                  <Button onClick={() => setShowLotDialog(true)} className="bg-primary hover:bg-primary/90">
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar lote
                  </Button>
                </div>
              </div>

              {lotsConProblema.length > 0 && (
                <Card className="border-red-500/40 bg-red-500/5 print:hidden">
                  <CardContent className="flex items-start gap-2 py-3">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                    <p className="text-sm text-red-700 dark:text-red-400">
                      <span className="font-semibold">{lotsConProblema.length}</span>{' '}
                      {lotsConProblema.length === 1 ? 'lote no puede' : 'lotes no pueden'} entrar a producción
                      sin autorización escrita.{' '}
                      <button
                        type="button"
                        onClick={() => setLotOnlyProblem((v) => !v)}
                        className="font-semibold underline underline-offset-2"
                      >
                        {lotOnlyProblem ? 'Ver todos' : 'Ver sólo éstos'}
                      </button>
                    </p>
                  </CardContent>
                </Card>
              )}

              <div className="print:hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allVisibleLotsSelected}
                          onCheckedChange={toggleSelectAllVisibleLots}
                          disabled={lotsVisibles.length === 0}
                          aria-label="Seleccionar todos los lotes visibles"
                        />
                      </TableHead>
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
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Cargando lotes…</TableCell></TableRow>
                    )}
                    {lotsError && (
                      <TableRow><TableCell colSpan={7} className="text-center text-red-600 py-8">
                        No se pudieron cargar los lotes. <button className="underline" onClick={() => refetchLots()}>Reintentar</button>
                      </TableCell></TableRow>
                    )}
                    {!lotsLoading && !lotsError && lots.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin lotes todavía.</TableCell></TableRow>
                    )}
                    {!lotsLoading && !lotsError && lots.length > 0 && lotsVisibles.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nada calza con esa búsqueda o filtro.</TableCell></TableRow>
                    )}
                    {lotsVisibles.map((lot: any) => {
                      const estado = certStatus(lot.certification_expires_on);
                      const bloqueado = !!lot.blocked_reason;
                      const disponible = Number(lot.libre ?? lot.quantity_available ?? 0);
                      return (
                        <TableRow key={lot.id} className={bloqueado ? 'bg-red-500/5' : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={selectedLots.has(lot.id)}
                              onCheckedChange={() => toggleLotSelection(lot.id)}
                              aria-label={`Seleccionar lote ${lot.lot_number}`}
                            />
                          </TableCell>
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
              </div>

              {/* La hoja de etiquetas. Sólo existe al imprimir — ver el
                  aislamiento de impresión en AppShell/Breadcrumbs, porque acá
                  adentro hay barra lateral, breadcrumb y otras pestañas que
                  print:hidden por sí solo no alcanza a cubrir con seguridad. */}
              <div className="etiqueta-print-sheet hidden print:flex print:flex-wrap print:gap-2">
                {lotsParaImprimir.map((l: any) => (
                  <EtiquetaLote key={l.id} lote={l} />
                ))}
              </div>

              <style jsx global>{`
                @page {
                  size: A4;
                  margin: 8mm;
                }
                @media print {
                  /* El fondo degradado del tema vive en \`body\` mismo, no en un
                     hijo — \`body *\` no lo alcanza. Sin esto se imprime un
                     arcoíris de tinta detrás de las etiquetas. */
                  body {
                    background: white !important;
                  }
                  body * {
                    visibility: hidden;
                  }
                  .etiqueta-print-sheet,
                  .etiqueta-print-sheet * {
                    visibility: visible;
                  }
                  .etiqueta-print-sheet {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                  }
                  .etiqueta {
                    break-inside: avoid;
                  }
                }
              `}</style>
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
                      <TableCell>{txTypeLabel[tx.tx_type] ?? tx.tx_type}</TableCell>
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

      <Dialog
        open={showImportDialog}
        onOpenChange={(open) => {
          setShowImportDialog(open);
          if (!open) resetImportState();
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Importar Excel de inventario</DialogTitle>
            <DialogDescription>
              El export mensual del sistema anterior — se identifica por Código; los ítems nuevos se crean con un
              lote de apertura, los que ya existen sólo actualizan nombre, clasificación, mínimo y costo. El stock
              de ítems existentes nunca se toca automáticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!importResult && (
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => handleImportFileChange(e.target.files?.[0] ?? null)}
                disabled={importLoading}
              />
            )}

            {importLoading && <p className="text-sm text-muted-foreground">Procesando…</p>}
            {importError && <p className="text-sm text-destructive">{importError}</p>}

            {importPreview && !importResult && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-600 dark:text-emerald-400">
                    {importPreview.summary.new} nuevos
                  </span>
                  <span className="rounded-full bg-sky-500/10 px-2.5 py-1 font-medium text-sky-600 dark:text-sky-400">
                    {importPreview.summary.updated} actualizados
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                    {importPreview.summary.unchanged} sin cambios
                  </span>
                  {importPreview.summary.stockDiffers > 0 && (
                    <span
                      className="rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-600 dark:text-amber-400"
                      title="El Excel reporta un stock distinto al del sistema — no se ajusta automáticamente, revisar manualmente."
                    >
                      {importPreview.summary.stockDiffers} con diferencia de stock
                    </span>
                  )}
                </div>

                {importPreview.warnings.length > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-400">
                    {importPreview.warnings.map((w: string, i: number) => <p key={i}>{w}</p>)}
                  </div>
                )}

                <div className="max-h-80 overflow-y-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="p-2">Código</th>
                        <th className="p-2">Nombre</th>
                        <th className="p-2">Familia</th>
                        <th className="p-2">Estado</th>
                        <th className="p-2 text-right">Stock Excel</th>
                        <th className="p-2 text-right">Stock actual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.map((r: any) => (
                        <tr key={r.sku} className="border-b last:border-0">
                          <td className="p-2 font-mono">{r.sku}</td>
                          <td className="p-2 max-w-[220px] truncate" title={r.name}>{r.name}</td>
                          <td className="p-2">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] ${familyStyle(r.materialKind).chip}`}>
                              {getMaterialKindLabel(r.materialKind)}
                            </span>
                            {r.categoriaUnmapped && (
                              <span className="ml-1 text-amber-600 dark:text-amber-400" title="Categoría sin mapeo conocido">
                                ⚠
                              </span>
                            )}
                          </td>
                          <td className="p-2">
                            {r.status === 'new' && <span className="text-emerald-600 dark:text-emerald-400">Nuevo</span>}
                            {r.status === 'updated' && (
                              <span className="text-sky-600 dark:text-sky-400" title={r.changes.join(', ')}>
                                Actualiza {r.changes.join(', ')}
                              </span>
                            )}
                            {r.status === 'unchanged' && <span className="text-muted-foreground">Sin cambios</span>}
                          </td>
                          <td className="p-2 text-right font-mono">{r.excelStock.toLocaleString('es-CL')}</td>
                          <td className={`p-2 text-right font-mono ${r.stockDiffers ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}`}>
                            {r.currentStock == null ? '—' : r.currentStock.toLocaleString('es-CL')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {importResult && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-600 dark:text-emerald-400">
                    {importResult.created} creados
                  </span>
                  <span className="rounded-full bg-sky-500/10 px-2.5 py-1 font-medium text-sky-600 dark:text-sky-400">
                    {importResult.updated} actualizados
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                    {importResult.unchanged} sin cambios
                  </span>
                  {importResult.errors.length > 0 && (
                    <span className="rounded-full bg-destructive/10 px-2.5 py-1 font-medium text-destructive">
                      {importResult.errors.length} con error
                    </span>
                  )}
                </div>
                {importResult.errors.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                    {importResult.errors.map((e: string, i: number) => <p key={i}>{e}</p>)}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              {importResult ? 'Cerrar' : 'Cancelar'}
            </Button>
            {importPreview && !importResult && (
              <Button onClick={handleImportCommit} disabled={importLoading} className="bg-primary hover:bg-primary/90">
                Confirmar importación
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <Label>Código</Label>
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
                    {txOptions.map((option) => (
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
