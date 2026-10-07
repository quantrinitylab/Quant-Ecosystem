'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface Quest {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  progress: number;
  maxProgress: number;
  completed: boolean;
  icon: string;
}

export const DailyQuests: React.FC = () => {
  const [quests, setQuests] = useState<Quest[]>([
    {
      id: 'q1',
      title: 'Talk to QuantAI',
      description: 'Send 5 messages to QuantAI',
      xpReward: 150,
      progress: 3,
      maxProgress: 5,
      completed: false,
      icon: '💬',
    },
    {
      id: 'q2',
      title: 'Explore Marketplace',
      description: 'View 3 different agents in the marketplace',
      xpReward: 100,
      progress: 3,
      maxProgress: 3,
      completed: true,
      icon: '🛍️',
    },
    {
      id: 'q3',
      title: 'Voice Command',
      description: 'Complete 2 voice interactions',
      xpReward: 200,
      progress: 1,
      maxProgress: 2,
      completed: false,
      icon: '🎙️',
    },
    {
      id: 'q4',
      title: 'Agent Master',
      description: 'Run agents from 3 different categories',
      xpReward: 250,
      progress: 2,
      maxProgress: 3,
      completed: false,
      icon: '🤖',
    },
  ]);

  const completedQuests = quests.filter((q) => q.completed).length;
  const totalXP = quests.reduce((sum, q) => sum + (q.completed ? q.xpReward : 0), 0);

  const claimReward = (questId: string) => {
    setQuests(quests.map((q) => (q.id === questId ? { ...q, completed: true } : q)));
  };

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="text-2xl">📅</div>
            <div>
              <div className="text-xl font-semibold">Daily Quests</div>
              <div className="text-sm text-white/50">Reset in 14h 23m</div>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-emerald-400 text-2xl font-mono">{completedQuests}/4</div>
          <div className="text-xs text-white/40">COMPLETED</div>
        </div>
      </div>

      <div className="space-y-4">
        {quests.map((quest, index) => (
          <div
            key={index}
            className={`flex items-center gap-5 p-5 rounded-2xl border transition-all ${
              quest.completed
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-black border-zinc-900'
            }`}
          >
            <div className="text-3xl">{quest.icon}</div>

            <div className="flex-1">
              <div className="font-semibold">{quest.title}</div>
              <div className="text-sm text-white/50 mt-0.5">{quest.description}</div>

              {!quest.completed && (
                <div className="mt-3">
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-white rounded-full transition-all"
                      style={{ width: `${(quest.progress / quest.maxProgress) * 100}%` }}
                    />
                  </div>
                  <div className="text-xs text-white/40 mt-1.5">
                    {quest.progress} / {quest.maxProgress}
                  </div>
                </div>
              )}
            </div>

            <div className="text-right">
              {quest.completed ? (
                <div className="text-emerald-400 text-sm font-medium">✓ CLAIMED</div>
              ) : (
                <button
                  onClick={() => claimReward(quest.id)}
                  className="px-5 py-2 rounded-xl bg-white text-black text-sm font-medium hover:bg-white/90 active:scale-[0.985]"
                >
                  +{quest.xpReward} XP
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 text-center text-xs text-white/40">
        Complete all quests for bonus +500 XP
      </div>
    </div>
  );
};
