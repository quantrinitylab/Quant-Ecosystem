'use client';

import React from 'react';
import { motion } from 'framer-motion';

export const CommunityHighlights: React.FC = () => {
  const highlights = [
    { user: 'Alex Chen', action: 'reached Level 89', time: '2m ago', icon: '🏆' },
    { user: 'Sarah Kim', action: 'completed 50 voice interactions', time: '15m ago', icon: '🎙️' },
    { user: 'Marcus Rodriguez', action: 'purchased 3 agents today', time: '1h ago', icon: '🛍️' },
    { user: 'Priya Patel', action: 'maintained 52-day streak', time: '3h ago', icon: '🔥' },
  ];

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xl font-semibold">Community Highlights</div>
          <div className="text-sm text-white/50 mt-1">Live activity from 124,892 agents</div>
        </div>
        <div className="text-xs px-4 py-2 rounded-full bg-white/5">LIVE</div>
      </div>

      <div className="space-y-4">
        {highlights.map((highlight, index) => (
          <motion.div
            key={index}
            whileHover={{ scale: 1.01 }}
            className="flex items-center gap-4 p-4 rounded-2xl bg-black border border-zinc-900 hover:border-white/20 transition-all"
          >
            <div className="text-2xl">{highlight.icon}</div>
            <div className="flex-1">
              <span className="font-semibold">{highlight.user}</span>
              <span className="text-white/60"> {highlight.action}</span>
            </div>
            <div className="text-xs text-white/40">{highlight.time}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
