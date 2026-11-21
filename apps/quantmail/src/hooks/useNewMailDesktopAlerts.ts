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
// the browser granted permission (re-evaluated every render); otherwise this
// hook costs nothing.
// ============================================================================

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { browserApiRequest } from '../services/browser-api-request';
import { showDesktopNotification, desktopNotificationsAllowed } from './useDesktopNotifications';
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

/**
 * The collapse key for a desktop alert. Must match the web-push path exactly
 * (inbound-webhook.ts: `tag: email.threadId ?? email.id`) and the contract on
 * DesktopNotificationInput.tag ("one tag per conversation"): every message of
 * one thread shares one tag, so a thread gaining three messages replaces its
 * own notification instead of stacking three.
 *
 * Previously this was `newest.id` — the notification row's own id, unique per
 * message — which defeated the documented collapse. The thread id comes from
 * the row's stored `data` first (the same source the push path reads the email
 * from); the `/thread/<id>` deep link is the fallback for rows whose payload
 * predates or lacks it; a thread-less mail falls back to its own id, exactly
 * like the push path's `?? email.id` fallback.
 */
export function desktopAlertTag(notification: AppNotification): string {
  const threadId = notification.data?.threadId;
  if (threadId) return threadId;
  const emailId = notification.data?.emailId;
  const actionUrl = notification.actionUrl;
  if (actionUrl) {
    const match = /^\/thread\/([^/?#]+)$/.exec(actionUrl);
    if (match) return decodeURIComponent(match[1]);
  }
  if (emailId) return emailId;
  return notification.id;
}

export function useNewMailDesktopAlerts(): void {
  const router = useRouter();
  const primed = useRef(false);
  const seenNewestId = useRef<string | null>(null);

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
      tag: desktopAlertTag(newest),
      onActivate: () => {
        if (target) router.push(target);
      },
    });
  }, [data, router]);
}
