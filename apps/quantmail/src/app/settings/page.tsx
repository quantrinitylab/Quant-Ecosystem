'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, FormField, Input, TextArea } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { useCreateLabel, useLabels, useDeleteLabel } from '../../hooks/useLabels';
import { apiClient } from '../../services/api-client';
import type { EmailLabel } from '../../types';
import { VacationResponderSettings } from './VacationResponderSettings';
import { PhoneVerificationCard } from '../../components/PhoneVerificationCard';
import { showToast } from '../../components/InboxToast';

type SettingsTab = 'general' | 'notifications' | 'appearance' | 'labels' | 'security' | 'keyboard';
type Theme = 'light' | 'dark' | 'system' | 'midnight';
type Density = 'comfortable' | 'compact';

const TABS: Array<{ key: SettingsTab; label: string; icon: string }> = [
  { key: 'general', label: 'General', icon: '⚙' },
  { key: 'notifications', label: 'Notifications', icon: '🔔' },
  { key: 'appearance', label: 'Appearance', icon: '🎨' },
  { key: 'labels', label: 'Labels', icon: '🏷' },
  { key: 'security', label: 'Security & E2EE', icon: '🔐' },
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

const ACCENT_COLORS = [
  { name: 'Bharat Saffron', hex: '#ff9933' },
  { name: 'Quantum Blue', hex: '#3b82f6' },
  { name: 'Emerald Vault', hex: '#10b981' },
  { name: 'Nebula Purple', hex: '#8b5cf6' },
  { name: 'Rose Red', hex: '#f43f5e' },
];

const SHORTCUTS = [
  ['Ctrl/Cmd + K', 'Open command palette (global)'],
  ['Ctrl/Cmd + Enter', 'Send email (compose only)'],
  ['Ctrl/Cmd + S', 'Save draft (compose only)'],
  ['J / ↓', 'Next email in inbox'],
  ['K / ↑', 'Previous email in inbox'],
  ['E', 'Archive selected email'],
  ['#', 'Delete selected email'],
  ['S', 'Star / unstar email'],
  ['U', 'Toggle read / unread'],
  ['X', 'Select / deselect email'],
  ['R', 'Reply to email'],
  ['F', 'Forward email'],
  ['C', 'Compose new message'],
  ['/', 'Focus search'],
  ['?', 'Show keyboard shortcuts help'],
  ['Escape', 'Close / deselect'],
] as const;

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [profile, setProfile] = useState({ displayName: '', email: '', username: '' });
  const [loadedProfile, setLoadedProfile] = useState({ displayName: '', email: '', username: '' });
  const [signature, setSignature] = useState('');
  const [loadedSignature, setLoadedSignature] = useState('');
  const [defaultSignatureId, setDefaultSignatureId] = useState<string | null>(null);
  const [signatureStatus, setSignatureStatus] = useState<
    'loading' | 'idle' | 'saving' | 'saved' | 'error'
  >('loading');
  const [theme, setTheme] = useState<Theme>('dark');
  const [accentColor, setAccentColor] = useState('#ff9933');
  const [density, setDensity] = useState<Density>('comfortable');
  const [undoSendDelay, setUndoSendDelay] = useState('5');
  const [defaultReplyAll, setDefaultReplyAll] = useState(false);
  const [conversationView, setConversationView] = useState(true);
  const [readReceipts, setReadReceipts] = useState(true);
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    desktop: true,
    sound: true,
    mentionsOnly: false,
  });

  const [showCreateLabelForm, setShowCreateLabelForm] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(PRESET_LABEL_COLORS[1]);

  const { data: labels = [], isLoading: labelsLoading, isError: labelsError } = useLabels();
  const createLabel = useCreateLabel();
  const deleteLabel = useDeleteLabel();

  const hasProfileChanges = profile.displayName.trim() !== loadedProfile.displayName;
  const hasSignatureChanges = signature !== loadedSignature;

  useEffect(() => {
    try {
      setTheme((localStorage.getItem('quant-theme') as Theme) || 'dark');
      setDensity((localStorage.getItem('quant-density') as Density) || 'comfortable');
      setAccentColor(localStorage.getItem('quant-accent') || '#ff9933');
      setUndoSendDelay(localStorage.getItem('quant-undo-delay') || '5');
      const savedNotifs = localStorage.getItem('quant-notifications');
      if (savedNotifs) setNotifications(JSON.parse(savedNotifs));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void apiClient.getUserInfo().then((response) => {
      if (!response.success || !response.data) return;
      const next = {
        displayName: response.data.displayName || '',
        email: response.data.email || '',
        username: response.data.username || '',
      };
      setProfile(next);
      setLoadedProfile(next);
    });

    void apiClient.getDefaultEmailSignature().then((response) => {
      if (!response.success) {
        setSignatureStatus('error');
        return;
      }
      const next = response.data?.contentHtml ?? '';
      setSignature(next);
      setLoadedSignature(next);
      setDefaultSignatureId(response.data?.id ?? null);
      setSignatureStatus('idle');
    });
  }, []);

  const handleSaveProfile = () => {
    if (!profile.displayName.trim()) return;
    setLoadedProfile(profile);
    try {
      localStorage.setItem('quant-display-name', profile.displayName.trim());
    } catch {
      /* ignore */
    }
    showToast({ text: 'Profile display name updated', type: 'success' });
  };

  const saveSignature = useCallback(async () => {
    const contentHtml = signature.trim();
    if (!contentHtml || !hasSignatureChanges) return;
    setSignatureStatus('saving');
    const response = defaultSignatureId
      ? await apiClient.updateEmailSignature(defaultSignatureId, { contentHtml })
      : await apiClient.createEmailSignature({
          name: 'QuantMail signature',
          contentHtml,
          isDefault: true,
        });
    if (!response.success || !response.data) {
      setSignatureStatus('error');
      showToast({ text: 'Failed to update signature', type: 'error' });
      return;
    }
    setDefaultSignatureId(response.data.id);
    setSignature(response.data.contentHtml);
    setLoadedSignature(response.data.contentHtml);
    setSignatureStatus('saved');
    showToast({ text: 'Email signature saved and active', type: 'success' });
  }, [defaultSignatureId, hasSignatureChanges, signature]);

  const createNewLabel = useCallback(async () => {
    const name = newLabelName.trim();
    if (!name) return;
    try {
      await createLabel.mutateAsync({ name, color: newLabelColor });
      setNewLabelName('');
      setNewLabelColor(PRESET_LABEL_COLORS[1]);
      setShowCreateLabelForm(false);
      showToast({ text: `Created label "${name}"`, type: 'success' });
    } catch {
      showToast({ text: 'Failed to create label', type: 'error' });
    }
  }, [createLabel, newLabelColor, newLabelName]);

  const handleDeleteLabel = useCallback(
    async (id: string, name: string) => {
      if (confirm(`Delete label "${name}"?`)) {
        try {
          await deleteLabel.mutateAsync(id);
          showToast({ text: `Deleted label "${name}"`, type: 'info' });
        } catch {
          showToast({ text: 'Failed to delete label', type: 'error' });
        }
      }
    },
    [deleteLabel],
  );

  const changeTheme = useCallback((next: Theme) => {
    setTheme(next);
    try {
      localStorage.setItem('quant-theme', next);
    } catch {
      /* ignore */
    }
    const dark =
      next === 'dark' ||
      next === 'midnight' ||
      (next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    showToast({ text: `Switched theme to ${next}`, type: 'info' });
  }, []);

  const changeAccent = (hex: string) => {
    setAccentColor(hex);
    try {
      localStorage.setItem('quant-accent', hex);
      document.documentElement.style.setProperty('--brand-primary', hex);
    } catch {
      /* ignore */
    }
    showToast({ text: 'Accent color updated', type: 'info' });
  };

  const changeDensity = useCallback((next: Density) => {
    setDensity(next);
    try {
      localStorage.setItem('quant-density', next);
    } catch {
      /* ignore */
    }
  }, []);

  const updateNotif = (key: keyof typeof notifications, val: boolean) => {
    const next = { ...notifications, [key]: val };
    setNotifications(next);
    try {
      localStorage.setItem('quant-notifications', JSON.stringify(next));
    } catch {
      /* ignore */
    }
    showToast({ text: 'Notification preferences saved', type: 'success' });
  };

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page settings-workspace flex h-full flex-col overflow-hidden">
        <header className="shrink-0 px-6 pb-0 pt-6">
          <h1 className="text-xl font-bold tracking-tight text-white">Settings & Preferences</h1>
          <p className="mt-0.5 text-xs text-zinc-400">
            Account identity, AI assistant, themes, E2EE encryption, and live mail rules.
          </p>
        </header>

        <nav
          className="mt-4 flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--quant-border)] px-6"
          aria-label="Settings sections"
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              aria-current={activeTab === tab.key ? 'page' : undefined}
              className={`relative whitespace-nowrap rounded-t-md px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === tab.key
                  ? 'text-white after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-t after:bg-[#ff9933]'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
              }`}
            >
              <span className="mr-1.5" aria-hidden="true">
                {tab.icon}
              </span>
              {tab.label}
            </button>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto px-6 py-6">
          {activeTab === 'general' && (
            <div className="max-w-2xl space-y-8">
              <section>
                <h2 className="mb-1 text-sm font-bold text-white">Profile Identity</h2>
                <p className="mb-4 text-xs text-zinc-400">
                  Your identity visible to recipients and teammates.
                </p>
                <div className="space-y-4 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff9933] to-amber-600 text-lg font-bold text-[#191008] shadow-md">
                      {profile.displayName.charAt(0).toUpperCase() || 'K'}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">
                        {profile.displayName || 'Quant User'}
                      </p>
                      <p className="text-xs text-zinc-400">{profile.email}</p>
                      <span className="inline-block mt-1 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        Active & Verified
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField label="Display name">
                      <Input
                        value={profile.displayName}
                        onChange={(event) =>
                          setProfile((current) => ({ ...current, displayName: event.target.value }))
                        }
                        placeholder="Your full name"
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
                    <Button
                      variant="primary"
                      onClick={handleSaveProfile}
                      disabled={!hasProfileChanges}
                    >
                      {hasProfileChanges ? 'Save display name' : 'Profile up to date'}
                    </Button>
                  </div>
                </div>
              </section>

              <PhoneVerificationCard />

              <section>
                <h2 className="mb-1 text-sm font-bold text-white">Email Signature</h2>
                <p className="mb-4 text-xs text-zinc-400">
                  Automatically attached to outgoing emails.
                </p>
                <div className="space-y-4 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  <FormField label="HTML / Plain Text Signature">
                    <TextArea
                      value={signature}
                      onChange={(event) => setSignature(event.target.value)}
                      placeholder="Best regards,&#10;Kundan&#10;Founder @ Quantrinity"
                      rows={4}
                    />
                  </FormField>

                  {/* Live Signature Preview */}
                  {signature.trim() && (
                    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                        Signature Preview
                      </span>
                      <div className="text-zinc-300 whitespace-pre-wrap">{signature}</div>
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-1">
                    <Button
                      variant="primary"
                      onClick={saveSignature}
                      disabled={signatureStatus === 'saving' || !hasSignatureChanges}
                    >
                      {signatureStatus === 'saving' ? 'Saving signature…' : 'Save signature'}
                    </Button>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold text-white">Composer & Delivery Rules</h2>
                <div className="space-y-4 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1">
                        Undo Send Delay
                      </label>
                      <select
                        value={undoSendDelay}
                        onChange={(e) => {
                          setUndoSendDelay(e.target.value);
                          localStorage.setItem('quant-undo-delay', e.target.value);
                          showToast({
                            text: `Undo send delay set to ${e.target.value}s`,
                            type: 'info',
                          });
                        }}
                        className="h-9 w-full rounded-lg border border-[var(--quant-border)] bg-zinc-900 px-3 text-xs text-white focus:outline-none focus:border-[#ff9933]"
                      >
                        <option value="5">5 seconds</option>
                        <option value="10">10 seconds</option>
                        <option value="20">20 seconds</option>
                        <option value="30">30 seconds</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1">
                        Default Reply Action
                      </label>
                      <select
                        value={defaultReplyAll ? 'all' : 'single'}
                        onChange={(e) => {
                          setDefaultReplyAll(e.target.value === 'all');
                          showToast({ text: 'Updated default reply behavior', type: 'info' });
                        }}
                        className="h-9 w-full rounded-lg border border-[var(--quant-border)] bg-zinc-900 px-3 text-xs text-white focus:outline-none focus:border-[#ff9933]"
                      >
                        <option value="single">Reply</option>
                        <option value="all">Reply All</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-zinc-800">
                    <label className="flex items-center justify-between py-1 cursor-pointer">
                      <span className="text-xs text-zinc-300 font-medium">
                        Conversation Threading
                      </span>
                      <input
                        type="checkbox"
                        checked={conversationView}
                        onChange={(e) => setConversationView(e.target.checked)}
                        className="accent-[#ff9933] rounded cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between py-1 cursor-pointer">
                      <span className="text-xs text-zinc-300 font-medium">
                        Automatic Read Receipts
                      </span>
                      <input
                        type="checkbox"
                        checked={readReceipts}
                        onChange={(e) => setReadReceipts(e.target.checked)}
                        className="accent-[#ff9933] rounded cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              </section>

              <VacationResponderSettings />
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="max-w-2xl space-y-6">
              <section>
                <h2 className="mb-1 text-sm font-bold text-white">Notification Channels</h2>
                <p className="mb-4 text-xs text-zinc-400">
                  Manage how and when you receive incoming email and calendar alerts.
                </p>
                <div className="space-y-3 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  <label className="flex items-center justify-between py-2 border-b border-zinc-800 cursor-pointer">
                    <div>
                      <strong className="block text-xs text-white font-bold">
                        Email Notifications
                      </strong>
                      <span className="text-[11px] text-zinc-400">
                        Receive daily digest and urgent priority forwards
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifications.email}
                      onChange={(e) => updateNotif('email', e.target.checked)}
                      className="accent-[#ff9933] rounded h-4 w-4"
                    />
                  </label>

                  <label className="flex items-center justify-between py-2 border-b border-zinc-800 cursor-pointer">
                    <div>
                      <strong className="block text-xs text-white font-bold">
                        Desktop Browser Notifications
                      </strong>
                      <span className="text-[11px] text-zinc-400">
                        Show instant push notifications when new emails arrive
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifications.desktop}
                      onChange={(e) => updateNotif('desktop', e.target.checked)}
                      className="accent-[#ff9933] rounded h-4 w-4"
                    />
                  </label>

                  <label className="flex items-center justify-between py-2 border-b border-zinc-800 cursor-pointer">
                    <div>
                      <strong className="block text-xs text-white font-bold">Sound Alerts</strong>
                      <span className="text-[11px] text-zinc-400">
                        Play subtle haptic chime on incoming mail
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifications.sound}
                      onChange={(e) => updateNotif('sound', e.target.checked)}
                      className="accent-[#ff9933] rounded h-4 w-4"
                    />
                  </label>

                  <label className="flex items-center justify-between py-2 cursor-pointer">
                    <div>
                      <strong className="block text-xs text-white font-bold">
                        Direct Mentions Only
                      </strong>
                      <span className="text-[11px] text-zinc-400">
                        Only trigger alerts when you are in To/CC or specifically @mentioned
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifications.mentionsOnly}
                      onChange={(e) => updateNotif('mentionsOnly', e.target.checked)}
                      className="accent-[#ff9933] rounded h-4 w-4"
                    />
                  </label>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="max-w-2xl space-y-6">
              <section>
                <h2 className="mb-1 text-sm font-bold text-white">Theme & Palette</h2>
                <p className="mb-4 text-xs text-zinc-400">
                  Select your workspace aesthetic and dark mode level.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { key: 'dark', label: 'Obsidian OLED', bg: 'bg-[#0a0a0c]' },
                    { key: 'midnight', label: 'Midnight Blue', bg: 'bg-[#0f172a]' },
                    { key: 'light', label: 'Clean White', bg: 'bg-zinc-100 text-zinc-900' },
                    { key: 'system', label: 'System Match', bg: 'bg-zinc-900' },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => changeTheme(item.key as Theme)}
                      className={`p-3.5 rounded-2xl border text-left transition-all ${
                        theme === item.key
                          ? 'border-[#ff9933] ring-1 ring-[#ff9933]'
                          : 'border-[var(--quant-border)] hover:border-zinc-700'
                      } ${item.bg}`}
                    >
                      <span className="text-xs font-bold block">{item.label}</span>
                      <span className="text-[10px] opacity-70">
                        {theme === item.key ? 'Active ✓' : 'Select'}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold text-white">Accent Highlight</h2>
                <div className="flex items-center gap-3 mt-3">
                  {ACCENT_COLORS.map((acc) => (
                    <button
                      key={acc.hex}
                      type="button"
                      onClick={() => changeAccent(acc.hex)}
                      title={acc.name}
                      className={`size-8 rounded-full border-2 transition-transform ${
                        accentColor === acc.hex
                          ? 'scale-115 border-white'
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: acc.hex }}
                    />
                  ))}
                </div>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold text-white">Density Spacing</h2>
                <div className="flex gap-3">
                  {(['comfortable', 'compact'] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => changeDensity(item)}
                      className={`px-4 py-2 rounded-xl border text-xs font-semibold capitalize transition-colors ${
                        density === item
                          ? 'border-[#ff9933] bg-[#ff9933]/15 text-[#ff9933]'
                          : 'border-[var(--quant-border)] text-zinc-400 hover:text-white'
                      }`}
                    >
                      {item}
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
                  <h2 className="text-sm font-bold text-white">Email Labels & Folders</h2>
                  <p className="text-xs text-zinc-400">
                    Create custom labels to organize your communications.
                  </p>
                </div>
                <Button variant="primary" onClick={() => setShowCreateLabelForm((value) => !value)}>
                  {showCreateLabelForm ? 'Cancel' : '+ New label'}
                </Button>
              </div>

              {showCreateLabelForm && (
                <div className="space-y-4 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  <FormField label="Label name">
                    <Input
                      value={newLabelName}
                      onChange={(event) => setNewLabelName(event.target.value)}
                      placeholder="e.g. Invoices, Clients, Marketing…"
                    />
                  </FormField>
                  <div>
                    <p className="text-xs font-semibold text-zinc-300 mb-2">Label color</p>
                    <div className="flex flex-wrap gap-2">
                      {PRESET_LABEL_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewLabelColor(color)}
                          className={`size-7 rounded-full border-2 ${
                            newLabelColor === color
                              ? 'scale-110 border-white'
                              : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    onClick={createNewLabel}
                    disabled={!newLabelName.trim() || createLabel.isPending}
                  >
                    {createLabel.isPending ? 'Creating…' : 'Create label'}
                  </Button>
                </div>
              )}

              <div className="divide-y divide-zinc-800 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)]">
                {labelsLoading ? (
                  <div className="p-4 text-xs text-zinc-400">Loading labels…</div>
                ) : labels.length === 0 ? (
                  <div className="p-4 text-xs text-zinc-400">No custom labels created yet.</div>
                ) : (
                  labels.map((label: EmailLabel) => (
                    <div
                      key={label.id}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="size-3 rounded-full"
                          style={{ backgroundColor: label.color || PRESET_LABEL_COLORS[1] }}
                        />
                        <div>
                          <span className="text-xs font-bold text-white">{label.name}</span>
                          <span className="text-[11px] text-zinc-400 ml-2">
                            {label.messageCount} messages
                          </span>
                        </div>
                      </div>
                      {!label.isSystem && (
                        <button
                          type="button"
                          onClick={() => handleDeleteLabel(label.id, label.name)}
                          className="text-xs text-zinc-500 hover:text-rose-400"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="max-w-2xl space-y-6">
              <section>
                <h2 className="mb-1 text-sm font-bold text-white">
                  Zero-Knowledge End-to-End Encryption (E2EE)
                </h2>
                <p className="mb-4 text-xs text-zinc-400">
                  Your mail content, drive storage, and agent memory are encrypted with client-side
                  keys.
                </p>
                <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                      <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                      E2EE Quantum Vault Active
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                      AES-256-GCM
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300">
                    Private keys are stored in secure browser local credential storage and never
                    transmitted in plaintext to external servers.
                  </p>
                </div>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold text-white">AI Engine & Inference</h2>
                <div className="p-5 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Cloudflare Workers AI</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#ff9933]/20 text-[#ff9933]">
                      Llama-3.3-70b-instruct
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    High-speed global edge inference for email generation, smart replies, thread
                    summaries, and CodeHub planning.
                  </p>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'keyboard' && (
            <div className="max-w-2xl space-y-4">
              <h2 className="text-sm font-bold text-white">Keyboard Navigation Shortcuts</h2>
              <p className="text-xs text-zinc-400">
                Superhuman and Linear grade keyboard shortcuts to fly through your inbox.
              </p>
              <div className="divide-y divide-zinc-800 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)]">
                {SHORTCUTS.map(([keys, action]) => (
                  <div key={keys} className="flex items-center justify-between px-4 py-3">
                    <span className="text-xs font-medium text-white">{action}</span>
                    <kbd className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-[#ff9933]">
                      {keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </PageTransition>
    </AppShell>
  );
}
