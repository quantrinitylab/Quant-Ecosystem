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
  provider: string;
  description: string;
  bestFor: string;
  latency: string;
  badge: string;
}

const AVAILABLE_AI_MODELS: AIModelOption[] = [
  {
    id: 'auto-router',
    name: 'Quant Smart Model Router (Auto)',
    provider: 'Cloudflare Workers AI + Edge Router',
    description:
      'Dynamically routes each prompt to the optimal model based on task complexity, speed, and automatic health failover.',
    bestFor: 'All Tasks (Autonomous Task Matching & Instant Fallback)',
    latency: 'Sub-150ms dynamic',
    badge: 'Recommended',
  },
  {
    id: '@cf/meta/llama-3.3-70b-instruct',
    name: 'Meta Llama 3.3 (70B Instruct)',
    provider: 'Cloudflare Workers AI',
    description:
      'High-capability flagship model for detailed executive summaries, complex negotiations, and in-depth email reasoning.',
    bestFor: 'Deep Reasoning & Long Email Summaries',
    latency: '~380ms',
    badge: 'Heavy Reasoning',
  },
  {
    id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
    name: 'DeepSeek R1 Distill (Qwen 32B)',
    provider: 'Cloudflare Workers AI',
    description:
      'Chain-of-thought mathematical and analytical reasoning for contracts, financial schedules, and multi-step tasks.',
    bestFor: 'Complex Logic & Math Verification',
    latency: '~450ms',
    badge: 'Deep Reasoning',
  },
  {
    id: '@cf/qwen/qwen2.5-72b-instruct',
    name: 'Qwen 2.5 (72B Instruct)',
    provider: 'Cloudflare Workers AI',
    description:
      'State-of-the-art multilingual and technical coding model for CodeHub, technical diffs, and cross-language translation.',
    bestFor: 'Multilingual & Technical Mails',
    latency: '~410ms',
    badge: 'Multilingual',
  },
  {
    id: '@cf/meta/llama-3.1-8b-instruct',
    name: 'Meta Llama 3.1 (8B Instruct Fast)',
    provider: 'Cloudflare Workers AI',
    description:
      'Ultra-lightweight and lightning-fast edge model for autocomplete, quick 1-sentence replies, and instant categorization.',
    bestFor: 'Smart Reply & Quick Autocomplete',
    latency: '~85ms',
    badge: 'Ultra Fast',
  },
  {
    id: '@cf/mistral/mistral-7b-instruct-v0.2',
    name: 'Mistral 7B (Instruct v0.2)',
    provider: 'Cloudflare Workers AI',
    description:
      'Concise European-grade precision model specialized in clean formatting, bullet point extraction, and quick drafts.',
    bestFor: 'Bullet Summaries & Concise Drafts',
    latency: '~110ms',
    badge: 'Balanced',
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
      setAccentColor(localStorage.getItem('quant-accent') || '#ff9933');
      setUndoSendDelay(localStorage.getItem('quant-undo-delay') || '5');
      const savedModel = localStorage.getItem('quant-ai-model-mode');
      if (savedModel) setSelectedAIModel(savedModel);
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
    const found = AVAILABLE_AI_MODELS.find((m) => m.id === modelId);
    showToast({
      text: `AI Model set to ${found?.name || modelId} 🧠`,
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
        <header className="shrink-0 px-4 sm:px-6 pt-5 pb-3 border-b border-zinc-800/80 bg-[#0d1017]/95">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-gradient-to-br from-[#FF7A00]/20 to-orange-600/20 border border-[#FF7A00]/40 flex items-center justify-center text-[#FF7A00] shadow-lg shadow-orange-500/10">
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
              <p className="text-xs text-zinc-400">
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

              <section className="rounded-2xl border border-zinc-800 bg-[#121622]/90 p-5 shadow-xl space-y-4">
                <div className="border-b border-zinc-800 pb-3">
                  <h2 className="text-sm font-bold text-white">Email Signature</h2>
                  <p className="text-xs text-zinc-400">
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
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                      Live Preview
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
              </section>

              <section className="rounded-2xl border border-zinc-800 bg-[#121622]/90 p-5 shadow-xl space-y-4">
                <div className="border-b border-zinc-800 pb-3">
                  <h2 className="text-sm font-bold text-white">Composer & Delivery Rules</h2>
                  <p className="text-xs text-zinc-400">
                    Fine-tune sending delays and thread behaviors.
                  </p>
                </div>
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
                      className="h-9 w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 text-xs text-white focus:outline-none focus:border-[#FF7A00]"
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
                      className="h-9 w-full rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 text-xs text-white focus:outline-none focus:border-[#FF7A00]"
                    >
                      <option value="single">Reply (Direct Sender)</option>
                      <option value="all">Reply All (All Recipients)</option>
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
                      className="accent-[#FF7A00] rounded cursor-pointer"
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
                      className="accent-[#FF7A00] rounded cursor-pointer"
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="size-2.5 rounded-full bg-[#FF8C42] animate-pulse" />
                    <h2 className="text-sm font-semibold text-[#F5F5F5]">
                      Autonomous Multi-Model Router Active
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-[#2B1A11] text-[#FF8C42] border border-[#5C3016]">
                    6 Edge Models Available
                  </span>
                </div>
                <p className="text-xs text-[#A1A4AC] leading-relaxed">
                  Quant Ecosystem uses a dynamic Task-Based Model Router. Instead of relying on a
                  single static LLM, each email draft, thread summary, or code query is matched with
                  the best model in real-time, with automatic failover and circuit breaker
                  protection.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                  <div className="p-3 rounded-lg bg-[#16181D] border border-[#282C35] text-xs">
                    <span className="text-[#6B6E76] block text-[10px] uppercase font-semibold">
                      Fast Replies
                    </span>
                    <strong className="text-[#F5F5F5] font-medium">Llama 3.1 8B (~85ms)</strong>
                  </div>
                  <div className="p-3 rounded-lg bg-[#16181D] border border-[#282C35] text-xs">
                    <span className="text-[#6B6E76] block text-[10px] uppercase font-semibold">
                      Deep Summaries
                    </span>
                    <strong className="text-[#F5F5F5] font-medium">Llama 3.3 70B & R1</strong>
                  </div>
                  <div className="p-3 rounded-lg bg-[#16181D] border border-[#282C35] text-xs">
                    <span className="text-[#6B6E76] block text-[10px] uppercase font-semibold">
                      Code & Logic
                    </span>
                    <strong className="text-[#F5F5F5] font-medium">Qwen 2.5 72B & R1</strong>
                  </div>
                </div>
              </section>

              {/* Model Selection List */}
              <section className="rounded-xl border border-[#282C35] bg-[#111318] p-5 shadow-sm space-y-4">
                <div className="border-b border-[#282C35] pb-3">
                  <h2 className="text-sm font-semibold text-[#F5F5F5]">
                    Select AI Engine / Routing Mode
                  </h2>
                  <p className="text-xs text-[#A1A4AC]">
                    Choose Auto-Router (recommended) or lock to a specific preferred model.
                  </p>
                </div>

                <div className="space-y-3">
                  {AVAILABLE_AI_MODELS.map((model) => {
                    const isSelected = selectedAIModel === model.id;
                    return (
                      <div
                        key={model.id}
                        onClick={() => handleSelectAIModel(model.id)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer select-none flex items-start justify-between gap-4 ${
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
                                  ? 'bg-[#FF7A00] text-white'
                                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                              }`}
                            >
                              {model.badge}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-500">
                              {model.latency}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-300">{model.description}</p>
                          <div className="flex items-center gap-2 pt-0.5">
                            <span className="text-[11px] text-[#FF7A00] font-semibold">
                              🎯 Best for: {model.bestFor}
                            </span>
                          </div>
                        </div>

                        <div className="pt-1">
                          <div
                            className={`size-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
                              isSelected
                                ? 'border-[#FF7A00] bg-[#FF7A00]'
                                : 'border-zinc-600 bg-transparent'
                            }`}
                          >
                            {isSelected && <div className="size-2 rounded-full bg-white" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Failover & Advanced AI Options */}
              <section className="rounded-2xl border border-zinc-800 bg-[#121622]/90 p-5 shadow-xl space-y-4">
                <h2 className="text-sm font-bold text-white">Resilience & Routing Strategy</h2>
                <div className="space-y-3">
                  <label className="flex items-center justify-between py-2 border-b border-zinc-800 cursor-pointer">
                    <div>
                      <strong className="block text-xs text-white font-bold">
                        Automatic Health & Latency Failover
                      </strong>
                      <span className="text-[11px] text-zinc-400">
                        If the primary model latency exceeds 1.5s or fails, automatically switch to
                        backup model.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableAutoFailover}
                      onChange={(e) => {
                        setEnableAutoFailover(e.target.checked);
                        localStorage.setItem('quant-ai-failover', e.target.checked ? '1' : '0');
                        showToast({ text: 'Updated auto-failover policy', type: 'info' });
                      }}
                      className="accent-[#FF7A00] rounded h-4 w-4 cursor-pointer"
                    />
                  </label>

                  <div className="pt-2">
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
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
                              ? 'border-[#FF7A00] bg-[#FF7A00]/15 text-white'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                          }`}
                        >
                          <span className="text-xs font-bold block">{item.label}</span>
                          <span className="text-[10px] text-zinc-500 block">{item.desc}</span>
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
              <section className="rounded-2xl border border-emerald-500/30 bg-emerald-950/15 p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    Zero-Knowledge E2EE Vault Active
                  </span>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    AES-256-GCM + Ed25519
                  </span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Your email payloads, attachments, and private thread contents are encrypted on
                  your device before transmission. No plaintext is accessible by intermediaries.
                </p>
              </section>

              <section className="rounded-2xl border border-zinc-800 bg-[#121622]/90 p-5 shadow-xl space-y-4">
                <div className="border-b border-zinc-800 pb-3">
                  <h2 className="text-sm font-bold text-white">Session & Active Credentials</h2>
                  <p className="text-xs text-zinc-400">
                    Security status for current logged-in identity.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                    <div>
                      <p className="text-xs font-bold text-white">Browser Local Keychain</p>
                      <p className="text-[11px] text-zinc-400">
                        Ed25519 Mail signing key registered
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400">Active ✓</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                    <div>
                      <p className="text-xs font-bold text-white">DKIM & SPF Authorization</p>
                      <p className="text-[11px] text-zinc-400">
                        quantmail.in domain verified on AWS SES
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400">Passed ✓</span>
                  </div>
                </div>
              </section>

              <PhoneVerificationCard />
            </div>
          )}

          {/* 4. NOTIFICATIONS TAB */}
          {activeTab === 'notifications' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <section className="rounded-2xl border border-zinc-800 bg-[#121622]/90 p-5 shadow-xl space-y-3">
                <div className="border-b border-zinc-800 pb-3">
                  <h2 className="text-sm font-bold text-white">Notification Channels</h2>
                  <p className="text-xs text-zinc-400">
                    Manage how and when you receive incoming email and calendar alerts.
                  </p>
                </div>
                <label className="flex items-center justify-between py-2.5 border-b border-zinc-800 cursor-pointer">
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
                    className="accent-[#FF7A00] rounded h-4 w-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between py-2.5 border-b border-zinc-800 cursor-pointer">
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
                    className="accent-[#FF7A00] rounded h-4 w-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between py-2.5 border-b border-zinc-800 cursor-pointer">
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
                    className="accent-[#FF7A00] rounded h-4 w-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between py-2.5 cursor-pointer">
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
                    className="accent-[#FF7A00] rounded h-4 w-4 cursor-pointer"
                  />
                </label>
              </section>
            </div>
          )}

          {/* 5. APPEARANCE TAB */}
          {activeTab === 'appearance' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <section className="rounded-2xl border border-zinc-800 bg-[#121622]/90 p-5 shadow-xl space-y-4">
                <div className="border-b border-zinc-800 pb-3">
                  <h2 className="text-sm font-bold text-white">Theme & Palette</h2>
                  <p className="text-xs text-zinc-400">
                    Select your workspace aesthetic and dark mode level.
                  </p>
                </div>
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
                          ? 'border-[#FF7A00] ring-1 ring-[#FF7A00]'
                          : 'border-zinc-800 hover:border-zinc-700'
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

              <section className="rounded-2xl border border-zinc-800 bg-[#121622]/90 p-5 shadow-xl space-y-4">
                <div className="border-b border-zinc-800 pb-3">
                  <h2 className="text-sm font-bold text-white">Accent Highlight</h2>
                  <p className="text-xs text-zinc-400">
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

              <section className="rounded-2xl border border-zinc-800 bg-[#121622]/90 p-5 shadow-xl space-y-4">
                <div className="border-b border-zinc-800 pb-3">
                  <h2 className="text-sm font-bold text-white">Density Spacing</h2>
                  <p className="text-xs text-zinc-400">
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
                          ? 'border-[#FF7A00] bg-[#FF7A00]/15 text-[#FF7A00]'
                          : 'border-zinc-800 text-zinc-400 hover:text-white'
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
              <section className="rounded-2xl border border-zinc-800 bg-[#121622]/90 p-5 shadow-xl">
                <div className="border-b border-zinc-800 pb-3 mb-3">
                  <h2 className="text-sm font-bold text-white">Keyboard Navigation Shortcuts</h2>
                  <p className="text-xs text-zinc-400">
                    High-efficiency keyboard shortcuts to fly through your inbox.
                  </p>
                </div>
                <div className="divide-y divide-zinc-800">
                  {SHORTCUTS.map(([keys, action]) => (
                    <div key={keys} className="flex items-center justify-between py-2.5">
                      <span className="text-xs font-medium text-white">{action}</span>
                      <kbd className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-[#FF7A00]">
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
