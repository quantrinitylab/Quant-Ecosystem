'use client';

// ============================================================================
// QuantSync - CommunityCard Component
// Community preview card for discovery
// ============================================================================

import type { Community } from '../types';

interface CommunityCardProps {
  community: Community;
  onJoin?: (communityId: string) => void;
  onClick?: (communityId: string) => void;
}

export function CommunityCard({ community, onJoin, onClick }: CommunityCardProps) {
  return (
    <div
      className="flex w-full flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[var(--quant-card)] shadow-sm overflow-hidden cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all"
      onClick={() => onClick?.(community.id)}
      role="article"
      aria-label={`Community: ${community.displayName}`}
    >
      {community.banner && (
        <div
          className="h-24 w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${community.banner})` }}
          aria-hidden="true"
        />
      )}
      <div className="flex flex-col items-start gap-2 p-4">
        <img
          className="h-12 w-12 rounded-full border-2 border-white dark:border-gray-800 shadow-sm -mt-8"
          src={community.icon || '/default-community.png'}
          alt={community.displayName}
        />
        <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {community.displayName}
        </h4>
        <span className="text-sm text-gray-500 dark:text-gray-400">r/{community.name}</span>
        <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3">
          {community.description.substring(0, 150)}
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>{formatCount(community.memberCount)} members</span>
          <span>{community.onlineCount} online</span>
        </div>
        <span className="inline-block rounded-full bg-indigo-100 dark:bg-indigo-900/30 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
          {community.category}
        </span>
        {!community.isJoined && (
          <button
            className="mt-2 min-h-[44px] rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onJoin?.(community.id);
            }}
            aria-label={`Join ${community.displayName}`}
          >
            Join
          </button>
        )}
        {community.isJoined && (
          <span className="mt-2 inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/30 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-300">
            Joined
          </span>
        )}
      </div>
    </div>
  );
}

function formatCount(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}

export default CommunityCard;
