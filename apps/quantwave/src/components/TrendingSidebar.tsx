'use client';

// ============================================================================
// QuantSync - TrendingSidebar Component
// Trending topics, Who to Follow suggestions, and active Spaces indicator
// ============================================================================

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StaggerList, SpringButton, Avatar } from '@quant/shared-ui';
import type { TrendingTopic } from '../types';

interface SuggestedUser {
  id: string;
  displayName: string;
  username: string;
  avatar: string;
  bio: string;
  isFollowing: boolean;
}

interface ActiveSpace {
  id: string;
  title: string;
  hostName: string;
  participantCount: number;
}

interface TrendingSidebarProps {
  topics?: TrendingTopic[];
  suggestedUsers?: SuggestedUser[];
  activeSpaces?: ActiveSpace[];
  maxItems?: number;
}

const FALLBACK_USERS: SuggestedUser[] = [
  {
    id: 'u1',
    displayName: 'Sarah Chen',
    username: 'sarahcodes',
    avatar: '/avatars/sarah.jpg',
    bio: 'Full-stack dev. Building with React + Rust.',
    isFollowing: false,
  },
  {
    id: 'u2',
    displayName: 'Marcus Lee',
    username: 'marcusai',
    avatar: '/avatars/marcus.jpg',
    bio: 'ML Engineer at DeepMind. Writing about AI safety.',
    isFollowing: false,
  },
  {
    id: 'u3',
    displayName: 'Priya Sharma',
    username: 'priyabuilds',
    avatar: '/avatars/priya.jpg',
    bio: 'Indie hacker. Shipped 5 SaaS products.',
    isFollowing: false,
  },
];

const FALLBACK_SPACES: ActiveSpace[] = [
  {
    id: 's1',
    title: 'AI in Production - Lessons Learned',
    hostName: 'TechTalks',
    participantCount: 342,
  },
  {
    id: 's2',
    title: 'Building in Public - Week 12',
    hostName: 'IndieHackers',
    participantCount: 89,
  },
];

export function TrendingSidebar({
  topics = [],
  suggestedUsers = FALLBACK_USERS,
  activeSpaces = FALLBACK_SPACES,
  maxItems = 5,
}: TrendingSidebarProps) {
  const [trendingCollapsed, setTrendingCollapsed] = useState(false);
  const [followCollapsed, setFollowCollapsed] = useState(false);
  const [spacesCollapsed, setSpacesCollapsed] = useState(false);
  const [followState, setFollowState] = useState<Record<string, boolean>>({});

  const displayTopics = topics.slice(0, maxItems);

  const handleFollow = useCallback((userId: string) => {
    setFollowState((prev) => ({ ...prev, [userId]: !prev[userId] }));
  }, []);

  return (
    <aside className="hidden lg:flex flex-col gap-4 w-full" aria-label="Sidebar">
      {/* Trending Topics Section */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[var(--quant-card)] shadow-sm overflow-hidden">
        <button
          onClick={() => setTrendingCollapsed(!trendingCollapsed)}
          className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors min-h-[44px]"
        >
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Trending</h3>
          <motion.span
            animate={{ rotate: trendingCollapsed ? -90 : 0 }}
            className="text-gray-400 text-sm"
          >
            &#x25BC;
          </motion.span>
        </button>
        <AnimatePresence>
          {!trendingCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {displayTopics.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No trending topics right now.
                  </p>
                </div>
              ) : (
                <StaggerList className="flex flex-col divide-y divide-gray-100 dark:divide-gray-700">
                  {displayTopics.map((topic, index) => (
                    <li
                      key={topic.id}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400">
                        {index + 1}
                      </span>
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {topic.category}
                        </span>
                        <a
                          className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate"
                          href={`/hashtag/${topic.name}`}
                          aria-label={`Trending: ${topic.hashtag}`}
                        >
                          {topic.hashtag}
                        </a>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {formatCount(topic.postCount)} posts
                        </span>
                      </div>
                      {topic.velocity > 2 && (
                        <span className="ml-auto inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                          Hot
                        </span>
                      )}
                    </li>
                  ))}
                </StaggerList>
              )}
              <a
                className="block border-t border-gray-100 dark:border-gray-700 px-4 py-3 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                href="/trending"
              >
                Show more
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Who to Follow Section */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[var(--quant-card)] shadow-sm overflow-hidden">
        <button
          onClick={() => setFollowCollapsed(!followCollapsed)}
          className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors min-h-[44px]"
        >
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Who to Follow</h3>
          <motion.span
            animate={{ rotate: followCollapsed ? -90 : 0 }}
            className="text-gray-400 text-sm"
          >
            &#x25BC;
          </motion.span>
        </button>
        <AnimatePresence>
          {!followCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {suggestedUsers.map((user) => {
                  const isFollowing = followState[user.id] ?? user.isFollowing;
                  return (
                    <div
                      key={user.id}
                      className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar src={user.avatar} alt={user.displayName} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {user.displayName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            @{user.username}
                          </p>
                        </div>
                        <SpringButton
                          onClick={() => handleFollow(user.id)}
                          className={`min-h-[44px] px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                            isFollowing
                              ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400'
                              : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200'
                          }`}
                        >
                          {isFollowing ? 'Following' : 'Follow'}
                        </SpringButton>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-11 line-clamp-1">
                        {user.bio}
                      </p>
                    </div>
                  );
                })}
              </div>
              <a
                className="block border-t border-gray-100 dark:border-gray-700 px-4 py-3 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                href="/explore/people"
              >
                Show more
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Active Spaces Section */}
      {activeSpaces.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[var(--quant-card)] shadow-sm overflow-hidden">
          <button
            onClick={() => setSpacesCollapsed(!spacesCollapsed)}
            className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors min-h-[44px]"
          >
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
              Spaces
            </h3>
            <motion.span
              animate={{ rotate: spacesCollapsed ? -90 : 0 }}
              className="text-gray-400 text-sm"
            >
              &#x25BC;
            </motion.span>
          </button>
          <AnimatePresence>
            {!spacesCollapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {activeSpaces.map((space) => (
                    <a
                      key={space.id}
                      href={`/spaces/${space.id}`}
                      className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {space.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-1 ml-4">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Hosted by {space.hostName}
                        </span>
                        <span className="text-xs text-purple-500 font-medium">
                          {space.participantCount} listening
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </aside>
  );
}

function formatCount(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}

export default TrendingSidebar;
