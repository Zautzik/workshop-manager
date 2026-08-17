'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { Gift, Search, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { formatCLP } from '@/lib/format';

interface IncentiveRule {
  id: string;
  name: string;
  description: string | null;
  incentive_type: string;
  amount: number;
  currency_code: string;
  calculation_formula: string | null;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

// Mirrors `incentive_rule_type` — see src/app/api/incentives/route.ts.
const INCENTIVE_TYPE_LABELS: Record<string, string> = {
  fixed_amount: 'Monto fijo',
  percentage: 'Porcentaje',
  free_trial: 'Prueba gratuita',
  fixed_bonus: 'Bono fijo',
  performance_bonus: 'Bono por desempeño',
  attendance_bonus: 'Bono por asistencia',
  overtime_bonus: 'Bono por horas extra',
  penalty_adjustment: 'Ajuste por sanción',
};
const INCENTIVE_TYPES = Object.keys(INCENTIVE_TYPE_LABELS);

const EMPTY_FORM = {
  name: '',
  description: '',
  incentive_type: 'fixed_bonus',
  amount: '0',
  currency_code: 'CLP',
  calculation_formula: '',
  is_active: true,
  effective_from: format(new Date(), 'yyyy-MM-dd'),
  effective_to: '',
};
type FormState = typeof EMPTY_FORM;

function useAllIncentives() {
  return useQuery<IncentiveRule[]>({
    queryKey: ['hr', 'all-incentives'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_rules')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as IncentiveRule[];
    },
  });
}

function formatDate(d: string) {
  const parsed = parseISO(d);
  return isValid(parsed) ? format(parsed, 'd MMM yyyy', { locale: es }) : d;
}

function formatAmount(i: Pick<IncentiveRule, 'incentive_type' | 'amount' | 'currency_code'>) {
  if (i.incentive_type === 'percentage') return `${i.amount}%`;
  return i.currency_code === 'CLP' ? formatCLP(i.amount) : `${i.currency_code} ${i.amount.toLocaleString('es-CL')}`;
}

export function IncentivosContent() {
  const { role } = useAuth();
  // RLS ("Admins and HR managers can manage incentive rules"): sólo estos dos
  // escriben. Un supervisor entra a esta pestaña desde Talento pero sólo mira.
  const canEdit = role === 'admin' || role === 'hr_manager';

  const queryClient = useQueryClient();
  const { data: incentives = [], isLoading } = useAllIncentives();
  const [search, setSearch] = useState('');

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<IncentiveRule | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IncentiveRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return incentives;
    const q = search.toLowerCase();
    return incentives.filter(
      (i) => i.name?.toLowerCase().includes(q) || (INCENTIVE_TYPE_LABELS[i.incentive_type] ?? '').toLowerCase().includes(q),
    );
  }, [incentives, search]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['hr', 'all-incentives'] });

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setIsOpen(true); };
  const openEdit = (i: IncentiveRule) => {
    setEditing(i);
    setForm({
      name: i.name,
      description: i.description ?? '',
      incentive_type: i.incentive_type,
      amount: String(i.amount),
      currency_code: i.currency_code,
      calculation_formula: i.calculation_formula ?? '',
      is_active: i.is_active,
      effective_from: i.effective_from,
      effective_to: i.effective_to ?? '',
    });
    setIsOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    const amountNum = Number(form.amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) { toast.error('El monto debe ser un número válido'); return; }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      incentive_type: form.incentive_type,
      amount: amountNum,
      currency_code: form.currency_code.trim() || 'CLP',
      calculation_formula: form.calculation_formula.trim() || null,
      is_active: form.is_active,
      effective_from: form.effective_from,
      effective_to: form.effective_to || null,
    };

    setSaving(true);
    const res = await fetch(editing ? `/api/incentives/${editing.id}` : '/api/incentives', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? 'No se pudo guardar el incentivo');
      return;
    }
    toast.success(editing ? 'Incentivo actualizado' : 'Incentivo creado');
    setIsOpen(false);
    invalidate();
  };

  const handleToggleActive = async (i: IncentiveRule) => {
    const res = await fetch(`/api/incentives/${i.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ is_active: !i.is_active }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? 'No se pudo cambiar el estado');
      return;
    }
    invalidate();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/incentives/${deleteTarget.id}`, { method: 'DELETE', credentials: 'include' });
    setDeleting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? 'No se pudo eliminar el incentivo');
      return;
    }
    toast.success('Incentivo eliminado');
    setDeleteTarget(null);
    invalidate();
  };

  if (isLoading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar incentivo…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {canEdit && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo incentivo
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Gift className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>{incentives.length === 0 ? 'No hay reglas de incentivos configuradas.' : 'Ningún incentivo coincide con la búsqueda.'}</p>
        </div>
      ) : filtered.map((i) => (
        <Card key={i.id}>
          <CardContent className="flex items-center gap-4 p-4">
            <Gift className="h-5 w-5 text-purple-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{i.name}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                <span>{INCENTIVE_TYPE_LABELS[i.incentive_type] ?? i.incentive_type}</span>
                <span>{formatAmount(i)}</span>
                <span>
                  Desde {formatDate(i.effective_from)}{i.effective_to ? ` hasta ${formatDate(i.effective_to)}` : ''}
                </span>
              </div>
              {i.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{i.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => canEdit && handleToggleActive(i)}
              disabled={!canEdit}
              title={canEdit ? 'Clic para cambiar el estado' : undefined}
              className={canEdit ? 'cursor-pointer' : 'cursor-default'}
            >
              <Badge variant={i.is_active ? 'default' : 'outline'} className="text-xs shrink-0">
                {i.is_active ? 'Activo' : 'Inactivo'}
              </Badge>
            </button>
            {canEdit && (
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(i)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      <p className="text-xs text-muted-foreground text-right">{filtered.length} regla{filtered.length === 1 ? '' : 's'}</p>

      {canEdit && (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar incentivo' : 'Nuevo incentivo'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nombre</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Bono asistencia perfecta" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.incentive_type} onValueChange={(v) => setForm({ ...form, incentive_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INCENTIVE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{INCENTIVE_TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Moneda</Label>
                  <Select value={form.currency_code} onValueChange={(v) => setForm({ ...form, currency_code: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CLP">CLP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{form.incentive_type === 'percentage' ? 'Porcentaje' : 'Monto'}</Label>
                <Input
                  type="number" min="0" step="any"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Vigente desde</Label>
                  <Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
                </div>
                <div>
                  <Label>Vigente hasta (opcional)</Label>
                  <Input type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Descripción</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>
              <div>
                <Label>Fórmula de cálculo (opcional)</Label>
                <Input
                  value={form.calculation_formula}
                  onChange={(e) => setForm({ ...form, calculation_formula: e.target.value })}
                  placeholder="Ej: 5% sobre venta neta del mes"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border border-input px-3 py-2">
                <Label htmlFor="incentive-active" className="cursor-pointer">Activo</Label>
                <Switch id="incentive-active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar incentivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deleteTarget?.name}</strong> por completo. Si ya se le otorgó a alguna
              persona no se podrá eliminar — desactívalo en su lugar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Eliminando…' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function HRIncentivosPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'hr_manager']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Incentivos</h1>
          <p className="text-sm text-muted-foreground mt-1">Bonos, metas y reglas de programas de incentivos</p>
        </div>
        <IncentivosContent />
      </div>
    </ProtectedRoute>
  );
}
