'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Search, FileText, User, AlertTriangle } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { ListaRecortada } from '@/components/hr/ListaRecortada';

/**
 * Contratos de trabajo — pestaña «Contratos» de /personas/consola.
 *
 * Vivía dentro de `src/app/personas/contratos/page.tsx` y la consola lo
 * importaba cruzando el límite de una ruta (`from '@/app/personas/contratos/
 * page'`). Esa ruta ya no está en el menú, así que nadie notó que el único
 * motivo por el que el archivo seguía existiendo era este componente. Ahora
 * vive donde se usa.
 */

const CONTRACT_LABEL: Record<string, string> = {
  full_time: 'Tiempo Completo',
  part_time: 'Medio Tiempo',
  contractor: 'Contratista',
  temporary: 'Temporal',
  intern: 'Pasante',
};

/**
 * Lee por la API, no por `supabase.from(...)`.
 *
 * La versión anterior consultaba `employment_contracts` directo desde el
 * navegador. La publishable key es el rol `anon`, la policy de esa tabla cuelga
 * de `can_supervisor_view_employee(auth.uid(), …)` y acá `auth.uid()` es
 * siempre NULL porque se entra por NextAuth y nunca hay un JWT de Supabase.
 * Resultado: cero filas, devueltas como `200 []`. La tabla tiene contratos
 * (38 al 2026-10-14) y esta pestaña decía «No hay contratos registrados».
 */
function useAllContracts() {
  return useQuery({
    queryKey: ['hr', 'all-contracts'],
    queryFn: async () => {
      const res = await fetch('/api/hr/contracts?limit=500', { credentials: 'include' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'No se pudieron cargar los contratos');
      // Se conserva el `total` del servidor, no sólo las filas: es lo que
      // permite notar un recorte. Ver <ListaRecortada>.
      return { rows: (body?.data ?? []) as any[], total: Number(body?.total ?? 0) };
    },
  });
}

export function ContratosContent() {
  const { data, isLoading, error } = useAllContracts();
  // useMemo y no `?? []` suelto: un array nuevo en cada render invalidaba el
  // useMemo de abajo, que es justo lo que venía a evitar.
  const contracts = useMemo(() => data?.rows ?? [], [data]);
  const total = data?.total ?? 0;
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

  // Un fallo tiene que verse distinto a «no hay nada». Confundir las dos cosas
  // es exactamente lo que escondió este bug: la consulta devolvía vacío y la
  // pantalla lo presentaba como un hecho del taller.
  if (error) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-amber-500" />
        <p className="font-medium text-foreground">No se pudieron cargar los contratos</p>
        <p className="text-xs mt-1">{(error as Error).message}</p>
      </div>
    );
  }

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
      <ListaRecortada cargadas={contracts.length} total={total} sustantivo="contratos" />
      <p className="text-xs text-muted-foreground text-right">{filtered.length} contratos</p>
    </div>
  );
}
