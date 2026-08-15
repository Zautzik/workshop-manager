'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, Plus, Building2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Client } from '@/types/ot';

interface Props {
  clientName: string;
  clientId: string;
  onSelect: (client: { id: string; name: string }) => void;
  onNameChange: (name: string) => void;
}

export function ClientAutocomplete({ clientName, clientId, onSelect, onNameChange }: Props) {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({
    name: '',
    rut: '',
    contact_name: '',
    phone: '',
    email: '',
  });
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchClients = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients?q=${encodeURIComponent(q)}`);
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
    fetchClients('');
  }, [fetchClients]);

  const handleInputChange = (value: string) => {
    onNameChange(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchClients(value), 300);
  };

  const handleSelectClient = (client: Client) => {
    onSelect({ id: client.id, name: client.name });
    setOpen(false);
  };

  const handleCreateClient = async () => {
    if (!newClient.name.trim()) return;
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClient),
      });
      if (res.ok) {
        const created = await res.json();
        onSelect({ id: created.id, name: created.name });
        setShowNewClient(false);
        setNewClient({ name: '', rut: '', contact_name: '', phone: '', email: '' });
        fetchClients('');
      }
    } catch {
      // ignore
    }
  };

  const selectedClient = clients.find((c) => c.id === clientId);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        {/* ANCHOR, no TRIGGER.
        
            `PopoverTrigger` ALTERNA al hacer clic. Con el campo adentro, un solo
            clic hacía dos cosas: el `onFocus` abría el desplegable y el clic del
            disparador lo cerraba en el mismo gesto. Se veía como que las
            sugerencias aparecen y desaparecen solas.
            
            `PopoverAnchor` sólo posiciona; quién abre y quién cierra lo decide el
            campo, que es lo que corresponde cuando el que manda es el foco y no
            un botón. */}
        <PopoverAnchor asChild>
          <div className="relative">
            <Input
              value={clientName}
              onChange={(e) => {
                handleInputChange(e.target.value);
                if (!open) setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Buscar o agregar cliente..."
              className="bg-input border-border pr-10"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
        </PopoverAnchor>
        {/* Este componente también vive DENTRO del diálogo de Cotización, y ahí
            hacen falta las dos clases.
            
            `pointer-events-auto` es la que importa: Radix Dialog en modo modal
            pone `pointer-events: none` en el <body>, y el popover se portea
            justo ahí, así que lo hereda. Medido: el desplegable quedaba con
            z-index 60 sobre un diálogo de 50 —o sea, arriba y perfectamente
            visible— y `elementFromPoint` devolvía la etiqueta que estaba DEBAJO.
            Se ve bien y no se puede clicar: el peor defecto posible, porque no
            parece un defecto sino que el usuario apuntó mal.
            
            `z-[60]` porque los dos se portean al body y, a igual z-index, gana
            el que va después en el DOM — que es el diálogo. */}
        <PopoverContent
          className="pointer-events-auto z-[60] w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
          /* Sin esto el desplegable se lleva el foco al abrirse y la siguiente
             tecla no llega al campo: se escribe una letra y se corta. */
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false}>
            <CommandList>
              {loading && (
                <div className="py-3 text-center text-xs text-muted-foreground">
                  Buscando...
                </div>
              )}
              <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
                No se encontraron clientes
              </CommandEmpty>
              <CommandGroup>
                {clients.map((client) => (
                  <CommandItem
                    key={client.id}
                    value={client.id}
                    onSelect={() => handleSelectClient(client)}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{client.name}</p>
                      {client.contact_name && (
                        <p className="text-xs text-muted-foreground truncate">
                          {client.contact_name}
                          {client.rut && ` · ${client.rut}`}
                        </p>
                      )}
                    </div>
                    {clientId === client.id && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    setNewClient({ ...newClient, name: clientName });
                    setShowNewClient(true);
                  }}
                  className="flex items-center gap-2 text-primary cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span className="text-sm font-medium">Crear nuevo cliente</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected client badge */}
      {selectedClient && (
        <div className="flex items-center gap-2 mt-1.5 px-2 py-1 bg-primary/10 rounded-md border border-primary/20">
          <Building2 className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-primary font-medium">{selectedClient.name}</span>
          {selectedClient.rut && (
            <span className="text-xs text-primary/60">· {selectedClient.rut}</span>
          )}
          <button
            type="button"
            className="ml-auto text-primary/60 hover:text-primary text-xs"
            onClick={() => onSelect({ id: '', name: clientName })}
          >
            ✕
          </button>
        </div>
      )}

      {/* Create new client dialog */}
      <Dialog open={showNewClient} onOpenChange={setShowNewClient}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Nuevo Cliente
            </DialogTitle>
            <DialogDescription>
              Completa los datos para registrar un nuevo cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Nombre *</Label>
              <Input
                value={newClient.name}
                onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                className="bg-input border-border mt-1"
                placeholder="Nombre del cliente"
              />
            </div>
            <div>
              <Label className="text-xs">RUT</Label>
              <Input
                value={newClient.rut}
                onChange={(e) => setNewClient({ ...newClient, rut: e.target.value })}
                className="bg-input border-border mt-1"
                placeholder="12.345.678-9"
              />
            </div>
            <div>
              <Label className="text-xs">Contacto</Label>
              <Input
                value={newClient.contact_name}
                onChange={(e) => setNewClient({ ...newClient, contact_name: e.target.value })}
                className="bg-input border-border mt-1"
                placeholder="Nombre del contacto"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Teléfono</Label>
                <Input
                  value={newClient.phone}
                  onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                  className="bg-input border-border mt-1"
                  placeholder="+56 9..."
                />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={newClient.email}
                  onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                  className="bg-input border-border mt-1"
                  placeholder="email@..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowNewClient(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleCreateClient}
                disabled={!newClient.name.trim()}
                className="bg-primary hover:bg-primary/90"
              >
                Crear Cliente
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
