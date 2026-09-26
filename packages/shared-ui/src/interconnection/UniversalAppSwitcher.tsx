'use client';

// ============================================================================
// Quant Ecosystem - Universal App Switcher (9-Dots Launcher & Account Chip)
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import type { CoreQuantAppId, QuantUserSession, AppNotificationBadgeCount } from './types';
import { CORE_QUANT_APPS, CATEGORY_LABELS } from './constants';
import { UniversalSSOTokenBridge } from './UniversalSSOTokenBridge';

export interface UniversalAppSwitcherProps {
  currentApp: CoreQuantAppId;
  user: QuantUserSession;
  badges?: AppNotificationBadgeCount[];
  onOpenNotifications?: () => void;
  onOpenProfile?: () => void;
  className?: string;
}

export const UniversalAppSwitcher: React.FC<UniversalAppSwitcherProps> = ({
  currentApp,
  user,
  badges = [],
  onOpenNotifications: _onOpenNotifications,
  onOpenProfile,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Map badge counts for O(1) lookup
  const badgeMap = new Map<CoreQuantAppId, number>();
  badges.forEach((b) => badgeMap.set(b.app, b.unreadCount));

  // Close on outside click or escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleLaunchApp = (appId: CoreQuantAppId, e: React.MouseEvent) => {
    e.preventDefault();
    if (appId === currentApp) {
      setIsOpen(false);
      return;
    }

    const bridge = UniversalSSOTokenBridge.getInstance();
    if (user && !bridge.getCurrentSession()) {
      bridge.setCurrentSession(user, 3600);
    }
    const jumpUrl = bridge.buildCrossAppJumpUrl(appId);
    setIsOpen(false);
    window.location.href = jumpUrl;
  };

  const allApps = Object.values(CORE_QUANT_APPS);
  const filteredApps = searchQuery
    ? allApps.filter(
        (app) =>
          app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          app.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          app.tagline.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : allApps;

  // Group apps by category
  const categories: Array<{ id: string; label: string; apps: typeof allApps }> = [
    {
      id: 'social_communication',
      label: CATEGORY_LABELS['social_communication'] || 'Social & Communication',
      apps: filteredApps.filter((a) => a.category === 'social_communication'),
    },
    {
      id: 'creative_intelligence',
      label: CATEGORY_LABELS['creative_intelligence'] || 'Creative & Intelligence',
      apps: filteredApps.filter((a) => a.category === 'creative_intelligence'),
    },
    {
      id: 'enterprise_productivity',
      label: CATEGORY_LABELS['enterprise_productivity'] || 'Enterprise & Productivity',
      apps: filteredApps.filter((a) => a.category === 'enterprise_productivity'),
    },
  ].filter((group) => group.apps.length > 0);

  // SVG Icon mapping for apps
  const renderAppIcon = (iconName: string, color: string) => {
    switch (iconName) {
      case 'mail':
        return (
          <svg className="w-6 h-6" fill="none" stroke={color} strokeWidth={2} viewBox="0 0 24 24">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        );
      case 'message-square':
        return (
          <svg className="w-6 h-6" fill="none" stroke={color} strokeWidth={2} viewBox="0 0 24 24">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        );
      case 'camera':
        return (
          <svg className="w-6 h-6" fill="none" stroke={color} strokeWidth={2} viewBox="0 0 24 24">
            <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
          </svg>
        );
      case 'sparkles':
        return (
          <svg className="w-6 h-6" fill="none" stroke={color} strokeWidth={2} viewBox="0 0 24 24">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
          </svg>
        );
      case 'video':
        return (
          <svg className="w-6 h-6" fill="none" stroke={color} strokeWidth={2} viewBox="0 0 24 24">
            <path d="m22 8-6 4 6 4V8Z" />
            <rect width="14" height="12" x="2" y="6" rx="2" />
          </svg>
        );
      case 'radio':
        return (
          <svg className="w-6 h-6" fill="none" stroke={color} strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="2" />
            <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
          </svg>
        );
      case 'table':
        return (
          <svg className="w-6 h-6" fill="none" stroke={color} strokeWidth={2} viewBox="0 0 24 24">
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
          </svg>
        );
      case 'utensils':
        return (
          <svg className="w-6 h-6" fill="none" stroke={color} strokeWidth={2} viewBox="0 0 24 24">
            <path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2" />
            <path d="M15 11v11M5 2v20M5 7h4a2 2 0 0 0 2-2V2" />
          </svg>
        );
      case 'bar-chart-3':
        return (
          <svg className="w-6 h-6" fill="none" stroke={color} strokeWidth={2} viewBox="0 0 24 24">
            <path d="M3 3v18h18" />
            <path d="M18 17V9" />
            <path d="M13 17V5" />
            <path d="M8 17v-3" />
          </svg>
        );
      case 'shield-check':
        return (
          <svg className="w-6 h-6" fill="none" stroke={color} strokeWidth={2} viewBox="0 0 24 24">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        );
      default:
        return (
          <div
            className="w-6 h-6 rounded flex items-center justify-center font-bold text-xs"
            style={{ color }}
          >
            Q
          </div>
        );
    }
  };

  return (
    <div className={`relative inline-block ${className}`}>
      {/* 9-Dots Bento Grid Launcher Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="p-2 rounded-xl text-gray-700 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Universal Quant App Switcher (9 dots)"
        aria-expanded={isOpen}
      >
        <div className="w-5 h-5 grid grid-cols-3 gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-current transition-transform duration-200 hover:scale-125" />
          <div className="w-1.5 h-1.5 rounded-full bg-current transition-transform duration-200 hover:scale-125" />
          <div className="w-1.5 h-1.5 rounded-full bg-current transition-transform duration-200 hover:scale-125" />
          <div className="w-1.5 h-1.5 rounded-full bg-current transition-transform duration-200 hover:scale-125" />
          <div className="w-1.5 h-1.5 rounded-full bg-current transition-transform duration-200 hover:scale-125" />
          <div className="w-1.5 h-1.5 rounded-full bg-current transition-transform duration-200 hover:scale-125" />
          <div className="w-1.5 h-1.5 rounded-full bg-current transition-transform duration-200 hover:scale-125" />
          <div className="w-1.5 h-1.5 rounded-full bg-current transition-transform duration-200 hover:scale-125" />
          <div className="w-1.5 h-1.5 rounded-full bg-current transition-transform duration-200 hover:scale-125" />
        </div>
      </button>

      {/* Launcher Flyout Panel */}
      {isOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 mt-3 w-96 max-h-[85vh] overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl z-50 p-4 animate-in fade-in slide-in-from-top-2 duration-150"
          role="dialog"
          aria-label="Quant Ecosystem Application Switcher"
        >
          {/* Active Account Chip Header */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="w-10 h-10 rounded-full object-cover border-2 border-blue-500"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {user.displayName}
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                    {user.tier}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
              </div>
            </div>

            <button
              onClick={onOpenProfile}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 text-xs font-medium"
              title="Manage Account"
            >
              Manage
            </button>
          </div>

          {/* Quick Filter Search Input */}
          <div className="relative mb-3">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" strokeWidth={2} />
              <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth={2} />
            </svg>
            <input
              type="text"
              placeholder="Search apps or tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-900"
            />
          </div>

          {/* Apps Categorized Grid */}
          <div className="space-y-4">
            {categories.map((category) => (
              <div key={category.id}>
                <h3 className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase mb-2 px-1">
                  {category.label}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {category.apps.map((app) => {
                    const isActive = app.id === currentApp;
                    const unread = badgeMap.get(app.id) || 0;

                    const jumpUrl = UniversalSSOTokenBridge.getInstance().buildCrossAppJumpUrl(
                      app.id,
                    );

                    return (
                      <a
                        key={app.id}
                        href={jumpUrl}
                        onClick={(e) => handleLaunchApp(app.id, e)}
                        className={`group relative flex items-center gap-3 p-2.5 rounded-xl border transition-all duration-150 ${
                          isActive
                            ? 'bg-blue-50/70 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800 shadow-sm'
                            : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/80 hover:border-gray-200 dark:hover:border-gray-700'
                        }`}
                      >
                        {/* App Icon Container */}
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm transition-transform group-hover:scale-105"
                          style={{
                            backgroundColor: `${app.accentColor}18`,
                          }}
                        >
                          {renderAppIcon(app.icon, app.accentColor)}
                        </div>

                        {/* Title & Tagline */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                              {app.name}
                            </span>
                            {isActive && (
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                            )}
                          </div>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                            {app.tagline}
                          </p>
                        </div>

                        {/* Unread Badge Count */}
                        {unread > 0 && (
                          <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[10px] font-bold text-white bg-red-500 rounded-full shadow-sm animate-pulse">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Footer Links */}
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1">
            <span className="text-[11px]">Quant Ecosystem Unified v2.4</span>
            <button
              onClick={() => {
                setIsOpen(false);
                UniversalSSOTokenBridge.getInstance().performGlobalLogout(currentApp);
              }}
              className="text-red-500 hover:text-red-700 font-medium text-[11px]"
            >
              Sign out of all apps
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
