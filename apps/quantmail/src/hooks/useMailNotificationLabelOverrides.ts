'use client';

// ============================================================================
// QuantMail — per-label notification overrides (label id → 'all' | 'none').
//
// Gmail's per-label "Notify for every message", plus the mute side. The map
// lives on the server (`User.preferences`): the inbound webhook consults it
// before creating a `new_email` notification, so one setting covers the
// in-app bell, web push and the desktop-alert watcher's feed. An absent entry
// means "follow the global mode"; the server drops ids that are not the
// caller's labels and reports them in `dropped`, so a save never pretends
// an override took effect when it did not.
//
// Until the GET lands the hook reports `loaded: false` and the settings UI
// renders the fail-open default (no overrides); a failed PUT keeps the
// previous map and returns false so the caller can say so honestly.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { browserApiRequest } from '../services/browser-api-request';
import {
  normalizeMailNotificationLabelOverrides,
  type MailNotificationLabelOverride,
  type MailNotificationLabelOverrides,
} from '../lib/mail-notification-mode';

export interface MailNotificationLabelOverridesControl {
  overrides: MailNotificationLabelOverrides;
  /** The server value has arrived at least once. */
  loaded: boolean;
  /** A PUT is in flight. */
  saving: boolean;
  /** Ids the server dropped on the last save because they are not this user's labels. */
  dropped: string[];
  /**
   * Persists one label's override (`null` removes the entry, i.e. "follow the
   * global mode"). Resolves `{ ok: false }` when the server refused, leaving
   * the map unchanged; on success `dropped` carries the ids the server
   * dropped because they are not this user's labels, returned inline (not via
   * state) so the caller toasts the save it just made, not the previous one.
   */
  setOverride: (
    labelId: string,
    next: MailNotificationLabelOverride | null,
  ) => Promise<{ ok: boolean; dropped: string[] }>;
}

export function useMailNotificationLabelOverrides(): MailNotificationLabelOverridesControl {
  const [overrides, setOverridesState] = useState<MailNotificationLabelOverrides>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dropped, setDropped] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await browserApiRequest(
          '/api/notifications/mail-notification-label-overrides',
        );
        if (!response.ok) return;
        const payload = (await response.json().catch(() => null)) as {
          data?: { overrides?: unknown };
        } | null;
        if (!cancelled) {
          setOverridesState(normalizeMailNotificationLabelOverrides(payload?.data?.overrides));
        }
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

  const setOverride = useCallback(
    async (labelId: string, next: MailNotificationLabelOverride | null) => {
      const nextMap: MailNotificationLabelOverrides = { ...overrides };
      if (next === null) delete nextMap[labelId];
      else nextMap[labelId] = next;
      setSaving(true);
      try {
        const response = await browserApiRequest(
          '/api/notifications/mail-notification-label-overrides',
          {
            method: 'PUT',
            body: JSON.stringify({ overrides: nextMap }),
          },
        );
        if (!response.ok) return { ok: false, dropped: [] };
        const payload = (await response.json().catch(() => null)) as {
          data?: { overrides?: unknown; dropped?: unknown };
        } | null;
        setOverridesState(
          normalizeMailNotificationLabelOverrides(payload?.data?.overrides ?? nextMap),
        );
        const dropped = Array.isArray(payload?.data?.dropped)
          ? payload.data.dropped.filter((id): id is string => typeof id === 'string')
          : [];
        setDropped(dropped);
        return { ok: true, dropped };
      } catch {
        return { ok: false, dropped: [] };
      } finally {
        setSaving(false);
      }
    },
    [overrides],
  );

  return { overrides, loaded, saving, dropped, setOverride };
}
