'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface LeaderboardEntry {
  rank: number;
  name: string;
  level: number;
  xp: number;
  streak: number;
  avatar: string;
}

export const Leaderboard: React.FC = () => {
  const entries: LeaderboardEntry[] = [
    { rank: 1, name: 'Alex Chen', level: 89, xp: 124500, streak: 47, avatar: '🧠' },
    { rank: 2, name: 'Sarah Kim', level: 84, xp: 118200, streak: 39, avatar: '🚀' },
    { rank: 3, name: 'Marcus Rodriguez', level: 79, xp: 109800, streak: 52, avatar: '⚡' },
    { rank: 4, name: 'Priya Patel', level: 76, xp: 98700, streak: 28, avatar: '🌟' },
    { rank: 5, name: 'You', level: 52, xp: 45600, streak: 31, avatar: '💎' },
  ];

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-xl font-semibold">Global Leaderboard</div>
          <div className="text-sm text-white/50 mt-1">This week • 124,892 agents competing</div>
        </div>
        <div className="text-xs px-4 py-2 rounded-full bg-white/5">TOP 1%</div>
      </div>

      <div className="space-y-3">
        {entries.map((entry, index) => (
          <motion.div
            key={index}
            whileHover={{ scale: 1.01 }}
            className={`flex items-center gap-5 p-5 rounded-2xl border transition-all ${
              entry.name === 'You'
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-black border-zinc-900'
            }`}
          >
            <div className="w-8 text-center font-mono text-lg text-white/60">{entry.rank}</div>

            <div className="text-3xl">{entry.avatar}</div>

            <div className="flex-1">
              <div className="font-semibold text-lg">{entry.name}</div>
              <div className="text-sm text-white/50">
                Level {entry.level} • {entry.streak} day streak
              </div>
            </div>

            <div className="text-right">
              <div className="font-mono text-xl text-emerald-400">
                {(entry.xp / 1000).toFixed(0)}k
              </div>
              <div className="text-xs text-white/40">XP</div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 text-center">
        <button className="text-sm text-white/60 hover:text-white transition-colors">
          View full leaderboard →
        </button>
      </div>
    </div>
  );
};
