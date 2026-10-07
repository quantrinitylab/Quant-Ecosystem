// ============================================================================
// QuantAI - useUsageStats Hook
// Fetches REAL engagement stats (streak / xp / level / tokens) derived from the
// user's persisted AI sessions via GET /api/usage/stats. No hardcoded values.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '../lib/auth';

export interface UsageStats {
  totalConversations: number;
  totalTokens: number;
  tokensToday: number;
  streakDays: number;
  xp: number;
  level: number;
}

interface UseUsageStatsReturn {
  stats: UsageStats | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

const API_BASE = '/api';

export function useUsageStats(): UseUsageStatsReturn {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/usage/stats`, { headers, signal });
      if (!res.ok) {
        throw new Error(`Failed to load stats: ${res.status}`);
      }
      const json = (await res.json()) as { success?: boolean; data?: UsageStats };
      if (json?.data) {
        setStats(json.data);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchStats(controller.signal);
    return () => controller.abort();
  }, [fetchStats]);

  const refresh = useCallback(() => {
    void fetchStats();
  }, [fetchStats]);

  return { stats, isLoading, error, refresh };
}

export default useUsageStats;
