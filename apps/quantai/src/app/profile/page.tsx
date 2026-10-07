'use client';

import React from 'react';

export default function ProfilePage() {
  const userStats = {
    level: 52,
    xp: 12450,
    streak: 47,
    totalAgents: 8,
    totalMessages: 1247,
    voiceMinutes: 89,
  };

  const achievements = [
    { name: 'First Agent', icon: '🚀', unlocked: true },
    { name: 'Week Warrior', icon: '🔥', unlocked: true },
    { name: 'Level 50 Master', icon: '🏆', unlocked: false },
    { name: 'Marketplace Pro', icon: '🛍️', unlocked: true },
  ];

  const recentActivity = [
    { action: 'Reached Level 52', time: '2 hours ago' },
    { action: 'Completed Daily Quest', time: 'Yesterday' },
    { action: 'Purchased Code Architect', time: '2 days ago' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-6 mb-12">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-white to-zinc-400 flex items-center justify-center text-4xl">
            👤
          </div>
          <div>
            <div className="text-5xl font-bold tracking-[-2px]">Your Profile</div>
            <div className="text-xl text-white/60 mt-1">
              Level {userStats.level} • {userStats.xp} XP
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          {[
            { label: 'Current Level', value: userStats.level, icon: '📈' },
            { label: 'Total XP', value: userStats.xp.toLocaleString(), icon: '⚡' },
            { label: 'Day Streak', value: userStats.streak, icon: '🔥' },
            { label: 'Agents Owned', value: userStats.totalAgents, icon: '🤖' },
          ].map((stat, i) => (
            <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8">
              <div className="text-4xl mb-4">{stat.icon}</div>
              <div className="text-5xl font-mono font-bold">{stat.value}</div>
              <div className="text-sm text-white/50 mt-2">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Achievements */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 mb-8">
          <div className="text-xl font-semibold mb-6">Achievements</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {achievements.map((ach, i) => (
              <div
                key={i}
                className={`p-6 rounded-2xl border ${ach.unlocked ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-black border-zinc-900 opacity-60'}`}
              >
                <div className="text-4xl mb-3">{ach.icon}</div>
                <div className="font-semibold">{ach.name}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8">
          <div className="text-xl font-semibold mb-6">Recent Activity</div>
          <div className="space-y-4">
            {recentActivity.map((activity, i) => (
              <div
                key={i}
                className="flex justify-between items-center p-4 rounded-2xl bg-black border border-zinc-900"
              >
                <div>{activity.action}</div>
                <div className="text-sm text-white/40">{activity.time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
