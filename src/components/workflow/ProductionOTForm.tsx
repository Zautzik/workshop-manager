'use client';

import { useState, useCallback, useEffect, type ElementType } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  Plus,
  Trash2,
  FileText,
  Printer,
  Save,
  Eye,
  ChevronDown,
  ChevronUp,
  Package,
  Layers,
  Settings2,
  Scissors,
  UserCheck,
  LayoutGrid,
  DollarSign,
  CalendarDays,
} from 'lucide-react';
import type {
  OTProductionForm,
  OTTapa,
  OTPliego,
  OTItem,
} from '@/types/ot-production';
import {
  EMPTY_PRODUCTION_FORM,
  MACHINE_TYPES,
  PAYMENT_CATEGORIES,
  DIE_SHAPE_PATHS,
} from '@/types/ot-production';
import type { OTDieShapePreset } from '@/types/ot-production';
import { SUBSTRATE_TYPES, PRIORITY_LEVELS } from '@/types/ot';
import { generateProductionOTPDF } from '@/lib/ot-production-pdf';
import type { WorkCategoryKey } from '@/types/work-category';
import { WORK_CATEGORIES, CATEGORY_DEFAULTS } from '@/types/work-category';
import ProductionCostBreakdown from './ProductionCostBreakdown';

/* ================================================================ */
/*  Production OT Creation Form                                     */
/* ================================================================ */

interface ProductionOTFormProps {
  /** Initial form data (for editing existing OTs) */
  initialData?: Partial<OTProductionForm>;
  /** Work category selected in the pre-form step */
  workCategory?: WorkCategoryKey;
  /** Callback when form is saved/submitted */
  onSave?: (form: OTProductionForm) => void;
  /** Callback when form is cancelled */
  onCancel?: () => void;
}

/** Build initial form data from a work category */
function buildInitialForm(
  category?: WorkCategoryKey,
  initialData?: Partial<OTProductionForm>,
): OTProductionForm {
  const base = { ...EMPTY_PRODUCTION_FORM };

  if (category && CATEGORY_DEFAULTS[category]) {
    const d = CATEGORY_DEFAULTS[category];
    base.production_detail = {
      production_description: d.production_description,
      formato: d.formato,
      tapas_spec: d.tapas_spec,
      interior_spec: d.interior_spec,
      acabado: d.acabado,
    };
    base.items = [{
      id: crypto.randomUUID?.() ?? '1',
      item_number: 1,
      description: WORK_CATEGORIES.find((c) => c.key === category)?.label || '',
      a_imprimir: 0,
      papel: d.papel,
      grammage_grs: d.grammage_grs,
      sheet_width: d.sheet_width,
      sheet_height: d.sheet_height,
      hojas_sin_cortar: 0,
      pi_base: 0,
      pi_sobrante: 0,
      pliegos_a_maquina: 0,
      pliegos_count: d.pliegos_count,
    }];
    base.machine = {
      machine_type: d.machine_type as any,
      color_config: d.color_config,
      tiraje: 0,
      ctp_needed: d.machine_type !== 'impresion_digital',
      vb_pdf: false,
    };
    base.montaje = {
      ...base.montaje,
      montaje_grid: d.montaje_grid,
      corte_hoja: d.corte_hoja,
    };
    base.finishing = {
      corte_resma: d.corte_resma,
      corte_final: d.corte_final,
      doblados: d.doblados,
      corchetes: d.corchetes,
      cajas: d.cajas,
      despacho_gonsa: false,
    };
    base.process_summary = {
      description: d.process_summary,
    };
  }

  return { ...base, ...initialData };
}

export default function ProductionOTFormComponent({
  initialData,
  workCategory,
  onSave,
  onCancel,
}: ProductionOTFormProps) {
  const [form, setForm] = useState<OTProductionForm>(() =>
    buildInitialForm(workCategory, initialData),
  );
  const [activeTab, setActiveTab] = useState('header');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    header: true,
    production: true,
    tapas: true,
    items: true,
    montaje: true,
    machine: true,
    pliegos: true,
    finishing: true,
    admin: true,
    costs: true,
  });

  const categoryMeta = workCategory
    ? WORK_CATEGORIES.find((c) => c.key === workCategory)
    : undefined;

  /* ─── Calendar popover state ────────────────────────────── */
  const [fechaOTOpen, setFechaOTOpen] = useState(false);
  const [fechaEntregaOpen, setFechaEntregaOpen] = useState(false);

  /* ─── Update helpers ─────────────────────────────────────── */
  const updateField = useCallback(<K extends keyof OTProductionForm>(
    key: K,
    value: OTProductionForm[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateNested = useCallback(<
    K extends keyof OTProductionForm,
    NK extends keyof NonNullable<OTProductionForm[K]>
  >(
    key: K,
    nestedKey: NK,
    value: any
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: { ...(prev[key] as any), [nestedKey]: value },
    }));
  }, []);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  /* ─── Tapas CRUD ─────────────────────────────────────────── */
  const addTapa = () => {
    const codes = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nextCode = codes[form.tapas.length] || `T${form.tapas.length + 1}`;
    const newTapa: OTTapa = {
      id: crypto.randomUUID?.() ?? Date.now().toString(),
      code: nextCode,
      destination: '',
      quantity: 0,
    };
    updateField('tapas', [...form.tapas, newTapa]);
  };

  const updateTapa = (id: string, field: keyof OTTapa, value: any) => {
    updateField(
      'tapas',
      form.tapas.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  };

  const removeTapa = (id: string) => {
    updateField('tapas', form.tapas.filter((t) => t.id !== id));
  };

  /* ─── Pliegos CRUD ───────────────────────────────────────── */
  const addPliego = () => {
    const newPliego: OTPliego = {
      id: crypto.randomUUID?.() ?? Date.now().toString(),
      pliego_number: form.pliegos.length + 1,
      unid_pag: 4,
      tiro: 4,
      retiro: 1,
      description: '',
      tiraje: 0,
      sobrantes: 0,
      cantidad: 0,
    };
    updateField('pliegos', [...form.pliegos, newPliego]);
  };

  const updatePliego = (id: string, field: keyof OTPliego, value: any) => {
    updateField(
      'pliegos',
      form.pliegos.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const removePliego = (id: string) => {
    updateField('pliegos', form.pliegos.filter((p) => p.id !== id));
  };

  /* ─── Items CRUD ─────────────────────────────────────────── */
  const updateItem = (idx: number, field: keyof OTItem, value: any) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    updateField('items', items);
  };

  /* ─── PDF generation ─────────────────────────────────────── */
  const handleGeneratePDF = () => {
    generateProductionOTPDF(form);
  };

  /* ─── Save ───────────────────────────────────────────────── */
  const handleSave = () => {
    onSave?.(form);
  };

  /* ─── Section Header Component ───────────────────────────── */
  const SectionHeader = ({
    id,
    icon: Icon,
    title,
    subtitle,
  }: {
    id: string;
    icon: ElementType;
    title: string;
    subtitle?: string;
  }) => (
    <button
      type="button"
      onClick={() => toggleSection(id)}
      className="flex items-center justify-between w-full p-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
    >
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-blue-600" />
        <span className="font-semibold text-sm">{title}</span>
        {subtitle && (
          <span className="text-xs text-muted-foreground">— {subtitle}</span>
        )}
      </div>
      {expandedSections[id] ? (
        <ChevronUp className="h-4 w-4" />
      ) : (
        <ChevronDown className="h-4 w-4" />
      )}
    </button>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-4">
      {/* Top action bar */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Orden de Trabajo — Producción</h1>
            {categoryMeta && (
              <Badge
                className="text-sm px-3 py-1"
                style={{ backgroundColor: categoryMeta.color + '20', color: categoryMeta.color, border: `1px solid ${categoryMeta.color}40` }}
              >
                {categoryMeta.icon} {categoryMeta.label}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Formulario completo de producción para taller
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleGeneratePDF}>
            <Printer className="h-4 w-4 mr-1" />
            Imprimir / PDF
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Save className="h-4 w-4 mr-1" />
            Guardar OT
          </Button>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* ═══ SECTION 1: HEADER ═══ */}
      <Card>
        <SectionHeader id="header" icon={FileText} title="Encabezado" subtitle="Datos generales de la OT" />
        {expandedSections.header && (
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs font-bold">N° OT</Label>
                <Input
                  value={form.ot_number}
                  onChange={(e) => updateField('ot_number', e.target.value)}
                  placeholder="Ej: 40001"
                  className="font-bold text-lg"
                />
              </div>
              <div>
                <Label className="text-xs font-bold">OT Anterior</Label>
                <Input
                  value={form.ot_anterior || ''}
                  onChange={(e) => updateField('ot_anterior', e.target.value)}
                  placeholder="(opcional)"
                />
              </div>
              <div>
                <Label className="text-xs font-bold">Fecha OT</Label>
                <Popover open={fechaOTOpen} onOpenChange={setFechaOTOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal h-10',
                        !form.fecha_ot && 'text-muted-foreground'
                      )}
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {form.fecha_ot
                        ? format(new Date(form.fecha_ot + 'T12:00:00'), 'PPP', { locale: es })
                        : 'Seleccionar fecha...'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.fecha_ot ? new Date(form.fecha_ot + 'T12:00:00') : undefined}
                      onSelect={(date) => {
                        updateField('fecha_ot', date ? format(date, 'yyyy-MM-dd') : '');
                        setFechaOTOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs font-bold text-red-600">Fecha Entrega</Label>
                <Popover open={fechaEntregaOpen} onOpenChange={setFechaEntregaOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal h-10 border-red-300',
                        !form.fecha_entrega && 'text-muted-foreground'
                      )}
                    >
                      <CalendarDays className="mr-2 h-4 w-4 text-red-500" />
                      {form.fecha_entrega
                        ? format(new Date(form.fecha_entrega + 'T12:00:00'), 'PPP', { locale: es })
                        : 'Seleccionar fecha...'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.fecha_entrega ? new Date(form.fecha_entrega + 'T12:00:00') : undefined}
                      onSelect={(date) => {
                        updateField('fecha_entrega', date ? format(date, 'yyyy-MM-dd') : '');
                        setFechaEntregaOpen(false);
                      }}
                      disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold">Cliente</Label>
                <Input
                  value={form.client_name}
                  onChange={(e) => updateField('client_name', e.target.value)}
                  placeholder="Nombre del cliente"
                  className="font-semibold"
                />
              </div>
              <div>
                <Label className="text-xs font-bold">Trabajo</Label>
                <Input
                  value={form.trabajo}
                  onChange={(e) => updateField('trabajo', e.target.value)}
                  placeholder="Descripción del trabajo"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs font-bold">Cantidad Total</Label>
                <Input
                  type="number"
                  value={form.cantidad_total || ''}
                  onChange={(e) => updateField('cantidad_total', parseInt(e.target.value) || 0)}
                  placeholder="Ej: 5000"
                  className="font-bold text-lg"
                />
              </div>
              <div>
                <Label className="text-xs font-bold">Unidades</Label>
                <Input
                  value={form.unidades_label}
                  onChange={(e) => updateField('unidades_label', e.target.value)}
                  placeholder="UNIDADES"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs font-bold">Prioridad</Label>
                <Select
                  value={form.priority_level}
                  onValueChange={(v: any) => updateField('priority_level', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_LEVELS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ═══ SECTION 2: PRODUCTION DETAIL ═══ */}
      <Card>
        <SectionHeader id="production" icon={Package} title="Detalle de Producción" subtitle="Descripción técnica del producto" />
        {expandedSections.production && (
          <CardContent className="pt-4 space-y-4">
            <div>
              <Label className="text-xs font-bold">Descripción de Producción</Label>
              <Textarea
                value={form.production_detail.production_description}
                onChange={(e) => updateNested('production_detail', 'production_description', e.target.value)}
                placeholder="Descripción completa del producto para producción..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold">Formato</Label>
                <Input
                  value={form.production_detail.formato}
                  onChange={(e) => updateNested('production_detail', 'formato', e.target.value)}
                  placeholder="Ej: 21 x 29.7 cms cerrado"
                />
              </div>
              <div>
                <Label className="text-xs font-bold">Acabado</Label>
                <Input
                  value={form.production_detail.acabado || ''}
                  onChange={(e) => updateNested('production_detail', 'acabado', e.target.value)}
                  placeholder="Ej: Laminado / Doblado / Empaque"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold">Especificación Tapas</Label>
                <Input
                  value={form.production_detail.tapas_spec || ''}
                  onChange={(e) => updateNested('production_detail', 'tapas_spec', e.target.value)}
                  placeholder="Ej: Tapas 4/0 colores en Couché 250 grs"
                />
              </div>
              <div>
                <Label className="text-xs font-bold">Especificación Interior</Label>
                <Input
                  value={form.production_detail.interior_spec || ''}
                  onChange={(e) => updateNested('production_detail', 'interior_spec', e.target.value)}
                  placeholder="Ej: Interior 1/1 colores en Bond 75 grs"
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ═══ SECTION 3: TAPAS DISTRIBUTION ═══ */}
      <Card>
        <SectionHeader id="tapas" icon={Layers} title="Distribución de Tapas" subtitle="Variantes y destinos" />
        {expandedSections.tapas && (
          <CardContent className="pt-4 space-y-3">
            {form.tapas.map((tapa) => (
              <div key={tapa.id} className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <Badge variant="outline" className="font-bold text-lg px-3">
                  {tapa.code}
                </Badge>
                <Input
                  value={tapa.destination}
                  onChange={(e) => updateTapa(tapa.id, 'destination', e.target.value)}
                  placeholder="Destino / nombre"
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={tapa.quantity || ''}
                  onChange={(e) => updateTapa(tapa.id, 'quantity', parseInt(e.target.value) || 0)}
                  placeholder="Cantidad"
                  className="w-28"
                />
                <span className="text-xs text-muted-foreground">UNID.</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeTapa(tapa.id)}
                  className="h-8 w-8 text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addTapa}>
              <Plus className="h-4 w-4 mr-1" />
              Agregar Tapa
            </Button>
            {form.tapas.length > 0 && (
              <div className="text-sm text-muted-foreground">
                Total tapas: <strong>{form.tapas.reduce((s, t) => s + t.quantity, 0).toLocaleString()}</strong> unidades
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ═══ SECTION 4: ITEM SPECS ═══ */}
      <Card>
        <SectionHeader id="items" icon={LayoutGrid} title="Especificaciones del Item" subtitle="Papel, dimensiones, pliegos" />
        {expandedSections.items && (
          <CardContent className="pt-4 space-y-4">
            {form.items.map((item, idx) => (
              <div key={item.id} className="space-y-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge className="bg-blue-600">Item {item.item_number}</Badge>
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    placeholder="Descripción del item"
                    className="flex-1 font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">A Imprimir</Label>
                    <Input
                      type="number"
                      value={item.a_imprimir || ''}
                      onChange={(e) => updateItem(idx, 'a_imprimir', parseInt(e.target.value) || 0)}
                      placeholder="Cantidad"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Papel</Label>
                    <Select
                      value={typeof item.papel === 'string' ? item.papel : ''}
                      onValueChange={(v) => updateItem(idx, 'papel', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Tipo papel" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBSTRATE_TYPES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Gramaje (grs)</Label>
                    <Input
                      type="number"
                      value={item.grammage_grs || ''}
                      onChange={(e) => updateItem(idx, 'grammage_grs', parseInt(e.target.value) || 0)}
                      placeholder="140"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">N° Pliegos</Label>
                    <Input
                      type="number"
                      value={item.pliegos_count || ''}
                      onChange={(e) => updateItem(idx, 'pliegos_count', parseInt(e.target.value) || 0)}
                      placeholder="4"
                    />
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  <div>
                    <Label className="text-xs">Ancho</Label>
                    <Input
                      type="number"
                      value={item.sheet_width || ''}
                      onChange={(e) => updateItem(idx, 'sheet_width', parseFloat(e.target.value) || 0)}
                      placeholder="72"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Largo</Label>
                    <Input
                      type="number"
                      value={item.sheet_height || ''}
                      onChange={(e) => updateItem(idx, 'sheet_height', parseFloat(e.target.value) || 0)}
                      placeholder="102"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Hojas sin cortar</Label>
                    <Input
                      type="number"
                      value={item.hojas_sin_cortar || ''}
                      onChange={(e) => updateItem(idx, 'hojas_sin_cortar', parseInt(e.target.value) || 0)}
                      placeholder="842"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Pi/Base</Label>
                    <Input
                      type="number"
                      value={item.pi_base || ''}
                      onChange={(e) => updateItem(idx, 'pi_base', parseInt(e.target.value) || 0)}
                      placeholder="3250"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Pi/Sobrante</Label>
                    <Input
                      type="number"
                      value={item.pi_sobrante || ''}
                      onChange={(e) => updateItem(idx, 'pi_sobrante', parseInt(e.target.value) || 0)}
                      placeholder="120"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Pliegos a Máq.</Label>
                    <Input
                      type="number"
                      value={item.pliegos_a_maquina || ''}
                      onChange={(e) => updateItem(idx, 'pliegos_a_maquina', parseInt(e.target.value) || 0)}
                      placeholder="3370"
                    />
                  </div>
                </div>

                {/* ── Die-cut shape selector ── */}
                <Separator />
                <div>
                  <Label className="text-xs font-semibold flex items-center gap-1">
                    <Scissors className="h-3 w-3" /> Forma de Troquel / Corte
                  </Label>
                  <p className="text-[10px] text-muted-foreground mb-2">
                    Seleccione la forma del corte para el diagrama de montaje. Los operarios de guillotina y troquel verán esta silueta.
                  </p>
                  <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-11 gap-1.5">
                    {(Object.keys(DIE_SHAPE_PATHS) as OTDieShapePreset[]).map((shape) => {
                      const isActive = (item.die_shape || 'rectangle') === shape;
                      const path = DIE_SHAPE_PATHS[shape];
                      return (
                        <button
                          key={shape}
                          type="button"
                          onClick={() => updateItem(idx, 'die_shape', shape)}
                          className={cn(
                            'relative border rounded-md p-1.5 transition-all cursor-pointer',
                            'hover:border-primary hover:bg-primary/5',
                            isActive ? 'border-primary ring-2 ring-primary/30 bg-primary/10' : 'border-muted',
                          )}
                          title={shape.charAt(0).toUpperCase() + shape.slice(1).replace(/_/g, ' ')}
                        >
                          <svg viewBox="-5 -5 110 110" className="w-full h-8">
                            <path d={path} fill={isActive ? 'rgba(59,130,246,0.15)' : '#f5f5f5'} stroke={isActive ? '#2563eb' : '#888'} strokeWidth="2" />
                          </svg>
                          <div className="text-[7px] text-center leading-tight mt-0.5 truncate">
                            {shape === 'rectangle' ? 'Rect.' :
                             shape === 'rounded' ? 'Redond.' :
                             shape === 'circle' ? 'Círculo' :
                             shape === 'oval' ? 'Óvalo' :
                             shape === 'wavy' ? 'Ondulado' :
                             shape === 'arch_top' ? 'Arco' :
                             shape === 'label' ? 'Etiqueta' :
                             shape === 'heart' ? 'Corazón' :
                             shape === 'star' ? 'Estrella' :
                             shape === 'scalloped' ? 'Festón' :
                             shape}
                          </div>
                        </button>
                      );
                    })}
                    {/* Custom SVG path option */}
                    <button
                      type="button"
                      onClick={() => updateItem(idx, 'die_shape', 'custom')}
                      className={cn(
                        'relative border rounded-md p-1.5 transition-all cursor-pointer',
                        'hover:border-primary hover:bg-primary/5',
                        item.die_shape === 'custom' ? 'border-primary ring-2 ring-primary/30 bg-primary/10' : 'border-muted',
                      )}
                      title="Forma personalizada (SVG path)"
                    >
                      <svg viewBox="-5 -5 110 110" className="w-full h-8">
                        <text x="50" y="55" textAnchor="middle" fontSize="28" fill="#888">✎</text>
                      </svg>
                      <div className="text-[7px] text-center leading-tight mt-0.5">Personalizado</div>
                    </button>
                  </div>

                  {/* Custom path input (only when 'custom' is selected) */}
                  {item.die_shape === 'custom' && (
                    <div className="mt-3 space-y-2">
                      <div>
                        <Label className="text-xs">Etiqueta del troquel</Label>
                        <Input
                          value={item.die_shape_label || ''}
                          onChange={(e) => updateItem(idx, 'die_shape_label', e.target.value)}
                          placeholder="Ej: Troquel ondulado especial"
                          className="text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">SVG Path (coordenadas 0-100 × 0-100)</Label>
                        <Textarea
                          value={item.die_shape_path || ''}
                          onChange={(e) => updateItem(idx, 'die_shape_path', e.target.value)}
                          placeholder="M 0 0 L 100 0 Q 100 50 80 50 Q 100 50 100 100 L 0 100 Z"
                          rows={3}
                          className="text-xs font-mono"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Coordenadas normalizadas 0–100. Se escalará al tamaño real de la página en el montaje.
                        </p>
                      </div>
                      {/* Live preview */}
                      {item.die_shape_path && (
                        <div className="border rounded p-2 bg-muted/30">
                          <p className="text-[10px] font-semibold mb-1">Vista previa:</p>
                          <svg viewBox="-5 -5 110 110" className="w-24 h-24 mx-auto">
                            <path d={item.die_shape_path} fill="rgba(59,130,246,0.1)" stroke="#2563eb" strokeWidth="1.5" />
                          </svg>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      {/* ═══ SECTION 5: MONTAJE ═══ */}
      <Card>
        <SectionHeader id="montaje" icon={LayoutGrid} title="Montaje / Imposición" subtitle="Layout de página en pliego" />
        {expandedSections.montaje && (
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Páginas Total</Label>
                <Input
                  type="number"
                  value={form.montaje.paginas_total || ''}
                  onChange={(e) => updateNested('montaje', 'paginas_total', parseInt(e.target.value) || 0)}
                  placeholder="2"
                />
              </div>
              <div>
                <Label className="text-xs">Forma Extensión</Label>
                <Input
                  value={form.montaje.forma_extension}
                  onChange={(e) => updateNested('montaje', 'forma_extension', e.target.value)}
                  placeholder="21.5 x 32"
                />
              </div>
              <div>
                <Label className="text-xs">Montaje Grid</Label>
                <Input
                  value={form.montaje.montaje_grid}
                  onChange={(e) => updateNested('montaje', 'montaje_grid', e.target.value)}
                  placeholder="1 x 2"
                />
              </div>
              <div>
                <Label className="text-xs">Pliego a Máquina</Label>
                <Input
                  value={form.montaje.pliego_a_maquina}
                  onChange={(e) => updateNested('montaje', 'pliego_a_maquina', e.target.value)}
                  placeholder="33 x 48"
                />
              </div>
              <div>
                <Label className="text-xs">Pinza (cm)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.montaje.pinza_cm || ''}
                  onChange={(e) => updateNested('montaje', 'pinza_cm', parseFloat(e.target.value) || 0)}
                  placeholder="0.8"
                />
              </div>
              <div>
                <Label className="text-xs">Corte de Hoja</Label>
                <Input
                  value={form.montaje.corte_hoja}
                  onChange={(e) => updateNested('montaje', 'corte_hoja', e.target.value)}
                  placeholder="1/4 Normal"
                />
              </div>
              <div>
                <Label className="text-xs">Montaje Páginas</Label>
                <Input
                  type="number"
                  value={form.montaje.montaje_paginas || ''}
                  onChange={(e) => updateNested('montaje', 'montaje_paginas', parseInt(e.target.value) || 0)}
                  placeholder="2"
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ═══ SECTION 6: MACHINE / PRINT ═══ */}
      <Card>
        <SectionHeader id="machine" icon={Settings2} title="Máquina / Impresión" subtitle="Configuración de prensa" />
        {expandedSections.machine && (
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs">Máquina</Label>
                <Select
                  value={form.machine.machine_type}
                  onValueChange={(v: any) => updateNested('machine', 'machine_type', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MACHINE_TYPES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Color (Tiro/Retiro)</Label>
                <Input
                  value={form.machine.color_config}
                  onChange={(e) => updateNested('machine', 'color_config', e.target.value)}
                  placeholder="4/4"
                />
              </div>
              <div>
                <Label className="text-xs">Horas est.</Label>
                <Input
                  type="number"
                  value={form.machine.horas || ''}
                  onChange={(e) => updateNested('machine', 'horas', parseFloat(e.target.value) || undefined)}
                  placeholder="—"
                />
              </div>
              <div>
                <Label className="text-xs">Tiraje</Label>
                <Input
                  type="number"
                  value={form.machine.tiraje || ''}
                  onChange={(e) => updateNested('machine', 'tiraje', parseInt(e.target.value) || 0)}
                  placeholder="3370"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.machine.ctp_needed}
                  onCheckedChange={(c) => updateNested('machine', 'ctp_needed', !!c)}
                />
                <Label className="text-xs">CTP necesario</Label>
              </div>
              {form.machine.ctp_needed && (
                <div>
                  <Label className="text-xs">N° planchas CTP</Label>
                  <Input
                    type="number"
                    value={form.machine.ctp_count || ''}
                    onChange={(e) => updateNested('machine', 'ctp_count', parseInt(e.target.value) || 0)}
                    placeholder="4"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.machine.vb_pdf}
                  onCheckedChange={(c) => updateNested('machine', 'vb_pdf', !!c)}
                />
                <Label className="text-xs">V°B° PDF aprobado</Label>
              </div>
              <div>
                <Label className="text-xs">Colores especiales</Label>
                <Input
                  value={form.machine.colores_especiales || ''}
                  onChange={(e) => updateNested('machine', 'colores_especiales', e.target.value)}
                  placeholder="(ninguno)"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold">Resumen de Procesos</Label>
              <Input
                value={form.process_summary.description}
                onChange={(e) => updateNested('process_summary', 'description', e.target.value)}
                placeholder="Descripción de procesos (se genera automáticamente)"
                className="font-semibold uppercase"
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* ═══ SECTION 7: PLIEGOS TABLE ═══ */}
      <Card>
        <SectionHeader id="pliegos" icon={Layers} title="Detalle de Pliegos" subtitle="Tiraje por pliego" />
        {expandedSections.pliegos && (
          <CardContent className="pt-4 space-y-3">
            {/* Table header */}
            {form.pliegos.length > 0 && (
              <div className="grid grid-cols-9 gap-1 text-[10px] font-bold uppercase text-muted-foreground px-1">
                <span>Pliego</span>
                <span>Unid/Pag</span>
                <span>Tiro</span>
                <span>Retiro</span>
                <span className="col-span-2">Descripción</span>
                <span>Tiraje</span>
                <span>Sobrantes</span>
                <span>Cantidad</span>
              </div>
            )}

            {form.pliegos.map((pliego) => (
              <div
                key={pliego.id}
                className="grid grid-cols-9 gap-1 items-center p-1 bg-slate-50 dark:bg-slate-800 rounded"
              >
                <Input
                  type="number"
                  value={pliego.pliego_number}
                  onChange={(e) => updatePliego(pliego.id, 'pliego_number', parseInt(e.target.value) || 0)}
                  className="h-8 text-center text-xs"
                />
                <Input
                  type="number"
                  value={pliego.unid_pag}
                  onChange={(e) => updatePliego(pliego.id, 'unid_pag', parseInt(e.target.value) || 0)}
                  className="h-8 text-center text-xs"
                />
                <Input
                  type="number"
                  value={pliego.tiro}
                  onChange={(e) => updatePliego(pliego.id, 'tiro', parseInt(e.target.value) || 0)}
                  className="h-8 text-center text-xs"
                />
                <Input
                  type="number"
                  value={pliego.retiro}
                  onChange={(e) => updatePliego(pliego.id, 'retiro', parseInt(e.target.value) || 0)}
                  className="h-8 text-center text-xs"
                />
                <Input
                  value={pliego.description}
                  onChange={(e) => updatePliego(pliego.id, 'description', e.target.value)}
                  placeholder="TAPAS A"
                  className="h-8 text-xs col-span-2"
                />
                <Input
                  type="number"
                  value={pliego.tiraje || ''}
                  onChange={(e) => updatePliego(pliego.id, 'tiraje', parseInt(e.target.value) || 0)}
                  className="h-8 text-center text-xs"
                />
                <Input
                  type="number"
                  value={pliego.sobrantes || ''}
                  onChange={(e) => updatePliego(pliego.id, 'sobrantes', parseInt(e.target.value) || 0)}
                  className="h-8 text-center text-xs"
                />
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={pliego.cantidad || ''}
                    onChange={(e) => updatePliego(pliego.id, 'cantidad', parseInt(e.target.value) || 0)}
                    className="h-8 text-center text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-500"
                    onClick={() => removePliego(pliego.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}

            <Button variant="outline" size="sm" onClick={addPliego}>
              <Plus className="h-4 w-4 mr-1" />
              Agregar Pliego
            </Button>
          </CardContent>
        )}
      </Card>

      {/* ═══ SECTION 8: FINISHING ═══ */}
      <Card>
        <SectionHeader id="finishing" icon={Scissors} title="Encuadernación y Terminación" subtitle="Procesos de acabado" />
        {expandedSections.finishing && (
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {([
                { key: 'corte_resma' as const, label: 'Corte Resma', qtyKey: 'corte_resma_qty' as const },
                { key: 'corte_final' as const, label: 'Corte Final', qtyKey: 'corte_final_qty' as const },
                { key: 'doblados' as const, label: 'Doblados', qtyKey: 'doblados_qty' as const },
                { key: 'corchetes' as const, label: 'Corchetes', qtyKey: 'corchetes_qty' as const },
                { key: 'cajas' as const, label: 'Cajas', qtyKey: 'cajas_qty' as const },
              ]).map(({ key, label, qtyKey }) => (
                <div key={key} className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-800 rounded">
                  <Checkbox
                    checked={form.finishing[key]}
                    onCheckedChange={(c) => updateNested('finishing', key, !!c)}
                  />
                  <Label className="text-xs flex-1">{label}</Label>
                  {form.finishing[key] && (
                    <Input
                      type="number"
                      value={(form.finishing as any)[qtyKey] || ''}
                      onChange={(e) => updateNested('finishing', qtyKey, parseFloat(e.target.value) || 0)}
                      placeholder="Cant."
                      className="w-20 h-7 text-xs"
                    />
                  )}
                </div>
              ))}
              <div className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-800 rounded">
                <Checkbox
                  checked={form.finishing.despacho_gonsa}
                  onCheckedChange={(c) => updateNested('finishing', 'despacho_gonsa', !!c)}
                />
                <Label className="text-xs flex-1">Despacho GONSA</Label>
                {form.finishing.despacho_gonsa && (
                  <Input
                    value={form.finishing.despacho_gonsa_detail || ''}
                    onChange={(e) => updateNested('finishing', 'despacho_gonsa_detail', e.target.value)}
                    placeholder="Detalle"
                    className="w-28 h-7 text-xs"
                  />
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs">Otros procesos</Label>
              <Input
                value={form.finishing.otros || ''}
                onChange={(e) => updateNested('finishing', 'otros', e.target.value)}
                placeholder="Procesos adicionales..."
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* ═══ SECTION 9: ADMIN FOOTER ═══ */}
      <Card>
        <SectionHeader id="admin" icon={UserCheck} title="Datos Administrativos" subtitle="Solicitante, vendedor, pago" />
        {expandedSections.admin && (
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold">Solicitante</Label>
                <Input
                  value={form.admin.solicitante}
                  onChange={(e) => updateNested('admin', 'solicitante', e.target.value)}
                  placeholder="Nombre del solicitante"
                />
              </div>
              <div>
                <Label className="text-xs font-bold">Vendedor</Label>
                <Input
                  value={form.admin.vendedor}
                  onChange={(e) => updateNested('admin', 'vendedor', e.target.value)}
                  placeholder="Nombre del vendedor"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs">Teléfono</Label>
                <Input
                  value={form.admin.telefono || ''}
                  onChange={(e) => updateNested('admin', 'telefono', e.target.value)}
                  placeholder="+56 9 xxxx xxxx"
                />
              </div>
              <div>
                <Label className="text-xs">RUT</Label>
                <Input
                  value={form.admin.rut || ''}
                  onChange={(e) => updateNested('admin', 'rut', e.target.value)}
                  placeholder="12.345.678-9"
                />
              </div>
              <div>
                <Label className="text-xs">Presupuesto N°</Label>
                <Input
                  value={form.admin.presupuesto_numero || ''}
                  onChange={(e) => updateNested('admin', 'presupuesto_numero', e.target.value)}
                  placeholder="N° presupuesto"
                />
              </div>
              <div>
                <Label className="text-xs">O. Compra</Label>
                <Input
                  value={form.admin.orden_compra || ''}
                  onChange={(e) => updateNested('admin', 'orden_compra', e.target.value)}
                  placeholder="(opcional)"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold">Categoría de Pago</Label>
                <Select
                  value={form.admin.categoria_pago}
                  onValueChange={(v) => updateNested('admin', 'categoria_pago', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_CATEGORIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Originales vía</Label>
                <Input
                  value={form.admin.originales_via || ''}
                  onChange={(e) => updateNested('admin', 'originales_via', e.target.value)}
                  placeholder="Originales x Mail"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Notas para Producción y Observaciones</Label>
              <Textarea
                value={form.admin.notas_produccion || ''}
                onChange={(e) => updateNested('admin', 'notas_produccion', e.target.value)}
                placeholder="Notas adicionales para producción..."
                rows={3}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* ═══ SECTION 10: COST BREAKDOWN ═══ */}
      <Card>
        <SectionHeader id="costs" icon={DollarSign} title="Desglose de Costos" subtitle="Costos estimados de producción" />
        {expandedSections.costs && (
          <CardContent className="pt-4">
            <ProductionCostBreakdown form={form} />
          </CardContent>
        )}
      </Card>

      {/* ═══ BOTTOM ACTION BAR ═══ */}
      <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border rounded-lg sticky bottom-4 shadow-lg">
        <div className="text-sm text-muted-foreground">
          OT <strong>{form.ot_number || '—'}</strong> · {form.client_name || 'Sin cliente'} · {form.cantidad_total?.toLocaleString() || 0} {form.unidades_label}
          {categoryMeta && (
            <span className="ml-2">· {categoryMeta.icon} {categoryMeta.label}</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleGeneratePDF}>
            <Printer className="h-4 w-4 mr-1" />
            Generar PDF
          </Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-1" />
            Guardar OT
          </Button>
        </div>
      </div>
    </div>
  );
}
