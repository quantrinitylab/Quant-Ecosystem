'use client';

// ===========================================================================
// QuantMail — read receipts preference (the default for open tracking).
//
// The single per-user setting behind Settings › General › "Read receipts".
// It lives on the server (`User.preferences`), because the compose path
// consults it when a request omits `trackOpens` — storing it locally would
// leave every non-composer send path (quick replies, API clients) on the
// hardcoded default.
//
// Until the GET lands the hook reports `loaded: false` and callers keep the
// tracked default; the server treats an unset value as true, so nothing is
// misrepresented in the gap. A failed PUT keeps the previous value and
// returns false so the caller can say so honestly.
// ===========================================================================

import { useCallback, useEffect, useState } from 'react';
import { browserApiRequest } from '../services/browser-api-request';
import {
  normalizeReadReceiptsEnabled,
} from '../lib/read-receipts-preference';

export interface ReadReceiptsPreferenceControl {
  enabled: boolean;
  /** The server value has arrived at least once. */
  loaded: boolean;
  /** A PUT is in flight. */
  saving: boolean;
  /** Persists the value; resolves false when the server refused. */
  setEnabled: (next: boolean) => Promise<boolean>;
}

export function useReadReceiptsPreference(): ReadReceiptsPreferenceControl {
  const [enabled, setEnabledState] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await browserApiRequest('/api/read-receipts-preference');
        if (!response.ok) return;
        const payload = (await response.json().catch(() => null)) as {
          data?: { enabled?: unknown };
        } | null;
        if (!cancelled) setEnabledState(normalizeReadReceiptsEnabled(payload?.data?.enabled));
      } catch {
        // Background read; callers keep the fail-open default and the
        // server keeps enforcing whatever it stored.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setEnabled = useCallback(async (next: boolean) => {
    setSaving(true);
    try {
      const response = await browserApiRequest('/api/read-receipts-preference', {
        method: 'PUT',
        body: JSON.stringify({ enabled: next }),
      });
      if (!response.ok) return false;
      const payload = (await response.json().catch(() => null)) as {
        data?: { enabled?: unknown };
      } | null;
      setEnabledState(normalizeReadReceiptsEnabled(payload?.data?.enabled ?? next));
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return { enabled, loaded, saving, setEnabled };
}
