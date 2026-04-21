'use client';

import { useMemo, useState } from 'react';
import { Bell, CheckCheck, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useNotifications,
} from '@/hooks/use-notifications';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotificationsManagement() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');

  const { data: notifications = [], isLoading } = useNotifications({ limit: 200 });
  const markOne = useMarkNotificationsRead();
  const markAll = useMarkAllNotificationsRead();

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notifications.filter((n) => {
      const passesState =
        filter === 'all' || (filter === 'unread' ? !n.is_read : n.is_read);

      if (!passesState) return false;
      if (!q) return true;

      return (
        n.title.toLowerCase().includes(q) ||
        (n.message ?? '').toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q)
      );
    });
  }, [notifications, filter, query]);

  return (
    <div className="space-y-4">
      <Card className="p-4 border-border bg-card/70">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por título, mensaje o tipo..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={filter === 'all' ? 'default' : 'outline'}
              onClick={() => setFilter('all')}
            >
              Todas
            </Button>
            <Button
              size="sm"
              variant={filter === 'unread' ? 'default' : 'outline'}
              onClick={() => setFilter('unread')}
            >
              No leidas
            </Button>
            <Button
              size="sm"
              variant={filter === 'read' ? 'default' : 'outline'}
              onClick={() => setFilter('read')}
            >
              Leidas
            </Button>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => markAll.mutate()}
            disabled={unreadCount === 0 || markAll.isPending}
          >
            <CheckCheck className="h-4 w-4 mr-1" />
            Marcar todo
          </Button>
        </div>
      </Card>

      <div className="space-y-2">
        {isLoading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Cargando notificaciones...</Card>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">No hay notificaciones para este filtro.</Card>
        ) : (
          filtered.map((n) => (
            <Card
              key={n.id}
              className={`p-4 border-border ${n.is_read ? 'bg-card/50' : 'bg-primary/5 border-primary/30'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm text-foreground truncate">{n.title}</h3>
                    {!n.is_read && <Badge variant="default">Nuevo</Badge>}
                    <Badge variant="outline">{n.type}</Badge>
                  </div>
                  {n.message && (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{n.message}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">{formatDate(n.created_at)}</p>
                </div>

                {!n.is_read && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => markOne.mutate([n.id])}
                    disabled={markOne.isPending}
                  >
                    Marcar leida
                  </Button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
