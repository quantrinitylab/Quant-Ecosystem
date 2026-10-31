'use client';

// ============================================================================
// QuantMail — desktop alert watcher (QM-SCREEN-015).
//
// This is the firing path behind Settings › Notifications › "Desktop
// notifications". `showDesktopNotification` shipped with zero callers and the
// settings toggle persisted a preference nothing read, so the toggle promised
// "a system notification when new mail arrives" and delivered nothing.
//
// The watcher polls the real notifications feed (GET /api/notifications — the
// same source the Notifications center reads; the only producer is the
// inbound-mail webhook creating `new_email` rows). When notifications newer
// than anything this session has seen appear unread while the tab is hidden,
// it fires one OS notification PER unseen notification, in arrival order —
// the same per-email granularity as the tab-closed push path (inbound
// webhook → deliverPushToUser per email). An earlier version inspected only
// data[0] and advanced its seen-newest pointer past the whole batch, so
// three emails landing in one 30s poll window produced one alert and silently
// dropped the other two. `showDesktopNotification` re-checks the
// preference AND the browser permission at fire time, so revoking either one
// stops the alerts with no extra wiring here.
//
// Mounted once in AppShell so the watch is active on every app surface, not
// just the notifications page. Polling runs only while the user opted in and
// the browser granted permission (re-evaluated every render); otherwise this
// hook costs nothing.
// ============================================================================

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { browserApiRequest } from '../services/browser-api-request';
import { showDesktopNotification, desktopNotificationsAllowed } from './useDesktopNotifications';
import { unseenNotifications, recordBatchSeen } from './desktopAlertBatch';
import type { AppNotification } from './useNotifications';

const POLL_MS = 30_000;
const WATCH_LIMIT = 5;

interface WatchPayload {
  success: boolean;
  data?: { notifications: AppNotification[]; unreadCount: number };
}

async function fetchLatest(): Promise<AppNotification[]> {
  try {
    const response = await browserApiRequest(`/api/notifications?limit=${WATCH_LIMIT}`);
    if (!response.ok) return [];
    const payload = (await response.json().catch(() => null)) as WatchPayload | null;
    return payload?.success && payload.data ? payload.data.notifications : [];
  } catch {
    // Background watch must never throw into the shell.
    return [];
  }
}

/**
 * Same-origin guard for the deep link a notification carries. The backend only
 * ever stores paths like `/thread/<id>` or `/inbox`, but a row written by any
 * other path must never become a navigation target.
 */
function safePath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

// Batching rule lives in desktopAlertBatch.ts (dependency-free, unit-tested):
// every unseen row in a batch gets its own alert, oldest first.

export function useNewMailDesktopAlerts(): void {
  const router = useRouter();
  const primed = useRef(false);
  // Every id ever polled this session, not just the newest: advancing a
  // single newest-pointer past a batch is exactly what dropped the older
  // unseen rows in that batch.
  const seenIds = useRef<Set<string>>(new Set());

  const watchEnabled = typeof window !== 'undefined' && desktopNotificationsAllowed();

  const { data } = useQuery({
    queryKey: ['notifications', 'desktop-watch', WATCH_LIMIT],
    queryFn: fetchLatest,
    enabled: watchEnabled,
    refetchInterval: POLL_MS,
    staleTime: POLL_MS - 5_000,
    retry: 1,
  });

  useEffect(() => {
    if (!data || data.length === 0) return;
    if (!primed.current) {
      // First poll only sets the baseline: mail that arrived before this
      // session's watch started is not "new" and must not ping.
      primed.current = true;
      recordBatchSeen(seenIds.current, data);
      return;
    }
    // One alert per unseen notification in this batch — never just data[0].
    // Mark the whole batch seen BEFORE the visibility/read checks, as before:
    // a batch polled while the tab is visible (or already read elsewhere)
    // is consumed, not re-fired on the next poll.
    const fresh = unseenNotifications(data, seenIds.current);
    recordBatchSeen(seenIds.current, data);
    if (fresh.length === 0) return;
    // The tab is visible: the user can see the app; no need to ping them.
    if (!document.hidden) return;
    for (const notification of fresh) {
      if (notification.isRead) continue;
      const target = safePath(notification.actionUrl);
      showDesktopNotification({
        title: notification.title,
        body: notification.body ?? '',
        tag: notification.id,
        onActivate: () => {
          if (target) router.push(target);
        },
      });
    }
  }, [data, router]);
}
