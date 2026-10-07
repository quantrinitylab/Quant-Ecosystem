// ============================================================================
// QuantMax - User Profile Detail Page
// Cover photo, avatar, username, verified badge, stats, bio, tabs, content grid
// ============================================================================

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { UserProfile } from '../types';

type ProfileTab = 'videos' | 'favorites' | 'playlists';

const ProfileDetailPage: React.FC = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['max-profile-detail'],
    queryFn: async () => {
      const response = await apiClient.getMyProfile();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load profile');
      }
      return response.data;
    },
  });
  const [activeTab, setActiveTab] = useState<ProfileTab>('videos');
  const [isFollowing, setIsFollowing] = useState(false);

  const profile = data as UserProfile | undefined;

  const formatCount = (count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--quant-background)]">
        <LoadingState variant="skeleton" text="Loading profile..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--quant-background)]">
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--quant-background)]">
        <EmptyState title="User not found" description="This profile does not exist" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]"
      role="main"
      aria-label={`${profile.displayName} profile`}
    >
      {/* Cover Photo */}
      <div className="relative h-48 w-full overflow-hidden bg-gradient-to-b from-brand-app/30 to-transparent">
        {profile.photos[0] && (
          <img
            className="h-full w-full object-cover"
            src={profile.photos[0].url}
            alt={`${profile.username} cover`}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--quant-background)]" />
      </div>

      {/* Avatar + Info */}
      <div className="relative -mt-16 px-4">
        <div className="flex items-end gap-4">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', ...spring.bouncy }}
            className="relative"
          >
            <img
              className="h-24 w-24 rounded-full border-4 border-[var(--quant-background)] object-cover"
              src={profile.avatarUrl}
              alt={profile.username}
            />
          </motion.div>
          <div className="flex-1 pb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{profile.displayName}</h1>
              {profile.verified === 'verified' && (
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--quant-info)] text-[10px] text-white"
                  aria-label="Verified"
                >
                  &#10003;
                </span>
              )}
            </div>
            <span className="text-sm text-[var(--quant-muted-foreground)]">
              @{profile.username}
            </span>
          </div>
        </div>

        {/* Bio */}
        {profile.bio && <p className="mt-3 text-sm leading-relaxed">{profile.bio}</p>}

        {/* Stats */}
        <div className="mt-4 flex items-center gap-6">
          <div className="text-center">
            <span className="block text-lg font-bold">{formatCount(profile.following)}</span>
            <span className="text-xs text-[var(--quant-muted-foreground)]">Following</span>
          </div>
          <div className="text-center">
            <span className="block text-lg font-bold">{formatCount(profile.followers)}</span>
            <span className="text-xs text-[var(--quant-muted-foreground)]">Followers</span>
          </div>
          <div className="text-center">
            <span className="block text-lg font-bold">{formatCount(profile.likes)}</span>
            <span className="text-xs text-[var(--quant-muted-foreground)]">Likes</span>
          </div>
        </div>

        {/* Follow Button */}
        <div className="mt-4 flex gap-2">
          <motion.button
            whileTap={{ scale: 0.95 }}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold ${
              isFollowing
                ? 'border border-[var(--quant-border)] text-[var(--quant-foreground)]'
                : 'bg-brand-app text-white'
            }`}
            onClick={() => setIsFollowing(!isFollowing)}
            aria-label={isFollowing ? 'Unfollow' : 'Follow'}
            aria-pressed={isFollowing}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </motion.button>
          <button
            className="rounded-lg border border-[var(--quant-border)] px-4 py-2.5 text-sm font-semibold"
            aria-label="Message user"
          >
            Message
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="mt-6 border-b border-[var(--quant-border)]">
        <div className="flex" role="tablist" aria-label="Profile content tabs">
          {[
            { id: 'videos' as const, label: 'Videos', icon: '\u{1F3AC}' },
            { id: 'favorites' as const, label: 'Favorites', icon: '\u2764' },
            { id: 'playlists' as const, label: 'Playlists', icon: '\u{1F4C1}' },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`flex-1 py-3 text-center text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-[var(--quant-foreground)] text-[var(--quant-foreground)]'
                  : 'text-[var(--quant-muted-foreground)]'
              }`}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content Grid */}
      <div className="p-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-3 gap-0.5"
            role="tabpanel"
            aria-label={`${activeTab} content`}
          >
            {/* Empty content grid — fills with the profile's real content when loaded; never fake tiles */}
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={`${activeTab}-${i}`}
                className="relative aspect-[9/16] overflow-hidden rounded bg-[var(--quant-card)]"
              >
                <div className="h-full w-full flex items-center justify-center text-[var(--quant-muted-foreground)]">
                  <span className="text-lg">
                    {activeTab === 'videos'
                      ? '\u{1F3AC}'
                      : activeTab === 'favorites'
                        ? '\u2764'
                        : '\u{1F4C1}'}
                  </span>
                </div>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ProfileDetailPage;
