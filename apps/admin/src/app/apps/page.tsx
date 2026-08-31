'use client';

import { useState, useEffect } from 'react';
import { Card, Badge, Button } from '@quant/shared-ui';

interface EcosystemApp {
  id: string;
  name: string;
  enabled: boolean;
  version: string;
  port: number;
  lastDeploy: string;
  status: 'running' | 'stopped' | 'error';
}

const defaultAppsData: EcosystemApp[] = [
  {
    id: 'quantmail',
    name: 'QuantMail',
    enabled: true,
    version: '1.0.0',
    port: 3000,
    lastDeploy: '2024-01-15 14:30',
    status: 'running',
  },
  {
    id: 'quantchat',
    name: 'QuantChat',
    enabled: true,
    version: '1.0.0',
    port: 3001,
    lastDeploy: '2024-01-15 14:30',
    status: 'running',
  },
  {
    id: 'quantdrive',
    name: 'QuantDrive',
    enabled: true,
    version: '1.0.0',
    port: 3002,
    lastDeploy: '2024-01-15 13:00',
    status: 'running',
  },
  {
    id: 'quantcalendar',
    name: 'QuantCalendar',
    enabled: true,
    version: '1.0.0',
    port: 3003,
    lastDeploy: '2024-01-14 20:00',
    status: 'running',
  },
  {
    id: 'quantmeet',
    name: 'QuantMeet',
    enabled: true,
    version: '1.0.0',
    port: 3004,
    lastDeploy: '2024-01-14 18:00',
    status: 'running',
  },
  {
    id: 'quantnotes',
    name: 'QuantNotes',
    enabled: true,
    version: '1.0.0',
    port: 3005,
    lastDeploy: '2024-01-14 16:00',
    status: 'running',
  },
  {
    id: 'quanttasks',
    name: 'QuantTasks',
    enabled: true,
    version: '1.0.0',
    port: 3006,
    lastDeploy: '2024-01-14 15:00',
    status: 'running',
  },
  {
    id: 'quantcode',
    name: 'QuantGit',
    enabled: true,
    version: '1.0.0',
    port: 3007,
    lastDeploy: '2024-01-14 14:00',
    status: 'running',
  },
  {
    id: 'quantci',
    name: 'QuantCI',
    enabled: true,
    version: '1.0.0',
    port: 3008,
    lastDeploy: '2024-01-14 12:00',
    status: 'running',
  },
  {
    id: 'quantsocial',
    name: 'QuantSocial',
    enabled: true,
    version: '1.0.0',
    port: 3009,
    lastDeploy: '2024-01-13 22:00',
    status: 'running',
  },
  {
    id: 'quantai',
    name: 'QuantAI',
    enabled: true,
    version: '1.0.0',
    port: 3010,
    lastDeploy: '2024-01-13 20:00',
    status: 'running',
  },
  {
    id: 'quantpay',
    name: 'QuantPay',
    enabled: true,
    version: '1.0.0',
    port: 3011,
    lastDeploy: '2024-01-13 18:00',
    status: 'running',
  },
  {
    id: 'quantgames',
    name: 'QuantGames',
    enabled: true,
    version: '1.0.0',
    port: 3012,
    lastDeploy: '2024-01-13 16:00',
    status: 'running',
  },
  {
    id: 'quantforms',
    name: 'QuantForms',
    enabled: true,
    version: '1.0.0',
    port: 3013,
    lastDeploy: '2024-01-13 14:00',
    status: 'running',
  },
  {
    id: 'quantanalytics',
    name: 'QuantAnalytics',
    enabled: true,
    version: '1.0.0',
    port: 3014,
    lastDeploy: '2024-01-13 12:00',
    status: 'running',
  },
  {
    id: 'quantadmin',
    name: 'QuantAdmin',
    enabled: true,
    version: '1.0.0',
    port: 3100,
    lastDeploy: '2024-01-15 15:00',
    status: 'running',
  },
];

export default function AppsPage() {
  const [search, setSearch] = useState('');
  const [appsData, setAppsData] = useState<EcosystemApp[]>(defaultAppsData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch('/api/health');
        const json = await res.json();
        if (json.apps) {
          setAppsData(
            json.apps.map((app: { name: string; status: string; port: number }) => ({
              id: app.name.toLowerCase().replace(/\s+/g, ''),
              name: app.name,
              enabled: app.status === 'healthy',
              version: '1.0.0',
              port: app.port,
              lastDeploy: defaultAppsData.find((d) => d.name === app.name)?.lastDeploy ?? 'N/A',
              status:
                app.status === 'healthy' ? 'running' : app.status === 'down' ? 'stopped' : 'error',
            })),
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load apps');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const filteredApps = appsData.filter((app) =>
    app.name.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--quant-muted-foreground)]">Loading apps...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 flex items-center gap-2">
          <span className="text-yellow-500 text-sm font-medium">&#9888;</span>
          <p className="text-sm text-yellow-600">
            Could not refresh data: {error}. Showing cached data below.
          </p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--quant-foreground)]">Apps Management</h1>
          <p className="text-sm text-[var(--quant-muted-foreground)] mt-1">
            Manage all {appsData.length} ecosystem applications
          </p>
        </div>
        <Button>Deploy All</Button>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search apps..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-4 py-2 text-sm text-[var(--quant-foreground)] placeholder:text-[var(--quant-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
        />
      </div>

      {/* Apps Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--quant-border)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--quant-muted-foreground)]">
                  App
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--quant-muted-foreground)]">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--quant-muted-foreground)]">
                  Version
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--quant-muted-foreground)]">
                  Port
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--quant-muted-foreground)]">
                  Last Deploy
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--quant-muted-foreground)]">
                  Enabled
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredApps.map((app) => (
                <tr key={app.id} className="border-b border-[var(--quant-border)] last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium text-[var(--quant-foreground)]">{app.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={app.status === 'running' ? 'default' : 'default'}>
                      {app.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-[var(--quant-muted-foreground)]">v{app.version}</td>
                  <td className="px-4 py-3 text-[var(--quant-muted-foreground)]">:{app.port}</td>
                  <td className="px-4 py-3 text-[var(--quant-muted-foreground)]">
                    {app.lastDeploy}
                  </td>
                  <td className="px-4 py-3">
                    <div
                      className={`h-4 w-8 rounded-full ${app.enabled ? 'bg-green-500' : 'bg-gray-300'} relative`}
                    >
                      <div
                        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${app.enabled ? 'left-4' : 'left-0.5'}`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
