'use client';

import React from 'react';
import { motion } from 'framer-motion';

export const StreakCalendar: React.FC = () => {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const streakDays = [true, true, true, true, true, true, true]; // 7 day streak
  const currentDay = 6; // Sunday

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xl font-semibold">Streak Calendar</div>
          <div className="text-sm text-emerald-400 mt-1">47 day streak 🔥</div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-mono text-emerald-400">47</div>
          <div className="text-xs text-white/40">DAYS</div>
        </div>
      </div>

      <div className="flex justify-between gap-2">
        {days.map((day, index) => (
          <div key={index} className="flex-1 text-center">
            <div className="text-xs text-white/40 mb-2">{day}</div>
            <motion.div
              whileHover={{ scale: 1.1 }}
              className={`w-10 h-10 mx-auto rounded-2xl flex items-center justify-center text-sm font-medium transition-all ${
                streakDays[index] ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-white/40'
              } ${index === currentDay ? 'ring-2 ring-white' : ''}`}
            >
              {index + 1}
            </motion.div>
          </div>
        ))}
      </div>

      <div className="mt-6 text-center text-xs text-white/40">
        Keep going! 3 more days to break your record.
      </div>
    </div>
  );
};
