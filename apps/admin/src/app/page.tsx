'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { Card, Badge } from '@quant/shared-ui';
import { MetricCard } from '../components/MetricCard';

interface MetricData {
  label: string;
  value: number;
  formattedValue?: string;
  trend: 'up' | 'down' | 'neutral';
  trendLabel: string;
  sparklineData: number[];
  subtitle: string;
}

interface SystemHealth {
  cpu: number;
  memory: number;
  disk: number;
}

interface AppHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  port: number;
  version: string;
}

const defaultMetrics: MetricData[] = [
  {
    label: 'Total Users',
    value: 24891,
    trend: 'up',
    trendLabel: '+12%',
    sparklineData: [18200, 19400, 20100, 21300, 22800, 23900, 24891],
    subtitle: 'Across all applications',
  },
  {
    label: 'Requests/min',
    value: 8432,
    trend: 'up',
    trendLabel: '+5.2%',
    sparklineData: [7100, 7400, 7800, 8100, 8000, 8300, 8432],
    subtitle: 'Avg over last hour',
  },
  {
    label: 'Error Rate',
    value: 12,
    formattedValue: '0.12%',
    trend: 'down',
    trendLabel: '-0.03%',
    sparklineData: [22, 19, 18, 15, 14, 13, 12],
    subtitle: 'Below 0.5% threshold',
  },
  {
    label: 'Active Sessions',
    value: 3247,
    trend: 'up',
    trendLabel: '+8%',
    sparklineData: [2800, 2900, 3000, 3100, 3050, 3200, 3247],
    subtitle: 'Connected right now',
  },
];

const defaultHealth: SystemHealth = { cpu: 42, memory: 68, disk: 55 };

const defaultAppHealth: AppHealth[] = [
  { name: 'QuantMail', status: 'healthy', port: 3000, version: '2.1.0' },
  { name: 'QuantChat', status: 'healthy', port: 3001, version: '2.0.3' },
  { name: 'QuantDrive', status: 'healthy', port: 3002, version: '1.8.1' },
  { name: 'QuantCalendar', status: 'healthy', port: 3003, version: '1.5.0' },
  { name: 'QuantMeet', status: 'healthy', port: 3004, version: '1.3.2' },
  { name: 'QuantNotes', status: 'healthy', port: 3005, version: '1.7.0' },
  { name: 'QuantTasks', status: 'healthy', port: 3006, version: '1.4.1' },
  { name: 'QuantGit', status: 'degraded', port: 3007, version: '1.2.0' },
  { name: 'QuantCI', status: 'healthy', port: 3008, version: '1.1.0' },
  { name: 'QuantSync', status: 'healthy', port: 3009, version: '1.6.2' },
  { name: 'QuantAI', status: 'healthy', port: 3010, version: '2.3.0' },
  { name: 'QuantPay', status: 'healthy', port: 3011, version: '1.0.5' },
  { name: 'QuantGames', status: 'healthy', port: 3012, version: '0.9.1' },
  { name: 'QuantForms', status: 'healthy', port: 3013, version: '1.1.3' },
  { name: 'QuantAnalytics', status: 'healthy', port: 3014, version: '1.2.1' },
  { name: 'QuantAdmin', status: 'healthy', port: 3100, version: '1.0.0' },
];

function HealthBar({ label, value }: { label: string; value: number }) {
  const color = value < 70 ? 'bg-green-500' : value < 90 ? 'bg-yellow-500' : 'bg-red-500';
  const textColor = value < 70 ? 'text-green-500' : value < 90 ? 'text-yellow-500' : 'text-red-500';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--quant-foreground)]">{label}</span>
        <span className={`text-sm font-semibold ${textColor}`}>{value}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--quant-muted)]">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ type: 'spring', ...spring.snappy }}
        />
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: AppHealth['status'] }) {
  const colors = {
    healthy: 'bg-green-500',
    degraded: 'bg-yellow-500',
    down: 'bg-red-500',
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status]}`} />;
}

function PulseIndicator({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="relative flex h-3 w-3">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
    </span>
  );
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<MetricData[]>(defaultMetrics);
  const [health, setHealth] = useState<SystemHealth>(defaultHealth);
  const [appHealthData, setAppHealthData] = useState<AppHealth[]>(defaultAppHealth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const [statsRes, healthRes] = await Promise.all([fetch('/api/stats'), fetch('/api/health')]);

      const statsJson = await statsRes.json();
      const healthJson = await healthRes.json();

      if (statsJson.users) {
        setMetrics((prev) => [
          {
            ...prev[0],
            value: statsJson.users.total,
            sparklineData: [...prev[0].sparklineData.slice(1), statsJson.users.total],
          },
          {
            ...prev[1],
            value: statsJson.requests?.perMinute ?? prev[1].value,
            sparklineData: [
              ...prev[1].sparklineData.slice(1),
              statsJson.requests?.perMinute ?? prev[1].value,
            ],
          },
          {
            ...prev[2],
            value: Math.round((statsJson.errors?.rate ?? 0.12) * 100),
            formattedValue: `${(statsJson.errors?.rate ?? 0.12).toFixed(2)}%`,
            sparklineData: [
              ...prev[2].sparklineData.slice(1),
              Math.round((statsJson.errors?.rate ?? 0.12) * 100),
            ],
          },
          {
            ...prev[3],
            value: statsJson.users.online ?? prev[3].value,
            sparklineData: [
              ...prev[3].sparklineData.slice(1),
              statsJson.users.online ?? prev[3].value,
            ],
          },
        ]);
      }

      if (healthJson.system) {
        setHealth({
          cpu: healthJson.system.cpu ?? defaultHealth.cpu,
          memory: healthJson.system.memory ?? defaultHealth.memory,
          disk: healthJson.system.disk ?? defaultHealth.disk,
        });
      }

      if (healthJson.apps) {
        setAppHealthData(
          healthJson.apps.map(
            (app: { name: string; status: string; port: number; version?: string }) => ({
              name: app.name,
              status: app.status as AppHealth['status'],
              port: app.port,
              version: app.version ?? '1.0.0',
            }),
          ),
        );
      }

      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh dashboard data');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--quant-muted-foreground)]">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 flex items-center gap-2">
          <span className="text-yellow-500 text-sm font-medium">&#9888;</span>
          <p className="text-sm text-yellow-600">
            Could not refresh data: {error}. Showing cached data.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--quant-foreground)]">Dashboard</h1>
          <p className="text-sm text-[var(--quant-muted-foreground)] mt-1">
            Overview of the entire Quant Ecosystem
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PulseIndicator active={isRefreshing} />
          <span className="text-xs text-[var(--quant-muted-foreground)]">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AnimatePresence>
          {metrics.map((metric, i) => (
            <MetricCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
              formattedValue={metric.formattedValue}
              trend={metric.trend}
              trendLabel={metric.trendLabel}
              sparklineData={metric.sparklineData}
              subtitle={metric.subtitle}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* System Health */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', ...spring.gentle, delay: 0.1 }}
      >
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold text-[var(--quant-foreground)] mb-4">
              System Health
            </h2>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <HealthBar label="CPU Usage" value={health.cpu} />
              <HealthBar label="Memory Usage" value={health.memory} />
              <HealthBar label="Disk Usage" value={health.disk} />
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Apps Health Grid */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', ...spring.gentle, delay: 0.2 }}
      >
        <h2 className="text-lg font-semibold text-[var(--quant-foreground)] mb-4">
          Application Health
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {appHealthData.map((app) => (
            <Card key={app.name}>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--quant-foreground)]">
                    {app.name}
                  </span>
                  <StatusDot status={app.status} />
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
                  <span>:{app.port}</span>
                  <span>v{app.version}</span>
                  <Badge variant="default">{app.status}</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
