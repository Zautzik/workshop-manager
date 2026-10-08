'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, ChevronDown, Pencil, Trash2, Upload, Plus } from 'lucide-react';
import { formatCLP } from '@/lib/format';
import { CATEGORY_OPTIONS, MATERIAL_KIND_OPTIONS, STOCK_ORDER, familyStyle } from './constants';
import {
  splitVariant, normalizeBaseKey, specNumber, specUnit, parseWeight, inkColor, inkBrand, stockState,
} from './item-grouping';

export function ItemsTab({
  items,
  everReceivedIds,
  dailyConsumptionByItem,
  onEdit,
  onDelete,
  onImport,
  onAddItem,
}: {
  items: any[];
  everReceivedIds: Set<string>;
  dailyConsumptionByItem: Map<string, number>;
  onEdit: (item: any) => void;
  onDelete: (itemId: string) => void;
  onImport: () => void;
  onAddItem: () => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [materialFilter, setMaterialFilter] = useState<string>('all');
  const [scanSearch, setScanSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [collapsedFamilies, setCollapsedFamilies] = useState<Set<string>>(new Set());

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
      if (!map.has(key)) {
        const found = MATERIAL_KIND_OPTIONS.find((option) => option.value === key);
        map.set(key, { key, label: found?.label || (key ? key : 'Sin clasificar'), groups: [] });
      }
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
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(item)}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => onDelete(item.id)}>
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

  return (
    <div className="space-y-4">
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
          <Button variant="outline" onClick={onImport}>
            <Upload className="mr-2 h-4 w-4" />
            Importar Excel
          </Button>
          <Button onClick={onAddItem} className="bg-primary hover:bg-primary/90">
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
    </div>
  );
}
