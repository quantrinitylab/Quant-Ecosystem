'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, FormField, Input, TextArea } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { useCreateLabel, useLabels } from '../../hooks/useLabels';
import { apiClient } from '../../services/api-client';
import type { EmailLabel } from '../../types';
import { VacationResponderSettings } from './VacationResponderSettings';
import { PhoneVerificationCard } from '../../components/PhoneVerificationCard';

type SettingsTab = 'general' | 'notifications' | 'appearance' | 'labels' | 'keyboard';
type Theme = 'light' | 'dark' | 'system';
type Density = 'comfortable' | 'compact';

const TABS: Array<{ key: SettingsTab; label: string; icon: string }> = [
  { key: 'general', label: 'General', icon: '⚙' },
  { key: 'notifications', label: 'Notifications', icon: '🔔' },
  { key: 'appearance', label: 'Appearance', icon: '🎨' },
  { key: 'labels', label: 'Labels', icon: '🏷' },
  { key: 'keyboard', label: 'Keyboard shortcuts', icon: '⌨' },
];

const NOTIFICATION_CHANNELS = [
  ['Email notifications', 'Receive notifications via email'],
  ['Push notifications', 'Receive push notifications on mobile'],
  ['Desktop notifications', 'Show browser notifications'],
  ['Sound alerts', 'Play a sound when a new notification arrives'],
  ['Mentions only', 'Only notify when you are directly mentioned'],
] as const;

const PRESET_LABEL_COLORS = [
  '#ef4444', '#ff9933', '#eab308', '#138808', '#06b6d4',
  '#3b82f6', '#6366f1', '#ec4899', '#6b7280', '#14b8a6',
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
  const [signatureStatus, setSignatureStatus] = useState<'loading' | 'idle' | 'saving' | 'saved' | 'error'>('loading');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'unavailable'>('idle');
  const [theme, setTheme] = useState<Theme>('dark');
  const [density, setDensity] = useState<Density>('comfortable');
  const [showCreateLabelForm, setShowCreateLabelForm] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(PRESET_LABEL_COLORS[1]);

  const { data: labels = [], isLoading: labelsLoading, isError: labelsError } = useLabels();
  const createLabel = useCreateLabel();
  const hasProfileChanges = profile.displayName.trim() !== loadedProfile.displayName;
  const hasSignatureChanges = signature !== loadedSignature;
  const canSaveSignature = !['loading', 'saving'].includes(signatureStatus) && signature.trim().length > 0 && hasSignatureChanges;

  useEffect(() => {
    try {
      setTheme((localStorage.getItem('quant-theme') as Theme) || 'dark');
      setDensity((localStorage.getItem('quant-density') as Density) || 'comfortable');
    } catch { /* ignore unavailable local storage */ }
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

  useEffect(() => {
    if (!hasProfileChanges) setSaveStatus('idle');
  }, [hasProfileChanges]);

  useEffect(() => {
    if ((signatureStatus === 'saved' || signatureStatus === 'error') && hasSignatureChanges) {
      setSignatureStatus('idle');
    }
  }, [hasSignatureChanges, signatureStatus]);

  const saveSignature = useCallback(async () => {
    const contentHtml = signature.trim();
    if (!contentHtml || !hasSignatureChanges) return;
    setSignatureStatus('saving');
    const response = defaultSignatureId
      ? await apiClient.updateEmailSignature(defaultSignatureId, { contentHtml })
      : await apiClient.createEmailSignature({ name: 'QuantMail signature', contentHtml, isDefault: true });
    if (!response.success || !response.data) {
      setSignatureStatus('error');
      return;
    }
    setDefaultSignatureId(response.data.id);
    setSignature(response.data.contentHtml);
    setLoadedSignature(response.data.contentHtml);
    setSignatureStatus('saved');
  }, [defaultSignatureId, hasSignatureChanges, signature]);

  const createNewLabel = useCallback(async () => {
    const name = newLabelName.trim();
    if (!name) return;
    try {
      await createLabel.mutateAsync({ name, color: newLabelColor });
      setNewLabelName('');
      setNewLabelColor(PRESET_LABEL_COLORS[1]);
      setShowCreateLabelForm(false);
    } catch { /* mutation state renders the error */ }
  }, [createLabel, newLabelColor, newLabelName]);

  const changeTheme = useCallback((next: Theme) => {
    setTheme(next);
    try { localStorage.setItem('quant-theme', next); } catch { /* ignore */ }
    const dark = next === 'dark' || (next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  }, []);

  const changeDensity = useCallback((next: Density) => {
    setDensity(next);
    try { localStorage.setItem('quant-density', next); } catch { /* ignore */ }
  }, []);

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page settings-workspace flex h-full flex-col overflow-hidden">
        <header className="shrink-0 px-6 pb-0 pt-6">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--quant-foreground)]">Settings</h1>
          <p className="mt-0.5 text-sm text-[var(--quant-muted-foreground)]">Manage your account, preferences and integrations.</p>
        </header>

        <nav className="mt-4 flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--quant-border)] px-6" aria-label="Settings sections">
          {TABS.map((tab) => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} aria-current={activeTab === tab.key ? 'page' : undefined}
              className={`relative whitespace-nowrap rounded-t-md px-3 py-2.5 text-sm font-medium transition-colors ${activeTab === tab.key ? 'text-[var(--quant-foreground)] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-t after:bg-[var(--brand-primary)]' : 'text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-muted)] hover:text-[var(--quant-foreground)]'}`}>
              <span className="mr-1.5" aria-hidden="true">{tab.icon}</span>{tab.label}
            </button>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto px-6 py-6">
          {activeTab === 'general' && (
            <div className="max-w-2xl space-y-8">
              <section>
                <h2 className="mb-1 text-base font-semibold text-[var(--quant-foreground)]">Profile</h2>
                <p className="mb-4 text-sm text-[var(--quant-muted-foreground)]">Your public display information.</p>
                <div className="space-y-4 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand-primary)] to-[var(--quant-secondary)] text-xl font-bold text-white">{profile.displayName.charAt(0).toUpperCase() || 'Q'}</div>
                    <div>
                      <p className="text-sm font-medium text-[var(--quant-foreground)]">Profile photo</p>
                      <button type="button" disabled className="mt-1 cursor-not-allowed text-xs font-medium text-[var(--quant-muted-foreground)] opacity-70">Photo uploads unavailable</button>
                      <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">Profile photo uploads aren&apos;t connected in QuantMail yet.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField label="Display name"><Input value={profile.displayName} onChange={(event) => setProfile((current) => ({ ...current, displayName: event.target.value }))} placeholder="Your name" /></FormField>
                    <FormField label="Username"><Input value={profile.username} readOnly disabled /></FormField>
                  </div>
                  <FormField label="Email address"><Input value={profile.email} readOnly disabled /></FormField>
                  <div className="flex items-center gap-3 pt-2">
                    <Button variant="primary" onClick={() => hasProfileChanges && setSaveStatus('unavailable')} disabled={!hasProfileChanges}>{hasProfileChanges ? 'Save changes' : 'No changes to save'}</Button>
                    <span className="text-xs text-[var(--quant-muted-foreground)]">{saveStatus === 'unavailable' ? 'Profile updates aren\'t connected yet, so your display name can\'t be saved from QuantMail right now.' : 'Email and username come from your account identity.'}</span>
                  </div>
                </div>
              </section>

              <PhoneVerificationCard />

              <section>
                <h2 className="mb-1 text-base font-semibold text-[var(--quant-foreground)]">Email preferences</h2>
                <p className="mb-4 text-sm text-[var(--quant-muted-foreground)]">Control how you send and receive emails.</p>
                <div className="space-y-4 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  <FormField label="Email signature"><TextArea value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="Add your default email signature..." rows={3} /></FormField>
                  <div className="flex items-center gap-3 pt-1">
                    <Button variant="primary" onClick={saveSignature} disabled={!canSaveSignature}>{signatureStatus === 'saving' ? 'Saving signature…' : signatureStatus === 'loading' ? 'Loading signature…' : hasSignatureChanges ? 'Save signature' : 'Signature up to date'}</Button>
                    <span className="text-xs text-[var(--quant-muted-foreground)]">{signatureStatus === 'loading' ? 'Loading your live default signature.' : signatureStatus === 'saved' ? 'Your default signature now syncs to live mail.' : signatureStatus === 'error' ? 'The default signature could not be synced right now.' : defaultSignatureId ? 'This field edits your live default signature.' : 'Save here to create your live default signature.'}</span>
                  </div>
                  <fieldset disabled className="space-y-4 opacity-70">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField label="Undo send delay"><select defaultValue="5" className="h-9 w-full rounded-md border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 text-sm text-[var(--quant-foreground)]"><option value="5">5 seconds</option><option value="10">10 seconds</option><option value="20">20 seconds</option><option value="30">30 seconds</option></select></FormField>
                      <FormField label="Default reply behavior"><select defaultValue="reply" className="h-9 w-full rounded-md border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 text-sm text-[var(--quant-foreground)]"><option value="reply">Reply</option><option value="reply-all">Reply all</option></select></FormField>
                    </div>
                    <UnavailableCheckbox label="Conversation view" description="Group related emails together in threads." defaultChecked />
                    <UnavailableCheckbox label="Read receipts" description="Let senders know when you've read their email." />
                  </fieldset>
                  <VacationResponderSettings />
                  <p className="text-xs text-[var(--quant-muted-foreground)]">Signature and vacation auto-reply are live here. Undo send, reply behavior, conversation view, and read receipts aren&apos;t connected in Settings yet.</p>
                </div>
              </section>

              <section>
                <h2 className="mb-1 text-base font-semibold text-[var(--quant-destructive)]">Danger zone</h2>
                <div className="space-y-3 rounded-lg border border-[var(--quant-destructive)]/30 p-5">
                  <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium text-[var(--quant-foreground)]">Delete account</p><p className="text-xs text-[var(--quant-muted-foreground)]">Account deletion isn&apos;t connected in QuantMail yet, so this control stays unavailable for now.</p></div><Button variant="secondary" disabled className="cursor-not-allowed">Account deletion unavailable</Button></div>
                  <p className="text-xs text-[var(--quant-muted-foreground)]">This section will only become active after a verified deletion workflow is wired end to end.</p>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="max-w-2xl space-y-6">
              <section aria-labelledby="notification-channels-heading">
                <h2 id="notification-channels-heading" className="mb-1 text-base font-semibold text-[var(--quant-foreground)]">Notification channels</h2>
                <p className="mb-4 text-sm text-[var(--quant-muted-foreground)]">Notification preferences are not connected to your account yet.</p>
                <div className="space-y-4 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
                  <div className="rounded-md border border-[var(--quant-border)] bg-[var(--quant-muted)]/40 p-3" role="status">
                    <p className="text-sm font-medium text-[var(--quant-foreground)]">Notification controls unavailable</p>
                    <p id="notification-preferences-unavailable" className="mt-1 text-xs text-[var(--quant-muted-foreground)]">These controls stay read-only until QuantMail has a verified backend and persisted notification-preference contract. Changing them here would not affect delivery.</p>
                  </div>
                  <fieldset disabled aria-describedby="notification-preferences-unavailable" className="space-y-1 opacity-70">
                    <legend className="sr-only">Unavailable notification channel preferences</legend>
                    {NOTIFICATION_CHANNELS.map(([label, description]) => (
                      <label key={label} className="flex cursor-not-allowed items-center justify-between py-2">
                        <span><span className="block text-sm font-medium text-[var(--quant-foreground)]">{label}</span><span className="block text-xs text-[var(--quant-muted-foreground)]">{description}</span></span>
                        <input type="checkbox" disabled aria-label={`${label} unavailable`} className="h-4 w-4 rounded accent-[var(--brand-primary)]" />
                      </label>
                    ))}
                  </fieldset>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="max-w-2xl space-y-6">
              <ChoiceSection title="Theme" description="Customize how QuantMail looks.">
                <div className="grid grid-cols-3 gap-3">{(['light', 'dark', 'system'] as const).map((item) => <button key={item} type="button" onClick={() => changeTheme(item)} aria-pressed={theme === item} className={`rounded-lg border-2 p-4 text-sm font-medium capitalize ${theme === item ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5' : 'border-[var(--quant-border)] text-[var(--quant-muted-foreground)]'}`}>{item}</button>)}</div>
              </ChoiceSection>
              <ChoiceSection title="Density" description="Adjust spacing in the interface.">
                <div className="flex gap-3">{(['comfortable', 'compact'] as const).map((item) => <button key={item} type="button" onClick={() => changeDensity(item)} aria-pressed={density === item} className={`rounded-lg border-2 px-4 py-2.5 text-sm font-medium capitalize ${density === item ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5 text-[var(--quant-foreground)]' : 'border-[var(--quant-border)] text-[var(--quant-muted-foreground)]'}`}>{item}</button>)}</div>
              </ChoiceSection>
            </div>
          )}

          {activeTab === 'labels' && (
            <div className="max-w-2xl space-y-4">
              <div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-semibold text-[var(--quant-foreground)]">Labels</h2><p className="text-sm text-[var(--quant-muted-foreground)]">Live labels sync here from your account.</p><p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">Visibility controls aren&apos;t connected yet, so this view focuses on real label data and creation.</p></div><Button variant="primary" onClick={() => setShowCreateLabelForm((value) => !value)}>{showCreateLabelForm ? 'Cancel' : '+ New label'}</Button></div>
              {showCreateLabelForm && <div className="space-y-4 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5"><FormField label="Label name"><Input value={newLabelName} onChange={(event) => setNewLabelName(event.target.value)} placeholder="Enter a label name" /></FormField><div><p className="text-sm font-medium text-[var(--quant-foreground)]">Label color</p><div className="mt-3 flex flex-wrap gap-2" aria-label="Label color choices">{PRESET_LABEL_COLORS.map((color) => <button key={color} type="button" onClick={() => setNewLabelColor(color)} aria-label={`Use color ${color}`} aria-pressed={newLabelColor === color} className={`h-7 w-7 rounded-full border-2 ${newLabelColor === color ? 'scale-110 border-white' : 'border-transparent'}`} style={{ backgroundColor: color }} />)}</div></div>{createLabel.isError && <p className="text-xs text-[var(--quant-destructive)]" role="alert">Label could not be created right now.</p>}<Button variant="primary" onClick={createNewLabel} disabled={!newLabelName.trim() || createLabel.isPending}>{createLabel.isPending ? 'Creating…' : 'Create label'}</Button></div>}
              <div className="divide-y divide-[var(--quant-border)] rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)]">{labelsLoading ? <StateRow>Loading labels…</StateRow> : labelsError ? <StateRow>Labels couldn&apos;t be loaded right now.</StateRow> : labels.length === 0 ? <StateRow>No labels have been created yet.</StateRow> : labels.map((label: EmailLabel) => <div key={label.id} className="flex items-center justify-between gap-4 px-4 py-3"><div className="flex min-w-0 items-center gap-3"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color || PRESET_LABEL_COLORS[1] }} aria-hidden="true" /><div className="min-w-0"><span className="truncate text-sm font-medium text-[var(--quant-foreground)]">{label.name}</span><p className="text-xs text-[var(--quant-muted-foreground)]">{label.messageCount} messages · {label.unreadCount} unread</p></div></div><div className="text-right text-xs text-[var(--quant-muted-foreground)]"><p>{label.isSystem ? 'System' : 'Custom'} label</p><p>Visible in live mail</p></div></div>)}</div>
            </div>
          )}

          {activeTab === 'keyboard' && <div className="max-w-2xl space-y-4"><h2 className="text-base font-semibold text-[var(--quant-foreground)]">Keyboard shortcuts</h2><p className="text-sm text-[var(--quant-muted-foreground)]">Speed up your workflow with these shortcuts.</p><div className="divide-y divide-[var(--quant-border)] rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)]">{SHORTCUTS.map(([keys, action]) => <div key={keys} className="flex items-center justify-between px-4 py-3"><span className="text-sm text-[var(--quant-foreground)]">{action}</span><kbd className="rounded border border-[var(--quant-border)] bg-[var(--quant-muted)] px-2 py-1 font-mono text-xs text-[var(--quant-muted-foreground)]">{keys}</kbd></div>)}</div></div>}
        </main>
      </PageTransition>
    </AppShell>
  );
}

function UnavailableCheckbox({ label, description, defaultChecked = false }: { label: string; description: string; defaultChecked?: boolean }) {
  return <label className="flex cursor-not-allowed items-center gap-3"><input type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4 rounded accent-[var(--brand-primary)]" /><span><span className="block text-sm text-[var(--quant-foreground)]">{label}</span><span className="block text-xs text-[var(--quant-muted-foreground)]">{description}</span></span></label>;
}

function ChoiceSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section><h2 className="mb-1 text-base font-semibold text-[var(--quant-foreground)]">{title}</h2><p className="mb-4 text-sm text-[var(--quant-muted-foreground)]">{description}</p>{children}</section>;
}

function StateRow({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-6 text-sm text-[var(--quant-muted-foreground)]">{children}</div>;
}
