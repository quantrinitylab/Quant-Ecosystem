'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface AnalyticsData {
  totalUsers: number;
  activeUsers: number;
  totalAgents: number;
  agentRuns: number;
  revenue: number;
  topAgents: Array<{ id: string; runs: number; growth: number }>;
}

export const AnalyticsDashboard: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => {
      setData({
        totalUsers: 1240000,
        activeUsers: 892000,
        totalAgents: 7,
        agentRuns: 45600000,
        revenue: 12400000,
        topAgents: [
          { id: 'quantai-agent', runs: 12400000, growth: 18 },
          { id: 'quantchat-agent', runs: 8900000, growth: 24 },
          { id: 'quantmail-agent', runs: 6700000, growth: 12 },
        ],
      });
      setLoading(false);
    }, 800);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-zinc-500">Loading intelligence...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-12">
          <div>
            <div className="text-emerald-400 text-sm tracking-[4px]">LIVE INTELLIGENCE</div>
            <h1 className="text-7xl font-bold tracking-[-3px] mt-2">QuantOS Analytics</h1>
          </div>
          <div className="text-right">
            <div className="text-emerald-400 text-sm">LAST 30 DAYS</div>
            <div className="text-2xl font-mono text-white/60">MAR 10 — APR 9</div>
          </div>
        </div>

        {/* Big Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {[
            {
              label: 'TOTAL USERS',
              value: (data?.totalUsers ?? 0).toLocaleString(),
              change: '+142k',
              color: 'emerald',
            },
            {
              label: 'ACTIVE TODAY',
              value: (data?.activeUsers ?? 0).toLocaleString(),
              change: '+89k',
              color: 'amber',
            },
            {
              label: 'AGENT RUNS',
              value: ((data?.agentRuns ?? 0) / 1000000).toFixed(1) + 'M',
              change: '+2.4M',
              color: 'purple',
            },
            {
              label: 'REVENUE',
              value: '$' + ((data?.revenue ?? 0) / 1000000).toFixed(1) + 'M',
              change: '+$1.2M',
              color: 'rose',
            },
          ].map((stat, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -4 }}
              className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8"
            >
              <div className="text-xs tracking-[2px] text-zinc-500">{stat.label}</div>
              <div className="text-6xl font-mono font-bold mt-4 tracking-[-2px]">{stat.value}</div>
              <div className={`text-sm mt-3 text-${stat.color}-400`}>{stat.change} this month</div>
            </motion.div>
          ))}
        </div>

        {/* Top Agents */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="text-xl font-semibold">Top Performing Agents</div>
              <div className="text-zinc-500 text-sm">Ranked by execution volume</div>
            </div>
          </div>

          <div className="space-y-4">
            {data?.topAgents.map((agent, index) => (
              <div
                key={index}
                className="flex items-center gap-6 p-5 rounded-2xl bg-black border border-zinc-900 hover:border-zinc-700 transition-all"
              >
                <div className="text-5xl w-16">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-2xl">{agent.id}</div>
                  <div className="text-emerald-400 text-sm mt-1">
                    {agent.runs.toLocaleString()} executions
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-mono text-emerald-400">+{agent.growth}%</div>
                  <div className="text-xs text-zinc-500">GROWTH</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
