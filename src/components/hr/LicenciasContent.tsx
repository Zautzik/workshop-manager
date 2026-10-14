'use client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarDays, User, Search, AlertTriangle } from 'lucide-react';
import { ListaRecortada } from '@/components/hr/ListaRecortada';

/**
 * Licencias y permisos — pestaña «Asistencia» de /personas/consola.
 *
 * Se movió desde `src/app/personas/licencias/page.tsx`, que la consola
 * importaba cruzando el límite de una ruta ya retirada del menú.
 */

const LEAVE_LABEL: Record<string, string> = {
  vacation: 'Vacaciones', sick: 'Enfermedad', personal: 'Personal',
  maternity: 'Maternidad', paternity: 'Paternidad', unpaid: 'Sin sueldo', other: 'Otro',
};
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-500', approved: 'bg-green-500', rejected: 'bg-red-500', cancelled: 'bg-gray-400',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', cancelled: 'Cancelada',
};

/**
 * Lee por `GET /api/leave-requests`, no por `supabase.from(...)`.
 *
 * La lectura directa iba como rol `anon` (la publishable key), y la policy de
 * `leave_requests` cuelga de `can_supervisor_view_employee(auth.uid(), …)`.
 * Con NextAuth `auth.uid()` es siempre NULL, así que devolvía cero filas como
 * `200 []` y la pestaña afirmaba que no había licencias. Ver
 * `/api/hr/contracts` para el diagnóstico completo.
 */
function useAllLeaveRequests() {
  return useQuery({
    queryKey: ['hr', 'all-leave-requests'],
    queryFn: async () => {
      const res = await fetch('/api/leave-requests?limit=500', { credentials: 'include' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'No se pudieron cargar las licencias');
      return { rows: (body?.data ?? []) as any[], total: Number(body?.total ?? 0) };
    },
  });
}

export function LicenciasContent() {
  const { data, isLoading, error } = useAllLeaveRequests();
  // useMemo: ver nota en ContratosContent.
  const requests = useMemo(() => data?.rows ?? [], [data]);
  const total = data?.total ?? 0;
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const filtered = useMemo(() => {
    let list = requests as any[];
    if (filterStatus !== 'all') list = list.filter(r => r.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.employees?.full_name?.toLowerCase().includes(q));
    }
    return list;
  }, [requests, search, filterStatus]);

  if (isLoading) return <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  // Un fallo no puede verse igual que «no hay nada»: esa confusión es la que
  // mantuvo este bug invisible.
  if (error) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-amber-500" />
        <p className="font-medium text-foreground">No se pudieron cargar las licencias</p>
        <p className="text-xs mt-1">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar empleado…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No hay licencias registradas.</p>
        </div>
      ) : filtered.map((r: any) => (
        <Card key={r.id}>
          <CardContent className="flex items-center gap-4 p-4">
            <User className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{r.employees?.full_name ?? 'Empleado'}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                <span>{LEAVE_LABEL[r.leave_type] ?? r.leave_type}</span>
                {r.start_date && isValid(parseISO(r.start_date)) && (
                  <span>{format(parseISO(r.start_date), 'PP', { locale: es })} → {r.end_date && isValid(parseISO(r.end_date)) ? format(parseISO(r.end_date), 'PP', { locale: es }) : '?'}</span>
                )}
                {r.hours_requested > 0 && <span>{r.hours_requested}h</span>}
              </div>
            </div>
            <Badge className={`text-xs shrink-0 ${STATUS_COLOR[r.status] ?? 'bg-gray-400'} text-white`}>
              {STATUS_LABEL[r.status] ?? r.status}
            </Badge>
          </CardContent>
        </Card>
      ))}
      <ListaRecortada cargadas={requests.length} total={total} sustantivo="solicitudes" />
      <p className="text-xs text-muted-foreground text-right">{filtered.length} solicitudes</p>
    </div>
  );
}
