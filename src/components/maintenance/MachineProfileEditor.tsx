'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  useUpsertMachine,
  useMachineSupplies,
  useUpsertMachineSupply,
  useDeleteMachineSupply,
  useMachineCostEntries,
  useUpsertMachineCost,
  MACHINE_TYPE_LABELS,
  MACHINE_STATUS_LABELS,
  type Machine,
  type MachineType,
  type MachineStatus,
} from '@/hooks/use-machines';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Cpu, Zap, Package, DollarSign, Settings, Plus, Trash2, AlertTriangle, Gauge, Scan } from 'lucide-react';
import {
  MACHINE_USAGE_UNIT_VALUES,
  USAGE_UNIT_LABEL,
  defaultUsageUnitFor,
  type MachineUsageUnit,
} from '@/types/machine-usage-unit';
import {
  MACHINE_CONSUMPTION_MODE_VALUES,
  MACHINE_CONSUMPTION_MODE_LABEL,
  MACHINE_CONSUMPTION_MODE_HINT,
  type MachineConsumptionMode,
} from '@/types/machine-consumption-mode';

interface Props {
  machine?: Machine | null;
  onSaved?: (machine: Machine) => void;
  onCancel?: () => void;
}

const MACHINE_TYPES = Object.entries(MACHINE_TYPE_LABELS) as [MachineType, string][];
const MACHINE_STATUSES = Object.entries(MACHINE_STATUS_LABELS) as [MachineStatus, string][];

export function MachineProfileEditor({ machine, onSaved, onCancel }: Props) {
  const { toast } = useToast();
  const upsert = useUpsertMachine();
  const { data: supplies = [] } = useMachineSupplies(machine?.id);
  const upsertSupply = useUpsertMachineSupply();
  const deleteSupply = useDeleteMachineSupply();
  const { data: costEntries = [] } = useMachineCostEntries(machine?.id);
  const upsertCost = useUpsertMachineCost();

  // Inventory items for supply selector
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventory_items_for_machine'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('id, name, unit, category')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { register, handleSubmit, setValue, watch, formState: { errors, isDirty } } = useForm<Machine>({
    defaultValues: machine ?? {
      name: '',
      type: 'offset_printer',
      status: 'idle',
      is_active: true,
      colors: 1,
    } as any,
  });

  const [newSupply, setNewSupply] = useState({ inventory_item_id: '', consumption_rate: 0, rate_unit: 'per_1000_sheets', is_critical: false, notes: '' });
  const [newCost, setNewCost] = useState({ period_month: '', energy_kwh: '', energy_cost: '', maintenance_cost: '', supplies_cost: '', other_cost: '', notes: '' });

  const onSubmit = async (values: Machine) => {
    try {
      const saved = await upsert.mutateAsync({ ...values, id: machine?.id });
      toast({ title: machine ? 'Máquina actualizada' : 'Máquina creada', description: saved.name });
      onSaved?.(saved as Machine);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const addSupply = async () => {
    if (!machine?.id || !newSupply.inventory_item_id) return;
    try {
      await upsertSupply.mutateAsync({ machine_id: machine.id, ...newSupply, consumption_rate: Number(newSupply.consumption_rate) });
      setNewSupply({ inventory_item_id: '', consumption_rate: 0, rate_unit: 'per_1000_sheets', is_critical: false, notes: '' });
      toast({ title: 'Insumo añadido' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const removeSupply = async (id: string) => {
    if (!machine?.id) return;
    await deleteSupply.mutateAsync({ id, machineId: machine.id });
  };

  const addCost = async () => {
    if (!machine?.id || !newCost.period_month) return;
    try {
      await upsertCost.mutateAsync({
        machine_id: machine.id,
        period_month: newCost.period_month + '-01',
        energy_kwh: newCost.energy_kwh ? Number(newCost.energy_kwh) : null,
        energy_cost: newCost.energy_cost ? Number(newCost.energy_cost) : null,
        maintenance_cost: newCost.maintenance_cost ? Number(newCost.maintenance_cost) : null,
        supplies_cost: newCost.supplies_cost ? Number(newCost.supplies_cost) : null,
        other_cost: newCost.other_cost ? Number(newCost.other_cost) : null,
        notes: newCost.notes || null,
      });
      setNewCost({ period_month: '', energy_kwh: '', energy_cost: '', maintenance_cost: '', supplies_cost: '', other_cost: '', notes: '' });
      toast({ title: 'Costo registrado' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const Field = ({ label, id, children }: { label: string; id: string; children: React.ReactNode }) => (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );

  return (
    <div className="space-y-2">
      <Tabs defaultValue="identity">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="identity" className="gap-1 text-xs"><Cpu className="h-3 w-3" />Identidad</TabsTrigger>
          <TabsTrigger value="productivity" className="gap-1 text-xs"><Settings className="h-3 w-3" />Productividad</TabsTrigger>
          <TabsTrigger value="supplies" className="gap-1 text-xs"><Package className="h-3 w-3" />Insumos</TabsTrigger>
          <TabsTrigger value="costs" className="gap-1 text-xs"><DollarSign className="h-3 w-3" />Costos</TabsTrigger>
        </TabsList>

        {/* ── IDENTITY ─────────────────────────────────── */}
        <TabsContent value="identity">
          <form id="machine-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-3">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nombre *" id="name">
                <Input id="name" {...register('name', { required: true })} placeholder="Ej: Ryobi 524GS #1" />
              </Field>
              <Field label="Tipo *" id="type">
                <Select defaultValue={machine?.type ?? 'offset_printer'} onValueChange={v => setValue('type', v as MachineType, { shouldDirty: true })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MACHINE_TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Marca" id="brand">
                <Input id="brand" {...register('brand')} placeholder="Ej: Ryobi" />
              </Field>
              <Field label="Modelo" id="model">
                <Input id="model" {...register('model')} placeholder="Ej: 524GS" />
              </Field>
              <Field label="N° de Serie" id="serial_number">
                <Input id="serial_number" {...register('serial_number')} />
              </Field>
              <Field label="Año" id="year_manufactured">
                <Input id="year_manufactured" type="number" {...register('year_manufactured', { valueAsNumber: true })} placeholder="Ej: 2015" />
              </Field>
              <Field label="Ubicación en planta" id="location">
                <Input id="location" {...register('location')} placeholder="Ej: Nave A – Puesto 2" />
              </Field>
              <Field label="Estado" id="status">
                <Select defaultValue={machine?.status ?? 'idle'} onValueChange={v => setValue('status', v as MachineStatus, { shouldDirty: true })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MACHINE_STATUSES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Descripción / Observaciones" id="description">
              <Textarea id="description" {...register('description')} rows={3} placeholder="Características especiales, historial de compra, etc." />
            </Field>
            <div className="flex items-center gap-3">
              <Switch id="is_active" checked={watch('is_active')} onCheckedChange={v => setValue('is_active', v, { shouldDirty: true })} />
              <Label htmlFor="is_active">Máquina activa (visible en Planta)</Label>
            </div>
          </form>
        </TabsContent>

        {/* ── PRODUCTIVITY ─────────────────────────────── */}
        <TabsContent value="productivity">
          <form id="machine-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-3">
            <p className="text-xs text-muted-foreground">Parámetros operativos que alimentan los cálculos de tiempo y costo en las OTs.</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Velocidad nominal (hojas/hr)" id="nominal_speed">
                <Input id="nominal_speed" type="number" {...register('nominal_speed_sheets_hr', { valueAsNumber: true })} placeholder="Ej: 6000" />
              </Field>
              <Field label="Velocidad óptima (hojas/hr)" id="optimal_speed">
                <Input id="optimal_speed" type="number" {...register('optimal_speed_sheets_hr', { valueAsNumber: true })} placeholder="Ej: 5000" />
              </Field>
              <Field label="Ancho máx. impresión (mm)" id="max_w">
                <Input id="max_w" type="number" {...register('max_print_width_mm', { valueAsNumber: true })} />
              </Field>
              <Field label="Alto máx. impresión (mm)" id="max_h">
                <Input id="max_h" type="number" {...register('max_print_height_mm', { valueAsNumber: true })} />
              </Field>
              <Field label="Colores" id="colors">
                <Input id="colors" type="number" min={1} max={12} {...register('colors', { valueAsNumber: true })} placeholder="Ej: 4" />
              </Field>
            </div>

            <Separator />
            <p className="text-xs font-semibold text-foreground flex items-center gap-1">
              <Gauge className="h-3 w-3 text-rose-500" />Mantenimiento & contador
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Se mide en" id="usage_unit">
                <Select
                  value={watch('usage_unit') ?? defaultUsageUnitFor(watch('type'))}
                  onValueChange={(v) => setValue('usage_unit', v as MachineUsageUnit, { shouldDirty: true })}
                >
                  <SelectTrigger id="usage_unit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MACHINE_USAGE_UNIT_VALUES.map((u) => (
                      <SelectItem key={u} value={u}>{USAGE_UNIT_LABEL[u]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label={machine ? 'Contador actual' : 'Lectura inicial del contador'}
                id="usage_counter"
              >
                <Input
                  id="usage_counter"
                  type="number"
                  min={0}
                  disabled={!!machine}
                  {...register('usage_counter', { valueAsNumber: true })}
                  placeholder="Ej: 8400000"
                />
              </Field>
              <Field label="Operarios habilitados mínimos" id="min_qualified_operators">
                <Input
                  id="min_qualified_operators"
                  type="number"
                  min={0}
                  max={50}
                  {...register('min_qualified_operators', { valueAsNumber: true })}
                  placeholder="2"
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              {machine
                ? 'El contador se mueve anotando lecturas en Mecánica → Anotar lectura, no editándolo acá: así queda quién lo anotó y cuándo.'
                : 'La unidad decide cómo se programa la pauta y cómo se mide la vida de cada repuesto: una offset por impresiones, una Roland o un compresor por horas, un vehículo por kilómetros.'}{' '}
              Por debajo del mínimo de operarios habilitados, el taller depende de una sola persona y la cobertura lo marca en rojo.
            </p>

            <Separator />
            <p className="text-xs font-semibold text-foreground flex items-center gap-1">
              <Scan className="h-3 w-3 text-cyan-500" />Consumo de papel
            </p>
            <Field label="Cómo se descuenta el papel" id="consumption_mode">
              <Select
                value={watch('consumption_mode') ?? 'scan'}
                onValueChange={(v) => setValue('consumption_mode', v as MachineConsumptionMode, { shouldDirty: true })}
              >
                <SelectTrigger id="consumption_mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MACHINE_CONSUMPTION_MODE_VALUES.map((m) => (
                    <SelectItem key={m} value={m}>{MACHINE_CONSUMPTION_MODE_LABEL[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <p className="text-xs text-muted-foreground">
              {MACHINE_CONSUMPTION_MODE_HINT[watch('consumption_mode') ?? 'scan']}
            </p>

            <Separator />
            <p className="text-xs font-semibold text-foreground flex items-center gap-1"><Zap className="h-3 w-3 text-amber-500" />Energía & Costos fijos</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Potencia (kW)" id="power_kw">
                <Input id="power_kw" type="number" step="0.01" {...register('power_kw', { valueAsNumber: true })} placeholder="Ej: 3.5" />
              </Field>
              <Field label="Costo energía / hr ($)" id="energy_cost_per_hr">
                <Input id="energy_cost_per_hr" type="number" step="0.0001" {...register('energy_cost_per_hr', { valueAsNumber: true })} placeholder="Ej: 0.85" />
              </Field>
              <Field label="Costo mantenimiento / mes ($)" id="maintenance_cost_monthly">
                <Input id="maintenance_cost_monthly" type="number" step="0.01" {...register('maintenance_cost_monthly', { valueAsNumber: true })} />
              </Field>
              <Field label="Depreciación / mes ($)" id="depreciation_monthly">
                <Input id="depreciation_monthly" type="number" step="0.01" {...register('depreciation_monthly', { valueAsNumber: true })} />
              </Field>
            </div>
          </form>
        </TabsContent>

        {/* ── SUPPLIES ─────────────────────────────────── */}
        <TabsContent value="supplies">
          <div className="space-y-4 pt-3">
            {!machine?.id ? (
              <p className="text-sm text-muted-foreground italic">Guarda la máquina primero para vincular insumos.</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Define qué insumos de inventario consume esta máquina y su tasa de consumo.
                  Los ítems &quot;críticos&quot; generan alerta en Planta cuando su stock cae bajo mínimo.
                </p>
                {/* Existing supplies */}
                <div className="space-y-2">
                  {supplies.map(s => (
                    <div key={s.id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30 text-sm">
                      {s.is_critical && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
                      <span className="flex-1 font-medium">{s.inventory_items?.name}</span>
                      <span className="text-muted-foreground text-xs">{s.consumption_rate} {s.rate_unit.replace('per_', '').replace('_', '/')}</span>
                      <Badge variant="outline" className="text-xs">{s.inventory_items?.unit}</Badge>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeSupply(s.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  {supplies.length === 0 && <p className="text-xs text-muted-foreground italic py-2">No hay insumos vinculados.</p>}
                </div>

                {/* Add new supply */}
                <Separator />
                <p className="text-xs font-semibold">Agregar insumo</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Select value={newSupply.inventory_item_id} onValueChange={v => setNewSupply(p => ({ ...p, inventory_item_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar ítem de inventario…" /></SelectTrigger>
                      <SelectContent>
                        {inventoryItems.map((i: any) => (
                          <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input type="number" placeholder="Tasa de consumo" value={newSupply.consumption_rate || ''} onChange={e => setNewSupply(p => ({ ...p, consumption_rate: Number(e.target.value) }))} />
                  <Select value={newSupply.rate_unit} onValueChange={v => setNewSupply(p => ({ ...p, rate_unit: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_1000_sheets">por 1 000 hojas</SelectItem>
                      <SelectItem value="per_hour">por hora</SelectItem>
                      <SelectItem value="per_job">por trabajo</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Notas opcionales" value={newSupply.notes} onChange={e => setNewSupply(p => ({ ...p, notes: e.target.value }))} />
                  <div className="flex items-center gap-2">
                    <Switch checked={newSupply.is_critical} onCheckedChange={v => setNewSupply(p => ({ ...p, is_critical: v }))} />
                    <Label className="text-xs">Crítico</Label>
                  </div>
                </div>
                <Button size="sm" onClick={addSupply} disabled={!newSupply.inventory_item_id || upsertSupply.isPending} className="gap-1">
                  <Plus className="h-3 w-3" />Agregar insumo
                </Button>
              </>
            )}
          </div>
        </TabsContent>

        {/* ── COSTS ────────────────────────────────────── */}
        <TabsContent value="costs">
          <div className="space-y-4 pt-3">
            {!machine?.id ? (
              <p className="text-sm text-muted-foreground italic">Guarda la máquina primero para registrar costos.</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Registro de costos reales mensuales: energía, mantenimiento, insumos y otros.</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {costEntries.map(c => {
                    const total = [c.energy_cost, c.maintenance_cost, c.supplies_cost, c.other_cost]
                      .reduce((sum: number, v: number | null | undefined) => sum + (v ?? 0), 0);
                    return (
                      <div key={c.id} className="flex items-center gap-3 p-2 rounded border text-sm bg-muted/20">
                        <span className="font-medium w-20">{c.period_month?.slice(0, 7)}</span>
                        <span className="text-muted-foreground text-xs flex-1">E: {c.energy_cost ?? '—'} | M: {c.maintenance_cost ?? '—'} | I: {c.supplies_cost ?? '—'}</span>
                        <span className="font-semibold text-emerald-600">${total.toFixed(2)}</span>
                      </div>
                    );
                  })}
                  {costEntries.length === 0 && <p className="text-xs text-muted-foreground italic py-2">Sin registros de costos aún.</p>}
                </div>
                <Separator />
                <p className="text-xs font-semibold">Registrar mes</p>
                <div className="grid grid-cols-3 gap-2">
                  <Input type="month" value={newCost.period_month} onChange={e => setNewCost(p => ({ ...p, period_month: e.target.value }))} className="col-span-3" />
                  <Input placeholder="kWh" value={newCost.energy_kwh} onChange={e => setNewCost(p => ({ ...p, energy_kwh: e.target.value }))} />
                  <Input placeholder="$ Energía" value={newCost.energy_cost} onChange={e => setNewCost(p => ({ ...p, energy_cost: e.target.value }))} />
                  <Input placeholder="$ Mantención" value={newCost.maintenance_cost} onChange={e => setNewCost(p => ({ ...p, maintenance_cost: e.target.value }))} />
                  <Input placeholder="$ Insumos" value={newCost.supplies_cost} onChange={e => setNewCost(p => ({ ...p, supplies_cost: e.target.value }))} />
                  <Input placeholder="$ Otros" value={newCost.other_cost} onChange={e => setNewCost(p => ({ ...p, other_cost: e.target.value }))} />
                  <Input placeholder="Notas" value={newCost.notes} onChange={e => setNewCost(p => ({ ...p, notes: e.target.value }))} />
                </div>
                <Button size="sm" onClick={addCost} disabled={!newCost.period_month || upsertCost.isPending} className="gap-1">
                  <Plus className="h-3 w-3" />Registrar mes
                </Button>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t">
        {onCancel && <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>}
        <Button
          form="machine-form"
          type="submit"
          size="sm"
          disabled={upsert.isPending}
        >
          {upsert.isPending ? 'Guardando…' : machine ? 'Guardar cambios' : 'Crear máquina'}
        </Button>
      </div>
    </div>
  );
}
