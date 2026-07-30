'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button, Input, FormField, TextArea } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { useCreateLabel, useLabels } from '../../hooks/useLabels';
import { apiClient } from '../../services/api-client';
import type { EmailLabel } from '../../types';

// ---------------------------------------------------------------------------
// Settings Tabs — GitHub/Gmail-quality tabbed navigation
// ---------------------------------------------------------------------------
type SettingsTab = 'general' | 'notifications' | 'appearance' | 'labels' | 'keyboard';

const TABS: { key: SettingsTab; label: string; icon: string }[] = [
  { key: 'general', label: 'General', icon: '⚙' },
  { key: 'notifications', label: 'Notifications', icon: '🔔' },
  { key: 'appearance', label: 'Appearance', icon: '🎨' },
  { key: 'labels', label: 'Labels', icon: '🏷' },
  { key: 'keyboard', label: 'Keyboard shortcuts', icon: '⌨' },
];

const PRESET_LABEL_COLORS = [
  '#ef4444',
  '#ff9933',
  '#eab308',
  '#138808',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#ec4899',
  '#6b7280',
  '#14b8a6',
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [profile, setProfile] = useState({ displayName: '', email: '', username: '' });
  const [loadedProfile, setLoadedProfile] = useState({ displayName: '', email: '', username: '' });
  const [emailPrefs, setEmailPrefs] = useState({
    signature: '',
    autoReply: false,
    undoSendDelay: 5,
    defaultReplyBehavior: 'reply' as 'reply' | 'reply-all',
    conversationView: true,
    readReceipts: false,
  });
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    desktop: false,
    sound: true,
    mentionsOnly: false,
  });
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'unavailable'>('idle');
  const [showCreateLabelForm, setShowCreateLabelForm] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(PRESET_LABEL_COLORS[1]);

  const { data: labels = [], isLoading: labelsLoading, isError: labelsError } = useLabels();
  const createLabel = useCreateLabel();
  const hasProfileChanges = profile.displayName.trim() !== loadedProfile.displayName;

  useEffect(() => {
    try {
      const saved = (localStorage.getItem('quant-theme') as 'light' | 'dark' | 'system') || 'dark';
      setTheme(saved);
      const savedDensity =
        (localStorage.getItem('quant-density') as 'comfortable' | 'compact') || 'comfortable';
      setDensity(savedDensity);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      const response = await apiClient.getUserInfo();
      if (response.success && response.data) {
        const nextProfile = {
          displayName: response.data.displayName || '',
          email: response.data.email || '',
          username: (response.data as any).username || '',
        };
        setProfile(nextProfile);
        setLoadedProfile(nextProfile);
      }
    };
    loadProfile();
  }, []);

  useEffect(() => {
    if (!hasProfileChanges && saveStatus !== 'idle') {
      setSaveStatus('idle');
    }
  }, [hasProfileChanges, saveStatus]);

  const handleSaveProfile = useCallback(async () => {
    if (!hasProfileChanges) return;
    setSaveStatus('unavailable');
  }, [hasProfileChanges]);

  const handleCreateLabel = useCallback(async () => {
    const name = newLabelName.trim();
    if (!name) return;

    try {
      await createLabel.mutateAsync({ name, color: newLabelColor });
      setNewLabelName('');
      setNewLabelColor(PRESET_LABEL_COLORS[1]);
      setShowCreateLabelForm(false);
    } catch {
      // The mutation state renders the failure message inline.
    }
  }, [createLabel, newLabelColor, newLabelName]);

  const handleThemeChange = useCallback((newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    if (typeof document === 'undefined') return;
    try {
      localStorage.setItem('quant-theme', newTheme);
    } catch {
      /* ignore */
    }
    const isDark =
      newTheme === 'dark' ||
      (newTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  const handleDensityChange = useCallback((d: 'comfortable' | 'compact') => {
    setDensity(d);
    try {
      localStorage.setItem('quant-density', d);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page settings-workspace flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-6 pt-6 pb-0">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--quant-foreground)]">
            Settings
          </h1>
          <p className="text-sm text-[var(--quant-muted-foreground)] mt-0.5">
            Manage your account, preferences and integrations.
          </p>
        </div>

        {/* Tab navigation */}
        <nav className="shrink-0 flex items-center gap-1 px-6 mt-4 border-b border-[var(--quant-border)] overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                relative px-3 py-2.5 text-sm font-medium rounded-t-md transition-colors whitespace-nowrap
                ${
                  activeTab === tab.key
                    ? 'text-[var(--quant-foreground)] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[var(--brand-primary)] after:rounded-t'
                    : 'text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] hover:bg-[var(--quant-muted)]'
                }
              `}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {activeTab === 'general' && (
            <div className="max-w-2xl space-y-8">
              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Profile
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  Your public display information.
                </p>
                <div className="space-y-4 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--brand-primary)] to-[var(--quant-secondary)] flex items-center justify-center text-white text-xl font-bold">
                      {profile.displayName?.charAt(0)?.toUpperCase() || 'Q'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--quant-foreground)]">
                        Profile photo
                      </p>
                      <p className="text-xs text-[var(--quant-muted-foreground)]">
                        JPG, PNG or GIF. Max 2MB.
                      </p>
                      <button
                        type="button"
                        disabled
                        className="mt-1 cursor-not-allowed text-xs font-medium text-[var(--quant-muted-foreground)] opacity-70"
                      >
                        Photo uploads unavailable
                      </button>
                      <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
                        Profile photo uploads aren&apos;t connected in QuantMail yet.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField label="Display name">
                      <Input
                        value={profile.displayName}
                        onChange={(e) =>
                          setProfile((prev) => ({ ...prev, displayName: e.target.value }))
                        }
                        placeholder="Your name"
                      />
                    </FormField>
                    <FormField label="Username">
                      <Input value={profile.username} readOnly disabled />
                    </FormField>
                  </div>
                  <FormField label="Email address">
                    <Input value={profile.email} readOnly disabled />
                  </FormField>
                  <div className="flex items-center gap-3 pt-2">
                    <Button variant="primary" onClick={handleSaveProfile} disabled={!hasProfileChanges}>
                      {hasProfileChanges ? 'Save changes' : 'No changes to save'}
                    </Button>
                    {saveStatus === 'unavailable' ? (
                      <span className="text-xs text-[var(--quant-muted-foreground)]">
                        Profile updates aren&apos;t connected yet, so your display name can&apos;t be saved from QuantMail right now.
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--quant-muted-foreground)]">
                        Email and username come from your account identity.
                      </span>
                    )}
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Email preferences
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  Control how you send and receive emails.
                </p>
                <div className="space-y-4 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  <FormField label="Email signature">
                    <TextArea
                      value={emailPrefs.signature}
                      onChange={(e) =>
                        setEmailPrefs((prev) => ({ ...prev, signature: e.target.value }))
                      }
                      placeholder="Your email signature..."
                      rows={3}
                    />
                  </FormField>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField label="Undo send delay">
                      <select
                        className="w-full h-9 px-3 rounded-md border border-[var(--quant-border)] bg-[var(--quant-background)] text-sm text-[var(--quant-foreground)]"
                        value={emailPrefs.undoSendDelay}
                        onChange={(e) =>
                          setEmailPrefs((prev) => ({
                            ...prev,
                            undoSendDelay: Number(e.target.value),
                          }))
                        }
                      >
                        <option value={5}>5 seconds</option>
                        <option value={10}>10 seconds</option>
                        <option value={20}>20 seconds</option>
                        <option value={30}>30 seconds</option>
                      </select>
                    </FormField>
                    <FormField label="Default reply behavior">
                      <select
                        className="w-full h-9 px-3 rounded-md border border-[var(--quant-border)] bg-[var(--quant-background)] text-sm text-[var(--quant-foreground)]"
                        value={emailPrefs.defaultReplyBehavior}
                        onChange={(e) =>
                          setEmailPrefs((prev) => ({
                            ...prev,
                            defaultReplyBehavior: e.target.value as 'reply' | 'reply-all',
                          }))
                        }
                      >
                        <option value="reply">Reply</option>
                        <option value="reply-all">Reply all</option>
                      </select>
                    </FormField>
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={emailPrefs.conversationView}
                      onChange={(e) =>
                        setEmailPrefs((prev) => ({
                          ...prev,
                          conversationView: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded border-[var(--quant-border)] accent-[var(--brand-primary)]"
                    />
                    <div>
                      <span className="text-sm text-[var(--quant-foreground)]">
                        Conversation view
                      </span>
                      <p className="text-xs text-[var(--quant-muted-foreground)]">
                        Group related emails together in threads.
                      </p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={emailPrefs.readReceipts}
                      onChange={(e) =>
                        setEmailPrefs((prev) => ({ ...prev, readReceipts: e.target.checked }))
                      }
                      className="w-4 h-4 rounded border-[var(--quant-border)] accent-[var(--brand-primary)]"
                    />
                    <div>
                      <span className="text-sm text-[var(--quant-foreground)]">Read receipts</span>
                      <p className="text-xs text-[var(--quant-muted-foreground)]">
                        Let senders know when you&apos;ve read their email.
                      </p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={emailPrefs.autoReply}
                      onChange={(e) =>
                        setEmailPrefs((prev) => ({ ...prev, autoReply: e.target.checked }))
                      }
                      className="w-4 h-4 rounded border-[var(--quant-border)] accent-[var(--brand-primary)]"
                    />
                    <div>
                      <span className="text-sm text-[var(--quant-foreground)]">
                        Vacation auto-reply
                      </span>
                      <p className="text-xs text-[var(--quant-muted-foreground)]">
                        Automatically respond to incoming messages while away.
                      </p>
                    </div>
                  </label>
                </div>
              </section>

              <section>
                <h2 className="text-base font-semibold text-[var(--quant-destructive)] mb-1">
                  Danger zone
                </h2>
                <div className="rounded-lg border border-[var(--quant-destructive)]/30 p-5 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-[var(--quant-foreground)]">
                        Delete account
                      </p>
                      <p className="text-xs text-[var(--quant-muted-foreground)]">
                        Account deletion isn&apos;t connected in QuantMail yet, so this control stays unavailable for now.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      disabled
                      className="cursor-not-allowed border-[var(--quant-destructive)]/30 text-[var(--quant-muted-foreground)] hover:bg-transparent"
                    >
                      Account deletion unavailable
                    </Button>
                  </div>
                  <p className="text-xs text-[var(--quant-muted-foreground)]">
                    This section will only become active after a verified deletion workflow is wired end to end.
                  </p>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="max-w-2xl space-y-6">
              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Notification channels
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  Choose how you want to be notified.
                </p>
                <div className="space-y-3 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  {[
                    {
                      key: 'email' as const,
                      label: 'Email notifications',
                      desc: 'Receive notifications via email',
                    },
                    {
                      key: 'push' as const,
                      label: 'Push notifications',
                      desc: 'Receive push notifications on mobile',
                    },
                    {
                      key: 'desktop' as const,
                      label: 'Desktop notifications',
                      desc: 'Show browser notifications',
                    },
                    {
                      key: 'sound' as const,
                      label: 'Sound alerts',
                      desc: 'Play a sound when a new notification arrives',
                    },
                    {
                      key: 'mentionsOnly' as const,
                      label: 'Mentions only',
                      desc: 'Only notify when you are directly mentioned',
                    },
                  ].map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center justify-between py-2 cursor-pointer"
                    >
                      <div>
                        <p className="text-sm font-medium text-[var(--quant-foreground)]">
                          {item.label}
                        </p>
                        <p className="text-xs text-[var(--quant-muted-foreground)]">{item.desc}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifications[item.key]}
                        onChange={(e) =>
                          setNotifications((prev) => ({ ...prev, [item.key]: e.target.checked }))
                        }
                        className="w-4 h-4 rounded accent-[var(--brand-primary)]"
                      />
                    </label>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="max-w-2xl space-y-6">
              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Theme
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  Customize how QuantMail looks.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {(['light', 'dark', 'system'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => handleThemeChange(t)}
                      className={`
                        relative flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all
                        ${
                          theme === t
                            ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5'
                            : 'border-[var(--quant-border)] hover:border-[var(--quant-muted-foreground)]'
                        }
                      `}
                    >
                      <div
                        className={`w-10 h-10 rounded-lg ${t === 'dark' ? 'bg-gray-800' : t === 'light' ? 'bg-white border border-gray-200' : 'bg-gradient-to-br from-white to-gray-800'}`}
                      />
                      <span className="text-sm font-medium text-[var(--quant-foreground)] capitalize">
                        {t}
                      </span>
                      {theme === t && (
                        <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--brand-primary)] text-white text-xs flex items-center justify-center">
                          ✓
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-1">
                  Density
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                  Adjust spacing in the interface.
                </p>
                <div className="flex gap-3">
                  {(['comfortable', 'compact'] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => handleDensityChange(d)}
                      className={`
                        px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all capitalize
                        ${
                          density === d
                            ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5 text-[var(--quant-foreground)]'
                            : 'border-[var(--quant-border)] text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]'
                        }
                      `}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'labels' && (
            <div className="max-w-2xl space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-[var(--quant-foreground)]">Labels</h2>
                  <p className="text-sm text-[var(--quant-muted-foreground)]">
                    Live labels sync here from your account.
                  </p>
                  <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
                    Visibility controls aren&apos;t connected yet, so this view focuses on real label data and creation.
                  </p>
                </div>
                <Button
                  variant="primary"
                  onClick={() => {
                    setShowCreateLabelForm((value) => !value);
                    if (showCreateLabelForm) {
                      setNewLabelName('');
                      setNewLabelColor(PRESET_LABEL_COLORS[1]);
                    }
                  }}
                >
                  {showCreateLabelForm ? 'Cancel' : '+ New label'}
                </Button>
              </div>

              {showCreateLabelForm && (
                <div className="space-y-4 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  <FormField label="Label name">
                    <Input
                      value={newLabelName}
                      onChange={(event) => setNewLabelName(event.target.value)}
                      placeholder="Enter a label name"
                    />
                  </FormField>
                  <div>
                    <p className="text-sm font-medium text-[var(--quant-foreground)]">Label color</p>
                    <div className="mt-3 flex flex-wrap gap-2" aria-label="Label color choices">
                      {PRESET_LABEL_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewLabelColor(color)}
                          aria-label={`Use color ${color}`}
                          aria-pressed={newLabelColor === color}
                          className={`h-7 w-7 rounded-full border-2 transition-transform ${
                            newLabelColor === color
                              ? 'scale-110 border-white'
                              : 'border-transparent hover:scale-105'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  {createLabel.isError && (
                    <p className="text-xs text-[var(--quant-destructive)]" role="alert">
                      Label could not be created right now.
                    </p>
                  )}
                  <div className="flex items-center gap-3">
                    <Button
                      variant="primary"
                      onClick={handleCreateLabel}
                      disabled={!newLabelName.trim() || createLabel.isPending}
                    >
                      {createLabel.isPending ? 'Creating…' : 'Create label'}
                    </Button>
                    <span className="text-xs text-[var(--quant-muted-foreground)]">
                      New labels are added to your live label list.
                    </span>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] divide-y divide-[var(--quant-border)]">
                {labelsLoading ? (
                  <div className="px-4 py-6 text-sm text-[var(--quant-muted-foreground)]">
                    Loading labels…
                  </div>
                ) : labelsError ? (
                  <div className="px-4 py-6 text-sm text-[var(--quant-muted-foreground)]">
                    Labels couldn&apos;t be loaded right now.
                  </div>
                ) : labels.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-[var(--quant-muted-foreground)]">
                    No labels have been created yet.
                  </div>
                ) : (
                  labels.map((label: EmailLabel) => (
                    <div key={label.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0 flex items-center gap-3">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: label.color || PRESET_LABEL_COLORS[1] }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-[var(--quant-foreground)]">
                              {label.name}
                            </span>
                            <span className="rounded-full border border-[var(--quant-border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--quant-muted-foreground)]">
                              {label.isSystem ? 'System' : 'Custom'}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--quant-muted-foreground)]">
                            {label.messageCount} messages · {label.unreadCount} unread
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-xs text-[var(--quant-muted-foreground)]">
                        <p>Visible in live mail</p>
                        <p>Settings controls unavailable</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'keyboard' && (
            <div className="max-w-2xl space-y-4">
              <h2 className="text-base font-semibold text-[var(--quant-foreground)]">
                Keyboard shortcuts
              </h2>
              <p className="text-sm text-[var(--quant-muted-foreground)] mb-4">
                Speed up your workflow with these shortcuts.
              </p>
              <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] divide-y divide-[var(--quant-border)]">
                {[
                  { keys: 'C', action: 'Compose new email' },
                  { keys: 'R', action: 'Reply' },
                  { keys: 'A', action: 'Reply all' },
                  { keys: 'F', action: 'Forward' },
                  { keys: 'E', action: 'Archive' },
                  { keys: '#', action: 'Delete / Move to trash' },
                  { keys: '/', action: 'Search' },
                  { keys: 'Ctrl+Enter', action: 'Send email' },
                  { keys: 'Ctrl+S', action: 'Save draft' },
                  { keys: 'J / K', action: 'Newer / older conversation' },
                  { keys: 'G then I', action: 'Go to Inbox' },
                  { keys: 'G then S', action: 'Go to Starred' },
                  { keys: '?', action: 'Show all shortcuts' },
                ].map((shortcut) => (
                  <div key={shortcut.keys} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-[var(--quant-foreground)]">
                      {shortcut.action}
                    </span>
                    <kbd className="px-2 py-1 text-xs font-mono rounded bg-[var(--quant-muted)] border border-[var(--quant-border)] text-[var(--quant-muted-foreground)]">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </PageTransition>
    </AppShell>
  );
}
