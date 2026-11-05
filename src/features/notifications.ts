import { api } from '../api';
import type { ApiItem, ApiResponse } from '../lib/api-types';
import { invalidateApi, useApiQuery } from '../lib/query';

export type NotificationItem = ApiItem<'/api/v1/notifications'>;
export type NotificationPage = ApiResponse<'/api/v1/notifications'>;

const UNREAD_URL = '/api/v1/notifications/unread-count';

/** Unread count. Polls every minute, and only while the tab is visible. */
export function useUnreadCount(enabled = true) {
  const q = useApiQuery<ApiResponse<'/api/v1/notifications/unread-count'>>(enabled ? UNREAD_URL : null, { refetchInterval: 60_000, refetchIntervalInBackground: false, staleTime: 15_000 });
  return q.data?.unread ?? 0;
}

const invalidateNotifications = () => invalidateApi('/api/v1/notifications');

export async function markRead(id: string) {
  await api.post(`/api/v1/notifications/${id}/read`);
  await invalidateNotifications();
}

export async function markAllRead() {
  await api.post('/api/v1/notifications/read-all');
  await invalidateNotifications();
}
