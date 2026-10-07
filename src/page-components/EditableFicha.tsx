'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CONTRACT_LABEL, type MergedPerson } from './personas-shared';

/** Same taxonomy the ficha form uses — one vocabulary across the module. */
const DEPARTMENTS = [
  'Impresión Offset', 'Pre-Prensa', 'Terminaciones', 'Corte',
  'Troquelado', 'Despacho', 'Bodega', 'Management',
] as const;

/**
 * The ficha, editable in place.
 *
 * A person's record spans three tables, so saving fans out to three routes and
 * only sends what actually changed — an untouched wage never hits the
 * compensation endpoint, which keeps the HR compliance log honest about who
 * really changed pay and when.
 */
export function EditableFicha({ person, onSaved }: { person: MergedPerson; onSaved: () => void }) {
  const initial = {
    full_name: person.full_name ?? '',
    department: person.department ?? '',
    hire_date: person.hire_date ?? '',
    email: person.email ?? '',
    phone: person.phone ?? '',
    contract_type: person.contract?.contract_type ?? 'full_time',
    hours_per_week: String(person.contract?.hours_per_week ?? ''),
    overtime_allowed: Boolean(person.contract?.overtime_allowed),
    hourly_rate: person.comp?.hourly_rate != null ? String(person.comp.hourly_rate) : '',
  };

  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof initial>) => setForm(f => ({ ...f, ...patch }));

  const dirty = (Object.keys(initial) as Array<keyof typeof initial>).some(
    k => String(form[k]) !== String(initial[k])
  );

  const save = async () => {
    if (!form.full_name.trim()) {
      toast.error('El nombre no puede quedar vacío');
      return;
    }

    setSaving(true);
    const failures: string[] = [];

    const send = async (url: string, method: string, body: unknown, label: string) => {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        failures.push(`${label}: ${b?.error || res.status}`);
      }
    };

    // 1. Identity
    if (
      form.full_name !== initial.full_name ||
      form.department !== initial.department ||
      form.hire_date !== initial.hire_date ||
      form.email !== initial.email ||
      form.phone !== initial.phone
    ) {
      await send(
        `/api/employees/${person.id}`,
        'PUT',
        {
          full_name: form.full_name.trim(),
          department: form.department || null,
          ...(form.hire_date ? { hire_date: form.hire_date } : {}),
          email: form.email || null,
          phone: form.phone || null,
        },
        'ficha'
      );
    }

    // 2. Contract
    if (
      form.contract_type !== initial.contract_type ||
      form.hours_per_week !== initial.hours_per_week ||
      form.overtime_allowed !== initial.overtime_allowed
    ) {
      await send(
        `/api/employees/${person.id}/contract`,
        'PATCH',
        {
          contract_type: form.contract_type,
          ...(form.hours_per_week ? { hours_per_week: Number(form.hours_per_week) } : {}),
          overtime_allowed: form.overtime_allowed,
        },
        'contrato'
      );
    }

    // 3. Rate — only when actually touched.
    if (form.hourly_rate !== initial.hourly_rate && form.hourly_rate.trim()) {
      await send(
        `/api/employees/${person.id}/compensation`,
        'PATCH',
        { hourly_rate: Number(form.hourly_rate) },
        'tarifa'
      );
    }

    setSaving(false);

    if (failures.length > 0) {
      toast.error(`No se guardó todo — ${failures.join(' · ')}`);
    } else {
      toast.success('Ficha actualizada');
    }
    onSaved();
  };

  const field = 'h-8 text-sm';

  return (
    <div className="space-y-2 md:col-span-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ficha — editable
        </div>
        {dirty && <span className="text-xs text-amber-600">sin guardar</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Nombre</label>
          <Input className={field} value={form.full_name} onChange={e => set({ full_name: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Departamento</label>
          <Select value={form.department || undefined} onValueChange={v => set({ department: v })}>
            <SelectTrigger className={field}><SelectValue placeholder="Sin departamento" /></SelectTrigger>
            <SelectContent>
              {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Fecha de ingreso</label>
          <Input type="date" className={field} value={form.hire_date} onChange={e => set({ hire_date: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Tarifa por hora (CLP)</label>
          <Input
            type="number"
            min={0}
            step="1"
            className={field}
            value={form.hourly_rate}
            onChange={e => set({ hourly_rate: e.target.value })}
            placeholder="Ej: 8500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Tipo de contrato</label>
          <Select value={form.contract_type} onValueChange={v => set({ contract_type: v })}>
            <SelectTrigger className={field}><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CONTRACT_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Horas por semana</label>
          <Input
            type="number"
            min={1}
            max={80}
            className={field}
            value={form.hours_per_week}
            onChange={e => set({ hours_per_week: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Correo</label>
          <Input type="email" className={field} value={form.email} onChange={e => set({ email: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Teléfono</label>
          <Input className={field} value={form.phone} onChange={e => set({ phone: e.target.value })} />
        </div>
      </div>

      <label className="flex w-fit items-center gap-2 pt-1 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={form.overtime_allowed}
          onChange={e => set({ overtime_allowed: e.target.checked })}
        />
        Horas extra permitidas
      </label>

      <div className="flex items-center gap-2 pt-2">
        <Button size="sm" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        {dirty && (
          <Button size="sm" variant="ghost" onClick={() => setForm(initial)} disabled={saving}>
            Descartar
          </Button>
        )}
      </div>
    </div>
  );
}
