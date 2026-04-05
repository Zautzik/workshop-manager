'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Plus,
  Edit2,
  Trash2,
  Save,
  Search,
  DollarSign,
  Settings,
  BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';
import type { CostCenterItem, CostCategory } from '@/types/work-category';
import {
  COST_CATEGORIES,
  DEFAULT_COST_CENTER,
} from '@/types/work-category';

/* ================================================================ */
/*  Cost Center Management — Financial Report admin tab              */
/* ================================================================ */

const STORAGE_KEY = 'workshop_cost_center';

function loadCostCenter(): CostCenterItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [...DEFAULT_COST_CENTER];
}

function saveCostCenter(items: CostCenterItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function CostCenterManager() {
  const [items, setItems] = useState<CostCenterItem[]>(loadCostCenter);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<CostCategory | 'all'>('all');
  const [editingItem, setEditingItem] = useState<CostCenterItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  /* ─── Filtered + grouped list ─────────────────────────────── */
  const filtered = useMemo(() => {
    let list = items;
    if (filterCategory !== 'all') {
      list = list.filter((i) => i.category === filterCategory);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) => i.name.toLowerCase().includes(q) || i.category.includes(q),
      );
    }
    return list;
  }, [items, filterCategory, search]);

  const grouped = useMemo(() => {
    const map = new Map<CostCategory, CostCenterItem[]>();
    for (const item of filtered) {
      const existing = map.get(item.category) ?? [];
      existing.push(item);
      map.set(item.category, existing);
    }
    return map;
  }, [filtered]);

  /* ─── CRUD operations ─────────────────────────────────────── */
  const handleSave = (item: CostCenterItem) => {
    let updated: CostCenterItem[];
    const existing = items.find((i) => i.id === item.id);
    if (existing) {
      updated = items.map((i) => (i.id === item.id ? item : i));
    } else {
      updated = [...items, item];
    }
    setItems(updated);
    saveCostCenter(updated);
    setIsDialogOpen(false);
    setEditingItem(null);
    toast.success(existing ? 'Costo actualizado' : 'Costo agregado');
  };

  const handleDelete = (id: string) => {
    const updated = items.filter((i) => i.id !== id);
    setItems(updated);
    saveCostCenter(updated);
    toast.success('Costo eliminado');
  };

  const handleToggle = (id: string, active: boolean) => {
    const updated = items.map((i) => (i.id === id ? { ...i, is_active: active } : i));
    setItems(updated);
    saveCostCenter(updated);
  };

  const handleResetDefaults = () => {
    const defaults = [...DEFAULT_COST_CENTER];
    setItems(defaults);
    saveCostCenter(defaults);
    toast.success('Costos restablecidos a valores predeterminados');
  };

  /* ─── Summary stats ───────────────────────────────────────── */
  const totalActive = items.filter((i) => i.is_active).length;
  const totalInactive = items.filter((i) => !i.is_active).length;
  const avgCostByCategory = useMemo(() => {
    const catTotals: Record<string, { sum: number; count: number }> = {};
    for (const item of items.filter((i) => i.is_active)) {
      if (!catTotals[item.category]) catTotals[item.category] = { sum: 0, count: 0 };
      catTotals[item.category].sum += item.unit_cost;
      catTotals[item.category].count += 1;
    }
    return catTotals;
  }, [items]);

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{items.length}</div>
            <p className="text-xs text-muted-foreground">
              {totalActive} activos · {totalInactive} inactivos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Categorías</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{new Set(items.map((i) => i.category)).size}</div>
            <p className="text-xs text-muted-foreground">centros de costo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Costo Promedio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${Math.round(
                items.filter((i) => i.is_active && i.unit !== '%').reduce((s, i) => s + i.unit_cost, 0) /
                  Math.max(items.filter((i) => i.is_active && i.unit !== '%').length, 1),
              ).toLocaleString('es-CL')}
            </div>
            <p className="text-xs text-muted-foreground">por unidad (excl. %)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Overhead</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {items.find((i) => i.category === 'overhead' && i.is_active)?.unit_cost ?? 0}%
            </div>
            <p className="text-xs text-muted-foreground">gastos generales</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o categoría..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={filterCategory}
          onValueChange={(v) => setFilterCategory(v as CostCategory | 'all')}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Todas las categorías" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {COST_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.icon} {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setEditingItem(null);
                setIsDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Agregar Costo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Editar' : 'Agregar'} Centro de Costo</DialogTitle>
              <DialogDescription>
                {editingItem ? 'Modifica los datos del centro de costo.' : 'Define un nuevo centro de costo para el taller.'}
              </DialogDescription>
            </DialogHeader>
            <CostItemForm
              initial={editingItem}
              onSave={handleSave}
              onCancel={() => {
                setIsDialogOpen(false);
                setEditingItem(null);
              }}
            />
          </DialogContent>
        </Dialog>

        <Button variant="outline" size="sm" onClick={handleResetDefaults}>
          <Settings className="h-4 w-4 mr-1" />
          Restablecer
        </Button>
      </div>

      {/* ── Cost Items by Category ────────────────────────────── */}
      {Array.from(grouped.entries()).map(([category, catItems]) => {
        const catMeta = COST_CATEGORIES.find((c) => c.value === category);
        const catTotal = catItems.filter((i) => i.is_active).reduce((s, i) => s + i.unit_cost, 0);

        return (
          <Card key={category}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span>{catMeta?.icon}</span>
                  <span style={{ color: catMeta?.color }}>{catMeta?.label || category}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {catItems.length} items
                  </Badge>
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1">
                {/* Table header */}
                <div className="grid grid-cols-12 gap-2 text-[10px] font-bold uppercase text-muted-foreground px-2 pb-1">
                  <span className="col-span-1">Estado</span>
                  <span className="col-span-4">Nombre</span>
                  <span className="col-span-2">Unidad</span>
                  <span className="col-span-2 text-right">Costo Unit.</span>
                  <span className="col-span-1 text-right">Notas</span>
                  <span className="col-span-2 text-right">Acciones</span>
                </div>

                <Separator />

                {catItems.map((item) => (
                  <div
                    key={item.id}
                    className={`grid grid-cols-12 gap-2 items-center px-2 py-1.5 rounded text-sm transition-colors ${
                      item.is_active
                        ? 'hover:bg-muted/50'
                        : 'opacity-50 bg-muted/20'
                    }`}
                  >
                    <div className="col-span-1">
                      <Switch
                        checked={item.is_active}
                        onCheckedChange={(v) => handleToggle(item.id, v)}
                      />
                    </div>
                    <div className="col-span-4 font-medium truncate">
                      {item.name}
                    </div>
                    <div className="col-span-2 text-muted-foreground text-xs">
                      {item.unit}
                    </div>
                    <div className="col-span-2 text-right font-bold tabular-nums">
                      {item.unit === '%'
                        ? `${item.unit_cost}%`
                        : `$${item.unit_cost.toLocaleString('es-CL')}`}
                    </div>
                    <div className="col-span-1 text-right text-[10px] text-muted-foreground truncate">
                      {item.notes || '—'}
                    </div>
                    <div className="col-span-2 flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingItem(item);
                          setIsDialogOpen(true);
                        }}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No se encontraron centros de costo.</p>
        </div>
      )}
    </div>
  );
}

/* ─── Cost Item Edit/Create Form ─────────────────────────────── */

function CostItemForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: CostCenterItem | null;
  onSave: (item: CostCenterItem) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<CostCenterItem>(
    initial ?? {
      id: crypto.randomUUID?.() ?? Date.now().toString(),
      name: '',
      category: 'papel',
      unit: 'kg',
      unit_cost: 0,
      is_active: true,
      notes: '',
    },
  );

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    onSave(form);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Nombre</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Ej: Couché 170 grs, Tinta Pantone, Offset 4 Colores..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Categoría</Label>
          <Select
            value={form.category}
            onValueChange={(v) => setForm({ ...form, category: v as CostCategory })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COST_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.icon} {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Unidad de medida</Label>
          <Select
            value={form.unit}
            onValueChange={(v) => setForm({ ...form, unit: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="kg">kg</SelectItem>
              <SelectItem value="und">und</SelectItem>
              <SelectItem value="hrs">hrs</SelectItem>
              <SelectItem value="pliego">pliego</SelectItem>
              <SelectItem value="click">click</SelectItem>
              <SelectItem value="mt">mt</SelectItem>
              <SelectItem value="lt">lt</SelectItem>
              <SelectItem value="%">%</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>
          {form.unit === '%' ? 'Porcentaje (%)' : 'Costo por unidad ($CLP)'}
        </Label>
        <Input
          type="number"
          value={form.unit_cost || ''}
          onChange={(e) => setForm({ ...form, unit_cost: parseFloat(e.target.value) || 0 })}
          placeholder={form.unit === '%' ? '8' : '1500'}
        />
      </div>

      <div>
        <Label>Notas (opcional)</Label>
        <Input
          value={form.notes || ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Notas adicionales..."
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={form.is_active}
          onCheckedChange={(v) => setForm({ ...form, is_active: v })}
        />
        <Label className="text-sm">Activo</Label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit}>
          <Save className="h-4 w-4 mr-1" />
          Guardar
        </Button>
      </div>
    </div>
  );
}
