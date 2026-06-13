'use client';

// ============================================================================
// Shared UI - Settings Panel Component
// ============================================================================

import React, { useState } from 'react';

export type ThemeOption = 'light' | 'dark' | 'system';

export interface NotificationPreference {
  appId: string;
  appName: string;
  enabled: boolean;
}

export interface ShortcutEntry {
  combo: string;
  description: string;
}

export interface ShortcutGroup {
  scope: string;
  shortcuts: ShortcutEntry[];
}

export interface SettingsPanelProps {
  profile?: {
    name: string;
    email: string;
    avatarUrl?: string;
  };
  theme?: ThemeOption;
  onThemeChange?: (theme: ThemeOption) => void;
  accentColor?: string;
  onAccentColorChange?: (color: string) => void;
  notificationPreferences?: NotificationPreference[];
  onNotificationToggle?: (appId: string, enabled: boolean) => void;
  privacySettings?: {
    dataSharing: boolean;
    analytics: boolean;
  };
  onPrivacyChange?: (key: string, value: boolean) => void;
  shortcuts?: ShortcutGroup[];
  onProfileUpdate?: (name: string, email: string) => void;
}

const tabs = ['Profile', 'Appearance', 'Notifications', 'Privacy', 'Shortcuts'] as const;
type TabName = (typeof tabs)[number];

const accentColors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  profile,
  theme = 'system',
  onThemeChange,
  accentColor = '#3b82f6',
  onAccentColorChange,
  notificationPreferences = [],
  onNotificationToggle,
  privacySettings = { dataSharing: false, analytics: true },
  onPrivacyChange,
  shortcuts = [],
  onProfileUpdate,
}) => {
  const [activeTab, setActiveTab] = useState<TabName>('Profile');
  const [localName, setLocalName] = useState(profile?.name || '');
  const [localEmail, setLocalEmail] = useState(profile?.email || '');

  const renderProfile = () => (
    <div className="space-y-6" role="tabpanel" aria-label="Profile settings">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-2xl font-bold text-gray-600 dark:text-gray-300 overflow-hidden">
          {profile?.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt="Profile avatar"
              className="w-full h-full object-cover"
            />
          ) : (
            profile?.name?.charAt(0)?.toUpperCase() || 'U'
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {profile?.name || 'User'}
          </p>
          <p className="text-xs text-[var(--quant-text-secondary,#6b7280)]">
            {profile?.email || 'user@quant.dev'}
          </p>
        </div>
      </div>
      <div className="space-y-4">
        <div>
          <label
            htmlFor="settings-name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Name
          </label>
          <input
            id="settings-name"
            type="text"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            className="w-full px-4 py-2 text-sm border border-[var(--quant-border,#e5e7eb)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-100"
            aria-label="Your name"
          />
        </div>
        <div>
          <label
            htmlFor="settings-email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Email
          </label>
          <input
            id="settings-email"
            type="email"
            value={localEmail}
            onChange={(e) => setLocalEmail(e.target.value)}
            className="w-full px-4 py-2 text-sm border border-[var(--quant-border,#e5e7eb)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-100"
            aria-label="Your email"
          />
        </div>
        <button
          onClick={() => onProfileUpdate?.(localName, localEmail)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label="Save profile"
        >
          Save
        </button>
      </div>
    </div>
  );

  const renderAppearance = () => (
    <div className="space-y-6" role="tabpanel" aria-label="Appearance settings">
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Theme</p>
        <div className="flex gap-2" role="radiogroup" aria-label="Theme selection">
          {(['light', 'dark', 'system'] as ThemeOption[]).map((opt) => (
            <button
              key={opt}
              onClick={() => onThemeChange?.(opt)}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                theme === opt
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'border-[var(--quant-border,#e5e7eb)] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              role="radio"
              aria-checked={theme === opt}
              aria-label={`${opt} theme`}
            >
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Accent Color</p>
        <div className="flex gap-3" role="radiogroup" aria-label="Accent color selection">
          {accentColors.map((color) => (
            <button
              key={color}
              onClick={() => onAccentColorChange?.(color)}
              className={`w-8 h-8 rounded-full border-2 transition-transform focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                accentColor === color
                  ? 'border-gray-900 dark:border-white scale-110'
                  : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
              role="radio"
              aria-checked={accentColor === color}
              aria-label={`Accent color ${color}`}
            />
          ))}
        </div>
      </div>
    </div>
  );

  const renderNotifications = () => (
    <div className="space-y-4" role="tabpanel" aria-label="Notification settings">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Per-app notification preferences
      </p>
      {notificationPreferences.length === 0 ? (
        <p className="text-sm text-[var(--quant-text-secondary,#6b7280)]">
          No apps configured for notifications.
        </p>
      ) : (
        <div className="space-y-2">
          {notificationPreferences.map((pref) => (
            <label
              key={pref.appId}
              className="flex items-center justify-between p-3 border border-[var(--quant-border,#e5e7eb)] rounded-lg cursor-pointer hover:bg-[var(--quant-surface-hover,#f9fafb)]"
            >
              <span className="text-sm text-gray-900 dark:text-gray-100">{pref.appName}</span>
              <input
                type="checkbox"
                checked={pref.enabled}
                onChange={(e) => onNotificationToggle?.(pref.appId, e.target.checked)}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                aria-label={`Notifications for ${pref.appName}`}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );

  const renderPrivacy = () => (
    <div className="space-y-4" role="tabpanel" aria-label="Privacy settings">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Data sharing</p>
      <label className="flex items-center justify-between p-3 border border-[var(--quant-border,#e5e7eb)] rounded-lg cursor-pointer hover:bg-[var(--quant-surface-hover,#f9fafb)]">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Share usage data</p>
          <p className="text-xs text-[var(--quant-text-secondary,#6b7280)]">
            Help us improve by sharing anonymous usage data.
          </p>
        </div>
        <input
          type="checkbox"
          checked={privacySettings.dataSharing}
          onChange={(e) => onPrivacyChange?.('dataSharing', e.target.checked)}
          className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
          aria-label="Share usage data"
        />
      </label>
      <label className="flex items-center justify-between p-3 border border-[var(--quant-border,#e5e7eb)] rounded-lg cursor-pointer hover:bg-[var(--quant-surface-hover,#f9fafb)]">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Analytics</p>
          <p className="text-xs text-[var(--quant-text-secondary,#6b7280)]">
            Allow analytics tracking for product improvements.
          </p>
        </div>
        <input
          type="checkbox"
          checked={privacySettings.analytics}
          onChange={(e) => onPrivacyChange?.('analytics', e.target.checked)}
          className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
          aria-label="Allow analytics"
        />
      </label>
    </div>
  );

  const renderShortcuts = () => (
    <div className="space-y-4" role="tabpanel" aria-label="Keyboard shortcuts">
      {shortcuts.length === 0 ? (
        <p className="text-sm text-[var(--quant-text-secondary,#6b7280)]">
          No keyboard shortcuts registered.
        </p>
      ) : (
        shortcuts.map((group) => (
          <div key={group.scope}>
            <p className="text-xs font-semibold text-[var(--quant-text-secondary,#6b7280)] uppercase tracking-wide mb-2">
              {group.scope}
            </p>
            <div className="space-y-1">
              {group.shortcuts.map((shortcut) => (
                <div
                  key={shortcut.combo}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--quant-surface-hover,#f9fafb)]"
                >
                  <span className="text-sm text-gray-900 dark:text-gray-100">
                    {shortcut.description}
                  </span>
                  <kbd className="px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-[var(--quant-border,#e5e7eb)] rounded">
                    {shortcut.combo}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Profile':
        return renderProfile();
      case 'Appearance':
        return renderAppearance();
      case 'Notifications':
        return renderNotifications();
      case 'Privacy':
        return renderPrivacy();
      case 'Shortcuts':
        return renderShortcuts();
      default:
        return null;
    }
  };

  return (
    <div
      className="w-full max-w-3xl mx-auto bg-white dark:bg-gray-900 border border-[var(--quant-border,#e5e7eb)] rounded-xl shadow-sm"
      role="region"
      aria-label="Settings"
    >
      {/* Tabs */}
      <div className="border-b border-[var(--quant-border,#e5e7eb)]">
        <nav
          className="flex overflow-x-auto px-4 sm:px-6"
          role="tablist"
          aria-label="Settings tabs"
        >
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-[var(--quant-text-secondary,#6b7280)] hover:text-gray-900 dark:hover:text-gray-100'
              }`}
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`settings-${tab.toLowerCase()}`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="p-4 sm:p-6">{renderTabContent()}</div>
    </div>
  );
};
