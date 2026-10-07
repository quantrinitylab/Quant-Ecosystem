// ============================================================================
// QuantAI - useUsageAnalytics Hook
// Fetches the per-day token/cost/session series from GET /api/usage/daily,
// powering analytics charts. Derives convenient totals for the window.
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { getAuthToken } from '../lib/auth';

export interface DailyUsagePoint {
  date: string;
  tokens: number;
  cost: number;
  sessions: number;
}

interface UseUsageAnalyticsReturn {
  series: DailyUsagePoint[];
  totals: { tokens: number; cost: number; sessions: number };
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useUsageAnalytics(days = 30): UseUsageAnalyticsReturn {
  const [series, setSeries] = useState<DailyUsagePoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSeries = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError(null);
      try {
        const token = getAuthToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/usage/daily?days=${days}`, { headers, signal });
        if (!res.ok) throw new Error(`Failed to load analytics: ${res.status}`);

        const json = (await res.json()) as { data?: DailyUsagePoint[] };
        setSeries(Array.isArray(json.data) ? json.data : []);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setIsLoading(false);
      }
    },
    [days],
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchSeries(controller.signal);
    return () => controller.abort();
  }, [fetchSeries]);

  const totals = useMemo(
    () =>
      series.reduce(
        (acc, p) => ({
          tokens: acc.tokens + p.tokens,
          cost: acc.cost + p.cost,
          sessions: acc.sessions + p.sessions,
        }),
        { tokens: 0, cost: 0, sessions: 0 },
      ),
    [series],
  );

  const refresh = useCallback(() => void fetchSeries(), [fetchSeries]);

  return { series, totals, isLoading, error, refresh };
}

export default useUsageAnalytics;
