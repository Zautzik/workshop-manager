'use client';

/**
 * WorkersManagement — the ONE door for creating and editing a person.
 *
 * This used to be a two-field form (name + department) posting to /api/workers,
 * which inserted straight into `employees` with no contract and no rate. That is
 * where the "fdf" and "Ñaño" rows came from: people who break payroll and OT
 * costing downstream because they have no hourly rate, and whose department came
 * from a dropdown ('press', 'pre_press') that didn't match the taxonomy the rest
 * of the app uses ('Impresión Offset', 'Pre-Prensa').
 *
 * Now it writes through /api/employees, which creates the employee, the
 * employment contract and the compensation rate together — and refuses to create
 * a half-person unless the user explicitly says it's a draft.
 */

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, AlertTriangle, Lock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

interface WorkersManagementProps {
  onUpdate: () => void;
}

/** The taxonomy the plant actually uses — matches existing employee records. */
const DEPARTMENTS = [
  'Impresión Offset',
  'Pre-Prensa',
  'Terminaciones',
  'Corte',
  'Troquelado',
  'Despacho',
  'Bodega',
  'Management',
] as const;

const CONTRACT_TYPES = [
  { value: 'full_time', label: 'Tiempo Completo' },
  { value: 'part_time', label: 'Medio Tiempo' },
  { value: 'contractor', label: 'Contratista' },
  { value: 'temporary', label: 'Temporal' },
  { value: 'intern', label: 'Pasante' },
] as const;

const CONTRACT_LABEL: Record<string, string> = Object.fromEntries(
  CONTRACT_TYPES.map((c) => [c.value, c.label])
);

const emptyForm = {
  full_name: '',
  department: 'Impresión Offset' as string,
  hire_date: new Date().toISOString().split('T')[0],
  employee_code: '',
  contract_type: 'full_time' as string,
  hours_per_week: '45',
  overtime_allowed: 'true',
  hourly_rate: '',
  currency_code: 'CLP',
  allow_incomplete: false,
};

/** Reads the consolidated employee list (identity + contract + compensation). */
function useEmployeeRoster() {
  return useQuery({
    queryKey: ['personas', 'roster'],
    queryFn: async () => {
      const res = await fetch('/api/employees?limit=200', { credentials: 'include' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'No se pudo cargar el personal');
      return (payload?.data ?? []) as any[];
    },
    staleTime: 60 * 1000,
  });
}

const current = <T extends Record<string, any>>(rows: T[] | undefined, endField: string): T | null => {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.find((r) => !r[endField]) ?? rows[0];
};

const WorkersManagement = ({ onUpdate }: WorkersManagementProps) => {
  const { role } = useAuth();
  const canManageCompensation = role === 'admin' || role === 'hr_manager';
  const { data: employees = [], refetch, isLoading } = useEmployeeRoster();

  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const set = (patch: Partial<typeof emptyForm>) => setForm((f) => ({ ...f, ...patch }));

  const incompleteCount = useMemo(
    () =>
      employees.filter(
        (e) => !current(e.employment_contracts, 'end_date') || !current(e.compensation_rates, 'effective_to')
      ).length,
    [employees]
  );

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditing(null);
    setShowDialog(false);
  };

  const openCreate = () => {
    setForm({ ...emptyForm });
    setEditing(null);
    setShowDialog(true);
  };

  const openEdit = (employee: any) => {
    const contract = current(employee.employment_contracts, 'end_date');
    const comp = current(employee.compensation_rates, 'effective_to');
    setEditing(employee);
    setForm({
      ...emptyForm,
      full_name: employee.full_name ?? '',
      department: employee.department ?? DEPARTMENTS[0],
      hire_date: employee.hire_date ?? emptyForm.hire_date,
      employee_code: employee.employee_code ?? '',
      contract_type: contract?.contract_type ?? 'full_time',
      hours_per_week: String(contract?.hours_per_week ?? 45),
      overtime_allowed: String(contract?.overtime_allowed ?? true),
      hourly_rate: comp?.hourly_rate != null ? String(comp.hourly_rate) : '',
      currency_code: comp?.currency_code ?? 'CLP',
    });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!form.full_name.trim()) {
      toast.error('Ingresa el nombre completo');
      return;
    }
    if (!form.hire_date) {
      toast.error('Indica la fecha de ingreso');
      return;
    }

    // A person with no rate silently breaks payroll and OT costing downstream.
    // Allow it only when the user says out loud that it's a draft.
    const missingRate = canManageCompensation && !form.hourly_rate.trim();
    if (!editing && missingRate && !form.allow_incomplete) {
      toast.error('Indica la tarifa por hora, o marca la ficha como incompleta');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/employees/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            full_name: form.full_name.trim(),
            department: form.department,
            hire_date: form.hire_date,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || 'No se pudo actualizar la ficha');
        }
        toast.success('Ficha actualizada');
      } else {
        const payload: Record<string, unknown> = {
          full_name: form.full_name.trim(),
          department: form.department,
          hire_date: form.hire_date,
          contract_type: form.contract_type,
          hours_per_week: Number(form.hours_per_week) || 45,
          overtime_allowed: form.overtime_allowed === 'true',
        };
        if (form.employee_code.trim()) payload.employee_code = form.employee_code.trim();
        if (canManageCompensation && form.hourly_rate.trim()) {
          payload.hourly_rate = Number(form.hourly_rate);
          payload.currency_code = form.currency_code;
        }

        const res = await fetch('/api/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const created = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(created?.error || 'No se pudo crear la ficha');
        }

        // The employee row can land while its contract or rate does not; say so
        // rather than reporting a clean success over a half-created person.
        if (Array.isArray(created?.warnings) && created.warnings.length > 0) {
          toast.warning(`Ficha creada con observaciones: ${created.warnings.join(' · ')}`);
        } else {
          toast.success(
            form.allow_incomplete && !form.hourly_rate.trim()
              ? 'Ficha creada como incompleta — falta la tarifa'
              : 'Ficha creada con contrato y tarifa'
          );
        }
      }

      refetch();
      onUpdate();
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la ficha');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (employee: any) => {
    if (!confirm(`¿Archivar la ficha de ${employee.full_name}?`)) return;

    const res = await fetch(`/api/employees/${employee.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error || 'No se pudo archivar la ficha');
      return;
    }

    toast.success('Ficha archivada');
    refetch();
    onUpdate();
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-primary">Fichas del personal</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Identidad, contrato y tarifa se crean juntos — una sola ficha por persona.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Nueva ficha
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {incompleteCount > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {incompleteCount === 1
              ? '1 ficha sin contrato o sin tarifa — completa sus datos para que nómina y costeo cuadren.'
              : `${incompleteCount} fichas sin contrato o sin tarifa — complétalas para que nómina y costeo cuadren.`}
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Departamento</TableHead>
              <TableHead>Contrato</TableHead>
              <TableHead className="text-right">Tarifa/hora</TableHead>
              <TableHead className="w-[110px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Cargando personal…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && employees.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Sin fichas registradas.
                </TableCell>
              </TableRow>
            )}
            {employees.map((employee) => {
              const contract = current(employee.employment_contracts, 'end_date');
              const comp = current(employee.compensation_rates, 'effective_to');
              return (
                <TableRow key={employee.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{employee.full_name}</div>
                    {employee.employee_code && (
                      <div className="text-xs font-mono text-muted-foreground">{employee.employee_code}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{employee.department || '—'}</TableCell>
                  <TableCell>
                    {contract ? (
                      <span className="text-foreground">
                        {CONTRACT_LABEL[contract.contract_type] || contract.contract_type}
                        {contract.hours_per_week != null && (
                          <span className="text-muted-foreground"> · {contract.hours_per_week} h/sem</span>
                        )}
                      </span>
                    ) : (
                      <Badge variant="outline" className="border-amber-500/40 text-amber-600">
                        Sin contrato
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {!canManageCompensation ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Lock className="h-3 w-3" /> restringido
                      </span>
                    ) : comp?.hourly_rate != null ? (
                      <span className="font-medium text-foreground">
                        {comp.currency_code} {Number(comp.hourly_rate).toLocaleString('es-CL')}
                      </span>
                    ) : (
                      <Badge variant="outline" className="border-amber-500/40 text-amber-600">
                        Sin tarifa
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="icon" onClick={() => openEdit(employee)} title="Editar ficha">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => handleDelete(employee)} title="Archivar ficha">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={showDialog} onOpenChange={(open) => (open ? setShowDialog(true) : resetForm())}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar ficha' : 'Nueva ficha'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Actualiza los datos de identidad. La tarifa se ajusta desde Retribución.'
                : 'La persona se crea con su contrato y su tarifa en un solo paso.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Nombre completo</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => set({ full_name: e.target.value })}
                placeholder="Ej: Carlos Muñoz"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="department">Departamento</Label>
                <Select value={form.department} onValueChange={(v) => set({ department: v })}>
                  <SelectTrigger id="department"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hire_date">Fecha de ingreso</Label>
                <Input
                  id="hire_date"
                  type="date"
                  value={form.hire_date}
                  onChange={(e) => set({ hire_date: e.target.value })}
                />
              </div>
            </div>

            {!editing && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="contract_type">Tipo de contrato</Label>
                    <Select value={form.contract_type} onValueChange={(v) => set({ contract_type: v })}>
                      <SelectTrigger id="contract_type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CONTRACT_TYPES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hours_per_week">Horas por semana</Label>
                    <Input
                      id="hours_per_week"
                      type="number"
                      min={1}
                      value={form.hours_per_week}
                      onChange={(e) => set({ hours_per_week: e.target.value })}
                    />
                  </div>
                </div>

                {canManageCompensation && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="hourly_rate">Tarifa por hora</Label>
                      <Input
                        id="hourly_rate"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.hourly_rate}
                        onChange={(e) => set({ hourly_rate: e.target.value })}
                        placeholder="Ej: 4500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="currency_code">Moneda</Label>
                      <Select value={form.currency_code} onValueChange={(v) => set({ currency_code: v })}>
                        <SelectTrigger id="currency_code"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CLP">CLP</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {canManageCompensation && !form.hourly_rate.trim() && (
                  <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.allow_incomplete}
                      onChange={(e) => set({ allow_incomplete: e.target.checked })}
                      className="mt-0.5"
                    />
                    <span>
                      Crear sin tarifa (ficha incompleta). Nómina y costeo de OT no podrán usar a esta persona
                      hasta que se le asigne una tarifa.
                    </span>
                  </label>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetForm} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving} className="bg-primary hover:bg-primary/90">
              {saving ? 'Guardando…' : editing ? 'Actualizar' : 'Crear ficha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default WorkersManagement;
