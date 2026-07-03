// ============================================================================
// QuantChat - Profile Hub Page
//
// Central hub that surfaces the user's identity (alien avatar + level/XP) and
// acts as the launch point for the screens that aren't on the 5-tab bottom bar
// (Stories, Spotlight, Memories, Reels) plus in-app feature panels
// (avatar generator, notification settings).
// ============================================================================
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { AppShell, TopBar, BottomNav, LoadingState, ErrorState } from '@quant/shared-ui';
import { navItems, routes } from '../../lib/navigation';
import { AlienAvatar } from '../../components/avatar/AlienAvatar';
import { LevelProgress } from '../../components/profile/LevelProgress';
import { AvatarGenerator } from '../../components/profile/AvatarGenerator';
import { NotificationSettings } from '../../components/settings/NotificationSettings';
import { useMe } from '../../hooks/useMe';

interface RouteTile {
  id: string;
  label: string;
  description: string;
  icon: string;
  route: string;
}

const ROUTE_TILES: RouteTile[] = [
  {
    id: 'stories',
    label: 'Stories',
    description: 'Your 24h moments',
    icon: '⭕',
    route: routes.stories,
  },
  {
    id: 'spotlight',
    label: 'Spotlight',
    description: 'Top community reels',
    icon: '✨',
    route: routes.spotlight,
  },
  {
    id: 'memories',
    label: 'Memories',
    description: 'Saved snaps & reels',
    icon: '🗂️',
    route: routes.memories,
  },
  { id: 'reels', label: 'Reels', description: 'Your video feed', icon: '🎬', route: routes.reels },
  {
    id: 'channels',
    label: 'Channels',
    description: 'Broadcast channels',
    icon: '📢',
    route: routes.channels,
  },
];

type Panel = 'avatar' | 'notifications' | null;

export default function ProfilePage() {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const { me, isLoading, error, refetch } = useMe();

  const closePanel = () => setPanel(null);

  if (isLoading) return <LoadingState variant="skeleton" text="Loading profile..." />;
  if (error || !me)
    return (
      <ErrorState
        message={error?.message ?? 'Could not load your profile'}
        onRetry={() => void refetch()}
      />
    );

  return (
    <AppShell topBar={<TopBar title="Profile" />}>
      <div className="flex h-full flex-col overflow-y-auto bg-gradient-to-b from-black via-zinc-950 to-black pb-20 text-white">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
          {/* User header — real, backend-verified identity (useMe -> /auth/me) */}
          <section className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <AlienAvatar userId={me.id} size={72} surface="profile_header" />
            <div className="flex-1">
              <h2 className="text-lg font-bold">@{me.username}</h2>
              <p className="mb-2 text-xs text-gray-400">
                {me.displayName || 'Your QuantChat profile'}
              </p>
              <LevelProgress xp={me.xpPoints} level={me.level} />
            </div>
          </section>

          {/* Navigation tiles */}
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
              Explore
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {ROUTE_TILES.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => router.push(tile.route)}
                  className="flex flex-col items-start gap-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10 active:scale-95"
                >
                  <span className="text-2xl" aria-hidden>
                    {tile.icon}
                  </span>
                  <span className="text-sm font-semibold">{tile.label}</span>
                  <span className="text-xs text-gray-400">{tile.description}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Feature panels */}
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
              Customize
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPanel('avatar')}
                className="flex flex-col items-start gap-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10 active:scale-95"
              >
                <span className="text-2xl" aria-hidden>
                  👽
                </span>
                <span className="text-sm font-semibold">Avatar generator</span>
                <span className="text-xs text-gray-400">Create your alien avatar</span>
              </button>
              <button
                type="button"
                onClick={() => setPanel('notifications')}
                className="flex flex-col items-start gap-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10 active:scale-95"
              >
                <span className="text-2xl" aria-hidden>
                  🔔
                </span>
                <span className="text-sm font-semibold">Notifications</span>
                <span className="text-xs text-gray-400">Manage alert categories</span>
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Feature panel modal */}
      <AnimatePresence>
        {panel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
            onClick={closePanel}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-5 text-white sm:rounded-3xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">
                  {panel === 'avatar' ? 'Avatar generator' : 'Notification settings'}
                </h2>
                <button
                  type="button"
                  onClick={closePanel}
                  aria-label="Close"
                  className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold hover:bg-white/20"
                >
                  Close
                </button>
              </div>
              {panel === 'avatar' ? <AvatarGenerator userId={me.id} /> : <NotificationSettings />}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav
        items={navItems}
        activeId="profile"
        onChange={(id) => {
          const route = routes[id];
          if (route) router.push(route);
        }}
      />
    </AppShell>
  );
}
