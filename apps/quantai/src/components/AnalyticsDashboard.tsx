import React, { useState, useEffect } from 'react';

interface AnalyticsData {
  totalUsers: number;
  activeUsers: number;
  totalAgents: number;
  agentRuns: number;
  revenue: number;
  topAgents: Array<{ id: string; runs: number }>;
}

export const AnalyticsDashboard: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate fetching analytics data
    setTimeout(() => {
      setData({
        totalUsers: 1240000,
        activeUsers: 892000,
        totalAgents: 7,
        agentRuns: 45600000,
        revenue: 12400000,
        topAgents: [
          { id: 'quantai-agent', runs: 12400000 },
          { id: 'quantchat-agent', runs: 8900000 },
          { id: 'quantmail-agent', runs: 6700000 },
        ],
      });
      setLoading(false);
    }, 1000);
  }, []);

  if (loading) {
    return <div className="p-6">Loading analytics...</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Platform Analytics</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow p-6">
          <div className="text-sm text-gray-500">Total Users</div>
          <div className="text-3xl font-bold mt-2">{data?.totalUsers.toLocaleString()}</div>
          <div className="text-green-500 text-sm mt-1">↑ 12% from last month</div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <div className="text-sm text-gray-500">Active Users</div>
          <div className="text-3xl font-bold mt-2">{data?.activeUsers.toLocaleString()}</div>
          <div className="text-green-500 text-sm mt-1">↑ 8% from last month</div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <div className="text-sm text-gray-500">Agent Runs</div>
          <div className="text-3xl font-bold mt-2">{data?.agentRuns.toLocaleString()}</div>
          <div className="text-green-500 text-sm mt-1">↑ 24% from last month</div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <div className="text-sm text-gray-500">Revenue</div>
          <div className="text-3xl font-bold mt-2">${data?.revenue.toLocaleString()}</div>
          <div className="text-green-500 text-sm mt-1">↑ 31% from last month</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Top Performing Agents</h2>
        <div className="space-y-4">
          {data?.topAgents.map((agent, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="font-medium">{agent.id}</div>
              <div className="text-gray-600">{agent.runs.toLocaleString()} runs</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
