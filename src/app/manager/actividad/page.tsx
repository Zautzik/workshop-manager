'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useOTs, useWorkers } from '@/hooks/use-operations-queries';
import { useMachines } from '@/hooks/use-machines';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMemo } from 'react';
import { format, parseISO, isValid, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Activity, Users, Cpu, FileText } from 'lucide-react';

type ActivityEntry = { id: string; type: 'ot' | 'worker' | 'machine'; icon: React.ElementType; iconColor: string; title: string; subtitle: string; time: string | null; };

function ActivityFeed() {
  const { data: ots     = [], isLoading: l1 } = useOTs();
  const { data: workers = [], isLoading: l2 } = useWorkers();
  const { data: machines= [], isLoading: l3 } = useMachines();

  const loading = l1 || l2 || l3;

  const feed = useMemo<ActivityEntry[]>(() => {
    const entries: ActivityEntry[] = [];

    for (const ot of (ots as any[]).slice(0, 20)) {
      if (!ot.created_at) continue;
      entries.push({
        id: `ot-${ot.id}`,
        type: 'ot',
        icon: FileText,
        iconColor: 'text-blue-500',
        title: `OT ${ot.ot_number} — ${ot.client_name}`,
        subtitle: `Estado: ${ot.status}`,
        time: ot.created_at,
      });
    }

    for (const m of (machines as any[]).slice(0, 10)) {
      entries.push({
        id: `machine-${m.id}`,
        type: 'machine',
        icon: Cpu,
        iconColor: 'text-orange-500',
        title: `Máquina: ${m.name}`,
        subtitle: `Estado actual: ${m.status}`,
        time: m.updated_at ?? m.created_at ?? null,
      });
    }

    return entries
      .filter(e => e.time && isValid(parseISO(e.time)))
      .sort((a, b) => parseISO(b.time!).getTime() - parseISO(a.time!).getTime())
      .slice(0, 50);
  }, [ots, machines]);

  if (loading) return <div className="space-y-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;

  return (
    <div className="space-y-2">
      {feed.map(entry => {
        const Icon = entry.icon;
        return (
          <Card key={entry.id}>
            <CardContent className="flex items-center gap-4 p-3">
              <Icon className={`h-5 w-5 shrink-0 ${entry.iconColor}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{entry.title}</p>
                <p className="text-xs text-muted-foreground">{entry.subtitle}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                {formatDistanceToNow(parseISO(entry.time!), { addSuffix: true, locale: es })}
              </span>
            </CardContent>
          </Card>
        );
      })}
      {feed.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No hay actividad reciente.</p>
        </div>
      )}
    </div>
  );
}

export default function ManagerActividadPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Actividad del Sistema</h1>
          <p className="text-sm text-muted-foreground mt-1">Log de eventos recientes de OTs y equipos</p>
        </div>
        <ActivityFeed />
      </div>
    </ProtectedRoute>
  );
}
