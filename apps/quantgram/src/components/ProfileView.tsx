'use client';

// ============================================================================
// QuantGram (QuantNeon) — ProfileView Component
// Forensic 98-Screen Instagram Parity (Task W39-G04)
//
// 1. Instagram-class Profile Header:
//    - Avatar with story ring indicator (active unviewed gradient, close friend green, or viewed gray)
//    - Posts / Followers / Following stat counts
//    - Pronouns and bio with clickable @mentions, #hashtags, and external links
//    - 'Edit Profile' & 'Share Profile' pills with clipboard feedback
//    - Story highlights tray
// 2. 4-Tab Matrix:
//    - 'Posts' (3x3 grid with hover like, comment & view counts)
//    - 'Reels' (vertical 9:16 card grid with play counts & pinned status)
//    - 'Saved' (collection folders mosaic & bookmarked reels with privacy notice)
//    - 'Tagged' (photo tag mosaic with creator tag indicators)
// 3. Bottom Sheet Multi-Account Switcher:
//    - Triggered by username chevron in header
//    - Unread notification badges on inactive accounts
//    - Active account checkmark
//    - '+ Add account' flow
// 4. Hooked into useProfile & profile-matrix.ts state engine
// ============================================================================

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  PROFILE_TABS,
  selectProfileTab,
  switchAccount,
  getAccountTotalUnreadCount,
  type ProfileTab,
  type AccountProfileItem,
} from '../features/profile/profile-matrix';
import { useProfile } from '../hooks/useProfile';
import { useUserPosts } from '../hooks/useUserPosts';
import { apiClient } from '../services/api-client';
import { AccountSwitcherBottomSheet } from './AccountSwitcherBottomSheet';
import type { Profile } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface ProfilePostItem {
  id: string;
  type: 'photo' | 'video' | 'carousel';
  mediaUrl: string;
  caption: string;
  likes: number;
  comments: number;
  views?: number;
}

export interface ProfileReelItem {
  id: string;
  thumbnailUrl: string;
  videoUrl?: string;
  caption: string;
  plays: number;
  likes: number;
  comments: number;
  isPinned?: boolean;
  audioName?: string;
}

export interface ProfileSavedCollection {
  id: string;
  name: string;
  count: number;
  coverUrls: string[];
  isPrivate?: boolean;
}

export interface ProfileSavedItem {
  id: string;
  type: 'post' | 'reel';
  mediaUrl: string;
  title: string;
  savedAt?: string;
}

export interface ProfileTaggedItem {
  id: string;
  mediaUrl: string;
  taggedBy: string;
  caption?: string;
  likes: number;
}

export interface StoryHighlightItem {
  id: string;
  title: string;
  coverUrl: string;
}

export interface ProfileViewProps {
  userId?: string;
  initialProfile?: Partial<Profile> & {
    pronouns?: string;
    category?: string;
    hasActiveStory?: boolean;
    hasUnviewedStory?: boolean;
    isCloseFriendStory?: boolean;
  };
  initialAccounts?: AccountProfileItem[];
  isOwnProfile?: boolean;
  onEditProfile?: () => void;
  onShareProfile?: () => void;
  onAddAccount?: () => void;
  onPostClick?: (postId: string) => void;
  onReelClick?: (reelId: string) => void;
  onSavedClick?: (item: ProfileSavedItem | ProfileSavedCollection) => void;
  onTaggedClick?: (item: ProfileTaggedItem) => void;
  onStoryClick?: (userId: string) => void;
  onAccountSwitched?: (account: AccountProfileItem) => void;
  className?: string;
}

// ============================================================================
// Helper Utilities
// ============================================================================

export function formatStatCount(num: number): string {
  if (num >= 1_000_000) {
    const formatted = (num / 1_000_000).toFixed(1);
    return formatted.endsWith('.0') ? `${Math.floor(num / 1_000_000)}M` : `${formatted}M`;
  }
  if (num >= 10_000) {
    const formatted = (num / 1_000).toFixed(1);
    return formatted.endsWith('.0') ? `${Math.floor(num / 1_000)}K` : `${formatted}K`;
  }
  return num.toLocaleString();
}

/**
 * Parses bio text with interactive clickable @mentions, #hashtags, and external links
 */
export function renderBioWithLinks(bio: string): React.ReactNode[] {
  const tokenRegex = /(https?:\/\/[^\s]+|@[a-zA-Z0-9_.]+|#[a-zA-Z0-9_]+)/g;
  const parts = bio.split(tokenRegex);

  return parts.map((part, index) => {
    if (part.startsWith('http://') || part.startsWith('https://')) {
      const cleanUrl = part.replace(/^https?:\/\//, '');
      return (
        <a
          key={`bio-link-${index}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#0095F6] dark:text-[#3897f0] hover:underline font-medium break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {cleanUrl}
        </a>
      );
    }
    if (part.startsWith('@')) {
      return (
        <a
          key={`bio-mention-${index}`}
          href={`/profile/${part.substring(1)}`}
          className="text-[#0095F6] dark:text-[#3897f0] hover:underline font-semibold"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    if (part.startsWith('#')) {
      return (
        <span
          key={`bio-hashtag-${index}`}
          className="text-[#0095F6] dark:text-[#3897f0] hover:underline font-semibold cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </span>
      );
    }
    return <span key={`bio-text-${index}`}>{part}</span>;
  });
}

// ============================================================================
// Main ProfileView Component
// ============================================================================

export const ProfileView: React.FC<ProfileViewProps> = ({
  userId = '',
  initialProfile,
  initialAccounts = [],
  isOwnProfile = true,
  onEditProfile,
  onShareProfile,
  onAddAccount,
  onPostClick,
  onReelClick,
  onSavedClick,
  onTaggedClick,
  onStoryClick,
  onAccountSwitched,
  className = '',
}) => {
  // Query hook for profile data
  const { data: remoteProfile } = useProfile(userId);
  const { data: remoteUserPosts } = useUserPosts(userId);

  // Profile Matrix State
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [accounts, setAccounts] = useState<AccountProfileItem[]>(initialAccounts);
  const [isAccountSwitcherOpen, setIsAccountSwitcherOpen] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);

  // Active Account (no fabricated defaults — empty when the caller supplies none)
  const currentAccount = useMemo(() => {
    return accounts.find((a) => a.isCurrent) || accounts[0];
  }, [accounts]);

  // Total unread notifications across inactive accounts
  const totalUnreadCount = useMemo(() => {
    return getAccountTotalUnreadCount(accounts);
  }, [accounts]);

  const effectiveUserId = useMemo(
    () => remoteProfile?.id || userId || currentAccount?.id || '',
    [remoteProfile, userId, currentAccount],
  );

  // Real reels authored by this user (no fabricated defaults)
  const { data: remoteReels } = useQuery({
    queryKey: ['neon-user-reels', effectiveUserId],
    queryFn: async () => {
      const response = await apiClient.getReelsFeed();
      if (!response.success) return [];
      return (response.data?.reels ?? []).filter((r) => r.userId === effectiveUserId);
    },
    enabled: !!effectiveUserId,
  });

  // Real saved posts (no fabricated defaults)
  const { data: remoteSavedPosts } = useQuery({
    queryKey: ['neon-saved-posts'],
    queryFn: async () => {
      const response = await apiClient.getSavedPosts();
      if (!response.success) return [];
      return response.data?.posts ?? [];
    },
    enabled: activeTab === 'saved' && isOwnProfile,
  });

  // Consolidated profile data (no fabricated fallbacks)
  const profileData = useMemo(() => {
    return {
      id: effectiveUserId,
      username: remoteProfile?.username || initialProfile?.username || currentAccount?.username || '',
      displayName:
        remoteProfile?.displayName ||
        initialProfile?.displayName ||
        currentAccount?.displayName ||
        '',
      avatarUrl: remoteProfile?.avatarUrl || initialProfile?.avatarUrl || currentAccount?.avatar || '',
      isVerified:
        remoteProfile?.isVerified ?? initialProfile?.isVerified ?? currentAccount?.isVerified ?? false,
      bio: remoteProfile?.bio || initialProfile?.bio || '',
      website: remoteProfile?.website || initialProfile?.website || '',
      pronouns: initialProfile?.pronouns || '',
      category: initialProfile?.category || '',
      postCount:
        remoteProfile?.postCount ?? initialProfile?.postCount ?? remoteUserPosts?.length ?? 0,
      followerCount: remoteProfile?.followerCount ?? initialProfile?.followerCount ?? 0,
      followingCount: remoteProfile?.followingCount ?? initialProfile?.followingCount ?? 0,
      hasActiveStory: initialProfile?.hasActiveStory ?? false,
      hasUnviewedStory: initialProfile?.hasUnviewedStory ?? false,
      isCloseFriendStory: initialProfile?.isCloseFriendStory ?? false,
    };
  }, [remoteProfile, initialProfile, currentAccount, effectiveUserId, remoteUserPosts]);

  // Posts data — real posts only; posts without media are excluded (no fake media injected)
  const postsList: ProfilePostItem[] = useMemo(() => {
    if (!remoteUserPosts || remoteUserPosts.length === 0) return [];
    return remoteUserPosts
      .map((p) => ({
        id: p.id,
        type: p.type || 'photo',
        mediaUrl: p.mediaUrls?.[0] || p.media?.[0]?.url || '',
        caption: p.caption || '',
        likes: p.likeCount ?? p.likes ?? 0,
        comments: p.commentCount ?? p.comments?.length ?? 0,
      }))
      .filter((p) => p.mediaUrl !== '');
  }, [remoteUserPosts]);

  // Reels data — real reels only (no fabricated play counts)
  const reelsList: ProfileReelItem[] = useMemo(() => {
    if (!remoteReels || remoteReels.length === 0) return [];
    return remoteReels.map((r) => ({
      id: r.id,
      thumbnailUrl: r.thumbnailUrl,
      videoUrl: r.videoUrl,
      caption: r.caption || '',
      plays: r.plays ?? 0,
      likes: r.likes ?? 0,
      comments: r.comments ?? 0,
      audioName: r.audioName || undefined,
    }));
  }, [remoteReels]);

  // Saved data — real saved posts only
  const savedList: ProfileSavedItem[] = useMemo(() => {
    if (!remoteSavedPosts || remoteSavedPosts.length === 0) return [];
    return remoteSavedPosts
      .map((p) => ({
        id: p.id,
        type: 'post' as const,
        mediaUrl: p.mediaUrls?.[0] || p.media?.[0]?.url || '',
        title: p.caption || '',
      }))
      .filter((p) => p.mediaUrl !== '');
  }, [remoteSavedPosts]);

  // Tab change handler using profile-matrix.ts state engine
  const handleTabChange = useCallback(
    (targetTab: ProfileTab) => {
      const result = selectProfileTab(activeTab, targetTab);
      if (result.isChanged) {
        setActiveTab(result.activeTab);
      }
    },
    [activeTab],
  );

  // Account switcher handler using profile-matrix.ts state engine
  const handleSelectAccount = useCallback(
    (targetAccountId: string) => {
      const result = switchAccount(accounts, targetAccountId);
      setAccounts(result.accounts);
      if (result.currentAccount && onAccountSwitched) {
        onAccountSwitched(result.currentAccount);
      }
    },
    [accounts, onAccountSwitched],
  );

  // Handle Share Profile pill
  const handleShareProfile = useCallback(() => {
    if (onShareProfile) {
      onShareProfile();
      return;
    }
    const profileUrl =
      typeof window !== 'undefined'
        ? window.location.href
        : `https://quantgram.in/@${profileData.username}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(profileUrl);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2400);
    }
  }, [onShareProfile, profileData.username]);

  // Story ring gradient calculation
  const storyRingClass = useMemo(() => {
    if (!profileData.hasActiveStory) return 'p-[2px] bg-transparent';
    if (!profileData.hasUnviewedStory) {
      return 'p-[2.5px] bg-gradient-to-tr from-gray-400 to-gray-500 dark:from-[#3A3A3A] dark:to-[#4A4A4A]';
    }
    if (profileData.isCloseFriendStory) {
      return 'p-[2.5px] bg-gradient-to-tr from-[#10B981] via-[#059669] to-[#047857] shadow-sm';
    }
    // Signature Instagram vibrant ring gradient
    return 'p-[2.5px] bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] shadow-sm';
  }, [profileData.hasActiveStory, profileData.hasUnviewedStory, profileData.isCloseFriendStory]);

  return (
    <div
      className={`min-h-screen bg-white dark:bg-[#000000] text-gray-900 dark:text-white transition-colors pb-16 ${className}`}
      data-testid="profile-view"
    >
      {/* Copied Toast Banner */}
      <AnimatePresence>
        {copiedToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#262626] text-white px-4 py-2 rounded-full text-xs font-semibold shadow-xl border border-[#3A3A3A] flex items-center gap-2"
          >
            <span>✓</span>
            <span>Profile link copied to clipboard</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-2xl mx-auto">
        {/* ==================================================================== */}
        {/* TOP BAR / MULTI-ACCOUNT SWITCHER TRIGGER */}
        {/* ==================================================================== */}
        <header className="sticky top-0 z-20 px-4 py-3 bg-white/95 dark:bg-[#000000]/95 backdrop-blur-md border-b border-gray-100 dark:border-[#1F1F1F] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsAccountSwitcherOpen(true)}
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity focus:outline-hidden group"
              aria-label="Switch account"
              aria-haspopup="dialog"
              data-testid="account-switcher-trigger"
            >
              <span className="font-bold text-base md:text-lg tracking-tight truncate max-w-[200px]">
                {profileData.username}
              </span>

              {profileData.isVerified && (
                <span
                  className="w-4 h-4 rounded-full bg-[#0095F6] text-white text-[9px] font-bold flex items-center justify-center shrink-0"
                  title="Verified Account"
                >
                  ✓
                </span>
              )}

              {/* Chevron Down — only when there are accounts to switch between */}
              {accounts.length > 0 && (
                <span className="text-xs text-gray-500 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                  ▼
                </span>
              )}

              {/* Inactive accounts unread badge */}
              {totalUnreadCount > 0 && (
                <span
                  className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-px rounded-full ring-2 ring-white dark:ring-[#000000] ml-0.5"
                  title={`${totalUnreadCount} unread across other accounts`}
                  data-testid="header-unread-badge"
                >
                  {totalUnreadCount > 9 ? '9+' : totalUnreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Top Right Header Quick Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-[#1A1A1A] transition-colors text-lg"
              aria-label="Create Post"
              title="Create"
            >
              +
            </button>
            <button
              type="button"
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-[#1A1A1A] transition-colors text-lg"
              aria-label="Settings and activity"
              title="Menu"
            >
              ☰
            </button>
          </div>
        </header>

        {/* ==================================================================== */}
        {/* 1. INSTAGRAM-CLASS PROFILE HEADER */}
        {/* ==================================================================== */}
        <section className="px-4 pt-4 pb-3" aria-label="Profile Header">
          <div className="flex items-center justify-between gap-6">
            {/* Avatar with Story Ring Indicator */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => onStoryClick?.(profileData.id)}
                className={`rounded-full transition-transform active:scale-95 focus:outline-hidden ${storyRingClass}`}
                aria-label={`View story of ${profileData.username}`}
                data-testid="profile-avatar-story-ring"
              >
                <div className="p-[2.5px] bg-white dark:bg-[#000000] rounded-full">
                  {profileData.avatarUrl ? (
                    <img
                      src={profileData.avatarUrl}
                      alt={profileData.username}
                      className="w-20 h-20 md:w-22 md:h-22 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-20 h-20 md:w-22 md:h-22 rounded-full bg-gray-200 dark:bg-[#262626] flex items-center justify-center text-2xl font-bold text-gray-500 dark:text-[#A8A8A8]"
                      aria-label={profileData.username}
                    >
                      {(profileData.username || profileData.displayName || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              </button>

              {/* Add Story Plus Badge for own profile */}
              {isOwnProfile && (
                <button
                  type="button"
                  onClick={() => onStoryClick?.(profileData.id)}
                  className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-[#0095F6] text-white flex items-center justify-center text-sm font-bold border-2 border-white dark:border-[#000000] hover:scale-105 transition-transform"
                  aria-label="Add to story"
                  title="Add to story"
                >
                  +
                </button>
              )}
            </div>

            {/* Posts / Followers / Following Stat Counts */}
            <div className="flex-1 flex justify-around items-center" aria-label="Statistics">
              <div className="text-center cursor-pointer group" data-testid="stat-posts">
                <span className="font-bold text-base md:text-lg block tracking-tight">
                  {formatStatCount(profileData.postCount)}
                </span>
                <span className="text-xs text-gray-500 dark:text-[#A8A8A8] group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                  posts
                </span>
              </div>

              <button
                type="button"
                className="text-center group focus:outline-hidden"
                data-testid="stat-followers"
              >
                <span className="font-bold text-base md:text-lg block tracking-tight">
                  {formatStatCount(profileData.followerCount)}
                </span>
                <span className="text-xs text-gray-500 dark:text-[#A8A8A8] group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                  followers
                </span>
              </button>

              <button
                type="button"
                className="text-center group focus:outline-hidden"
                data-testid="stat-following"
              >
                <span className="font-bold text-base md:text-lg block tracking-tight">
                  {formatStatCount(profileData.followingCount)}
                </span>
                <span className="text-xs text-gray-500 dark:text-[#A8A8A8] group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                  following
                </span>
              </button>
            </div>
          </div>

          {/* Display Name, Pronouns & Bio */}
          <div className="mt-3.5 space-y-1">
            {(profileData.displayName || profileData.pronouns) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {profileData.displayName && (
                  <span className="font-bold text-sm tracking-tight">{profileData.displayName}</span>
                )}
                {profileData.pronouns && (
                  <span className="text-xs text-gray-500 dark:text-[#8E8E8E] font-medium">
                    {profileData.pronouns}
                  </span>
                )}
              </div>
            )}

            {profileData.category && (
              <span className="text-xs text-gray-400 dark:text-[#737373] block font-medium">
                {profileData.category}
              </span>
            )}

            {/* Clickable Bio */}
            {profileData.bio && (
              <div
                className="text-sm text-gray-800 dark:text-[#F5F5F5] leading-snug whitespace-pre-line pt-0.5"
                data-testid="profile-bio"
              >
                {renderBioWithLinks(profileData.bio)}
              </div>
            )}

            {/* Clickable External Website Link */}
            {profileData.website && (
              <div className="pt-1 flex items-center gap-1 text-xs">
                <span className="text-gray-400">🔗</span>
                <a
                  href={profileData.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[#0095F6] hover:underline truncate max-w-[300px]"
                >
                  {profileData.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
          </div>

          {/* Action Pills: 'Edit Profile' & 'Share Profile' */}
          <div className="flex items-center gap-2 mt-4">
            {isOwnProfile ? (
              <>
                <button
                  type="button"
                  onClick={onEditProfile}
                  className="flex-1 py-1.5 px-3 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-[#262626] dark:hover:bg-[#333333] text-gray-900 dark:text-white text-xs md:text-sm font-semibold transition-colors text-center"
                  data-testid="edit-profile-pill"
                >
                  Edit profile
                </button>
                <button
                  type="button"
                  onClick={handleShareProfile}
                  className="flex-1 py-1.5 px-3 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-[#262626] dark:hover:bg-[#333333] text-gray-900 dark:text-white text-xs md:text-sm font-semibold transition-colors text-center"
                  data-testid="share-profile-pill"
                >
                  Share profile
                </button>
                <button
                  type="button"
                  aria-label="Discover people"
                  title="Discover people"
                  className="p-1.5 px-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-[#262626] dark:hover:bg-[#333333] text-gray-900 dark:text-white text-sm font-semibold transition-colors"
                >
                  👤+
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="flex-1 py-1.5 px-3 rounded-lg bg-[#0095F6] hover:bg-[#1877F2] text-white text-xs md:text-sm font-semibold transition-colors text-center"
                >
                  Follow
                </button>
                <button
                  type="button"
                  className="flex-1 py-1.5 px-3 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-[#262626] dark:hover:bg-[#333333] text-gray-900 dark:text-white text-xs md:text-sm font-semibold transition-colors text-center"
                >
                  Message
                </button>
              </>
            )}
          </div>

          {/* Story Highlights Bar — real highlights only (none fabricated); 'New' starts creation */}
          <div className="mt-5 pb-2 overflow-x-auto scrollbar-none flex items-center gap-4">
            {/* New Highlight Button */}
            {isOwnProfile && (
              <button
                type="button"
                className="flex flex-col items-center gap-1.5 shrink-0 group focus:outline-hidden"
                aria-label="New Story Highlight"
              >
                <div className="w-16 h-16 rounded-full border border-dashed border-gray-300 dark:border-[#3A3A3A] flex items-center justify-center group-hover:border-gray-500 transition-colors">
                  <span className="text-xl text-gray-500 dark:text-gray-400 font-light">+</span>
                </div>
                <span className="text-xs text-gray-700 dark:text-[#A8A8A8] truncate max-w-[68px]">
                  New
                </span>
              </button>
            )}
          </div>
        </section>

        {/* ==================================================================== */}
        {/* 2. 4-TAB MATRIX (Posts, Reels, Saved, Tagged) */}
        {/* ==================================================================== */}
        <nav
          className="border-t border-gray-200 dark:border-[#262626] mt-2 sticky top-[53px] z-10 bg-white/95 dark:bg-[#000000]/95 backdrop-blur-md"
          role="tablist"
          aria-label="Profile Tabs Matrix"
        >
          <div className="flex">
            {PROFILE_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-controls={`panel-${tab.id}`}
                  aria-selected={isActive}
                  onClick={() => handleTabChange(tab.id)}
                  data-testid={`tab-${tab.id}`}
                  className={`flex-1 py-3 flex items-center justify-center gap-1.5 text-sm transition-all focus:outline-hidden relative ${
                    isActive
                      ? 'text-gray-900 dark:text-white font-semibold border-t-2 border-gray-900 dark:border-white'
                      : 'text-gray-400 dark:text-[#737373] hover:text-gray-700 dark:hover:text-[#A8A8A8] border-t-2 border-transparent'
                  }`}
                >
                  <span className="text-base">{tab.icon}</span>
                  <span className="hidden sm:inline text-xs tracking-wider uppercase font-semibold">
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* TAB PANELS */}
        <main className="mt-0.5">
          <AnimatePresence mode="wait">
            {/* ---------------------------------------------------------------- */}
            {/* TAB 1: POSTS (3x3 Photo Grid with Hover Stats) */}
            {/* ---------------------------------------------------------------- */}
            {activeTab === 'posts' && (
              <motion.div
                key="posts-panel"
                id="panel-posts"
                role="tabpanel"
                aria-labelledby="tab-posts"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="grid grid-cols-3 gap-0.5 md:gap-1"
                data-testid="panel-posts"
              >
                {postsList.length === 0 ? (
                  <div className="col-span-3 py-16 text-center text-gray-500">
                    <p className="text-3xl mb-2">📷</p>
                    <p className="font-semibold text-sm">No posts yet</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Share your first photo or video with the world
                    </p>
                  </div>
                ) : (
                  postsList.map((post) => (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => onPostClick?.(post.id)}
                      className="relative aspect-square overflow-hidden bg-gray-100 dark:bg-[#1A1A1A] group focus:outline-hidden"
                      aria-label={`${post.type} post, ${post.likes} likes, ${post.comments} comments`}
                    >
                      <img
                        src={post.mediaUrl}
                        alt={post.caption}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />

                      {/* Type Indicator Badges */}
                      {post.type === 'carousel' && (
                        <span className="absolute top-2 right-2 text-white drop-shadow-md text-xs bg-black/40 px-1.5 py-0.5 rounded-full backdrop-blur-xs">
                          📷 2/4
                        </span>
                      )}
                      {post.type === 'video' && (
                        <span className="absolute top-2 right-2 text-white drop-shadow-md text-xs bg-black/40 px-1.5 py-0.5 rounded-full backdrop-blur-xs">
                          ▶
                        </span>
                      )}

                      {/* Hover Overlay with Likes & Comments (real counts only) */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white text-xs md:text-sm font-bold">
                        <span className="flex items-center gap-1">
                          <span>♥</span> {formatStatCount(post.likes)}
                        </span>
                        <span className="flex items-center gap-1">
                          <span>💬</span> {formatStatCount(post.comments)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </motion.div>
            )}

            {/* ---------------------------------------------------------------- */}
            {/* TAB 2: REELS (Vertical 9:16 Card Grid with Play Counts) */}
            {/* ---------------------------------------------------------------- */}
            {activeTab === 'reels' && (
              <motion.div
                key="reels-panel"
                id="panel-reels"
                role="tabpanel"
                aria-labelledby="tab-reels"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="grid grid-cols-3 gap-1 md:gap-1.5 px-0.5"
                data-testid="panel-reels"
              >
                {reelsList.length === 0 ? (
                  <div className="col-span-3 py-16 text-center text-gray-500">
                    <p className="text-3xl mb-2">🎬</p>
                    <p className="font-semibold text-sm">No reels yet</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Create your first reel to see it here
                    </p>
                  </div>
                ) : (
                  reelsList.map((reel) => (
                    <button
                      key={reel.id}
                      type="button"
                      onClick={() => onReelClick?.(reel.id)}
                      className="relative aspect-[9/16] overflow-hidden rounded-md bg-gray-900 group focus:outline-hidden"
                      aria-label={`Reel, ${reel.plays} plays`}
                    >
                      <img
                        src={reel.thumbnailUrl}
                        alt={reel.caption}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />

                      {/* Bottom Gradient with Play Count */}
                      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex flex-col justify-end text-left">
                        <div className="flex items-center gap-1 text-white text-xs font-bold drop-shadow-xs">
                          <span>▶</span>
                          <span>{formatStatCount(reel.plays)}</span>
                        </div>
                        <p className="text-[10px] text-gray-200 line-clamp-1 mt-0.5 font-normal">
                          {reel.caption}
                        </p>
                      </div>

                      {/* Hover Stats */}
                      <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 text-white text-xs font-bold">
                        <span>♥ {formatStatCount(reel.likes)}</span>
                        <span>💬 {formatStatCount(reel.comments)}</span>
                      </div>
                    </button>
                  ))
                )}
              </motion.div>
            )}

            {/* ---------------------------------------------------------------- */}
            {/* TAB 3: SAVED (Bookmarked Posts & Reels) */}
            {/* ---------------------------------------------------------------- */}
            {activeTab === 'saved' && (
              <motion.div
                key="saved-panel"
                id="panel-saved"
                role="tabpanel"
                aria-labelledby="tab-saved"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-4 px-2"
                data-testid="panel-saved"
              >
                {/* Privacy Notice Banner */}
                <div className="py-2.5 px-3 rounded-xl bg-gray-50 dark:bg-[#121212] border border-gray-200 dark:border-[#2B2B2B] flex items-center justify-between text-xs text-gray-500 dark:text-[#A8A8A8]">
                  <span className="flex items-center gap-1.5">
                    <span>🔒</span>
                    <span>Only you can see what you've saved</span>
                  </span>
                </div>

                {savedList.length === 0 ? (
                  <div className="py-16 text-center text-gray-500">
                    <p className="text-3xl mb-2">🔖</p>
                    <p className="font-semibold text-sm">No saved posts yet</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Tap the bookmark icon on any post to save it here
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1">
                    {savedList.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSavedClick?.(item)}
                        className="relative aspect-square rounded-md overflow-hidden bg-gray-900 group focus:outline-hidden"
                      >
                        <img
                          src={item.mediaUrl}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <span className="absolute top-1.5 right-1.5 text-xs text-white drop-shadow-sm">
                          🔖
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ---------------------------------------------------------------- */}
            {/* TAB 4: TAGGED (Photo Tag Mosaic) */}
            {/* ---------------------------------------------------------------- */}
            {activeTab === 'tagged' && (
              <motion.div
                key="tagged-panel"
                id="panel-tagged"
                role="tabpanel"
                aria-labelledby="tab-tagged"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="grid grid-cols-3 gap-0.5 md:gap-1"
                data-testid="panel-tagged"
              >
                <div className="col-span-3 py-16 text-center text-gray-500">
                  <p className="text-3xl mb-2">🏷️</p>
                  <p className="font-semibold text-sm">No tagged photos</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Photos people tag you in will appear here
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* ==================================================================== */}
      {/* 3. BOTTOM SHEET MULTI-ACCOUNT SWITCHER */}
      {/* ==================================================================== */}
      <AccountSwitcherBottomSheet
        isOpen={isAccountSwitcherOpen}
        onClose={() => setIsAccountSwitcherOpen(false)}
        accounts={accounts}
        onSelectAccount={handleSelectAccount}
        onAddAccount={onAddAccount}
      />
    </div>
  );
};

export default ProfileView;
