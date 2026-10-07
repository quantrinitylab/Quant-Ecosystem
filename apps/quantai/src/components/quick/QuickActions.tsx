'use client';

import React from 'react';
import { motion } from 'framer-motion';

export const QuickActions: React.FC = () => {
  const actions = [
    { icon: '💬', label: 'New Chat', color: 'emerald' },
    { icon: '🎙️', label: 'Voice Mode', color: 'amber' },
    { icon: '🛍️', label: 'Marketplace', color: 'purple' },
    { icon: '📊', label: 'Analytics', color: 'rose' },
  ];

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8">
      <div className="text-xl font-semibold mb-6">Quick Actions</div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {actions.map((action, index) => (
          <motion.button
            key={index}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            className="flex flex-col items-center justify-center p-6 rounded-2xl bg-black border border-zinc-900 hover:border-white/20 transition-all group"
          >
            <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">
              {action.icon}
            </div>
            <div className="text-sm font-medium">{action.label}</div>
          </motion.button>
        ))}
      </div>
    </div>
  );
};
