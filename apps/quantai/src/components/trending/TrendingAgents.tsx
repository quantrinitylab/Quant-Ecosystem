'use client';

import React from 'react';
import { motion } from 'framer-motion';

export const TrendingAgents: React.FC = () => {
  const trending = [
    { name: 'Super Reasoner Pro', growth: '+124%', category: 'Reasoning', icon: '🧠' },
    { name: 'Creative Writer Elite', growth: '+89%', category: 'Content', icon: '✍️' },
    { name: 'Code Architect', growth: '+156%', category: 'Development', icon: '💻' },
    { name: 'Data Scientist X', growth: '+67%', category: 'Data', icon: '📊' },
  ];

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xl font-semibold">Trending Agents</div>
          <div className="text-sm text-white/50 mt-1">This week • 12,489 installs</div>
        </div>
        <div className="text-xs px-4 py-2 rounded-full bg-white/5">HOT 🔥</div>
      </div>

      <div className="space-y-4">
        {trending.map((agent, index) => (
          <motion.div
            key={index}
            whileHover={{ scale: 1.01 }}
            className="flex items-center gap-4 p-4 rounded-2xl bg-black border border-zinc-900 hover:border-white/20 transition-all"
          >
            <div className="text-3xl">{agent.icon}</div>
            <div className="flex-1">
              <div className="font-semibold">{agent.name}</div>
              <div className="text-xs text-white/50">{agent.category}</div>
            </div>
            <div className="text-emerald-400 font-mono text-sm">{agent.growth}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
