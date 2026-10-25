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
// inbound-mail webhook creating `new_email` rows). When a notification newer
// than anything this session has seen appears unread while the tab is hidden,
// it fires one OS notification for it. `showDesktopNotification` re-checks the
// preference AND the browser permission at fire time, so revoking either one
// stops the alerts with no extra wiring here.
//
// Mounted once in AppShell so the watch is active on every app surface, not
// just the notifications page. Polling runs only while the user opted in and
// the browser granted permission, tracked via a subscription to the
// preference (see `useDesktopNotificationsAllowed`) so a Settings toggle
// starts/stops the 30s poll immediately, without waiting for a remount;
// otherwise this hook costs nothing.
// ============================================================================

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { browserApiRequest } from '../services/browser-api-request';
import { showDesktopNotification, useDesktopNotificationsAllowed } from './useDesktopNotifications';
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

export function useNewMailDesktopAlerts(): void {
  const router = useRouter();
  const primed = useRef(false);
  const seenNewestId = useRef<string | null>(null);

  // Reactive gate, not a per-render read: AppShell does not re-render when
  // Settings toggles the preference, so the old `desktopNotificationsAllowed()`
  // read stayed stale until navigation remounted the shell — enabling left
  // the query `enabled: false` (zero alerts), disabling kept the 30s poll
  // running. This subscription flips `enabled` in the same tick as the toggle.
  const watchEnabled = useDesktopNotificationsAllowed();

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
    // The feed is newest-first (backend orderBy createdAt desc).
    const newest = data[0];
    if (!primed.current) {
      // First poll only sets the baseline: mail that arrived before this
      // session's watch started is not "new" and must not ping.
      primed.current = true;
      seenNewestId.current = newest.id;
      return;
    }
    if (seenNewestId.current === newest.id) return;
    seenNewestId.current = newest.id;
    if (newest.isRead) return;
    // The tab is visible: the user can see the app; no need to ping them.
    if (!document.hidden) return;
    const target = safePath(newest.actionUrl);
    showDesktopNotification({
      title: newest.title,
      body: newest.body ?? '',
      tag: newest.id,
      onActivate: () => {
        if (target) router.push(target);
      },
    });
  }, [data, router]);
}
