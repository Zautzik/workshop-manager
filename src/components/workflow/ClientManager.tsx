'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  Building2,
  Plus,
  Search,
  Edit2,
  Trash2,
  Phone,
  Mail,
  MapPin,
  FileText,
  Users,
} from 'lucide-react';
import type { Client } from '@/types/ot';

interface ClientFormState {
  name: string;
  rut: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  payment_terms: string;
  notes: string;
}

const EMPTY_FORM: ClientFormState = {
  name: '',
  rut: '',
  contact_name: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  payment_terms: '30 días',
  notes: '',
};

export function ClientManager() {
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ClientFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients?q=`);
      if (res.ok) {
        const data = await res.json();
        setClients(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const filtered = clients.filter((c) => {
    if (!showInactive && !c.is_active) return false;
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.rut?.toLowerCase().includes(q) ?? false) ||
      (c.contact_name?.toLowerCase().includes(q) ?? false) ||
      (c.email?.toLowerCase().includes(q) ?? false) ||
      (c.city?.toLowerCase().includes(q) ?? false)
    );
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (client: Client) => {
    setEditingId(client.id);
    setForm({
      name: client.name,
      rut: client.rut || '',
      contact_name: client.contact_name || '',
      phone: client.phone || '',
      email: client.email || '',
      address: client.address || '',
      city: client.city || '',
      payment_terms: client.payment_terms || '30 días',
      notes: client.notes || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'El nombre es requerido', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        rut: form.rut.trim() || null,
        contact_name: form.contact_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        payment_terms: form.payment_terms.trim() || null,
        notes: form.notes.trim() || null,
      };

      const url = editingId ? `/api/clients/${editingId}` : '/api/clients';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Error al guardar');
      }

      toast({
        title: editingId ? 'Cliente actualizado' : 'Cliente creado',
        description: form.name,
      });

      setShowForm(false);
      fetchClients();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'No se pudo guardar el cliente',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (client: Client) => {
    if (!confirm(`¿Desactivar el cliente "${client.name}"?`)) return;
    try {
      const res = await fetch(`/api/clients/${client.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast({ title: 'Cliente desactivado', description: client.name });
      fetchClients();
    } catch {
      toast({ title: 'Error al desactivar', variant: 'destructive' });
    }
  };

  const handleReactivate = async (client: Client) => {
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: 'Cliente reactivado', description: client.name });
      fetchClients();
    } catch {
      toast({ title: 'Error al reactivar', variant: 'destructive' });
    }
  };

  const updateField = (field: keyof ClientFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Gestión de Clientes
          </h2>
          <p className="text-sm text-muted-foreground">
            {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-64 bg-input border-border"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInactive(!showInactive)}
            className={showInactive ? 'border-amber-500/50 text-amber-400' : ''}
          >
            {showInactive ? 'Ocultar inactivos' : 'Ver inactivos'}
          </Button>
          <Button onClick={openCreate} className="bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-1" />
            Nuevo Cliente
          </Button>
        </div>
      </div>

      {/* Client List */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Cargando clientes...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mb-3 opacity-30" />
              <p>No se encontraron clientes</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Cliente</TableHead>
                    <TableHead>RUT</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead>Pago</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((client) => (
                    <TableRow
                      key={client.id}
                      className={!client.is_active ? 'opacity-50' : 'hover:bg-muted/20'}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div>
                            <p className="font-medium text-sm">{client.name}</p>
                            {!client.is_active && (
                              <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">
                                Inactivo
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {client.rut || '—'}
                      </TableCell>
                      <TableCell className="text-sm">{client.contact_name || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {client.phone || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {client.email || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {client.city || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {client.payment_terms || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => openEdit(client)}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          {client.is_active ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                              onClick={() => handleDeactivate(client)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-amber-400 hover:text-amber-300"
                              onClick={() => handleReactivate(client)}
                            >
                              Reactivar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {editingId ? 'Editar Cliente' : 'Nuevo Cliente'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label className="text-xs font-medium">Nombre *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="Razón social o nombre"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">RUT</Label>
                <Input
                  value={form.rut}
                  onChange={(e) => updateField('rut', e.target.value)}
                  placeholder="12.345.678-9"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Contacto</Label>
                <Input
                  value={form.contact_name}
                  onChange={(e) => updateField('contact_name', e.target.value)}
                  placeholder="Nombre del contacto"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Teléfono
                </Label>
                <Input
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="+56 9..."
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Mail className="h-3 w-3" /> Email
                </Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="correo@ejemplo.cl"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-medium flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Dirección
                </Label>
                <Input
                  value={form.address}
                  onChange={(e) => updateField('address', e.target.value)}
                  placeholder="Dirección"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Ciudad</Label>
                <Input
                  value={form.city}
                  onChange={(e) => updateField('city', e.target.value)}
                  placeholder="Santiago, Valparaíso..."
                  className="mt-1"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs font-medium">Condición de Pago</Label>
                <Input
                  value={form.payment_terms}
                  onChange={(e) => updateField('payment_terms', e.target.value)}
                  placeholder="30 días, contado, etc."
                  className="mt-1"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Notas
                </Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  placeholder="Observaciones adicionales..."
                  className="mt-1 min-h-[60px]"
                  rows={2}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="bg-primary hover:bg-primary/90"
            >
              {saving ? 'Guardando...' : editingId ? 'Guardar Cambios' : 'Crear Cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
