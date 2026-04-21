'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface NotificationItem {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export const notificationQueryKeys = {
  all: ['notifications'] as const,
  unread: ['notifications', 'unread'] as const,
};

export function useNotifications(opts?: { unreadOnly?: boolean; limit?: number }) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const allKey = notificationQueryKeys.all;
  const unreadKey = notificationQueryKeys.unread;

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const inserted = payload.new as NotificationItem;

          qc.setQueryData<NotificationItem[]>(allKey, (prev = []) => {
            const exists = prev.some((n) => n.id === inserted.id);
            if (exists) return prev;
            return [inserted, ...prev];
          });

          if (!inserted.is_read) {
            qc.setQueryData<NotificationItem[]>(unreadKey, (prev = []) => {
              const exists = prev.some((n) => n.id === inserted.id);
              if (exists) return prev;
              return [inserted, ...prev];
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as NotificationItem;

          qc.setQueryData<NotificationItem[]>(allKey, (prev = []) =>
            prev.map((n) => (n.id === updated.id ? updated : n))
          );

          qc.setQueryData<NotificationItem[]>(unreadKey, (prev = []) => {
            const withoutCurrent = prev.filter((n) => n.id !== updated.id);
            if (updated.is_read) return withoutCurrent;
            return [updated, ...withoutCurrent];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, unreadKey, allKey, user?.id]);

  return useQuery<NotificationItem[]>({
    queryKey: opts?.unreadOnly ? notificationQueryKeys.unread : notificationQueryKeys.all,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (opts?.unreadOnly) params.set('unread', 'true');
      if (opts?.limit) params.set('limit', String(opts.limit));

      const query = params.toString();
      const res = await fetch(`/api/notifications${query ? `?${query}` : ''}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to fetch notifications');
      }
      return res.json();
    },
    staleTime: 15_000,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to mark notifications as read');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationQueryKeys.all });
      qc.invalidateQueries({ queryKey: notificationQueryKeys.unread });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark_all_read: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to mark all notifications as read');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationQueryKeys.all });
      qc.invalidateQueries({ queryKey: notificationQueryKeys.unread });
    },
  });
}
