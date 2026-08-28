'use client';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Truck, Building2, Pencil, Plus, ShieldCheck, ShieldAlert, X, BadgeCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCLP } from '@/lib/format';
import {
  useSuppliers, useSupplierCategories, useCreateSupplierCategory,
  useSaveSupplierProfile, useCreateSupplier, useDeleteSupplier,
  type Supplier, type SupplierCertification,
} from '@/hooks/use-procurement-queries';

const isPefc = (name: string) => /pefc/i.test(name);
const isExpired = (c: SupplierCertification) => !!c.expires_on && new Date(c.expires_on) < new Date();

type DialogState = { mode: 'edit'; supplier: Supplier } | { mode: 'create' } | null;

export function SuppliersDirectory() {
  // "Cargando" y "sin proveedores" se veían idénticos — un fetch que todavía
  // no volvió mostraba la misma fila vacía que un directorio genuinamente
  // sin nadie. En esta pantalla las tres consultas del lado del servidor
  // (OCs, perfiles, categorías) tardan lo suficiente para que la diferencia
  // se note (auditoría 2026-08).
  const { data, isLoading, isError, refetch } = useSuppliers();
  const suppliers = data?.data ?? [];
  const totals = data?.totals;
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Proveedores" value={String(totals?.count ?? 0)} hint="en el directorio" tone="default" />
        <KpiCard label="Comprado (histórico)" value={formatCLP(totals?.spend ?? 0)} hint="suma de OCs" tone="warning" />
        <KpiCard label="PEFC certificados" value={String(totals?.pefc ?? 0)} hint="cadena de custodia" tone="success" />
        <KpiCard label="OCs abiertas" value={String(totals?.open ?? 0)} hint="sin cerrar/anular" tone="info" />
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" /> Directorio de proveedores</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Categorías que abastece y certificaciones (PEFC cadena de custodia) — junto a la trazabilidad por lote.</p>
          </div>
          <Button size="sm" onClick={() => setDialog({ mode: 'create' })}><Plus className="h-4 w-4 mr-1" /> Nuevo Proveedor</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-muted-foreground">
                <th className="text-left py-2 px-2 font-medium">Proveedor</th>
                <th className="text-left py-2 px-2 font-medium">Categorías</th>
                <th className="text-left py-2 px-2 font-medium">Certificaciones</th>
                <th className="text-center py-2 px-2 font-medium">OCs</th>
                <th className="text-right py-2 px-2 font-medium">Total comprado</th>
                <th className="text-right py-2 px-2 font-medium"></th>
              </tr></thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={6} className="text-center text-muted-foreground py-8">Cargando proveedores…</td></tr>
                )}
                {isError && (
                  <tr><td colSpan={6} className="text-center text-red-600 py-8">
                    No se pudo cargar el directorio. <button className="underline" onClick={() => refetch()}>Reintentar</button>
                  </td></tr>
                )}
                {!isLoading && !isError && suppliers.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-muted-foreground py-8">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />Sin proveedores aún.
                  </td></tr>
                )}
                {suppliers.map((s) => (
                  <tr key={s.supplier} className="border-b hover:bg-muted/40 align-top">
                    <td className="py-2.5 px-2">
                      <div className="font-medium">{s.supplier}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {[s.supplier_rut, s.phone, s.email].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex flex-wrap gap-1 max-w-[240px]">
                        {s.categories.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                        {s.categories.map((c) => <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>)}
                      </div>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {s.certifications.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                        {s.certifications.map((c, i) => {
                          const expired = isExpired(c);
                          const cls = expired ? 'bg-red-500/15 text-red-600'
                            : isPefc(c.name) ? 'bg-green-500/15 text-green-600' : 'bg-slate-500/15 text-slate-600';
                          return (
                            <Badge key={i} className={`${cls} text-[10px] gap-1`}>
                              {expired ? <ShieldAlert className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                              {c.name}{c.expires_on ? ` · ${new Date(c.expires_on).toLocaleDateString('es-CL')}` : ''}
                            </Badge>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center">{s.oc_count}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums font-semibold">{formatCLP(s.total_spend)}</td>
                    <td className="py-2.5 px-2 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDialog({ mode: 'edit', supplier: s })}><Pencil className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <SupplierDialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function SupplierDialog({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const { data: catalog = [] } = useSupplierCategories();
  const createCategory = useCreateSupplierCategory();
  const saveProfile = useSaveSupplierProfile();
  const createSupplier = useCreateSupplier();
  const deleteSupplier = useDeleteSupplier();

  const editing = state?.mode === 'edit' ? state.supplier : null;
  const [form, setForm] = useState({ name: '', rut: '', email: '', phone: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [certs, setCerts] = useState<SupplierCertification[]>([]);
  const [newCat, setNewCat] = useState('');
  const [certName, setCertName] = useState('PEFC');
  const [certCode, setCertCode] = useState('');
  const [certExp, setCertExp] = useState('');
  const [hydrated, setHydrated] = useState<string | null>(null);

  // Hydrate whenever a different dialog target opens.
  const targetKey = state ? (state.mode === 'edit' ? state.supplier.supplier : '__new__') : null;
  if (state && hydrated !== targetKey) {
    if (editing) {
      setForm({ name: editing.supplier, rut: editing.supplier_rut ?? '', email: editing.email ?? '', phone: editing.phone ?? '' });
      setSelected(new Set(editing.category_ids));
      setCerts(editing.certifications ?? []);
    } else {
      setForm({ name: '', rut: '', email: '', phone: '' });
      setSelected(new Set()); setCerts([]);
    }
    setHydrated(targetKey);
  }

  const grouped = useMemo(() => ({
    material: catalog.filter((c) => c.kind === 'material'),
    service: catalog.filter((c) => c.kind === 'service' || !c.kind),
  }), [catalog]);

  if (!state) return null;

  const close = () => { setHydrated(null); onClose(); };
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const addCategory = async () => {
    if (!newCat.trim()) return;
    try {
      const created: any = await createCategory.mutateAsync({ name: newCat.trim(), kind: 'material' });
      if (created?.id) setSelected((prev) => new Set(prev).add(created.id));
      setNewCat(''); toast.success('Categoría creada');
    } catch (e: any) { toast.error(e?.message ?? 'Error'); }
  };

  const addCert = () => {
    if (!certName.trim()) return;
    setCerts((prev) => [...prev, { name: certName.trim(), code: certCode || null, expires_on: certExp || null }]);
    setCertName('PEFC'); setCertCode(''); setCertExp('');
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    const profile = {
      rut: form.rut || null, email: form.email || null, phone: form.phone || null,
      category_ids: [...selected], certifications: certs,
    };
    try {
      if (editing) {
        await saveProfile.mutateAsync({ current_name: editing.supplier, supplier_name: form.name.trim(), ...profile });
      } else {
        await createSupplier.mutateAsync({ supplier_name: form.name.trim(), ...profile });
      }
      toast.success(editing ? 'Proveedor actualizado' : 'Proveedor creado');
      close();
    } catch (e: any) { toast.error(e?.message ?? 'No se pudo guardar'); }
  };

  const remove = async () => {
    if (!editing) return;
    if (!confirm(`¿Eliminar a ${editing.supplier}?${editing.oc_count > 0 ? ' Su historial de OCs se conserva.' : ''}`)) return;
    try { await deleteSupplier.mutateAsync(editing.supplier); toast.success('Proveedor eliminado'); close(); }
    catch (e: any) { toast.error(e?.message ?? 'Error'); }
  };

  const busy = saveProfile.isPending || createSupplier.isPending;

  return (
    <Dialog open={!!state} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
          <DialogDescription>Datos de contacto, categorías que abastece y certificaciones (PEFC).</DialogDescription>
        </DialogHeader>

        {/* Contact */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2"><Label className="text-xs">Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">RUT</Label><Input value={form.rut} onChange={(e) => setForm({ ...form, rut: e.target.value })} placeholder="76.123.456-7" /></div>
          <div className="space-y-1"><Label className="text-xs">Teléfono</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+56 …" /></div>
          <div className="space-y-1 col-span-2"><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        </div>

        {/* Categories */}
        <div className="space-y-2 border-t pt-3">
          <Label className="text-sm">Categorías abastecidas</Label>
          {(['material', 'service'] as const).map((kind) => (
            <div key={kind} className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{kind === 'material' ? 'Materiales' : 'Servicios'}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {grouped[kind].map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />{c.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nueva categoría…" className="h-8 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())} />
            <Button size="sm" variant="outline" onClick={addCategory} disabled={createCategory.isPending}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
        </div>

        {/* Certifications */}
        <div className="space-y-2 border-t pt-3">
          <Label className="text-sm flex items-center gap-1.5"><BadgeCheck className="h-4 w-4" /> Certificaciones</Label>
          <div className="space-y-1.5">
            {certs.length === 0 && <p className="text-xs text-muted-foreground">Sin certificaciones registradas.</p>}
            {certs.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge className={isPefc(c.name) ? 'bg-green-500/15 text-green-600' : 'bg-slate-500/15 text-slate-600'}>{c.name}</Badge>
                  <span className="text-xs text-muted-foreground font-mono">{c.code || '—'}</span>
                  {c.expires_on && <span className={`text-xs ${isExpired(c) ? 'text-red-600' : 'text-muted-foreground'}`}>vence {new Date(c.expires_on).toLocaleDateString('es-CL')}</span>}
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCerts((p) => p.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <div className="space-y-1"><Label className="text-[11px]">Certificación</Label><Input value={certName} onChange={(e) => setCertName(e.target.value)} className="h-8 text-sm" placeholder="PEFC" /></div>
            <div className="space-y-1"><Label className="text-[11px]">Código</Label><Input value={certCode} onChange={(e) => setCertCode(e.target.value)} className="h-8 text-sm" placeholder="PEFC/28-31-…" /></div>
            <div className="space-y-1"><Label className="text-[11px]">Vence</Label><Input type="date" value={certExp} onChange={(e) => setCertExp(e.target.value)} className="h-8 text-sm" /></div>
          </div>
          <Button size="sm" variant="outline" className="w-full" onClick={addCert}><Plus className="h-3.5 w-3.5 mr-1" /> Agregar certificación</Button>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {editing
            ? <Button variant="ghost" className="text-red-600" onClick={remove} disabled={deleteSupplier.isPending}><Trash2 className="h-4 w-4 mr-1" /> Eliminar</Button>
            : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={close}>Cancelar</Button>
            <Button onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

