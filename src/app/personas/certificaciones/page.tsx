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
import { BadgeCheck, Search, AlertTriangle } from 'lucide-react';

function useAllSkillCerts() {
  return useQuery({
    queryKey: ['hr', 'all-skill-certs'],
    queryFn: async () => {
      // `employee_skills` has no `verified_at` or `skill_name` — the real
      // columns are `last_assessed_on` and a `skill_id` FK to `skills`. The
      // sort threw on every load (42703), which the caller reads as "no
      // certifications registered" (2026-08 audit).
      const { data, error } = await supabase
        .from('employee_skills')
        .select('*, employees(full_name, department), skills(name)')
        .order('last_assessed_on', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function CertificacionesContent() {
  const { data: certs = [], isLoading } = useAllSkillCerts();
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
      <p className="text-xs text-muted-foreground text-right">{filtered.length} registros</p>
    </div>
  );
}

export default function HRCertificacionesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'supervisor']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Certificaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">Habilidades certificadas y fechas de vencimiento</p>
        </div>
        <CertificacionesContent />
      </div>
    </ProtectedRoute>
  );
}
