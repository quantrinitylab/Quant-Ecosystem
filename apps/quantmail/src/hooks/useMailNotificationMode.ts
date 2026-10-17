'use client';

// ============================================================================
// QuantMail — mail notification mode (all / important only / off).
//
// The single per-user setting behind Settings › Notifications › "Notify me
// about". It lives on the server (`User.preferences`), because the inbound
// webhook consults it before creating a `new_email` notification — the one
// write that feeds the in-app bell, web push, and this tab's desktop-alert
// watcher. Storing it locally would leave push and the bell unfiltered.
//
// Until the GET lands the hook reports `loaded: false` and the settings UI
// renders the last-known default; the server treats an unset mode as 'all',
// so nothing is misrepresented in the gap. A failed PUT keeps the previous
// mode and returns false so the caller can say so honestly.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { browserApiRequest } from '../services/browser-api-request';
import {
  normalizeMailNotificationMode,
  type MailNotificationMode,
} from '../lib/mail-notification-mode';

export interface MailNotificationModeControl {
  mode: MailNotificationMode;
  /** The server value has arrived at least once. */
  loaded: boolean;
  /** A PUT is in flight. */
  saving: boolean;
  /** Persists the mode; resolves false when the server refused. */
  setMode: (next: MailNotificationMode) => Promise<boolean>;
}

export function useMailNotificationMode(): MailNotificationModeControl {
  const [mode, setModeState] = useState<MailNotificationMode>('all');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await browserApiRequest('/api/notifications/mail-notification-mode');
        if (!response.ok) return;
        const payload = (await response.json().catch(() => null)) as {
          data?: { mode?: unknown };
        } | null;
        if (!cancelled) setModeState(normalizeMailNotificationMode(payload?.data?.mode));
      } catch {
        // Background read; the settings UI keeps the fail-open default and the
        // server keeps enforcing whatever it stored.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback(async (next: MailNotificationMode) => {
    setSaving(true);
    try {
      const response = await browserApiRequest('/api/notifications/mail-notification-mode', {
        method: 'PUT',
        body: JSON.stringify({ mode: next }),
      });
      if (!response.ok) return false;
      const payload = (await response.json().catch(() => null)) as {
        data?: { mode?: unknown };
      } | null;
      setModeState(normalizeMailNotificationMode(payload?.data?.mode ?? next));
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return { mode, loaded, saving, setMode };
}
