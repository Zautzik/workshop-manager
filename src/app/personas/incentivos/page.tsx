'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { Gift, User, Search } from 'lucide-react';

function useAllIncentives() {
  return useQuery({
    queryKey: ['hr', 'all-incentives'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_rules')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function IncentivosContent() {
  const { data: incentives = [], isLoading } = useAllIncentives();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return incentives as any[];
    const q = search.toLowerCase();
    return (incentives as any[]).filter(i => i.name?.toLowerCase().includes(q) || i.rule_type?.toLowerCase().includes(q));
  }, [incentives, search]);

  if (isLoading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar incentivo…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Gift className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No hay reglas de incentivos configuradas.</p>
        </div>
      ) : filtered.map((i: any) => (
        <Card key={i.id}>
          <CardContent className="flex items-center gap-4 p-4">
            <Gift className="h-5 w-5 text-purple-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{i.name ?? i.rule_type ?? 'Incentivo'}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                {i.bonus_amount && <span>Bono: ${Number(i.bonus_amount).toLocaleString()}</span>}
                {i.bonus_percentage && <span>Porcentaje: {i.bonus_percentage}%</span>}
                {i.applies_to && <span>Aplica a: {i.applies_to}</span>}
              </div>
            </div>
            <Badge variant={i.is_active ? 'default' : 'outline'} className="text-xs shrink-0">
              {i.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
          </CardContent>
        </Card>
      ))}
      <p className="text-xs text-muted-foreground text-right">{filtered.length} reglas</p>
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
