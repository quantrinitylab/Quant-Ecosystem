'use client';

import React from 'react';
import { useUsageStats } from '../../hooks/useUsageStats';

// ============================================================================
// QuantAI - Profile page (P1 fix 2026-10-11)
// Previously rendered entirely fabricated stats (hardcoded level 52, 12450 XP,
// 47-day streak, fake achievements and activity). Now wired to the real,
// activity-derived usage endpoint (GET /api/usage/stats) with honest
// loading / empty / error states. No fake numbers anywhere.
// Achievements and activity feed are intentionally hidden until they are
// backed by real data.
// ============================================================================

export default function ProfilePage() {
  const { stats, isLoading, error, refresh } = useUsageStats();

  const hasActivity =
    !!stats && (stats.totalConversations > 0 || stats.totalTokens > 0);

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
              {isLoading && !stats ? (
                'Loading your activity…'
              ) : error ? (
                'Stats unavailable'
              ) : (
                <>
                  Level {stats?.level ?? 1} • {(stats?.xp ?? 0).toLocaleString()}{' '}
                  XP
                </>
              )}
            </div>
          </div>
        </div>

        {/* Loading state — skeleton placeholders, never fake numbers */}
        {isLoading && !stats && (
          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12"
            aria-label="Loading stats"
          >
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 animate-pulse"
              >
                <div className="w-10 h-10 rounded-xl bg-zinc-800 mb-4" />
                <div className="h-12 rounded-lg bg-zinc-800 mb-2" />
                <div className="h-4 rounded bg-zinc-900 w-2/3" />
              </div>
            ))}
          </div>
        )}

        {/* Error state — honest, with retry */}
        {!isLoading && error && (
          <div
            role="alert"
            className="bg-red-500/10 border border-red-500/30 rounded-3xl p-8 mb-12"
          >
            <div className="text-xl font-semibold mb-2">
              Couldn&apos;t load your stats
            </div>
            <p className="text-white/60 mb-6">{error}</p>
            <button
              type="button"
              onClick={refresh}
              className="px-5 py-2.5 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15 transition-colors font-medium"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state — no activity yet */}
        {!isLoading && !error && stats && !hasActivity && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-12 text-center mb-12">
            <div className="text-5xl mb-4">💬</div>
            <div className="text-2xl font-semibold mb-2">No activity yet</div>
            <p className="text-white/50 max-w-md mx-auto">
              Your real stats — level, XP, streaks and chats — will appear here
              once you start chatting with QuantAI.
            </p>
          </div>
        )}

        {/* Stats Grid — real, activity-derived values only */}
        {!isLoading && !error && stats && hasActivity && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
            {[
              { label: 'Current Level', value: String(stats.level), icon: '📈' },
              {
                label: 'Total XP',
                value: stats.xp.toLocaleString(),
                icon: '⚡',
              },
              {
                label: 'Day Streak',
                value: String(stats.streakDays),
                icon: '🔥',
              },
              {
                label: 'Chats',
                value: stats.totalConversations.toLocaleString(),
                icon: '💬',
              },
            ].map((stat, i) => (
              <div
                key={i}
                className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8"
              >
                <div className="text-4xl mb-4">{stat.icon}</div>
                <div className="text-5xl font-mono font-bold">{stat.value}</div>
                <div className="text-sm text-white/50 mt-2">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/*
         * Achievements and recent-activity feed are intentionally not rendered:
         * there is no real data source for them yet, and showing fabricated
         * entries would be dishonest. Reintroduce only against real data.
         */}
      </div>
    </div>
  );
}
