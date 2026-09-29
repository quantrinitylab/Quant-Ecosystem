// ============================================================================
// QuantEdits - useAnalytics Hook
// Analytics data fetching with aggregation, date range management
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';

interface KPIMetric {
  label: string;
  value: number;
  previousValue: number;
  change: number;
  format: 'currency' | 'number' | 'percentage' | 'multiplier';
}

interface TimeSeriesPoint {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpm: number;
  roas: number;
  revenue: number;
}

interface BreakdownEntry {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  conversionRate: number;
  roas: number;
}

interface FunnelStage {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

type DateRange = '1d' | '7d' | '14d' | '30d' | '90d' | 'custom';
type Granularity = 'hour' | 'day' | 'week' | 'month';
type BreakdownType = 'placement' | 'device' | 'geo' | 'age' | 'gender' | 'hour';

interface UseAnalyticsOptions {
  campaignId?: string;
  adGroupId?: string;
  initialDateRange?: DateRange;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UseAnalyticsReturn {
  kpis: KPIMetric[];
  timeSeries: TimeSeriesPoint[];
  funnel: FunnelStage[];
  breakdown: BreakdownEntry[];
  loading: boolean;
  error: string | null;
  dateRange: DateRange;
  granularity: Granularity;
  breakdownType: BreakdownType;
  customDateRange: { start: string; end: string };
  setDateRange: (range: DateRange) => void;
  setGranularity: (g: Granularity) => void;
  setBreakdownType: (type: BreakdownType) => void;
  setCustomDateRange: (range: { start: string; end: string }) => void;
  refresh: () => Promise<void>;
  exportData: (format: 'csv' | 'json') => Promise<void>;
  aggregateBy: (field: string) => BreakdownEntry[];
  getTopPerformers: (metric: string, limit?: number) => BreakdownEntry[];
}

export function useAnalytics(options: UseAnalyticsOptions = {}): UseAnalyticsReturn {
  const {
    campaignId,
    adGroupId,
    initialDateRange = '7d',
    autoRefresh = false,
    refreshInterval = 60000,
  } = options;

  const [kpis, setKpis] = useState<KPIMetric[]>([]);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [breakdown, setBreakdown] = useState<BreakdownEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(initialDateRange);
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [breakdownType, setBreakdownType] = useState<BreakdownType>('placement');
  const [customDateRange, setCustomDateRange] = useState<{ start: string; end: string }>({
    start: '',
    end: '',
  });
  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const buildParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams();
    params.set('range', dateRange);
    params.set('granularity', granularity);
    params.set('breakdown', breakdownType);
    if (campaignId) params.set('campaignId', campaignId);
    if (adGroupId) params.set('adGroupId', adGroupId);
    if (dateRange === 'custom' && customDateRange.start && customDateRange.end) {
      params.set('start', customDateRange.start);
      params.set('end', customDateRange.end);
    }
    return params;
  }, [dateRange, granularity, breakdownType, campaignId, adGroupId, customDateRange]);

  const fetchAnalytics = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const params = buildParams();
      const response = await fetch(`/api/analytics/dashboard?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Failed to load analytics');
      const data = await response.json();

      setKpis(data.kpis || []);
      setTimeSeries(data.timeSeries || []);
      setFunnel(data.funnel || []);
      setBreakdown(data.breakdown || []);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Analytics request failed');
      }
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    if (!autoRefresh) return;
    intervalRef.current = setInterval(fetchAnalytics, refreshInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, refreshInterval, fetchAnalytics]);

  useEffect(() => {
    if (dateRange === '1d') setGranularity('hour');
    else if (dateRange === '7d' || dateRange === '14d') setGranularity('day');
    else if (dateRange === '30d') setGranularity('day');
    else if (dateRange === '90d') setGranularity('week');
  }, [dateRange]);

  const aggregateBy = useCallback(
    (field: string): BreakdownEntry[] => {
      const grouped = new Map<string, BreakdownEntry>();
      for (const entry of breakdown) {
        const key = (entry as any)[field] || entry.name;
        if (grouped.has(key)) {
          const existing = grouped.get(key)!;
          existing.spend += entry.spend;
          existing.impressions += entry.impressions;
          existing.clicks += entry.clicks;
          existing.conversions += entry.conversions;
        } else {
          grouped.set(key, { ...entry, name: key });
        }
      }
      return Array.from(grouped.values()).map((entry) => ({
        ...entry,
        ctr: entry.impressions > 0 ? (entry.clicks / entry.impressions) * 100 : 0,
        conversionRate: entry.clicks > 0 ? (entry.conversions / entry.clicks) * 100 : 0,
        roas: entry.spend > 0 ? (entry.conversions * 50) / entry.spend : 0,
      }));
    },
    [breakdown],
  );

  const getTopPerformers = useCallback(
    (metric: string, limit: number = 5): BreakdownEntry[] => {
      return [...breakdown]
        .sort((a, b) => ((b as any)[metric] || 0) - ((a as any)[metric] || 0))
        .slice(0, limit);
    },
    [breakdown],
  );

  const exportData = useCallback(
    async (format: 'csv' | 'json') => {
      try {
        const params = buildParams();
        params.set('format', format);
        const response = await fetch(`/api/analytics/export?${params.toString()}`);
        if (!response.ok) throw new Error('Export failed');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics_${dateRange}_${new Date().toISOString().split('T')[0]}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err: any) {
        setError(err.message);
      }
    },
    [buildParams, dateRange],
  );

  const refresh = useCallback(async () => {
    await fetchAnalytics();
  }, [fetchAnalytics]);

  return {
    kpis,
    timeSeries,
    funnel,
    breakdown,
    loading,
    error,
    dateRange,
    granularity,
    breakdownType,
    customDateRange,
    setDateRange,
    setGranularity,
    setBreakdownType,
    setCustomDateRange,
    refresh,
    exportData,
    aggregateBy,
    getTopPerformers,
  };
}

export default useAnalytics;
