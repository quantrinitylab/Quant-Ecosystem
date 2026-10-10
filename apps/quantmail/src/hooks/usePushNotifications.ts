'use client';

/**
 * Push notifications, and the server they actually depend on.
 *
 * The desktop control (`useDesktopNotifications`) fires a notification from
 * this tab. This one is the tab-closed path: a service worker and a
 * `PushManager` subscription registered on the server, which is where new
 * mail actually arrives. The checkbox is on only when the subscription
 * exists — preference, permission and server keys all have to line up, and
 * when the server has no VAPID keys yet the control says so instead of
 * sitting ticked over a delivery path that does not exist.
 *
 * All of the flow lives in `PushNotificationClient`
 * (`lib/push-notifications-client`); this hook is its React state.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PushNotificationClient,
  createBrowserPushDeps,
  type PushClientStatus,
} from '../lib/push-notifications-client';

export type PushNotificationStatus = PushClientStatus | 'unknown';

export interface PushNotificationControl {
  status: PushNotificationStatus;
  /** A server-registered subscription exists right now. */
  enabled: boolean;
  busy: boolean;
  setEnabled: (next: boolean) => Promise<void>;
}

export function usePushNotifications(): PushNotificationControl {
  const client = useMemo(() => new PushNotificationClient(createBrowserPushDeps()), []);
  const [status, setStatus] = useState<PushNotificationStatus>('unknown');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await client.getStatus());
    } catch {
      // A failed probe must not flip the switch either way; the next focus
      // re-reads it. Leaving the last known status is the honest render.
    }
  }, [client]);

  useEffect(() => {
    void refresh();
    // Permission revoked in the browser's own site settings fires no event,
    // so re-read on focus — same reasoning as useDesktopNotifications.
    const sync = () => void refresh();
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [refresh]);

  const setEnabled = useCallback(
    async (next: boolean) => {
      setBusy(true);
      try {
        setStatus(next ? await client.enable() : await client.disable());
      } catch {
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [client, refresh],
  );

  return {
    status,
    enabled: status === 'subscribed',
    busy,
    setEnabled,
  };
}
