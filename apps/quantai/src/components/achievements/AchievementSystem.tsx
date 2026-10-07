'use client';

import React, { useState } from 'react';

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  unlocked: boolean;
  progress: number;
  maxProgress: number;
}

export const AchievementSystem: React.FC = () => {
  const [achievements, setAchievements] = useState<Achievement[]>([
    {
      id: 'first_agent',
      name: 'First Agent',
      description: 'Successfully run your first agent',
      icon: '🚀',
      xpReward: 100,
      unlocked: true,
      progress: 1,
      maxProgress: 1,
    },
    {
      id: 'streak_7',
      name: 'Week Warrior',
      description: 'Maintain a 7-day streak',
      icon: '🔥',
      xpReward: 250,
      unlocked: true,
      progress: 7,
      maxProgress: 7,
    },
    {
      id: 'level_50',
      name: 'Level 50 Master',
      description: 'Reach agent level 50',
      icon: '🏆',
      xpReward: 500,
      unlocked: false,
      progress: 42,
      maxProgress: 50,
    },
    {
      id: 'marketplace_pro',
      name: 'Marketplace Pro',
      description: 'Purchase 5 agents from the marketplace',
      icon: '🛒',
      xpReward: 300,
      unlocked: false,
      progress: 3,
      maxProgress: 5,
    },
    {
      id: 'voice_master',
      name: 'Voice Master',
      description: 'Complete 50 voice interactions',
      icon: '🎙️',
      xpReward: 400,
      unlocked: false,
      progress: 28,
      maxProgress: 50,
    },
  ]);

  const [showUnlock] = useState<Achievement | null>(null);

  const totalXP = achievements.reduce((sum, a) => sum + (a.unlocked ? a.xpReward : 0), 0);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-xl font-semibold">Achievements</div>
          <div className="text-sm text-white/50 mt-1">
            {unlockedCount}/{achievements.length} unlocked
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-mono text-emerald-400">+{totalXP}</div>
          <div className="text-xs text-white/40">XP EARNED</div>
        </div>
      </div>

      <div className="space-y-4">
        {achievements.map((achievement, index) => (
          <div
            key={index}
            className={`flex items-center gap-5 p-5 rounded-2xl border transition-all ${
              achievement.unlocked
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-black border-zinc-900'
            }`}
          >
            <div className="text-4xl">{achievement.icon}</div>

            <div className="flex-1">
              <div className="font-semibold text-lg">{achievement.name}</div>
              <div className="text-sm text-white/50">{achievement.description}</div>

              {!achievement.unlocked && (
                <div className="mt-3">
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-white rounded-full transition-all"
                      style={{
                        width: `${(achievement.progress / achievement.maxProgress) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="text-xs text-white/40 mt-1.5">
                    {achievement.progress} / {achievement.maxProgress}
                  </div>
                </div>
              )}
            </div>

            <div className="text-right">
              <div
                className={`text-xl font-mono ${achievement.unlocked ? 'text-emerald-400' : 'text-white/40'}`}
              >
                +{achievement.xpReward}
              </div>
              <div className="text-xs text-white/40">XP</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
