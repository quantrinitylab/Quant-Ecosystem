'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuantyPopupData } from './types';

export interface UseQuantyPopupDataOptions {
  /** GET endpoint. Defaults to /api/quanty/popup (see QuantyPopupData contract in types.ts). */
  apiBase?: string;
  /** When false the hook never fetches (popup closed). Defaults to true. */
  enabled?: boolean;
  /** Refetch interval in ms for the live status line. 0 disables. Defaults to 15000. */
  pollIntervalMs?: number;
}

export interface UseQuantyPopupData {
  data: QuantyPopupData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Popup dashboard data: activity history, approvals log, browser tasks,
 * the real cron registry, and identity mtimes — all from the agent core
 * backend at GET {apiBase}.
 *
 * Honesty rule: until the backend implements the endpoint, tabs show their
 * loading skeletons and then honest empty states. The hook never invents
 * entries — a fabricated "activity feed" would be the Drive-phantom-stats
 * anti-pattern all over again.
 */
export function useQuantyPopupData(options: UseQuantyPopupDataOptions = {}): UseQuantyPopupData {
  const { apiBase = '/api/quanty/popup', enabled = true, pollIntervalMs = 15000 } = options;
  const [data, setData] = useState<QuantyPopupData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);

  const fetchData = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiBase, { headers: { Accept: 'application/json' } });
      if (seq !== seqRef.current) return; // superseded
      if (res.status === 404) {
        // Backend not wired yet — honest empty, not an error state.
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as QuantyPopupData;
      setData(payload);
    } catch (e) {
      if (seq !== seqRef.current) return;
      setError(e instanceof Error ? e.message : 'Data load nahi ho paya');
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    if (!enabled) return;
    void fetchData();
    if (pollIntervalMs > 0) {
      const id = window.setInterval(() => void fetchData(), pollIntervalMs);
      return () => window.clearInterval(id);
    }
    return undefined;
  }, [enabled, fetchData, pollIntervalMs]);

  return { data, loading, error, refresh: fetchData };
}
