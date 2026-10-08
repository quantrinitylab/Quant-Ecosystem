'use client';

// ============================================================================
// QuantGit — Notifications Center & Inbox (GitHub Screens 22, 85–86, 145–146)
//
// QM-UIUX-065 honesty contract: this inbox renders ONLY notifications it is
// given via props. There is no seed/sample data anywhere in this file — the
// backend never creates git notifications (the only notification producer is
// the inbound-mail webhook), so with no real source wired in, the honest
// state is an empty inbox, not fabricated rows about merged PRs or CI runs.
// ============================================================================

import React, { useEffect, useState } from 'react';

export interface GitNotificationItem {
  id: string;
  repo: string;
  number: number;
  type: 'pr' | 'issue' | 'release' | 'ci';
  status: 'open' | 'merged' | 'closed' | 'failed' | 'success';
  title: string;
  author: string;
  commentSnippet?: string;
  timeAgo: string;
  unread: boolean;
  category: 'assigned' | 'participating' | 'mentioned' | 'review_requested';
}

export interface NotificationsInboxProps {
  /** Real notifications only. Defaults to an empty, honest inbox. */
  notifications?: GitNotificationItem[];
}

export const NotificationsInbox: React.FC<NotificationsInboxProps> = ({
  notifications: providedNotifications = [],
}) => {
  const [activeMainTab, setActiveMainTab] = useState<'inbox' | 'saved' | 'done'>('inbox');
  const [filterRead, setFilterRead] = useState<'all' | 'unread'>('all');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [notifications, setNotifications] = useState<GitNotificationItem[]>(providedNotifications);

  // Keep the inbox in sync with real data supplied after mount (e.g. an
  // async API fetch resolving in the parent). Without this, notifications
  // that arrive after the first render would silently never appear.
  useEffect(() => {
    setNotifications(providedNotifications);
  }, [providedNotifications]);

  const filteredNotifs = notifications.filter((n) => {
    if (filterRead === 'unread' && !n.unread) return false;
    if (selectedFilter !== 'all' && n.category !== selectedFilter) return false;
    return true;
  });

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col md:flex-row gap-6 text-xs text-[#E6EDF3] py-4">
      {/* Left Sidebar Filters (Screens 22, 85–86) */}
      <div className="w-full md:w-56 space-y-4 shrink-0">
        <div className="space-y-1">
          <button
            onClick={() => setActiveMainTab('inbox')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors ${
              activeMainTab === 'inbox'
                ? 'bg-[#21262D] text-[#E6EDF3]'
                : 'text-[#8D96A0] hover:bg-[var(--quant-surface-elevated)]'
            }`}
          >
            <span className="flex items-center gap-2">
              <span>📥</span>
              <span>Inbox</span>
            </span>
            <span className="text-[10px] px-1.5 py-px rounded-full bg-[#30363D] text-[#E6EDF3]">
              {notifications.filter((n) => n.unread).length}
            </span>
          </button>

          <button
            onClick={() => setActiveMainTab('saved')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors ${
              activeMainTab === 'saved'
                ? 'bg-[#21262D] text-[#E6EDF3]'
                : 'text-[#8D96A0] hover:bg-[var(--quant-surface-elevated)]'
            }`}
          >
            <span className="flex items-center gap-2">
              <span>🔖</span>
              <span>Saved</span>
            </span>
          </button>

          <button
            onClick={() => setActiveMainTab('done')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors ${
              activeMainTab === 'done'
                ? 'bg-[#21262D] text-[#E6EDF3]'
                : 'text-[#8D96A0] hover:bg-[var(--quant-surface-elevated)]'
            }`}
          >
            <span className="flex items-center gap-2">
              <span>✓</span>
              <span>Done</span>
            </span>
          </button>
        </div>

        {/* Filters Group */}
        <div className="pt-3 border-t border-[#30363D] space-y-1">
          <span className="text-[11px] font-semibold text-[#8D96A0] px-3 uppercase tracking-wider">
            Filters
          </span>
          {[
            { id: 'all', label: 'All notifications', icon: '🔔' },
            { id: 'assigned', label: 'Assigned', icon: '👤' },
            { id: 'participating', label: 'Participating', icon: '💬' },
            { id: 'mentioned', label: 'Mentioned', icon: '@' },
            { id: 'review_requested', label: 'Review requested', icon: '👀' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedFilter(f.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left transition-colors ${
                selectedFilter === f.id
                  ? 'bg-[#1F242C] text-[#58A6FF] font-medium'
                  : 'text-[#8D96A0] hover:text-[#E6EDF3] hover:bg-[var(--quant-surface-elevated)]'
              }`}
            >
              <span>{f.icon}</span>
              <span>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Notification Stream */}
      <div className="flex-1 space-y-4">
        {/* Header Toolbar */}
        <div className="flex items-center justify-between border-b border-[#30363D] pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterRead('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                filterRead === 'all'
                  ? 'bg-[#21262D] text-[#E6EDF3]'
                  : 'text-[#8D96A0] hover:text-[#E6EDF3]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterRead('unread')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                filterRead === 'unread'
                  ? 'bg-[#21262D] text-[#E6EDF3]'
                  : 'text-[#8D96A0] hover:text-[#E6EDF3]'
              }`}
            >
              Unread
            </button>
          </div>

          <button
            onClick={markAllRead}
            className="text-[11px] text-[#58A6FF] hover:underline font-medium"
          >
            Mark all as read
          </button>
        </div>

        {/* Notifications List */}
        {filteredNotifs.length > 0 ? (
          <div className="divide-y divide-[#21262D] rounded-xl bg-[var(--quant-surface-elevated)] border border-[#30363D] overflow-hidden">
            {filteredNotifs.map((item) => (
              <div
                key={item.id}
                className={`p-4 flex items-start justify-between gap-3 hover:bg-[#1C2128] transition-colors ${
                  item.unread ? 'bg-[var(--quant-surface-elevated)]' : 'bg-[var(--quant-surface-elevated)]/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    {item.type === 'pr' && <span className="text-[#A371F7] text-sm">⑂</span>}
                    {item.type === 'issue' && <span className="text-[#3FB950] text-sm">☉</span>}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[11px] text-[#8D96A0]">
                      <span className="font-semibold text-[#E6EDF3]">{item.repo}</span>
                      <span>#{item.number}</span>
                    </div>

                    <h4 className="font-medium text-xs text-[#E6EDF3] leading-snug">
                      {item.title}
                    </h4>

                    {item.commentSnippet && (
                      <p className="text-[11px] text-[#8D96A0] line-clamp-1">
                        <span className="font-medium text-[#C9D1D9]">{item.author}:</span>{' '}
                        {item.commentSnippet}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 pt-0.5">
                  <span className="text-[11px] text-[#8D96A0] font-mono">{item.timeAgo}</span>
                  {item.unread && (
                    <span className="w-2.5 h-2.5 rounded-full bg-[#58A6FF]" title="Unread" />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Empty State Illustration (Screen 22) */
          <div className="py-16 text-center space-y-4 rounded-xl bg-[var(--quant-surface-elevated)] border border-[#30363D] p-8">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 mx-auto flex items-center justify-center text-3xl">
              🧘
            </div>
            <div>
              <h4 className="font-bold text-sm text-[#E6EDF3]">No notifications</h4>
              <p className="text-xs text-[#8D96A0] pt-1">
                There are no notifications to show right now.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
