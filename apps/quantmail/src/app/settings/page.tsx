'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, FormField, Input, TextArea } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { apiClient } from '../../services/api-client';
import { VacationResponderSettings } from './VacationResponderSettings';
import { PhoneVerificationCard } from '../../components/PhoneVerificationCard';
import { showToast } from '../../components/InboxToast';

type SettingsTab = 'general' | 'ai' | 'security' | 'notifications' | 'appearance' | 'keyboard';
type Theme = 'light' | 'dark' | 'system' | 'midnight';
type Density = 'comfortable' | 'compact';

interface AIModelOption {
  id: string;
  name: string;
  description: string;
  bestFor: string;
  badge: string;
}

/**
 * The user-facing AI choices.
 *
 * These used to be six entries naming the vendor, the parameter count and a
 * latency figure — `'Meta Llama 3.3 (70B Instruct)'`, `'~380ms'`. Both were a
 * problem. The latencies were hardcoded literals that nothing measured, so the
 * page was quoting numbers it had invented. And exposing the vendor contradicts
 * the routing model itself: which model answers a prompt is the router's call,
 * it changes with load and health, and a user who has pinned "Llama 3.3" has
 * pinned something we may not be serving.
 *
 * What a user can actually reason about is how much thinking they want spent on
 * a request, so that is what the setting offers. `id` is the value persisted to
 * `quant-ai-model-mode` and handed to the router as an intent, not a model name.
 */
const AI_ENGINE_MODES: AIModelOption[] = [
  {
    id: 'auto-router',
    name: 'Automatic',
    description:
      'Reads each request and spends as much reasoning on it as it needs — a one-line reply stays instant, a long thread gets the slower pass. Falls back on its own if a route is unhealthy.',
    bestFor: 'Everything, unless you have a reason to override it',
    badge: 'Recommended',
  },
  {
    id: 'fast',
    name: 'Fast',
    description:
      'Answers immediately and keeps it short. Good for smart replies, autocomplete and one-line summaries where waiting is worse than a slightly plainer answer.',
    bestFor: 'Quick replies, autocomplete, categorising',
    badge: 'Lowest wait',
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description:
      'The middle setting: enough reasoning for a full draft or a thread summary, without the pause the deep setting takes.',
    bestFor: 'Drafting mail, summarising a thread',
    badge: 'Default',
  },
  {
    id: 'deep',
    name: 'Deep',
    description:
      'Takes noticeably longer and thinks harder. Worth it for contracts, long documents, multi-step logic and code review, where a shallow answer costs more than the wait.',
    bestFor: 'Contracts, code, analysis, long documents',
    badge: 'Most thorough',
  },
];

const TABS: Array<{ key: SettingsTab; label: string }> = [
  { key: 'general', label: 'General' },
  { key: 'ai', label: 'AI & Models' },
  { key: 'security', label: 'Security & Encryption' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'keyboard', label: 'Keyboard Shortcuts' },
];

const ACCENT_COLORS = [
  { name: 'Bharat Saffron', hex: '#FF8C42' },
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
  const [accentColor, setAccentColor] = useState('#FF8C42');
  const [density, setDensity] = useState<Density>('comfortable');
  const [undoSendDelay, setUndoSendDelay] = useState('5');
  const [defaultReplyAll, setDefaultReplyAll] = useState(false);
  const [conversationView, setConversationView] = useState(true);
  const [readReceipts, setReadReceipts] = useState(true);
  const [selectedAIModel, setSelectedAIModel] = useState('auto-router');
  const [enableAutoFailover, setEnableAutoFailover] = useState(true);
  const [aiCreativity, setAiCreativity] = useState('balanced');
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    desktop: true,
    sound: true,
    mentionsOnly: false,
  });

  const hasProfileChanges = profile.displayName.trim() !== loadedProfile.displayName;
  const hasSignatureChanges = signature !== loadedSignature;

  useEffect(() => {
    try {
      setTheme((localStorage.getItem('quant-theme') as Theme) || 'dark');
      setDensity((localStorage.getItem('quant-density') as Density) || 'comfortable');
      setAccentColor(localStorage.getItem('quant-accent') || '#FF8C42');
      setUndoSendDelay(localStorage.getItem('quant-undo-delay') || '5');
      const savedModel = localStorage.getItem('quant-ai-model-mode');
      // Browsers that used the app before the vendor-named models were replaced
      // by intent tiers still hold an id like `@cf/meta/llama-3.3-70b-instruct`,
      // which now matches nothing and would render the list with no row selected.
      if (savedModel && AI_ENGINE_MODES.some((m) => m.id === savedModel)) {
        setSelectedAIModel(savedModel);
      }
      const savedFailover = localStorage.getItem('quant-ai-failover');
      if (savedFailover !== null) setEnableAutoFailover(savedFailover === '1');
      const savedCreativity = localStorage.getItem('quant-ai-creativity');
      if (savedCreativity) setAiCreativity(savedCreativity);
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

  const handleSelectAIModel = (modelId: string) => {
    setSelectedAIModel(modelId);
    try {
      localStorage.setItem('quant-ai-model-mode', modelId);
    } catch {
      /* ignore */
    }
    const found = AI_ENGINE_MODES.find((m) => m.id === modelId);
    showToast({
      text: `Assistant set to ${found?.name || modelId}`,
      type: 'success',
    });
  };

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
      <PageTransition className="workspace-page settings-workspace flex h-full flex-col overflow-hidden bg-[#0a0d14]">
        {/* Sleek Settings Header */}
        <header className="shrink-0 px-4 sm:px-6 pt-5 pb-3 border-b border-[#282C35]/80 bg-[#0d1017]/95">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-gradient-to-br from-[#FF8C42]/20 to-[#E8752F]/20 border border-[#FF8C42]/40 flex items-center justify-center text-[#FF8C42] shadow-[0_4px_16px_rgba(0,0,0,0.6)]">
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                Settings & Preferences
              </h1>
              <p className="text-xs text-[#A1A4AC]">
                Manage profile, AI model router, security keys, and workspace preferences.
              </p>
            </div>
          </div>
        </header>

        {/* Smooth Horizontal Pill Tabs */}
        <nav
          className="flex items-center gap-2 overflow-x-auto py-3 px-4 sm:px-6 no-scrollbar select-none border-b border-[#282C35] bg-[#090A0C]/90 backdrop-blur-md shrink-0"
          aria-label="Settings sections"
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[#2B1A11] text-[#FF8C42] border border-[#5C3016] font-semibold'
                    : 'bg-[#16181D] hover:bg-[#1C1F26] text-[#A1A4AC] hover:text-[#F5F5F5] border border-[#282C35]'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 w-full max-w-4xl mx-auto space-y-6">
          {/* 1. GENERAL TAB */}
          {activeTab === 'general' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <section className="rounded-xl border border-[#282C35] bg-[#111318] p-5 shadow-sm space-y-4">
                <div className="border-b border-[#282C35] pb-3">
                  <h2 className="text-sm font-semibold text-[#F5F5F5]">Profile Identity</h2>
                  <p className="text-xs text-[#A1A4AC]">
                    Your public identifier visible to teammates and mail recipients.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2B1A11] border border-[#5C3016] text-base font-bold text-[#FF8C42]">
                    {profile.displayName.charAt(0).toUpperCase() || 'Q'}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#F5F5F5]">
                      {profile.displayName || 'Quant User'}
                    </p>
                    <p className="text-xs text-[#A1A4AC]">{profile.email}</p>
                    <span className="inline-block mt-1 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Active & Verified Identity
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
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
              </section>

              <PhoneVerificationCard />

              <section className="rounded-2xl border border-[#282C35] bg-[#121622]/90 p-5 shadow-xl space-y-4">
                <div className="border-b border-[#282C35] pb-3">
                  <h2 className="text-sm font-bold text-white">Email Signature</h2>
                  <p className="text-xs text-[#A1A4AC]">
                    Automatically attached to all outgoing emails.
                  </p>
                </div>
                <FormField label="HTML / Plain Text Signature">
                  <TextArea
                    value={signature}
                    onChange={(event) => setSignature(event.target.value)}
                    placeholder="Best regards,&#10;Kundan&#10;Founder @ Quantrinity"
                    rows={4}
                  />
                </FormField>
                {signature.trim() && (
                  <div className="p-3 rounded-xl bg-[#090A0C] border border-[#282C35] text-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#A1A4AC] block mb-1">
                      Live Preview
                    </span>
                    <div className="text-[#A1A4AC] whitespace-pre-wrap">{signature}</div>
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
              </section>

              <section className="rounded-2xl border border-[#282C35] bg-[#121622]/90 p-5 shadow-xl space-y-4">
                <div className="border-b border-[#282C35] pb-3">
                  <h2 className="text-sm font-bold text-white">Composer & Delivery Rules</h2>
                  <p className="text-xs text-[#A1A4AC]">
                    Fine-tune sending delays and thread behaviors.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#A1A4AC] mb-1">
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
                      className="h-11 sm:h-9 w-full rounded-xl border border-[#3A404D]/80 bg-[#111318] px-3 text-xs text-white focus:outline-none focus:border-[#FF8C42]"
                    >
                      <option value="5">5 seconds</option>
                      <option value="10">10 seconds</option>
                      <option value="20">20 seconds</option>
                      <option value="30">30 seconds</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#A1A4AC] mb-1">
                      Default Reply Action
                    </label>
                    <select
                      value={defaultReplyAll ? 'all' : 'single'}
                      onChange={(e) => {
                        setDefaultReplyAll(e.target.value === 'all');
                        showToast({ text: 'Updated default reply behavior', type: 'info' });
                      }}
                      className="h-11 sm:h-9 w-full rounded-xl border border-[#3A404D]/80 bg-[#111318] px-3 text-xs text-white focus:outline-none focus:border-[#FF8C42]"
                    >
                      <option value="single">Reply (Direct Sender)</option>
                      <option value="all">Reply All (All Recipients)</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2 pt-2 border-t border-[#282C35]">
                  {/* The label is the hit area — a tap anywhere on the row toggles
                   * the box — so the 44px floor belongs here, not on the 13px
                   * native checkbox that a phone was measuring. */}
                  <label className="flex min-h-11 items-center justify-between py-1 cursor-pointer">
                    <span className="text-xs text-[#A1A4AC] font-medium">
                      Conversation Threading
                    </span>
                    <input
                      type="checkbox"
                      checked={conversationView}
                      onChange={(e) => setConversationView(e.target.checked)}
                      className="size-4 shrink-0 accent-[#FF8C42] rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                    />
                  </label>
                  <label className="flex min-h-11 items-center justify-between py-1 cursor-pointer">
                    <span className="text-xs text-[#A1A4AC] font-medium">
                      Automatic Read Receipts
                    </span>
                    <input
                      type="checkbox"
                      checked={readReceipts}
                      onChange={(e) => setReadReceipts(e.target.checked)}
                      className="size-4 shrink-0 accent-[#FF8C42] rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                    />
                  </label>
                </div>
              </section>

              <VacationResponderSettings />
            </div>
          )}

          {/* 2. AI & MULTI-MODEL ROUTER TAB */}
          {activeTab === 'ai' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Dynamic Model Router Banner */}
              <section className="rounded-xl border border-[#282C35] bg-[#111318] p-5 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="size-2.5 rounded-full bg-[#FF8C42]" />
                    <h2 className="text-sm font-semibold text-[#F5F5F5]">
                      Quanty routes every request for you
                    </h2>
                  </div>
                  <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-[#2B1A11] text-[#FF8C42] border border-[#5C3016]">
                    Automatic
                  </span>
                </div>
                <p className="text-xs text-[#A1A4AC] leading-relaxed">
                  You pick how much thinking a request deserves; Quanty picks what answers it. That
                  choice shifts with load and health, so it is deliberately not something you pin to
                  a named engine. Everything below is an intent, not a machine.
                </p>
              </section>

              {/* Model Selection List */}
              <section className="rounded-xl border border-[#282C35] bg-[#111318] p-5 shadow-sm space-y-4">
                <div className="border-b border-[#282C35] pb-3">
                  <h2 className="text-sm font-semibold text-[#F5F5F5]">How much thinking</h2>
                  <p className="text-xs text-[#A1A4AC]">
                    Leave this on Automatic unless a particular kind of work needs a particular
                    trade-off.
                  </p>
                </div>

                <div className="space-y-3" role="radiogroup" aria-label="How much thinking">
                  {AI_ENGINE_MODES.map((model) => {
                    const isSelected = selectedAIModel === model.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => handleSelectAIModel(model.id)}
                        className={`w-full min-h-11 p-4 rounded-xl border transition-all cursor-pointer select-none flex items-start justify-between gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                          isSelected
                            ? 'bg-[#2B1A11] border-[#5C3016] shadow-sm'
                            : 'bg-[#16181D] border-[#282C35] hover:border-[#3A404D] hover:bg-[#1C1F26]'
                        }`}
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-[#F5F5F5]">
                              {model.name}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isSelected
                                  ? 'bg-[#FF8C42] text-[#111111]'
                                  : 'bg-[#282C35] text-[#A1A4AC] border border-[#3A404D]'
                              }`}
                            >
                              {model.badge}
                            </span>
                          </div>
                          <p className="text-xs text-[#A1A4AC]">{model.description}</p>
                          <div className="flex items-center gap-2 pt-0.5">
                            <span className="text-[11px] text-[#FF8C42] font-semibold">
                              Best for: {model.bestFor}
                            </span>
                          </div>
                        </div>

                        <div className="pt-1">
                          <div
                            className={`size-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
                              isSelected
                                ? 'border-[#FF8C42] bg-[#FF8C42]'
                                : 'border-[#6B6E76] bg-transparent'
                            }`}
                          >
                            {isSelected && <div className="size-2 rounded-full bg-[#111111]" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Failover & Advanced AI Options */}
              <section className="rounded-2xl border border-[#282C35] bg-[#121622]/90 p-5 shadow-xl space-y-4">
                <h2 className="text-sm font-bold text-white">When something is slow or down</h2>
                <div className="space-y-3">
                  <label className="flex min-h-11 items-center justify-between gap-3 py-2 border-b border-[#282C35] cursor-pointer">
                    <div>
                      <strong className="block text-xs text-white font-bold">
                        Reroute automatically
                      </strong>
                      <span className="text-[11px] text-[#A1A4AC]">
                        If a request stalls or errors, try a different route instead of returning
                        nothing. Turn this off to see failures as they are.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableAutoFailover}
                      onChange={(e) => {
                        setEnableAutoFailover(e.target.checked);
                        localStorage.setItem('quant-ai-failover', e.target.checked ? '1' : '0');
                        showToast({ text: 'Updated rerouting preference', type: 'info' });
                      }}
                      className="accent-[#FF8C42] rounded h-4 w-4 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                    />
                  </label>

                  <div className="pt-2">
                    <label className="block text-xs font-semibold text-[#A1A4AC] mb-1.5">
                      Copilot Response Temperature
                    </label>
                    <div className="grid grid-cols-3 gap-2.5">
                      {[
                        { key: 'precise', label: 'Precise (0.1)', desc: 'Fact-based & factual' },
                        {
                          key: 'balanced',
                          label: 'Balanced (0.7)',
                          desc: 'Standard business tone',
                        },
                        { key: 'creative', label: 'Creative (1.0)', desc: 'Expressive marketing' },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            setAiCreativity(item.key);
                            localStorage.setItem('quant-ai-creativity', item.key);
                            showToast({ text: `Set AI creativity to ${item.key}`, type: 'info' });
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-colors ${
                            aiCreativity === item.key
                              ? 'border-[#FF8C42] bg-[#FF8C42]/15 text-white'
                              : 'border-[#282C35] bg-[#111318] text-[#A1A4AC] hover:text-white'
                          }`}
                        >
                          <span className="text-xs font-bold block">{item.label}</span>
                          <span className="text-[10px] text-[#A1A4AC] block">{item.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* 3. SECURITY & ENCRYPTION TAB */}
          {activeTab === 'security' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/*
                This card used to read "Zero-Knowledge E2EE Vault Active / AES-256-GCM + Ed25519"
                over an emerald background, and claimed payloads were encrypted on the device before
                transmission. None of that was true for mail: QuantMail sends through AWS SES, which
                by construction sees plaintext. The end-to-end relay under `backend/routes/e2ee.ts`
                is real but is a QuantMail-to-QuantMail seam that the composer does not use yet, and
                nothing on this screen generates a device key.

                A false green badge is worse than an amber honest one, so the card now states the
                two protections separately and says plainly where the boundary is.
              */}
              <section className="rounded-2xl border border-[#282C35] bg-[#121622]/90 p-5 shadow-[0_4px_16px_rgba(0,0,0,0.6)] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#F5F5F5] inline-flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-emerald-400" />
                    Encrypted in transit and at rest
                  </span>
                  <span className="text-[10px] px-2.5 py-0.5 rounded bg-[#16181D] text-[#A1A4AC] border border-[#282C35]">
                    TLS 1.2+ · AES-256 at rest
                  </span>
                </div>
                <p className="text-xs text-[#A1A4AC] leading-relaxed">
                  Mail is encrypted on the wire to and from our servers and encrypted on disk once
                  it arrives. Your session can read it, and so can the delivery pipeline that has to
                  hand it to the recipient&apos;s provider.
                </p>
                <p className="text-xs text-[#A1A4AC] leading-relaxed border-t border-[#282C35] pt-3">
                  It is <strong className="text-[#F5F5F5] font-semibold">not</strong> end-to-end
                  encrypted. Ordinary email cannot be — SMTP requires a readable message at the
                  boundary. Anyone telling you otherwise about a normal mailbox is selling you
                  something. End-to-end encrypted QuantMail-to-QuantMail threads are in progress and
                  will say so explicitly on the thread itself when they land.
                </p>
              </section>

              <section className="rounded-2xl border border-[#282C35] bg-[#121622]/90 p-5 shadow-xl space-y-4">
                <div className="border-b border-[#282C35] pb-3">
                  <h2 className="text-sm font-bold text-white">Session & Active Credentials</h2>
                  <p className="text-xs text-[#A1A4AC]">
                    Security status for current logged-in identity.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#111318] border border-[#282C35]">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white">Device signing key</p>
                      <p className="text-[11px] text-[#A1A4AC]">
                        Not generated on this browser yet
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#A1A4AC]">
                      Not set up
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#111318] border border-[#282C35]">
                    <div>
                      <p className="text-xs font-bold text-white">DKIM & SPF Authorization</p>
                      <p className="text-[11px] text-[#A1A4AC]">
                        quantmail.in domain verified on AWS SES
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-emerald-400">
                      <svg
                        className="size-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Passed
                    </span>
                  </div>
                </div>
              </section>

              <PhoneVerificationCard />
            </div>
          )}

          {/* 4. NOTIFICATIONS TAB */}
          {activeTab === 'notifications' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <section className="rounded-2xl border border-[#282C35] bg-[#121622]/90 p-5 shadow-xl space-y-3">
                <div className="border-b border-[#282C35] pb-3">
                  <h2 className="text-sm font-bold text-white">Notification Channels</h2>
                  <p className="text-xs text-[#A1A4AC]">
                    Manage how and when you receive incoming email and calendar alerts.
                  </p>
                </div>
                <label className="flex min-h-11 items-center justify-between py-2.5 border-b border-[#282C35] cursor-pointer">
                  <div>
                    <strong className="block text-xs text-white font-bold">
                      Email Notifications
                    </strong>
                    <span className="text-[11px] text-[#A1A4AC]">
                      Receive daily digest and urgent priority forwards
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications.email}
                    onChange={(e) => updateNotif('email', e.target.checked)}
                    className="accent-[#FF8C42] rounded h-4 w-4 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                  />
                </label>

                <label className="flex min-h-11 items-center justify-between py-2.5 border-b border-[#282C35] cursor-pointer">
                  <div>
                    <strong className="block text-xs text-white font-bold">
                      Desktop Browser Notifications
                    </strong>
                    <span className="text-[11px] text-[#A1A4AC]">
                      Show instant push notifications when new emails arrive
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications.desktop}
                    onChange={(e) => updateNotif('desktop', e.target.checked)}
                    className="accent-[#FF8C42] rounded h-4 w-4 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                  />
                </label>

                <label className="flex min-h-11 items-center justify-between py-2.5 border-b border-[#282C35] cursor-pointer">
                  <div>
                    <strong className="block text-xs text-white font-bold">Sound Alerts</strong>
                    <span className="text-[11px] text-[#A1A4AC]">
                      Play subtle haptic chime on incoming mail
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications.sound}
                    onChange={(e) => updateNotif('sound', e.target.checked)}
                    className="accent-[#FF8C42] rounded h-4 w-4 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                  />
                </label>

                <label className="flex min-h-11 items-center justify-between py-2.5 cursor-pointer">
                  <div>
                    <strong className="block text-xs text-white font-bold">
                      Direct Mentions Only
                    </strong>
                    <span className="text-[11px] text-[#A1A4AC]">
                      Only trigger alerts when you are in To/CC or specifically @mentioned
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications.mentionsOnly}
                    onChange={(e) => updateNotif('mentionsOnly', e.target.checked)}
                    className="accent-[#FF8C42] rounded h-4 w-4 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                  />
                </label>
              </section>
            </div>
          )}

          {/* 5. APPEARANCE TAB */}
          {activeTab === 'appearance' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <section className="rounded-2xl border border-[#282C35] bg-[#121622]/90 p-5 shadow-xl space-y-4">
                <div className="border-b border-[#282C35] pb-3">
                  <h2 className="text-sm font-bold text-white">Theme & Palette</h2>
                  <p className="text-xs text-[#A1A4AC]">
                    Select your workspace aesthetic and dark mode level.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { key: 'dark', label: 'Obsidian OLED', bg: 'bg-[#090A0C]' },
                    { key: 'midnight', label: 'Midnight Blue', bg: 'bg-[#0f172a]' },
                    { key: 'light', label: 'Clean White', bg: 'bg-[#F5F5F5] text-[#111318]' },
                    { key: 'system', label: 'System Match', bg: 'bg-[#111318]' },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => changeTheme(item.key as Theme)}
                      className={`p-3.5 rounded-2xl border text-left transition-all ${
                        theme === item.key
                          ? 'border-[#FF8C42] ring-1 ring-[#FF8C42]'
                          : 'border-[#282C35] hover:border-[#3A404D]'
                      } ${item.bg}`}
                    >
                      <span className="text-xs font-bold block">{item.label}</span>
                      <span className="text-[10px] opacity-70">
                        {theme === item.key ? 'Active' : 'Select'}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-[#282C35] bg-[#121622]/90 p-5 shadow-xl space-y-4">
                <div className="border-b border-[#282C35] pb-3">
                  <h2 className="text-sm font-bold text-white">Accent Highlight</h2>
                  <p className="text-xs text-[#A1A4AC]">
                    Primary brand color across buttons and active tabs.
                  </p>
                </div>
                <div className="flex items-center gap-3">
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

              <section className="rounded-2xl border border-[#282C35] bg-[#121622]/90 p-5 shadow-xl space-y-4">
                <div className="border-b border-[#282C35] pb-3">
                  <h2 className="text-sm font-bold text-white">Density Spacing</h2>
                  <p className="text-xs text-[#A1A4AC]">
                    Adjust spacing for compact or spacious layouts.
                  </p>
                </div>
                <div className="flex gap-3">
                  {(['comfortable', 'compact'] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => changeDensity(item)}
                      className={`px-4 py-2 rounded-xl border text-xs font-semibold capitalize transition-colors ${
                        density === item
                          ? 'border-[#FF8C42] bg-[#FF8C42]/15 text-[#FF8C42]'
                          : 'border-[#282C35] text-[#A1A4AC] hover:text-white'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* 6. KEYBOARD SHORTCUTS TAB */}
          {activeTab === 'keyboard' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <section className="rounded-2xl border border-[#282C35] bg-[#121622]/90 p-5 shadow-xl">
                <div className="border-b border-[#282C35] pb-3 mb-3">
                  <h2 className="text-sm font-bold text-white">Keyboard Navigation Shortcuts</h2>
                  <p className="text-xs text-[#A1A4AC]">
                    High-efficiency keyboard shortcuts to fly through your inbox.
                  </p>
                </div>
                <div className="divide-y divide-[#282C35]">
                  {SHORTCUTS.map(([keys, action]) => (
                    <div key={keys} className="flex items-center justify-between py-2.5">
                      <span className="text-xs font-medium text-white">{action}</span>
                      <kbd className="rounded-lg border border-[#3A404D] bg-[#111318] px-2 py-1 font-mono text-[11px] text-[#FF8C42]">
                        {keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </main>
      </PageTransition>
    </AppShell>
  );
}
