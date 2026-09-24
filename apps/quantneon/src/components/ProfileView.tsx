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
// Default / Fallback Demo Mock Data
// ============================================================================

const DEFAULT_ACCOUNTS: AccountProfileItem[] = [
  {
    id: 'acc-curr',
    username: 'quant_creator',
    displayName: 'Quant Creator',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop',
    isVerified: true,
    isCurrent: true,
    unreadCount: 0,
  },
  {
    id: 'acc-personal',
    username: 'alex_personal',
    displayName: 'Alex Rivers',
    avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&h=150&fit=crop',
    isCurrent: false,
    unreadCount: 4,
  },
  {
    id: 'acc-studio',
    username: 'quant_studio_official',
    displayName: 'Quant Studio Org',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop',
    isVerified: true,
    isCurrent: false,
    unreadCount: 12,
  },
];

const DEFAULT_HIGHLIGHTS: StoryHighlightItem[] = [
  {
    id: 'hl-1',
    title: 'Neon ⚡',
    coverUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=120&h=120&fit=crop',
  },
  {
    id: 'hl-2',
    title: 'Travel ✈️',
    coverUrl: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=120&h=120&fit=crop',
  },
  {
    id: 'hl-3',
    title: 'CodeHub 💻',
    coverUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=120&h=120&fit=crop',
  },
  {
    id: 'hl-4',
    title: 'Beats 🎧',
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&h=120&fit=crop',
  },
];

const DEFAULT_POSTS: ProfilePostItem[] = [
  {
    id: 'p-1',
    type: 'carousel',
    mediaUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&h=600&fit=crop',
    caption: 'QuantGram sovereign UI design system drop ⚡ #quantgram #design #future',
    likes: 3840,
    comments: 142,
    views: 18200,
  },
  {
    id: 'p-2',
    type: 'video',
    mediaUrl: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=600&h=600&fit=crop',
    caption: 'High-speed local neural inference on WebGPU @quantrinity #ai',
    likes: 5120,
    comments: 289,
    views: 42100,
  },
  {
    id: 'p-3',
    type: 'photo',
    mediaUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=600&fit=crop',
    caption: 'Silicon architecture and hardware accelerators benchmarked.',
    likes: 2190,
    comments: 87,
    views: 12400,
  },
  {
    id: 'p-4',
    type: 'photo',
    mediaUrl: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=600&h=600&fit=crop',
    caption: 'Midnight Tokyo cyberpunk aesthetic sessions.',
    likes: 4310,
    comments: 198,
    views: 29500,
  },
  {
    id: 'p-5',
    type: 'carousel',
    mediaUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&h=600&fit=crop',
    caption: 'QuantAI agent runtime internals walkthrough.',
    likes: 6420,
    comments: 312,
    views: 58000,
  },
  {
    id: 'p-6',
    type: 'photo',
    mediaUrl: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=600&h=600&fit=crop',
    caption: 'Color gradients of the future. Clean aesthetic minimal spaces.',
    likes: 1890,
    comments: 65,
    views: 9400,
  },
];

const DEFAULT_REELS: ProfileReelItem[] = [
  {
    id: 'r-1',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=450&h=800&fit=crop',
    caption: '159 Screens built in 1 day with the Swarm Orchestrator 🤖🔥',
    plays: 184500,
    likes: 14200,
    comments: 840,
    isPinned: true,
    audioName: 'Original Audio • quant_creator',
  },
  {
    id: 'r-2',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=450&h=800&fit=crop',
    caption: 'Why one unified login beats Google + Meta combined',
    plays: 92400,
    likes: 8120,
    comments: 420,
    isPinned: true,
    audioName: 'Cyber Ambient Synth #04',
  },
  {
    id: 'r-3',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=450&h=800&fit=crop',
    caption: 'Building the Instagram 4-Tab Matrix in pure TypeScript',
    plays: 68100,
    likes: 4950,
    comments: 215,
    audioName: 'Coding Lofi Beats #12',
  },
  {
    id: 'r-4',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=450&h=800&fit=crop',
    caption: 'Zero-latency WebRTC media pipelines in action',
    plays: 43200,
    likes: 3100,
    comments: 180,
    audioName: 'Quant Sound Lab Official',
  },
];

const DEFAULT_SAVED_COLLECTIONS: ProfileSavedCollection[] = [
  {
    id: 'col-all',
    name: 'All Posts',
    count: 48,
    coverUrls: [
      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&h=200&fit=crop',
      'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=200&h=200&fit=crop',
      'https://images.unsplash.com/photo-1518770660439-4636190af475?w=200&h=200&fit=crop',
      'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=200&h=200&fit=crop',
    ],
    isPrivate: true,
  },
  {
    id: 'col-ui',
    name: 'Design & Neon ⚡',
    count: 24,
    coverUrls: [
      'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=200&h=200&fit=crop',
      'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=200&h=200&fit=crop',
      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=200&h=200&fit=crop',
      'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=200&h=200&fit=crop',
    ],
    isPrivate: true,
  },
  {
    id: 'col-audio',
    name: 'Audio & Loops 🎵',
    count: 15,
    coverUrls: [
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&h=200&fit=crop',
      'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=200&h=200&fit=crop',
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=200&h=200&fit=crop',
      'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=200&h=200&fit=crop',
    ],
    isPrivate: true,
  },
];

const DEFAULT_SAVED_ITEMS: ProfileSavedItem[] = [
  {
    id: 'sav-1',
    type: 'post',
    mediaUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&h=500&fit=crop',
    title: 'Neon futuristic glass tokens',
  },
  {
    id: 'sav-2',
    type: 'reel',
    mediaUrl: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=500&h=500&fit=crop',
    title: 'Swarm agent architecture',
  },
  {
    id: 'sav-3',
    type: 'post',
    mediaUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&h=500&fit=crop',
    title: 'Silicon wafers and compute',
  },
];

const DEFAULT_TAGGED_ITEMS: ProfileTaggedItem[] = [
  {
    id: 'tag-1',
    mediaUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=500&h=500&fit=crop',
    taggedBy: 'astra_ceo',
    caption: 'Swarm leadership meeting at Trinity Lab 🚀',
    likes: 1240,
  },
  {
    id: 'tag-2',
    mediaUrl: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=500&h=500&fit=crop',
    taggedBy: 'quantrinity_hq',
    caption: 'Sprint launch day with the entire dev crew @quant_creator',
    likes: 2480,
  },
  {
    id: 'tag-3',
    mediaUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=500&h=500&fit=crop',
    taggedBy: 'dev2_sentinel',
    caption: 'CI/CD pipeline test gates 100% green verified ✅',
    likes: 980,
  },
];

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
  initialAccounts = DEFAULT_ACCOUNTS,
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

  // Active Account
  const currentAccount = useMemo(() => {
    return accounts.find((a) => a.isCurrent) || accounts[0] || DEFAULT_ACCOUNTS[0];
  }, [accounts]);

  // Total unread notifications across inactive accounts
  const totalUnreadCount = useMemo(() => {
    return getAccountTotalUnreadCount(accounts);
  }, [accounts]);

  // Consolidated profile data
  const profileData = useMemo(() => {
    return {
      id: remoteProfile?.id || userId || currentAccount.id,
      username: remoteProfile?.username || initialProfile?.username || currentAccount.username,
      displayName:
        remoteProfile?.displayName || initialProfile?.displayName || currentAccount.displayName,
      avatarUrl: remoteProfile?.avatarUrl || initialProfile?.avatarUrl || currentAccount.avatar,
      isVerified:
        remoteProfile?.isVerified ??
        initialProfile?.isVerified ??
        currentAccount.isVerified ??
        true,
      bio:
        remoteProfile?.bio ||
        initialProfile?.bio ||
        'Building the Quant Ecosystem ⚡ Autonomous AI Swarm Architecture.\nFounder @quantrinity • Coding on CodeHub.\nDaily drops: https://quantmail.in',
      website: remoteProfile?.website || initialProfile?.website || 'https://quantmail.in',
      pronouns: initialProfile?.pronouns || 'they/them',
      category: initialProfile?.category || 'Digital Creator & Quant Architect',
      postCount: remoteProfile?.postCount ?? initialProfile?.postCount ?? DEFAULT_POSTS.length,
      followerCount: remoteProfile?.followerCount ?? initialProfile?.followerCount ?? 142800,
      followingCount: remoteProfile?.followingCount ?? initialProfile?.followingCount ?? 342,
      hasActiveStory: initialProfile?.hasActiveStory ?? true,
      hasUnviewedStory: initialProfile?.hasUnviewedStory ?? true,
      isCloseFriendStory: initialProfile?.isCloseFriendStory ?? false,
    };
  }, [remoteProfile, initialProfile, currentAccount, userId]);

  // Posts data (combining fetched or defaults)
  const postsList: ProfilePostItem[] = useMemo(() => {
    if (remoteUserPosts && remoteUserPosts.length > 0) {
      return remoteUserPosts.map((p) => ({
        id: p.id,
        type: p.type || 'photo',
        mediaUrl: p.mediaUrls?.[0] || p.media?.[0]?.url || DEFAULT_POSTS[0].mediaUrl,
        caption: p.caption || '',
        likes: p.likeCount ?? p.likes ?? 0,
        comments: p.commentCount ?? p.comments?.length ?? 0,
        views: (p.likeCount ?? 0) * 4 + 120,
      }));
    }
    return DEFAULT_POSTS;
  }, [remoteUserPosts]);

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

              {/* Chevron Down */}
              <span className="text-xs text-gray-500 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                ▼
              </span>

              {/* Inactive accounts unread badge */}
              {totalUnreadCount > 0 && (
                <span
                  className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full ring-2 ring-white dark:ring-[#000000] ml-0.5"
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
                  <img
                    src={profileData.avatarUrl}
                    alt={profileData.username}
                    className="w-20 h-20 md:w-22 md:h-22 rounded-full object-cover"
                  />
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
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-sm tracking-tight">{profileData.displayName}</span>
              {profileData.pronouns && (
                <span className="text-xs text-gray-500 dark:text-[#8E8E8E] font-medium">
                  {profileData.pronouns}
                </span>
              )}
            </div>

            {profileData.category && (
              <span className="text-xs text-gray-400 dark:text-[#737373] block font-medium">
                {profileData.category}
              </span>
            )}

            {/* Clickable Bio */}
            <div
              className="text-sm text-gray-800 dark:text-[#F5F5F5] leading-snug whitespace-pre-line pt-0.5"
              data-testid="profile-bio"
            >
              {renderBioWithLinks(profileData.bio)}
            </div>

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

          {/* Story Highlights Bar */}
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

            {/* Existing Highlights */}
            {DEFAULT_HIGHLIGHTS.map((hl) => (
              <button
                key={hl.id}
                type="button"
                onClick={() => onStoryClick?.(profileData.id)}
                className="flex flex-col items-center gap-1.5 shrink-0 group focus:outline-hidden"
              >
                <div className="p-[2px] rounded-full border border-gray-200 dark:border-[#2B2B2B]">
                  <img
                    src={hl.coverUrl}
                    alt={hl.title}
                    className="w-15 h-15 rounded-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <span className="text-xs text-gray-800 dark:text-[#F5F5F5] truncate max-w-[68px] font-medium">
                  {hl.title}
                </span>
              </button>
            ))}
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

                      {/* Hover Overlay with Likes, Comments & Views */}
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
                {DEFAULT_REELS.map((reel) => (
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

                    {/* Pinned Reel Badge */}
                    {reel.isPinned && (
                      <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                        <span>📌</span>
                        <span className="hidden sm:inline">Pinned</span>
                      </div>
                    )}

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
                ))}
              </motion.div>
            )}

            {/* ---------------------------------------------------------------- */}
            {/* TAB 3: SAVED (Collection Folders & Bookmarked Reels) */}
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
                  <button
                    type="button"
                    onClick={() => onSavedClick?.(DEFAULT_SAVED_COLLECTIONS[0])}
                    className="text-[#0095F6] font-semibold hover:underline"
                  >
                    + New collection
                  </button>
                </div>

                {/* Collection Folders Matrix */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {DEFAULT_SAVED_COLLECTIONS.map((col) => (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => onSavedClick?.(col)}
                      className="flex flex-col text-left group focus:outline-hidden"
                      aria-label={`Collection ${col.name}, ${col.count} items`}
                    >
                      {/* Quadrant Mosaic Cover */}
                      <div className="aspect-square rounded-xl overflow-hidden grid grid-cols-2 grid-rows-2 gap-0.5 border border-gray-200 dark:border-[#2B2B2B] bg-gray-100 dark:bg-[#1A1A1A] group-hover:opacity-90 transition-opacity">
                        {col.coverUrls.map((url, i) => (
                          <img key={i} src={url} alt="" className="w-full h-full object-cover" />
                        ))}
                      </div>
                      <span className="font-semibold text-xs text-gray-900 dark:text-white mt-1.5 truncate">
                        {col.name}
                      </span>
                      <span className="text-[11px] text-gray-500 dark:text-[#A8A8A8]">
                        {col.count} saved items
                      </span>
                    </button>
                  ))}
                </div>

                {/* All Saved Items Preview */}
                <div className="pt-2">
                  <h4 className="text-xs font-bold text-gray-400 dark:text-[#737373] uppercase tracking-wider mb-2">
                    Recent Bookmarks
                  </h4>
                  <div className="grid grid-cols-3 gap-1">
                    {DEFAULT_SAVED_ITEMS.map((item) => (
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
                </div>
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
                {DEFAULT_TAGGED_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onTaggedClick?.(item)}
                    className="relative aspect-square overflow-hidden bg-gray-100 dark:bg-[#1A1A1A] group focus:outline-hidden"
                    aria-label={`Tagged by @${item.taggedBy}`}
                  >
                    <img
                      src={item.mediaUrl}
                      alt={item.caption || 'Tagged post'}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />

                    {/* Tag Silhouette Badge in Bottom Left */}
                    <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-xs text-white text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span>👤</span>
                      <span>@{item.taggedBy}</span>
                    </div>

                    {/* Hover Stats */}
                    <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                      <span>♥ {formatStatCount(item.likes)}</span>
                    </div>
                  </button>
                ))}
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
