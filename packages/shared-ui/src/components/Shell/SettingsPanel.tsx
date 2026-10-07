'use client';

// ============================================================================
// Shared UI - Settings Panel Component
// ============================================================================

import React, { useCallback, useId, useRef, useState } from 'react';
import { nextRovingIndex, rovingTabIndex } from '../../utils/roving-focus';

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

const themeOptions: readonly ThemeOption[] = ['light', 'dark', 'system'];

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

  /*
    Every tab pointed `aria-controls` at `settings-profile`, `settings-appearance`
    and so on, and not one of those ids was ever rendered anywhere in the file —
    five dangling IDREFs. The five panels, meanwhile, carried `role="tabpanel"`
    with a hand-written `aria-label` and no `id`, so the relationship existed in
    neither direction: a reader on a tab was told it controlled something that did
    not exist, and a reader in a panel had no way back to the tab that opened it.

    Both halves are one defect, so both are fixed in one place. The five renderers
    no longer declare the role themselves; the single wrapper below owns `id`,
    `role` and `aria-labelledby`, which makes the pair correct by construction
    instead of by five matching string literals.

    `useId` rather than the literal ids the old `aria-controls` implied: this is a
    package primitive, and a settings surface embedded twice on one page would
    otherwise give both panels the same id and point both tabs at the first.
  */
  const baseId = useId();
  const tabId = (tab: TabName) => `${baseId}-tab-${tab.toLowerCase()}`;
  const panelId = (tab: TabName) => `${baseId}-panel-${tab.toLowerCase()}`;

  /*
    `role="tablist"` is a promise about the keyboard, not a label: the APG has
    Left/Right moving the selection and Home/End jumping to the ends, with exactly
    one tab in the tab sequence. This shipped with all five in the sequence and no
    key handler at all, so the role described a widget that did not exist. Focus
    has to be moved imperatively after the state change, which is what the refs
    are for.
  */
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = tabs.indexOf(activeTab);

  const onTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const next = nextRovingIndex(event.key, index, tabs.length);
      if (next === null) return;
      // Keeps the arrows off the horizontal scroller this row becomes on a narrow
      // screen, which would otherwise slide the tab out from under the focus ring.
      event.preventDefault();
      // `nextRovingIndex` only ever returns an in-range index or null, which
      // `noUncheckedIndexedAccess` cannot see.
      setActiveTab(tabs[next]!);
      tabRefs.current[next]?.focus();
    },
    [],
  );

  /*
    The same promise, twice more. Both `role="radiogroup"`s below held `role="radio"`
    buttons with every one of them in the tab sequence and no key handler — nine
    tab stops where a radio group is meant to have one, and none of the arrow keys
    a reader will actually try. Selection follows focus here, as it does for radios
    and unlike a menu.

    `accentIndex` can be -1 when a consumer passes a colour outside the six; the
    primitive answers that by parking the tab stop on the first swatch, so the
    group stays reachable instead of dropping out of the sequence entirely.
  */
  const themeRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const accentRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const themeIndex = themeOptions.indexOf(theme);
  const accentIndex = accentColors.indexOf(accentColor);

  const onThemeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const next = nextRovingIndex(event.key, index, themeOptions.length);
      if (next === null) return;
      event.preventDefault();
      onThemeChange?.(themeOptions[next]!);
      themeRefs.current[next]?.focus();
    },
    [onThemeChange],
  );

  const onAccentKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const next = nextRovingIndex(event.key, index, accentColors.length);
      if (next === null) return;
      event.preventDefault();
      onAccentColorChange?.(accentColors[next]!);
      accentRefs.current[next]?.focus();
    },
    [onAccentColorChange],
  );

  // The role and the name live on the single wrapper that renders whichever of
  // these is active — see the comment above `baseId`. A `role="tabpanel"` here as
  // well would nest one panel inside another and re-open the naming problem.
  const renderProfile = () => (
    <div className="space-y-6">
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
        {/* Same reason the tabs use `baseId`: two settings surfaces on one page
            would otherwise both render `id="settings-name"`, and both `<label>`s
            would point at the first one. */}
        <div>
          <label
            htmlFor={`${baseId}-name`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Name
          </label>
          <input
            id={`${baseId}-name`}
            type="text"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            className="w-full px-4 py-2 text-sm border border-[var(--quant-border,#e5e7eb)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-100"
            aria-label="Your name"
          />
        </div>
        <div>
          <label
            htmlFor={`${baseId}-email`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Email
          </label>
          <input
            id={`${baseId}-email`}
            type="email"
            value={localEmail}
            onChange={(e) => setLocalEmail(e.target.value)}
            className="w-full px-4 py-2 text-sm border border-[var(--quant-border,#e5e7eb)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-100"
            aria-label="Your email"
          />
        </div>
        <button
          type="button"
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
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Theme</p>
        <div className="flex gap-2" role="radiogroup" aria-label="Theme selection">
          {themeOptions.map((opt, index) => (
            <button
              key={opt}
              type="button"
              ref={(node) => {
                themeRefs.current[index] = node;
              }}
              onClick={() => onThemeChange?.(opt)}
              onKeyDown={(event) => onThemeKeyDown(event, index)}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                theme === opt
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'border-[var(--quant-border,#e5e7eb)] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              role="radio"
              aria-checked={theme === opt}
              // Kept over the visible "Light": a radio can be arrived at from
              // anywhere and not every reader re-announces the group name, so the
              // word "theme" has to survive on the control itself. WCAG 2.5.3 is
              // satisfied either way — the name contains the visible text.
              aria-label={`${opt} theme`}
              tabIndex={rovingTabIndex(index, themeIndex)}
            >
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Accent Color</p>
        <div className="flex gap-3" role="radiogroup" aria-label="Accent color selection">
          {accentColors.map((color, index) => (
            <button
              key={color}
              type="button"
              ref={(node) => {
                accentRefs.current[index] = node;
              }}
              onClick={() => onAccentColorChange?.(color)}
              onKeyDown={(event) => onAccentKeyDown(event, index)}
              /*
                An 8×8 swatch is a 32px pointer target, which no thumb hits
                reliably. `before:-inset-1.5` puts the missing 12px on a
                pseudo-element — 44px square, nothing moves, and it lands exactly
                in the `gap-3` between swatches so two targets meet without ever
                overlapping. Same trick as `Form/SearchClearButton`.
              */
              className={`relative w-8 h-8 rounded-full border-2 transition-transform focus:outline-none focus:ring-2 focus:ring-blue-500 before:absolute before:-inset-1.5 before:content-[''] ${
                accentColor === color
                  ? 'border-gray-900 dark:border-white scale-110'
                  : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
              role="radio"
              aria-checked={accentColor === color}
              aria-label={`Accent color ${color}`}
              tabIndex={rovingTabIndex(index, accentIndex)}
            />
          ))}
        </div>
      </div>
    </div>
  );

  const renderNotifications = () => (
    <div className="space-y-4">
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
    <div className="space-y-4">
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
    <div className="space-y-4">
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
          {tabs.map((tab, index) => (
            <button
              key={tab}
              // A settings panel is exactly the thing a consumer drops inside a
              // <form>, where a bare <button> is a submit button and every tab
              // switch would post the form.
              type="button"
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={tabId(tab)}
              onClick={() => setActiveTab(tab)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-[var(--quant-text-secondary,#6b7280)] hover:text-gray-900 dark:hover:text-gray-100'
              }`}
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={panelId(tab)}
              tabIndex={rovingTabIndex(index, activeIndex)}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/*
        Tab content. One wrapper, one panel: the role and the accessible name are
        declared here so they cannot drift from the tab that points at them, and
        `tabIndex={0}` is what the APG asks for when a panel holds no focusable
        control of its own — Shortcuts is read-only, and without this the sequence
        after the tabs jumps straight past everything it just selected.
      */}
      <div
        id={panelId(activeTab)}
        role="tabpanel"
        aria-labelledby={tabId(activeTab)}
        tabIndex={0}
        className="p-4 sm:p-6"
      >
        {renderTabContent()}
      </div>
    </div>
  );
};
