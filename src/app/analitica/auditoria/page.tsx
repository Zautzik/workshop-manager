'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useOTs } from '@/hooks/use-operations-queries';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useMemo } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { Search, FileSearch } from 'lucide-react';
import { otStatusLabel, otStatusColor } from '@/lib/status-labels';

interface AuditOt {
  id: string;
  ot_number: string | null;
  client_name: string | null;
  status: string | null;
  created_at: string | null;
  quantity: number | null;
}

function AuditList() {
  const { data, isLoading } = useOTs();
  const ots = (data ?? []) as AuditOt[];
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return ots;
    const q = search.toLowerCase();
    // Match the Spanish label too, so searching "troquelado" finds die_cutting OTs.
    return ots.filter(o =>
      o.ot_number?.toLowerCase().includes(q) ||
      o.client_name?.toLowerCase().includes(q) ||
      o.status?.toLowerCase().includes(q) ||
      otStatusLabel(o.status).toLowerCase().includes(q)
    );
  }, [ots, search]);

  if (isLoading) return <div className="space-y-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por número, cliente o estado…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileSearch className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Sin resultados.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((ot) => (
            <Card key={ot.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className={`h-2 w-2 rounded-full shrink-0 ${otStatusColor(ot.status)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-sm">{ot.ot_number}</span>
                    <span className="text-sm text-muted-foreground truncate">{ot.client_name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                    {ot.created_at && isValid(parseISO(ot.created_at)) && (
                      <span>Creada {format(parseISO(ot.created_at), 'PP', { locale: es })}</span>
                    )}
                    {ot.quantity && <span>{ot.quantity.toLocaleString()} un.</span>}
                  </div>
                </div>
                <Badge className={`${otStatusColor(ot.status)} text-white text-xs shrink-0`}>{otStatusLabel(ot.status)}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground text-right">{filtered.length} de {ots.length} órdenes</p>
    </div>
  );
}

export default function ManagerAuditoriaPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Auditoría OT</h1>
          <p className="text-sm text-muted-foreground mt-1">Historial detallado y estado de cada orden</p>
        </div>
        <AuditList />
      </div>
    </ProtectedRoute>
  );
}
