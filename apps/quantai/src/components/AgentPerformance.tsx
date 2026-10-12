import React, { useState, useEffect } from 'react';
import { apiFetchRaw } from '@quant/api-client';

interface AgentStats {
  agentId: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageResponseTime: number;
  /**
   * Optional: the backend /analytics/agents/top payload does not include
   * this field — it is derived from successfulRuns / totalRuns when absent.
   */
  successRate?: number;
  lastUsed: string;
}

export interface NormalizedAgentStats extends AgentStats {
  successRate: number;
}

/**
 * Type-guard: the analytics payload must be an array of agent stat objects
 * with the numeric fields the table needs. Anything else is rejected so a
 * malformed backend response can never reach the render path.
 */
export function isAgentStatsArray(data: unknown): data is AgentStats[] {
  return (
    Array.isArray(data) &&
    data.every(
      (item): item is AgentStats =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as AgentStats).agentId === 'string' &&
        typeof (item as AgentStats).totalRuns === 'number' &&
        typeof (item as AgentStats).successfulRuns === 'number' &&
        typeof (item as AgentStats).averageResponseTime === 'number',
    )
  );
}

/**
 * Normalize backend rows into the shape the table renders. The backend's
 * getTopAgents() omits successRate, so derive it from successfulRuns /
 * totalRuns (0 when there are no runs) instead of crashing on
 * `undefined.toFixed()`.
 */
export function normalizeStats(raw: AgentStats[]): NormalizedAgentStats[] {
  return raw.map((stat) => ({
    ...stat,
    successRate:
      typeof stat.successRate === 'number' && Number.isFinite(stat.successRate)
        ? stat.successRate
        : stat.totalRuns > 0
          ? (stat.successfulRuns / stat.totalRuns) * 100
          : 0,
  }));
}

/**
 * Fetch the top-agent performance rows. Throws on HTTP errors (e.g. the
 * analytics service being down) or malformed payloads — the caller renders an
 * honest error state instead of swallowing the failure.
 */
export async function fetchAgentStats(): Promise<NormalizedAgentStats[]> {
  const response = await apiFetchRaw('/api/analytics/agents/top');
  if (!response.ok) {
    throw new Error(`Analytics request failed with status ${response.status}`);
  }
  const data: unknown = await response.json();
  if (!isAgentStatsArray(data)) {
    throw new Error('Analytics response was not in the expected format');
  }
  return normalizeStats(data);
}

export const AgentPerformance: React.FC = () => {
  const [stats, setStats] = useState<NormalizedAgentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await fetchAgentStats());
    } catch (err) {
      setStats([]);
      setError(err instanceof Error ? err.message : 'Failed to load performance data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Agent Performance</h1>
        <button
          onClick={loadStats}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">Loading performance data…</div>
      ) : error ? (
        <div className="text-center py-12 bg-white rounded-xl shadow">
          <p className="text-gray-800 font-medium">Couldn&apos;t load performance data.</p>
          <p className="text-gray-500 text-sm mt-2">
            The analytics service may be unavailable — check your connection and try again.
          </p>
          <p className="text-gray-400 text-xs mt-1">{error}</p>
          <button
            onClick={loadStats}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
          >
            Retry
          </button>
        </div>
      ) : stats.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow">
          <p className="text-gray-800 font-medium">No performance data has been recorded yet.</p>
          <p className="text-gray-500 text-sm mt-2">
            Agent runs will appear here once the backend starts tracking them.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Agent</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Runs</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Success Rate
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Avg Response
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Last Used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {stats.map((stat) => (
                <tr key={stat.agentId}>
                  <td className="px-6 py-4 font-medium">{stat.agentId}</td>
                  <td className="px-6 py-4">{stat.totalRuns}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded text-sm ${
                        stat.successRate > 90
                          ? 'bg-green-100 text-green-800'
                          : stat.successRate > 70
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {stat.successRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4">{stat.averageResponseTime}ms</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(stat.lastUsed).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
