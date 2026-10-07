import React, { useState, useEffect } from 'react';

interface AgentStats {
  agentId: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageResponseTime: number;
  successRate: number;
  lastUsed: string;
}

export const AgentPerformance: React.FC = () => {
  const [stats, setStats] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(false);

  const loadStats = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/analytics/agents/top');
      const data = await response.json();
      setStats(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Agent Performance</h1>
        <button onClick={loadStats} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">Loading performance data...</div>
      ) : stats.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow">
          <p className="text-gray-500">No performance data yet.</p>
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
              {stats.map((stat, index) => (
                <tr key={index}>
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
