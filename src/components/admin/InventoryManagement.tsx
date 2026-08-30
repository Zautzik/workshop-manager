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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, AlertTriangle, Calculator, ChevronDown, Lock } from 'lucide-react';
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
  const { data: items = [], refetch: refetchItems } = useInventoryItems();
  const { data: lots = [], refetch: refetchLots, isLoading: lotsLoading, isError: lotsError } = useInventoryLots();
  const { data: transactions = [], refetch: refetchTransactions } = useInventoryTransactions();
  const { data: alerts = [] } = useInventoryLowStockAlerts();
  const { data: ots = [] } = useOTs();
  // Fijo al montar: una ventana de "últimos 30 días" no necesita
  // recalcularse en cada render, y leer Date.now() dentro de un useMemo es
  // impuro para el compilador de React — el inicializador perezoso de
  // useState corre una sola vez, así que es el lugar correcto para leerlo.
  const [now] = useState(() => Date.now());

  const [showItemDialog, setShowItemDialog] = useState(false);
  const [showLotDialog, setShowLotDialog] = useState(false);
  const [showTxDialog, setShowTxDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [materialFilter, setMaterialFilter] = useState<string>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [collapsedFamilies, setCollapsedFamilies] = useState<Set<string>>(new Set());
  const [scanSearch, setScanSearch] = useState('');

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

  // La misma alarma para "nunca se ha comprado" y "se agotó" es la que hace
  // que 29 de 37 ítems se vean igual de urgentes. needsAction filtra el
  // segundo caso — el primero ya se ve directo en cada fila como "Nunca
  // recibido", no hace falta una lista aparte.
  const needsAction = useMemo(
    () => alerts.filter((a: any) => !(Number(a.current_stock) <= 0 && !everReceivedIds.has(a.id))),
    [alerts, everReceivedIds],
  );

  // El mínimo estático puede decir "Disponible" mientras el ritmo real de
  // consumo dice "se acaba en 2 días" — son dos preguntas distintas
  // (¿cuánto queda? vs ¿cuánto dura?), y la de arriba sólo mostraba la
  // primera. Sin esto, "al día, nada urgente" puede ser literalmente falso.
  const criticalCoverageItems = useMemo(() => {
    return items.filter((item: any) => {
      const rate = dailyConsumptionByItem.get(item.id);
      if (!rate || rate <= 0) return false;
      return Number(item.current_stock || 0) / rate < 7;
    });
  }, [items, dailyConsumptionByItem]);

  const totalStockValue = useMemo(() => {
    return items.reduce((sum: number, item: any) => {
      const stock = Number(item.current_stock || 0);
      const cost = Number(item.weighted_unit_cost || item.estimated_unit_cost || 0);
      return sum + stock * cost;
    }, 0);
  }, [items]);

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
      const { base } = splitVariant(item.name);
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
  const renderItemRow = (item: any, indent = false) => {
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
    return (
      <div key={item.id} className={`flex items-center gap-2 py-1.5 pr-1 text-sm ${indent ? 'pl-7' : 'pl-2'}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`} />
        <div className="min-w-0 flex-1">
          <span className="truncate font-medium" title={item.name}>{indent ? splitVariant(item.name).spec || item.name : item.name}</span>
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

  const renderProductRow = (group: { key: string; base: string; familia: string; items: any[] }) => {
    if (group.items.length === 1) return renderItemRow(group.items[0]);

    const expanded = expandedGroups.has(group.key);

    // El peor estado entre las variantes, para que la fila cerrada no
    // esconda una emergencia detrás de un "3 variantes" neutro.
    let worst = stockState(Number(group.items[0].current_stock || 0), Number(group.items[0].min_stock || 0), everReceivedIds.has(group.items[0].id));
    let worstOrder = worst.key === 'agotado' ? -1 : STOCK_ORDER[worst.key];
    for (const it of group.items) {
      const s = stockState(Number(it.current_stock || 0), Number(it.min_stock || 0), everReceivedIds.has(it.id));
      const order = s.key === 'agotado' ? -1 : STOCK_ORDER[s.key];
      if (order < worstOrder) { worst = s; worstOrder = order; }
    }

    const specs = group.items
      .map((it) => specNumber(splitVariant(it.name).spec))
      .filter((n): n is number => n != null)
      .sort((a, b) => a - b);
    const unit = specUnit(splitVariant(group.items[0].name).spec);
    const specLabel = specs.length
      ? (specs[0] === specs[specs.length - 1] ? `${specs[0]}${unit}` : `${specs[0]}–${specs[specs.length - 1]}${unit}`)
      : null;

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
        {expanded && (
          <div className="border-l ml-4 border-border/60">
            {group.items.map((it) => renderItemRow(it, true))}
          </div>
        )}
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
      {/* Una sola barra, no tres tarjetas: "37 SKUs" y "0 necesita OC" no
          justifican una tarjeta entera cada uno — feedback directo de que
          las tarjetas de KPI eran puro espacio vacío. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-primary/20 bg-card px-4 py-3">
        <div className="shrink-0">
          <p className="text-xs text-muted-foreground">Valor estimado de stock</p>
          <p className="text-2xl font-bold text-primary">{formatCLP(totalStockValue)}</p>
        </div>

        <div className="min-w-[180px] flex-1">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            {valueByFamily.map((f) => (
              <span key={f.key} className={familyStyle(f.key).bar} style={{ width: `${f.pct}%` }} title={`${f.label}: ${formatCLP(f.value)}`} />
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {valueByFamily.slice(0, 4).map((f) => (
              <span key={f.key} className="inline-flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${familyStyle(f.key).dot}`} />
                {f.label} {f.pct.toFixed(0)}%
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">{items.length} ítems</span>
          <span
            className={`rounded-full px-2.5 py-1 font-medium ${
              needsAction.length > 0 || criticalCoverageItems.length > 0
                ? 'bg-destructive/10 text-destructive'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {needsAction.length > 0 || criticalCoverageItems.length > 0 ? 'atención requerida' : 'al día, nada urgente'}
          </span>
          {needsAction.length > 0 && (
            <span className="rounded-full bg-destructive/10 px-2.5 py-1 font-medium text-destructive">
              {needsAction.length} bajo mínimo
            </span>
          )}
          {criticalCoverageItems.length > 0 && (
            <span
              className="rounded-full bg-destructive/10 px-2.5 py-1 font-medium text-destructive"
              title="Menos de 7 días de cobertura al ritmo real de consumo — aunque el mínimo estático diga que está bien"
            >
              {criticalCoverageItems.length} a punto de agotarse
            </span>
          )}
        </div>
      </div>

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
                    placeholder="Escanee/Busque por nombre, código, código de barras o QR"
                  />
                </div>

                <Button onClick={() => setShowItemDialog(true)} className="bg-primary hover:bg-primary/90">
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar ítem
                </Button>
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
