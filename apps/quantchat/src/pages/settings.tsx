// ============================================================================
// QuantChat - Settings Page
// Privacy, notifications, theme, blocked users, data export, account deletion
// ============================================================================
//
// STYLING ROOT-CAUSE FIX (P0, live audit 2026-10-11): this page used custom
// class names (settings-page, settings-nav, setting-group, ...) that are
// defined in NO stylesheet in the repo, so it rendered as raw browser-
// default HTML. It now uses the app's Tailwind + CSS-token system, the same
// conversion src/pages/calls.tsx already went through. Form controls use
// the .quant-field / .quant-btn primitives defined in globals.css.
//
// AUTH HARDENING (P0, same audit): the page rendered its full UI — Save
// buttons and "Delete My Account" included — to logged-out visitors,
// because the Pages Router shell mounted no auth gate AND this page fell
// back to built-in default settings when its fetch failed. The shell now
// gates the route (PagesAuthGate), and this page additionally treats a
// 401 from /api/settings as a sign-in prompt, never as editable defaults.

import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { logger } from '@quant/common';
import { getAuthHeaders, getAuthHeadersWithContent } from '../lib/auth';
import { sanitizeErrorMessage } from '../lib/sanitize-error';
import { signOut } from '../lib/auth-session';
import { apiFetchRaw } from '@quant/api-client';

interface PrivacySettings {
  whoCanMessage: 'everyone' | 'friends' | 'nobody';
  whoCanSeeStory: 'everyone' | 'friends' | 'custom';
  whoCanSeeLocation: 'friends' | 'nobody' | 'ghost';
  showOnlineStatus: boolean;
  showReadReceipts: boolean;
  showTypingIndicator: boolean;
  allowScreenshots: boolean;
  hideFromSearch: boolean;
}

interface NotificationSettings {
  messages: boolean;
  stories: boolean;
  friendRequests: boolean;
  mentions: boolean;
  groupInvites: boolean;
  streakReminders: boolean;
  spotlight: boolean;
  sound: boolean;
  vibrate: boolean;
  preview: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

interface ThemeOption {
  id: string;
  name: string;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  preview: string;
}

interface BlockedUser {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  blockedAt: string;
}

interface SettingsPageProps {
  userId?: string;
}

const THEMES: ThemeOption[] = [
  {
    id: 'light',
    name: 'Light',
    primaryColor: '#FFFC00',
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
    preview: 'light',
  },
  {
    id: 'dark',
    name: 'Dark',
    primaryColor: '#FFFC00',
    backgroundColor: '#1C1C1E',
    textColor: '#FFFFFF',
    preview: 'dark',
  },
  {
    id: 'oled',
    name: 'OLED Black',
    primaryColor: '#FFFC00',
    backgroundColor: '#000000',
    textColor: '#FFFFFF',
    preview: 'oled',
  },
  {
    id: 'midnight',
    name: 'Midnight Blue',
    primaryColor: '#5B7FFF',
    backgroundColor: '#0D1B2A',
    textColor: '#E0E1DD',
    preview: 'midnight',
  },
  {
    id: 'forest',
    name: 'Forest',
    primaryColor: '#4CAF50',
    backgroundColor: '#1B2D1B',
    textColor: '#E8F5E9',
    preview: 'forest',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    primaryColor: '#FF6B35',
    backgroundColor: '#2D1B00',
    textColor: '#FFE0B2',
    preview: 'sunset',
  },
];

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ar', name: 'Arabic' },
  { code: 'pt', name: 'Portuguese' },
];

const SECTIONS = ['privacy', 'notifications', 'theme', 'blocked', 'data', 'account'] as const;

const selectClassName = 'quant-field min-h-[44px] px-3 py-2 text-base';
const checkboxClassName = 'h-5 w-5 shrink-0 accent-emerald-500';

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-4 py-1 text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={checkboxClassName}
      />
    </label>
  );
}

function SelectRow({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-3 py-1">
      <label className="text-sm">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectClassName}
      >
        {children}
      </select>
    </div>
  );
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ userId }) => {
  void userId;
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(true);
  const [unauthorized, setUnauthorized] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('privacy');
  const [privacy, setPrivacy] = useState<PrivacySettings>({
    whoCanMessage: 'friends',
    whoCanSeeStory: 'friends',
    whoCanSeeLocation: 'friends',
    showOnlineStatus: true,
    showReadReceipts: true,
    showTypingIndicator: true,
    allowScreenshots: false,
    hideFromSearch: false,
  });
  const [notifications, setNotifications] = useState<NotificationSettings>({
    messages: true,
    stories: true,
    friendRequests: true,
    mentions: true,
    groupInvites: true,
    streakReminders: true,
    spotlight: true,
    sound: true,
    vibrate: true,
    preview: true,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
  });
  const [selectedTheme, setSelectedTheme] = useState<string>('dark');
  const [language, setLanguage] = useState<string>('en');
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setUnauthorized(false);
    try {
      const response = await apiFetchRaw('/api/settings', {
        headers: { ...getAuthHeaders() },
      });
      if (response.status === 401) {
        // Session missing/expired: show a sign-in prompt, NOT the settings
        // UI pre-filled with defaults (that is how this page exposed its
        // full controls logged-out).
        setUnauthorized(true);
        return;
      }
      if (!response.ok) throw new Error('Failed to load settings');
      const payload = await response.json();
      // Backend wraps in { success, data } — accept both enveloped and bare shapes.
      const data = (payload && typeof payload === 'object' && 'data' in payload
        ? (payload as { data: Record<string, unknown> }).data
        : payload) as {
        privacy?: PrivacySettings;
        notifications?: NotificationSettings;
        theme?: string;
        language?: string;
        blockedUsers?: BlockedUser[];
      };
      if (data.privacy) setPrivacy(data.privacy);
      if (data.notifications) setNotifications(data.notifications);
      if (data.theme) setSelectedTheme(data.theme);
      if (data.language) setLanguage(data.language);
      if (data.blockedUsers) setBlockedUsers(data.blockedUsers);
    } catch (err) {
      setLoadError(sanitizeErrorMessage(err) || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSaveSettings = useCallback(async () => {
    setSaving(true);
    setSaveMessage(null);
    setError(null);
    try {
      const response = await apiFetchRaw('/api/settings', {
        method: 'PUT',
        headers: {
          ...getAuthHeadersWithContent(),
        },
        body: JSON.stringify({ privacy, notifications, theme: selectedTheme, language }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          (data as { error?: { message?: string } } | null)?.error?.message ||
            `Save failed (${response.status})`,
        );
      }
      setSaveMessage('Saved ✓');
    } catch (err) {
      setError(sanitizeErrorMessage(err) || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [privacy, notifications, selectedTheme, language]);

  const handleUnblock = useCallback(async (userId: string) => {
    try {
      await apiFetchRaw(`/api/settings/blocked/${userId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() },
      });
      setBlockedUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err) {
      logger.error('Unblock failed:', err);
    }
  }, []);

  const handleExportData = useCallback(async () => {
    setExporting(true);
    setExportProgress(0);
    try {
      const interval = setInterval(() => {
        setExportProgress((p) => Math.min(p + 10, 90));
      }, 500);
      const response = await apiFetchRaw('/api/settings/export', {
        method: 'POST',
        headers: { ...getAuthHeaders() },
      });
      clearInterval(interval);
      if (response.ok) {
        setExportProgress(100);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'quantchat-data.zip';
        a.click();
      }
    } catch (err) {
      logger.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    if (deleteConfirmText !== 'DELETE') return;
    try {
      await apiFetchRaw('/api/settings/account', {
        method: 'DELETE',
        headers: { ...getAuthHeaders() },
      });
      // QC-F-041: the account is gone — the client must stop presenting a
      // logged-in session. Expire the session cookies + clear every local
      // token trace (the same signOut the Sign Out button uses), then hard-
      // navigate to /login. The server gate rejects the old tokens anyway;
      // this keeps the UI honest about it.
      await signOut();
      window.location.href = '/login';
    } catch (err) {
      setError(sanitizeErrorMessage(err) || 'Delete failed');
    }
  }, [deleteConfirmText]);

  const pageShell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <Head>
        <title>Settings — QuantChat</title>
      </Head>
      {children}
    </div>
  );

  if (loading)
    return pageShell(
      <div className="flex items-center justify-center py-24" role="status">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--quant-border)] border-t-emerald-500" />
        <span className="sr-only">Loading settings…</span>
      </div>,
    );

  if (unauthorized)
    return pageShell(
      <div className="flex flex-col items-center gap-2 px-8 py-24 text-center">
        <span className="text-4xl" aria-hidden="true">
          🔒
        </span>
        <h1 className="text-lg font-semibold">Sign in to view settings</h1>
        <p className="max-w-sm text-sm text-[var(--quant-muted-foreground)]">
          Your settings are tied to your Quant Account. Sign in to view or change them.
        </p>
        <button
          type="button"
          onClick={() => void router.push('/login')}
          className="mt-2 min-h-[44px] rounded-full bg-emerald-500 px-5 text-sm font-semibold text-white hover:bg-emerald-600"
        >
          Sign in
        </button>
      </div>,
    );

  if (loadError)
    return pageShell(
      <div className="mx-auto max-w-md px-4 py-24">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-center">
          <h1 className="text-base font-semibold text-red-500">Couldn&apos;t load settings</h1>
          <p className="mt-1 text-sm text-red-500">{loadError}</p>
          <button
            type="button"
            onClick={() => void fetchSettings()}
            className="mt-3 min-h-[44px] rounded-full bg-[var(--quant-muted)] px-4 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>,
    );

  return pageShell(
    <>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--quant-border)] bg-[var(--quant-surface)] px-4 py-3">
        <button
          type="button"
          onClick={() => void router.push('/')}
          aria-label="Back to chats"
          className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-muted)]"
        >
          ←
        </button>
        <h1 className="flex-1 text-lg font-semibold">Settings</h1>
        {saveMessage && (
          <span className="text-sm font-medium text-emerald-500" role="status">
            {saveMessage}
          </span>
        )}
        <button
          type="button"
          onClick={() => void handleSaveSettings()}
          disabled={saving}
          className="quant-btn quant-btn-primary min-h-[44px] rounded-full px-5 text-sm disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </header>

      <nav className="flex gap-2 overflow-x-auto px-4 py-3" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setActiveSection(s)}
            aria-pressed={activeSection === s}
            className={`min-h-[44px] shrink-0 rounded-full px-4 text-sm font-medium capitalize transition-colors ${
              activeSection === s
                ? 'bg-emerald-500 text-white'
                : 'bg-[var(--quant-muted)] text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-border)]'
            }`}
          >
            {s}
          </button>
        ))}
      </nav>

      {error && (
        <div
          role="alert"
          className="mx-4 mb-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500"
        >
          {error}
        </div>
      )}

      <main className="mx-auto w-full max-w-3xl px-4 pb-10">
        {activeSection === 'privacy' && (
          <section className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-4">
            <h2 className="mb-2 text-base font-semibold">Privacy</h2>
            <SelectRow
              label="Who can message me"
              value={privacy.whoCanMessage}
              onChange={(v) =>
                setPrivacy((p) => ({ ...p, whoCanMessage: v as PrivacySettings['whoCanMessage'] }))
              }
            >
              <option value="everyone">Everyone</option>
              <option value="friends">Friends Only</option>
              <option value="nobody">Nobody</option>
            </SelectRow>
            <SelectRow
              label="Who can see my story"
              value={privacy.whoCanSeeStory}
              onChange={(v) =>
                setPrivacy((p) => ({ ...p, whoCanSeeStory: v as PrivacySettings['whoCanSeeStory'] }))
              }
            >
              <option value="everyone">Everyone</option>
              <option value="friends">Friends Only</option>
              <option value="custom">Custom</option>
            </SelectRow>
            <SelectRow
              label="Who can see my location"
              value={privacy.whoCanSeeLocation}
              onChange={(v) =>
                setPrivacy((p) => ({
                  ...p,
                  whoCanSeeLocation: v as PrivacySettings['whoCanSeeLocation'],
                }))
              }
            >
              <option value="friends">Friends</option>
              <option value="nobody">Nobody</option>
              <option value="ghost">Ghost Mode</option>
            </SelectRow>
            <ToggleRow
              label="Show online status"
              checked={privacy.showOnlineStatus}
              onChange={(c) => setPrivacy((p) => ({ ...p, showOnlineStatus: c }))}
            />
            <ToggleRow
              label="Show read receipts"
              checked={privacy.showReadReceipts}
              onChange={(c) => setPrivacy((p) => ({ ...p, showReadReceipts: c }))}
            />
            <ToggleRow
              label="Show typing indicator"
              checked={privacy.showTypingIndicator}
              onChange={(c) => setPrivacy((p) => ({ ...p, showTypingIndicator: c }))}
            />
            <ToggleRow
              label="Allow screenshots in chat"
              checked={privacy.allowScreenshots}
              onChange={(c) => setPrivacy((p) => ({ ...p, allowScreenshots: c }))}
            />
            <ToggleRow
              label="Hide profile from search"
              checked={privacy.hideFromSearch}
              onChange={(c) => setPrivacy((p) => ({ ...p, hideFromSearch: c }))}
            />
          </section>
        )}

        {activeSection === 'notifications' && (
          <section className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-4">
            <h2 className="mb-2 text-base font-semibold">Notifications</h2>
            <ToggleRow
              label="Messages"
              checked={notifications.messages}
              onChange={(c) => setNotifications((p) => ({ ...p, messages: c }))}
            />
            <ToggleRow
              label="Stories"
              checked={notifications.stories}
              onChange={(c) => setNotifications((p) => ({ ...p, stories: c }))}
            />
            <ToggleRow
              label="Friend requests"
              checked={notifications.friendRequests}
              onChange={(c) => setNotifications((p) => ({ ...p, friendRequests: c }))}
            />
            <ToggleRow
              label="Mentions"
              checked={notifications.mentions}
              onChange={(c) => setNotifications((p) => ({ ...p, mentions: c }))}
            />
            <ToggleRow
              label="Streak reminders"
              checked={notifications.streakReminders}
              onChange={(c) => setNotifications((p) => ({ ...p, streakReminders: c }))}
            />
            <ToggleRow
              label="Sound"
              checked={notifications.sound}
              onChange={(c) => setNotifications((p) => ({ ...p, sound: c }))}
            />
            <ToggleRow
              label="Vibrate"
              checked={notifications.vibrate}
              onChange={(c) => setNotifications((p) => ({ ...p, vibrate: c }))}
            />
            <ToggleRow
              label="Quiet hours"
              checked={notifications.quietHoursEnabled}
              onChange={(c) => setNotifications((p) => ({ ...p, quietHoursEnabled: c }))}
            />
            {notifications.quietHoursEnabled && (
              <div className="flex items-center gap-3 py-2">
                <input
                  type="time"
                  value={notifications.quietHoursStart}
                  onChange={(e) =>
                    setNotifications((p) => ({ ...p, quietHoursStart: e.target.value }))
                  }
                  className={`${selectClassName}`}
                  aria-label="Quiet hours start"
                />
                <span className="text-sm text-[var(--quant-muted-foreground)]">to</span>
                <input
                  type="time"
                  value={notifications.quietHoursEnd}
                  onChange={(e) =>
                    setNotifications((p) => ({ ...p, quietHoursEnd: e.target.value }))
                  }
                  className={`${selectClassName}`}
                  aria-label="Quiet hours end"
                />
              </div>
            )}
          </section>
        )}

        {activeSection === 'theme' && (
          <section className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-4">
            <h2 className="mb-3 text-base font-semibold">Appearance</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setSelectedTheme(theme.id)}
                  aria-pressed={selectedTheme === theme.id}
                  className="flex min-h-[44px] flex-col items-start gap-2 rounded-xl border-2 p-3 text-left"
                  style={{
                    backgroundColor: theme.backgroundColor,
                    color: theme.textColor,
                    borderColor: selectedTheme === theme.id ? theme.primaryColor : 'transparent',
                  }}
                >
                  <span
                    className="h-4 w-10 rounded-full"
                    style={{ backgroundColor: theme.primaryColor }}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium">{theme.name}</span>
                </button>
              ))}
            </div>
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold">Language</h3>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className={selectClassName}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        {activeSection === 'blocked' && (
          <section className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-4">
            <h2 className="mb-2 text-base font-semibold">Blocked Users ({blockedUsers.length})</h2>
            {blockedUsers.length === 0 ? (
              <p className="py-4 text-center text-sm text-[var(--quant-muted-foreground)]">
                No blocked users.
              </p>
            ) : (
              <div className="divide-y divide-[var(--quant-border)]">
                {blockedUsers.map((user) => (
                  <div key={user.id} className="flex items-center gap-3 py-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--quant-muted)] font-semibold">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span>{user.name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{user.name}</div>
                      <div className="truncate text-xs text-[var(--quant-muted-foreground)]">
                        @{user.username}
                      </div>
                      <div className="text-xs text-[var(--quant-muted-foreground)]">
                        Blocked {new Date(user.blockedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleUnblock(user.id)}
                      className="quant-btn quant-btn-secondary min-h-[44px] shrink-0 rounded-full px-4 text-sm"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeSection === 'data' && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-4">
              <h3 className="text-sm font-semibold">Export Data</h3>
              <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">
                Download all your messages, snaps, memories, and account info.
              </p>
              <button
                type="button"
                onClick={() => void handleExportData()}
                disabled={exporting}
                className="quant-btn quant-btn-secondary mt-3 min-h-[44px] rounded-full px-4 text-sm disabled:opacity-50"
              >
                {exporting ? `Exporting... ${exportProgress}%` : 'Export All Data'}
              </button>
              {exporting && (
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--quant-muted)]">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-4">
              <h3 className="text-sm font-semibold">Cache</h3>
              <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">
                Clear local cache to free up device storage.
              </p>
              <button
                type="button"
                className="quant-btn quant-btn-secondary mt-3 min-h-[44px] rounded-full px-4 text-sm"
              >
                Clear Cache
              </button>
            </div>
          </section>
        )}

        {activeSection === 'account' && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-4">
              <h2 className="mb-2 text-base font-semibold">Account</h2>
              <h3 className="text-sm font-semibold">Sign Out</h3>
              <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">
                Sign out of QuantChat on this device. Your Quant account stays active.
              </p>
              <button
                type="button"
                onClick={async () => {
                  // Full sign-out: expire the HttpOnly session cookies
                  // server-side + clear every local token trace, then hard-
                  // navigate so no in-memory state can resurrect the session.
                  await signOut();
                  window.location.href = '/login';
                }}
                className="quant-btn quant-btn-secondary mt-3 min-h-[44px] rounded-full px-4 text-sm"
              >
                Sign Out
              </button>
            </div>
            <section className="rounded-2xl border border-red-500/30 bg-[var(--quant-surface)] p-4">
              <h3 className="text-sm font-semibold text-red-500">Delete Account</h3>
              <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">
                This action is permanent and cannot be undone. All your data will be deleted.
              </p>
              {showDeleteConfirm ? (
                <div className="mt-3 space-y-3">
                  <label className="block text-sm" htmlFor="delete-confirm-input">
                    Type DELETE to confirm:
                  </label>
                  <input
                    id="delete-confirm-input"
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className={`${selectClassName} w-full`}
                  />
                  <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleDeleteAccount()}
                    disabled={deleteConfirmText !== 'DELETE'}
                    className="min-h-[44px] rounded-full bg-red-500 px-4 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                  >
                    Permanently Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="quant-btn quant-btn-secondary min-h-[44px] rounded-full px-4 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="mt-3 min-h-[44px] rounded-full bg-red-500 px-4 text-sm font-semibold text-white hover:bg-red-600"
              >
                Delete My Account
              </button>
              )}
            </section>
          </section>
        )}
      </main>
    </>,
  );
};

export default SettingsPage;
