'use client';

import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HEADER_ICON, HEADER_ICON_BUTTON } from '@/components/shell/header-controls';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useNotifications,
} from '@/hooks/use-notifications';

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NotificationCenter() {
  const { data: notifications = [] } = useNotifications({ unreadOnly: true, limit: 20 });
  const markOne = useMarkNotificationsRead();
  const markAll = useMarkAllNotificationsRead();

  const unreadCount = notifications.length;

  return (
    <DropdownMenu>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={
                unreadCount > 0
                  ? `Notificaciones, ${unreadCount} sin leer`
                  : 'Notificaciones'
              }
              className={HEADER_ICON_BUTTON}
            >
              <Bell className={HEADER_ICON} />
              {unreadCount > 0 && (
                // Kept inside the 36px box. The old badge sat at -top-1 -right-1,
                // so it hung outside the control and crowded its neighbour.
                <Badge
                  variant="destructive"
                  className="pointer-events-none absolute right-0.5 top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-[3px] text-[9px] font-semibold leading-none tabular-nums"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Badge>
              )}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {unreadCount > 0 ? `Notificaciones · ${unreadCount} sin leer` : 'Notificaciones'}
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-96 max-w-[90vw]">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Notificaciones</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => markAll.mutate()}
            disabled={unreadCount === 0 || markAll.isPending}
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            Marcar todo
          </Button>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {unreadCount === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            No tienes notificaciones pendientes.
          </div>
        ) : (
          notifications.map((item) => (
            <DropdownMenuItem
              key={item.id}
              className="flex flex-col items-start gap-1 py-2"
              onSelect={(event) => {
                event.preventDefault();
                markOne.mutate([item.id]);
              }}
            >
              <div className="w-full flex items-start justify-between gap-2">
                <span className="font-medium text-sm leading-tight">{item.title}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{formatWhen(item.created_at)}</span>
              </div>
              {item.message && (
                <p className="text-xs text-muted-foreground leading-snug w-full">{item.message}</p>
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
