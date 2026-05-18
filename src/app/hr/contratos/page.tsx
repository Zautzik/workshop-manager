'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useEmployees } from '@/hooks/use-employees';
import { useWorkers } from '@/hooks/use-operations-queries';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Search, FileText, User } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

const CONTRACT_LABEL: Record<string, string> = {
  full_time: 'Tiempo Completo',
  part_time: 'Medio Tiempo',
  contractor: 'Contratista',
  temporary: 'Temporal',
  intern: 'Pasante',
};

function useAllContracts() {
  return useQuery({
    queryKey: ['hr', 'all-contracts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employment_contracts')
        .select('*, employees(full_name, department)')
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function ContratosContent() {
  const { data: contracts = [], isLoading } = useAllContracts();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return contracts as any[];
    const q = search.toLowerCase();
    return (contracts as any[]).filter(c =>
      c.employees?.full_name?.toLowerCase().includes(q) ||
      c.contract_type?.toLowerCase().includes(q)
    );
  }, [contracts, search]);

  if (isLoading) return <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por nombre o tipo…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No hay contratos registrados.</p>
        </div>
      ) : filtered.map((c: any) => (
        <Card key={c.id}>
          <CardContent className="flex items-center gap-4 p-4">
            <User className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{c.employees?.full_name ?? 'Empleado'}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                <span className="capitalize">{c.employees?.department}</span>
                {c.start_date && isValid(parseISO(c.start_date)) && (
                  <span>Desde {format(parseISO(c.start_date), 'PP', { locale: es })}</span>
                )}
                {c.end_date && isValid(parseISO(c.end_date)) && (
                  <span>Hasta {format(parseISO(c.end_date), 'PP', { locale: es })}</span>
                )}
              </div>
            </div>
            <Badge variant="outline" className="text-xs shrink-0">
              {CONTRACT_LABEL[c.contract_type] ?? c.contract_type ?? 'N/A'}
            </Badge>
            <Badge className={`text-xs shrink-0 ${c.is_active ? 'bg-green-500' : 'bg-gray-400'} text-white`}>
              {c.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
          </CardContent>
        </Card>
      ))}
      <p className="text-xs text-muted-foreground text-right">{filtered.length} contratos</p>
    </div>
  );
}

export default function HRContratosPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'supervisor']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contratos</h1>
          <p className="text-sm text-muted-foreground mt-1">Tipos de vinculación y fechas clave por empleado</p>
        </div>
        <ContratosContent />
      </div>
    </ProtectedRoute>
  );
}
