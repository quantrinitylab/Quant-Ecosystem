// ============================================================================
// QuantChat - Settings Page
// Privacy, notifications, theme, blocked users, data export, account deletion
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '@quant/common';
import { getAuthHeaders, getAuthHeadersWithContent } from '../lib/auth';

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

export const SettingsPage: React.FC<SettingsPageProps> = ({ userId }) => {
  const [loading, setLoading] = useState<boolean>(true);
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/settings', {
        headers: { ...getAuthHeaders() },
      });
      if (!response.ok) throw new Error('Failed to load settings');
      const data = await response.json();
      if (data.privacy) setPrivacy(data.privacy);
      if (data.notifications) setNotifications(data.notifications);
      if (data.theme) setSelectedTheme(data.theme);
      if (data.language) setLanguage(data.language);
      if (data.blockedUsers) setBlockedUsers(data.blockedUsers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSaveSettings = useCallback(async () => {
    setSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          ...getAuthHeadersWithContent(),
        },
        body: JSON.stringify({ privacy, notifications, theme: selectedTheme, language }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [privacy, notifications, selectedTheme, language]);

  const handleUnblock = useCallback(async (userId: string) => {
    try {
      await fetch(`/api/settings/blocked/${userId}`, {
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
      const response = await fetch('/api/settings/export', {
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
      await fetch('/api/settings/account', {
        method: 'DELETE',
        headers: { ...getAuthHeaders() },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }, [deleteConfirmText]);

  if (loading)
    return (
      <div className="settings-loading">
        <div className="spinner">Loading settings...</div>
      </div>
    );
  if (error && !privacy)
    return (
      <div className="settings-error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={fetchSettings}>Retry</button>
      </div>
    );

  return (
    <div className="settings-page">
      <header className="settings-header">
        <h1>Settings</h1>
        <button onClick={handleSaveSettings} disabled={saving} className="save-btn">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </header>
      <nav className="settings-nav">
        {['privacy', 'notifications', 'theme', 'blocked', 'data', 'account'].map((s) => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            className={activeSection === s ? 'active' : ''}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </nav>
      <main className="settings-content">
        {activeSection === 'privacy' && (
          <div className="privacy-section">
            <h2>Privacy</h2>
            <div className="setting-group">
              <label>Who can message me</label>
              <select
                value={privacy.whoCanMessage}
                onChange={(e) =>
                  setPrivacy((p) => ({
                    ...p,
                    whoCanMessage: e.target.value as PrivacySettings['whoCanMessage'],
                  }))
                }
              >
                <option value="everyone">Everyone</option>
                <option value="friends">Friends Only</option>
                <option value="nobody">Nobody</option>
              </select>
            </div>
            <div className="setting-group">
              <label>Who can see my story</label>
              <select
                value={privacy.whoCanSeeStory}
                onChange={(e) =>
                  setPrivacy((p) => ({
                    ...p,
                    whoCanSeeStory: e.target.value as PrivacySettings['whoCanSeeStory'],
                  }))
                }
              >
                <option value="everyone">Everyone</option>
                <option value="friends">Friends Only</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="setting-group">
              <label>Who can see my location</label>
              <select
                value={privacy.whoCanSeeLocation}
                onChange={(e) =>
                  setPrivacy((p) => ({
                    ...p,
                    whoCanSeeLocation: e.target.value as PrivacySettings['whoCanSeeLocation'],
                  }))
                }
              >
                <option value="friends">Friends</option>
                <option value="nobody">Nobody</option>
                <option value="ghost">Ghost Mode</option>
              </select>
            </div>
            <div className="setting-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={privacy.showOnlineStatus}
                  onChange={(e) =>
                    setPrivacy((p) => ({ ...p, showOnlineStatus: e.target.checked }))
                  }
                />{' '}
                Show online status
              </label>
            </div>
            <div className="setting-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={privacy.showReadReceipts}
                  onChange={(e) =>
                    setPrivacy((p) => ({ ...p, showReadReceipts: e.target.checked }))
                  }
                />{' '}
                Show read receipts
              </label>
            </div>
            <div className="setting-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={privacy.showTypingIndicator}
                  onChange={(e) =>
                    setPrivacy((p) => ({ ...p, showTypingIndicator: e.target.checked }))
                  }
                />{' '}
                Show typing indicator
              </label>
            </div>
            <div className="setting-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={privacy.allowScreenshots}
                  onChange={(e) =>
                    setPrivacy((p) => ({ ...p, allowScreenshots: e.target.checked }))
                  }
                />{' '}
                Allow screenshots in chat
              </label>
            </div>
            <div className="setting-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={privacy.hideFromSearch}
                  onChange={(e) => setPrivacy((p) => ({ ...p, hideFromSearch: e.target.checked }))}
                />{' '}
                Hide profile from search
              </label>
            </div>
          </div>
        )}
        {activeSection === 'notifications' && (
          <div className="notifications-section">
            <h2>Notifications</h2>
            <div className="setting-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={notifications.messages}
                  onChange={(e) => setNotifications((p) => ({ ...p, messages: e.target.checked }))}
                />{' '}
                Messages
              </label>
            </div>
            <div className="setting-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={notifications.stories}
                  onChange={(e) => setNotifications((p) => ({ ...p, stories: e.target.checked }))}
                />{' '}
                Stories
              </label>
            </div>
            <div className="setting-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={notifications.friendRequests}
                  onChange={(e) =>
                    setNotifications((p) => ({ ...p, friendRequests: e.target.checked }))
                  }
                />{' '}
                Friend requests
              </label>
            </div>
            <div className="setting-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={notifications.mentions}
                  onChange={(e) => setNotifications((p) => ({ ...p, mentions: e.target.checked }))}
                />{' '}
                Mentions
              </label>
            </div>
            <div className="setting-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={notifications.streakReminders}
                  onChange={(e) =>
                    setNotifications((p) => ({ ...p, streakReminders: e.target.checked }))
                  }
                />{' '}
                Streak reminders
              </label>
            </div>
            <div className="setting-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={notifications.sound}
                  onChange={(e) => setNotifications((p) => ({ ...p, sound: e.target.checked }))}
                />{' '}
                Sound
              </label>
            </div>
            <div className="setting-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={notifications.vibrate}
                  onChange={(e) => setNotifications((p) => ({ ...p, vibrate: e.target.checked }))}
                />{' '}
                Vibrate
              </label>
            </div>
            <div className="setting-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={notifications.quietHoursEnabled}
                  onChange={(e) =>
                    setNotifications((p) => ({ ...p, quietHoursEnabled: e.target.checked }))
                  }
                />{' '}
                Quiet hours
              </label>
            </div>
            {notifications.quietHoursEnabled && (
              <div className="quiet-hours">
                <input
                  type="time"
                  value={notifications.quietHoursStart}
                  onChange={(e) =>
                    setNotifications((p) => ({ ...p, quietHoursStart: e.target.value }))
                  }
                />
                <span>to</span>
                <input
                  type="time"
                  value={notifications.quietHoursEnd}
                  onChange={(e) =>
                    setNotifications((p) => ({ ...p, quietHoursEnd: e.target.value }))
                  }
                />
              </div>
            )}
          </div>
        )}
        {activeSection === 'theme' && (
          <div className="theme-section">
            <h2>Appearance</h2>
            <div className="theme-grid">
              {THEMES.map((theme) => (
                <div
                  key={theme.id}
                  className={`theme-card ${selectedTheme === theme.id ? 'selected' : ''}`}
                  onClick={() => setSelectedTheme(theme.id)}
                  style={{
                    backgroundColor: theme.backgroundColor,
                    color: theme.textColor,
                    borderColor: selectedTheme === theme.id ? theme.primaryColor : 'transparent',
                  }}
                >
                  <div
                    className="theme-preview"
                    style={{ backgroundColor: theme.primaryColor }}
                  ></div>
                  <span className="theme-name">{theme.name}</span>
                </div>
              ))}
            </div>
            <div className="language-setting">
              <h3>Language</h3>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {activeSection === 'blocked' && (
          <div className="blocked-section">
            <h2>Blocked Users ({blockedUsers.length})</h2>
            {blockedUsers.length === 0 ? (
              <div className="empty-state">
                <p>No blocked users.</p>
              </div>
            ) : (
              <div className="blocked-list">
                {blockedUsers.map((user) => (
                  <div key={user.id} className="blocked-item">
                    <div className="blocked-avatar">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt="" />
                      ) : (
                        <span>{user.name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="blocked-info">
                      <span className="blocked-name">{user.name}</span>
                      <span className="blocked-username">@{user.username}</span>
                      <span className="blocked-date">
                        Blocked {new Date(user.blockedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <button onClick={() => handleUnblock(user.id)} className="unblock-btn">
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {activeSection === 'data' && (
          <div className="data-section">
            <h2>Your Data</h2>
            <div className="data-card">
              <h3>Export Data</h3>
              <p>Download all your messages, snaps, memories, and account info.</p>
              <button onClick={handleExportData} disabled={exporting}>
                {exporting ? `Exporting... ${exportProgress}%` : 'Export All Data'}
              </button>
              {exporting && (
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${exportProgress}%` }}></div>
                </div>
              )}
            </div>
            <div className="data-card">
              <h3>Cache</h3>
              <p>Clear local cache to free up device storage.</p>
              <button>Clear Cache</button>
            </div>
          </div>
        )}
        {activeSection === 'account' && (
          <div className="account-section">
            <h2>Account</h2>
            <div className="danger-zone">
              <h3>Delete Account</h3>
              <p>This action is permanent and cannot be undone. All your data will be deleted.</p>
              {showDeleteConfirm ? (
                <div className="delete-confirm">
                  <p>Type DELETE to confirm:</p>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                  />
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirmText !== 'DELETE'}
                    className="delete-btn"
                  >
                    Permanently Delete
                  </button>
                  <button onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => setShowDeleteConfirm(true)} className="delete-btn">
                  Delete My Account
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default SettingsPage;
