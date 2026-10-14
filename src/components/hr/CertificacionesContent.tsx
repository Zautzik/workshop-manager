'use client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { BadgeCheck, Search, AlertTriangle, Ban } from 'lucide-react';
import { ListaRecortada } from '@/components/hr/ListaRecortada';

/**
 * Certificaciones de competencias — pestaña «Certificaciones» de
 * /personas/talento. Movido desde `src/app/personas/certificaciones/page.tsx`.
 */

/**
 * Lee por `GET /api/hr/skill-certifications`, no por `supabase.from(...)`.
 *
 * Este archivo ya traía escrita la advertencia, por otro motivo: la auditoría
 * de 2026-08 encontró que el `.order()` citaba columnas inexistentes
 * (`verified_at`, `skill_name`) y tiraba 42703 en cada carga — «which the
 * caller reads as "no certifications registered"». Esa columna se arregló y el
 * síntoma volvió por una causa distinta: la lectura iba como rol `anon` (la
 * publishable key) y la policy de `employee_skills` es `auth.uid() IS NOT
 * NULL`, que acá es siempre falso porque se entra por NextAuth y nunca hay un
 * JWT de Supabase. Cero filas, devueltas como `200 []`.
 *
 * Dos causas, el mismo cartel de «no hay nada». Por eso ahora un fallo se
 * dibuja distinto a un conjunto vacío.
 */
function useAllSkillCerts() {
  return useQuery({
    queryKey: ['hr', 'all-skill-certs'],
    queryFn: async () => {
      const res = await fetch('/api/hr/skill-certifications?limit=500', {
        credentials: 'include',
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'No se pudieron cargar las certificaciones');
      return { rows: (body?.data ?? []) as any[], total: Number(body?.total ?? 0) };
    },
  });
}

export function CertificacionesContent() {
  const { data, isLoading, error } = useAllSkillCerts();
  // useMemo: ver nota en ContratosContent.
  const certs = useMemo(() => data?.rows ?? [], [data]);
  const total = data?.total ?? 0;
  const [search, setSearch] = useState('');

  const today = new Date();

  const filtered = useMemo(() => {
    if (!search.trim()) return certs as any[];
    const q = search.toLowerCase();
    return (certs as any[]).filter(c =>
      c.employees?.full_name?.toLowerCase().includes(q) ||
      c.skills?.name?.toLowerCase().includes(q)
    );
  }, [certs, search]);

  if (isLoading) return <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  if (error) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Ban className="h-10 w-10 mx-auto mb-3 text-amber-500" />
        <p className="font-medium text-foreground">No se pudieron cargar las certificaciones</p>
        <p className="text-xs mt-1">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por empleado o habilidad…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BadgeCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No hay certificaciones registradas.</p>
        </div>
      ) : filtered.map((c: any) => {
        const expiry = c.certification_expires_on ? parseISO(c.certification_expires_on) : null;
        const expired = expiry && expiry < today;
        return (
          <Card key={c.id} className={expired ? 'border-destructive/40' : ''}>
            <CardContent className="flex items-center gap-4 p-4">
              {expired
                ? <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                : <BadgeCheck className="h-5 w-5 text-green-500 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{c.skills?.name ?? 'Habilidad'}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                  <span>{c.employees?.full_name}</span>
                  <span className="capitalize">{c.employees?.department}</span>
                  {c.last_assessed_on && isValid(parseISO(c.last_assessed_on)) && (
                    <span>Verificado: {format(parseISO(c.last_assessed_on), 'PP', { locale: es })}</span>
                  )}
                  {expiry && isValid(expiry) && (
                    <span className={expired ? 'text-destructive font-semibold' : ''}>
                      Vence: {format(expiry, 'PP', { locale: es })}
                    </span>
                  )}
                </div>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">Nv. {c.proficiency_level ?? '—'}</Badge>
            </CardContent>
          </Card>
        );
      })}
      <ListaRecortada cargadas={certs.length} total={total} sustantivo="registros" />
      <p className="text-xs text-muted-foreground text-right">{filtered.length} registros</p>
    </div>
  );
}
