'use client';

// ============================================================================
// Quant Ecosystem - Unified Universal Header (Standard Across All 10 Apps)
// ============================================================================

import React, { useState, useEffect } from 'react';
import type { CoreQuantAppId, QuantUserSession } from './types';
import { CORE_QUANT_APPS } from './constants';
import { UniversalAppSwitcher } from './UniversalAppSwitcher';
import { UniversalCommandPalette } from './UniversalCommandPalette';
import { UnifiedNotificationDrawer } from './UnifiedNotificationDrawer';
import { NotificationBus } from './NotificationBus';

export interface UnifiedEcosystemHeaderProps {
  currentApp: CoreQuantAppId;
  user: QuantUserSession;
  onOpenSidekick?: () => void;
  className?: string;
}

export const UnifiedEcosystemHeader: React.FC<UnifiedEcosystemHeaderProps> = ({
  currentApp,
  user,
  onOpenSidekick,
  className = '',
}) => {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const appMeta = CORE_QUANT_APPS[currentApp];

  useEffect(() => {
    // Listen for Cmd+K / Ctrl+K
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    // Subscribe to notification updates
    const bus = NotificationBus.getInstance();
    const unsub = bus.subscribe(() => {
      setUnreadCount(bus.getTotalUnreadCount());
    });
    return unsub;
  }, []);

  return (
    <>
      <header
        className={`h-14 px-4 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 flex items-center justify-between sticky top-0 z-40 ${className}`}
      >
        {/* Left Section: 9-Dots Switcher + Brand Identity */}
        <div className="flex items-center gap-3">
          <UniversalAppSwitcher
            currentApp={currentApp}
            user={user}
            onOpenNotifications={() => setIsNotificationDrawerOpen(true)}
          />

          {/* App Branding */}
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shadow-xs"
              style={{
                backgroundColor: `${appMeta.accentColor}20`,
                color: appMeta.accentColor,
              }}
            >
              {appMeta.name.charAt(5) || 'Q'}
            </div>
            <div className="hidden sm:block">
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                {appMeta.name}
              </span>
              <span className="text-[10px] text-gray-400 ml-1.5 font-medium hidden md:inline">
                • {appMeta.tagline}
              </span>
            </div>
          </div>
        </div>

        {/* Center Section: Universal Command Palette (Cmd+K) Trigger */}
        <div className="flex-1 max-w-lg mx-4">
          <button
            type="button"
            onClick={() => setIsCommandPaletteOpen(true)}
            className="w-full flex items-center justify-between px-3.5 py-1.5 text-xs bg-gray-100 hover:bg-gray-200/80 dark:bg-gray-800 dark:hover:bg-gray-700/80 text-gray-500 dark:text-gray-400 rounded-xl border border-transparent hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-150"
          >
            <div className="flex items-center gap-2 truncate">
              <svg
                className="w-3.5 h-3.5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <circle cx="11" cy="11" r="8" strokeWidth={2} />
                <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth={2} />
              </svg>
              <span className="truncate">Search ecosystem (Mail, Reels, Chats, AI)...</span>
            </div>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 shadow-xs">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>
        </div>

        {/* Right Section: QuantAI Alien + Notifications Bell + Account Chip */}
        <div className="flex items-center gap-2">
          {/* QuantAI Assistant Quick Launch */}
          {onOpenSidekick && (
            <button
              onClick={onOpenSidekick}
              className="p-1.5 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-950/40 text-purple-600 transition-colors"
              title="QuantAI Sidekick"
            >
              <span className="text-lg">👾</span>
            </button>
          )}

          {/* Notifications Bell */}
          <button
            type="button"
            onClick={() => setIsNotificationDrawerOpen(true)}
            className="relative p-2 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800 transition-colors"
            aria-label="Unified Notifications"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-xs">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* User Account Avatar */}
          <div className="flex items-center gap-2 pl-1 border-l border-gray-200 dark:border-gray-800">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.displayName}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-blue-500/30"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Universal Modals & Drawers */}
      <UniversalCommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />

      <UnifiedNotificationDrawer
        isOpen={isNotificationDrawerOpen}
        onClose={() => setIsNotificationDrawerOpen(false)}
      />
    </>
  );
};
