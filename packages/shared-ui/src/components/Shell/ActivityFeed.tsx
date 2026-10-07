'use client';

// ============================================================================
// Shared UI - Activity Feed Component
// ============================================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';

export interface ActivityItem {
  id: string;
  actor: string;
  actorAvatar?: string;
  action: string;
  app: string;
  type: string;
  timestamp: number;
  url?: string;
  description?: string;
}

export interface ActivityFeedProps {
  activities: ActivityItem[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
  filterApps?: string[];
  filterTypes?: string[];
  availableApps?: string[];
  availableTypes?: string[];
  onFilterAppsChange?: (apps: string[]) => void;
  onFilterTypesChange?: (types: string[]) => void;
  onActivityClick?: (activity: ActivityItem) => void;
}

const appIcons: Record<string, string> = {
  mail: '\u2709\uFE0F',
  calendar: '\uD83D\uDCC5',
  drive: '\uD83D\uDCC1',
  chat: '\uD83D\uDCAC',
  docs: '\uD83D\uDCDD',
  meet: '\uD83D\uDCF9',
  contacts: '\uD83D\uDC64',
};

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  activities,
  onLoadMore,
  hasMore = false,
  loading = false,
  filterApps = [],
  filterTypes = [],
  availableApps = [],
  availableTypes = [],
  onFilterAppsChange,
  onFilterTypesChange,
  onActivityClick,
}) => {
  const [showFilters, setShowFilters] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !onLoadMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading) {
          onLoadMore();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, loading]);

  const formatTimestamp = (ts: number): string => {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const toggleAppFilter = useCallback(
    (app: string) => {
      const next = filterApps.includes(app)
        ? filterApps.filter((a) => a !== app)
        : [...filterApps, app];
      onFilterAppsChange?.(next);
    },
    [filterApps, onFilterAppsChange],
  );

  const toggleTypeFilter = useCallback(
    (type: string) => {
      const next = filterTypes.includes(type)
        ? filterTypes.filter((t) => t !== type)
        : [...filterTypes, type];
      onFilterTypesChange?.(next);
    },
    [filterTypes, onFilterTypesChange],
  );

  // Filter activities
  const filteredActivities = activities.filter((a) => {
    if (filterApps.length > 0 && !filterApps.includes(a.app)) return false;
    if (filterTypes.length > 0 && !filterTypes.includes(a.type)) return false;
    return true;
  });

  return (
    <div
      className="w-full max-w-2xl mx-auto"
      role="feed"
      aria-label="Activity feed"
      aria-busy={loading}
    >
      {/* Header with filter toggle */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Activity</h2>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            showFilters || filterApps.length > 0 || filterTypes.length > 0
              ? 'border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-900/20'
              : 'border-[var(--quant-border,#e5e7eb)] text-[var(--quant-text-secondary,#6b7280)] hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
          aria-label="Toggle filters"
          aria-expanded={showFilters}
        >
          Filter
          {filterApps.length + filterTypes.length > 0
            ? ` (${filterApps.length + filterTypes.length})`
            : ''}
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="mb-4 p-4 bg-[var(--quant-surface-hover,#f9fafb)] dark:bg-gray-800 rounded-lg border border-[var(--quant-border,#e5e7eb)]">
          {availableApps.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-[var(--quant-text-secondary,#6b7280)] mb-2 uppercase tracking-wide">
                Apps
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="App filters">
                {availableApps.map((app) => (
                  <button
                    key={app}
                    onClick={() => toggleAppFilter(app)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      filterApps.includes(app)
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'border-[var(--quant-border,#e5e7eb)] text-gray-600 dark:text-gray-400'
                    }`}
                    aria-pressed={filterApps.includes(app)}
                  >
                    {appIcons[app.toLowerCase()] || ''} {app}
                  </button>
                ))}
              </div>
            </div>
          )}
          {availableTypes.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--quant-text-secondary,#6b7280)] mb-2 uppercase tracking-wide">
                Types
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Type filters">
                {availableTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => toggleTypeFilter(type)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      filterTypes.includes(type)
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'border-[var(--quant-border,#e5e7eb)] text-gray-600 dark:text-gray-400'
                    }`}
                    aria-pressed={filterTypes.includes(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activity list */}
      {filteredActivities.length === 0 && !loading ? (
        <div className="text-center py-8">
          <p className="text-sm text-[var(--quant-text-secondary,#6b7280)]">No activity to show.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredActivities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start gap-3 p-3 rounded-lg hover:bg-[var(--quant-surface-hover,#f9fafb)] dark:hover:bg-gray-800 cursor-pointer transition-colors"
              role="article"
              aria-label={`${activity.actor} ${activity.action}`}
              onClick={() => onActivityClick?.(activity)}
            >
              {/* Avatar */}
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-300">
                {activity.actorAvatar ? (
                  <img
                    src={activity.actorAvatar}
                    alt=""
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  activity.actor.charAt(0).toUpperCase()
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  <span className="font-medium">{activity.actor}</span>{' '}
                  <span className="text-[var(--quant-text-secondary,#6b7280)]">
                    {activity.action}
                  </span>
                </p>
                {activity.description && (
                  <p className="text-xs text-[var(--quant-text-secondary,#6b7280)] mt-0.5 truncate">
                    {activity.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs" aria-hidden="true">
                    {appIcons[activity.app.toLowerCase()] || '\uD83D\uDCE6'}
                  </span>
                  <span className="text-xs text-[var(--quant-text-secondary,#6b7280)]">
                    {activity.app}
                  </span>
                  <span className="text-xs text-[var(--quant-text-secondary,#6b7280)]">
                    {formatTimestamp(activity.timestamp)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" aria-hidden="true" />

      {/* Loading indicator */}
      {loading && (
        <div className="py-4 text-center">
          <p className="text-sm text-[var(--quant-text-secondary,#6b7280)]">Loading more...</p>
        </div>
      )}
    </div>
  );
};
