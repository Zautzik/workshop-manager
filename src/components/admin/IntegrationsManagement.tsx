'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

type Connector = {
  id: string;
  provider: string;
  name: string;
  status: 'inactive' | 'active' | 'error';
  last_sync_at: string | null;
  last_error: string | null;
};

export default function IntegrationsManagement() {
  const [items, setItems] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState('');
  const [name, setName] = useState('');
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/integrations/connectors');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load integrations');
      setItems(data ?? []);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createConnector = async () => {
    try {
      const res = await fetch('/api/integrations/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to create integration');
      setProvider('');
      setName('');
      load();
      toast({ title: 'Integracion creada' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const setStatus = async (id: string, status: Connector['status']) => {
    try {
      const res = await fetch('/api/integrations/connectors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to update status');
      load();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold text-foreground">Nueva Integracion</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Input placeholder="Proveedor (ej: sap)" value={provider} onChange={(e) => setProvider(e.target.value)} />
          <Input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={createConnector} disabled={!provider || !name}>Crear</Button>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold text-foreground mb-3">Conectores</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay conectores registrados.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="border rounded-md p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">{item.provider} / {item.name}</p>
                  <p className="text-xs text-muted-foreground">Estado: {item.status}{item.last_error ? ` - ${item.last_error}` : ''}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => setStatus(item.id, 'inactive')}>Inactivo</Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus(item.id, 'active')}>Activo</Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus(item.id, 'error')}>Error</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
