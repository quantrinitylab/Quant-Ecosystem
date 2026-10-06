'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { spring } from '@quant/brand';
import { AnimatedPage, AppShell, Sidebar } from '@quant/shared-ui';
import { ErrorState } from '@quant/shared-ui';
import type { SidebarItem } from '@quant/shared-ui';
import { useBrandName } from '../components/BrandProvider';
import { useTheme } from '../providers/theme-provider';
import { useAIChat } from '../hooks/useAIChat';
import { useModelSelector } from '../hooks/useModelSelector';
import { useUsageStats } from '../hooks/useUsageStats';
import { useConversationSearch } from '../hooks/useConversationSearch';
import { ModelSelector } from '../components/ModelSelector';
import { ExportMenu } from '../components/ExportMenu';
import { AgenticMessage } from '../components/AgenticMessage';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { PersonaSelector } from '../components/PersonaSelector';
import type { Persona } from '../components/PersonaSelector';
import {
  getAuthToken,
  getAuthUser,
  clearAuthSession,
  savePreservedChatState,
  type AuthUser,
} from '../lib/auth';
import { OnboardingHero } from '../components/OnboardingHero';
import type { WorkCanvasDocument } from '../components/WorkCanvasPanel';
import type { CanvasArtifact } from '../types/agent-mode';
// P1-3 (slow first paint): interaction-only heavy panels are code-split out of
// the initial page bundle and load on demand. None of them render on first
// paint (agent terminal: agent-mode only; canvas: closed by default; voice
// modal: returns null until opened), so ssr:false is safe here.
const AgentCodeTerminal = dynamic(
  () => import('../components/AgentCodeTerminal').then((m) => m.AgentCodeTerminal),
  { ssr: false },
);
const WorkCanvasPanel = dynamic(
  () => import('../components/WorkCanvasPanel').then((m) => m.WorkCanvasPanel),
  { ssr: false },
);
const VoiceModeModal = dynamic(() => import('../components/voice').then((m) => m.VoiceModeModal), {
  ssr: false,
});
import { HeroPromptBento } from '../components/chat/HeroPromptBento';

export default function AIPage() {
  const brandName = useBrandName();
  const { resolvedTheme } = useTheme();
  const { models, currentModel, switchModel } = useModelSelector();
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    isStreaming,
    conversations,
    activeConversation,
    createConversation,
    selectConversation,
    switchModel: hookSwitchModel,
    setFeedback,
    retryLastMessage,
    stopStreaming,
  // Defensive: currentModel is guaranteed non-null by useModelSelector, but
  // optional chaining here ensures a future regression can never again throw
  // "Cannot read properties of undefined" during render (P0 Sept 2026 crash).
  } = useAIChat({ defaultModel: currentModel?.id ?? 'gpt-4o' });

  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [pinnedConversations, setPinnedConversations] = useState<Set<string>>(new Set());
  const [activePersona, setActivePersona] = useState<Persona | null>(null);
  const [customPersonas, setCustomPersonas] = useState<Persona[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; size: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // QuantAI Mode: ChatGPT / Claude conversational chat vs Claude Code / Codex agentic CLI
  const [activeMode, setActiveMode] = useState<'chat' | 'agent'>('chat');
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);
  const [currentArtifact, setCurrentArtifact] = useState<CanvasArtifact | null>(null);
  const [activeCanvasDoc, setActiveCanvasDoc] = useState<WorkCanvasDocument | null>(null);

  // Synchronize generated artifact into active canvas document
  useEffect(() => {
    if (currentArtifact) {
      setActiveCanvasDoc({
        id: currentArtifact.id,
        title: currentArtifact.title,
        type: currentArtifact.type === 'markdown' ? 'doc' : 'code',
        content: currentArtifact.markdown || currentArtifact.code,
        language: currentArtifact.language,
        lastModified: currentArtifact.createdAt,
        version: 1,
      });
      setIsCanvasOpen(true);
    }
  }, [currentArtifact]);

  const router = useRouter();

  // Authentication & Guest State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [dismissGuestBanner, setDismissGuestBanner] = useState(false);
  const [forceShowUI, setForceShowUI] = useState(false);
  const [ignoreError, setIgnoreError] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isLoading) {
      timer = setTimeout(() => setForceShowUI(true), 2000);
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    try {
      const token = getAuthToken();
      if (token) {
        setIsAuthenticated(true);
        setAuthUser(getAuthUser());
      }
      // Guest mode was removed: the backend has no guest path, so every guest
      // message 401'd and surfaced as a fake assistant error. Clear stale flags.
      localStorage.removeItem('quantai_guest');
    } catch {}
    setHasCheckedAuth(true);
  }, []);

  const handleNavigateToLogin = useCallback(() => {
    // Preserve current chat state so returning after login maintains full conversation
    if (conversations.length > 0) {
      savePreservedChatState({
        conversations,
        activeConversationId: activeConversation?.id ?? null,
        savedAt: new Date().toISOString(),
      });
    }
    router.push('/login');
  }, [conversations, activeConversation, router]);

  const handleSignOut = useCallback(() => {
    clearAuthSession();
    setIsAuthenticated(false);
    setAuthUser(null);
    setShowProfileMenu(false);
  }, []);

  const handleQuantSSO = useCallback(() => {
    // Preserve current chat state before redirecting to SSO
    if (conversations.length > 0) {
      savePreservedChatState({
        conversations,
        activeConversationId: activeConversation?.id ?? null,
        savedAt: new Date().toISOString(),
      });
    }
    try {
      const stored =
        localStorage.getItem('token') ||
        localStorage.getItem('quant_token') ||
        localStorage.getItem('quantchat_access_token');
      if (stored) {
        localStorage.setItem('token', stored);
        setIsAuthenticated(true);
        setAuthUser(getAuthUser());
        return;
      }
    } catch {}
    const returnTo = encodeURIComponent(window.location.href);
    window.location.href = `https://quantmail.in/login?returnTo=${returnTo}`;
  }, [conversations, activeConversation]);

  // Guest chat was removed (P0-2, 2026-10-06): the stream endpoint requires
  // auth, so every guest message returned 401 and showed as a fake assistant
  // "Sorry, I encountered an error." Chat now requires sign-in.
  // Sends while signed out route to /login instead of hitting the API.
  const sendMessageAuthed = useCallback(
    (text: string) => {
      if (!isAuthenticated) {
        handleNavigateToLogin();
        return;
      }
      return sendMessage(text);
    },
    [isAuthenticated, handleNavigateToLogin, sendMessage],
  );

  const handleModelSwitch = (modelId: string) => {
    switchModel(modelId);
    hookSwitchModel(modelId);
  };

  const handlePersonaSelect = useCallback((persona: Persona) => {
    setActivePersona(persona);
  }, []);

  const handleCreatePersona = useCallback((data: Omit<Persona, 'id'>) => {
    const newPersona: Persona = { ...data, id: `custom-${Date.now()}` };
    setCustomPersonas((prev) => [...prev, newPersona]);
    setActivePersona(newPersona);
  }, []);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
    if (e.target) e.target.value = '';
  }, []);

  const handleFileAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const size =
        file.size < 1024
          ? `${file.size}B`
          : file.size < 1048576
            ? `${(file.size / 1024).toFixed(1)}KB`
            : `${(file.size / 1048576).toFixed(1)}MB`;
      setAttachedFile({ name: file.name, size });
    }
    if (e.target) e.target.value = '';
  }, []);

  // Paste image from clipboard
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  // Server-side conversation search (title + message content) when typing.
  const {
    results: searchResults,
    isSearching: isSearchingConversations,
    active: searchActive,
  } = useConversationSearch(sidebarSearch);

  // Group conversations by date
  const groupedConversations = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 604800000);

    const filtered = conversations.filter(
      (c) => !sidebarSearch || c.title.toLowerCase().includes(sidebarSearch.toLowerCase()),
    );

    const groups: { label: string; items: typeof filtered }[] = [
      { label: 'Pinned', items: [] },
      { label: 'Today', items: [] },
      { label: 'Yesterday', items: [] },
      { label: 'This Week', items: [] },
      { label: 'Older', items: [] },
    ];

    for (const conv of filtered) {
      if (pinnedConversations.has(conv.id)) {
        groups[0].items.push(conv);
        continue;
      }
      const date = new Date(conv.updatedAt);
      if (date >= today) groups[1].items.push(conv);
      else if (date >= yesterday) groups[2].items.push(conv);
      else if (date >= weekAgo) groups[3].items.push(conv);
      else groups[4].items.push(conv);
    }

    return groups.filter((g) => g.items.length > 0);
  }, [conversations, sidebarSearch, pinnedConversations]);

  // Build sidebar items from grouped conversations
  const sidebarItems: SidebarItem[] = useMemo(() => {
    const items: SidebarItem[] = [
      { id: 'new-chat', label: 'New Chat', icon: <span>➕</span>, onClick: createConversation },
    ];

    // While searching, show flat server-side results (title + message content).
    if (searchActive) {
      items.push({
        id: 'search-header',
        label: isSearchingConversations ? 'Searching…' : `Results (${searchResults.length})`,
        icon: <span>🔍</span>,
      });
      for (const conv of searchResults) {
        items.push({
          id: conv.id,
          label: conv.title || 'Untitled',
          icon: <span>💬</span>,
          active: activeConversation?.id === conv.id,
          onClick: () => selectConversation(conv.id),
        });
      }
      return items;
    }

    for (const group of groupedConversations) {
      items.push({ id: `group-${group.label}`, label: group.label, icon: <span /> });
      for (const conv of group.items) {
        items.push({
          id: conv.id,
          label: conv.title || 'New Chat',
          icon: pinnedConversations.has(conv.id) ? <span>📌</span> : <span>💬</span>,
          active: activeConversation?.id === conv.id,
          onClick: () => selectConversation(conv.id),
        });
      }
    }

    return items;
  }, [
    groupedConversations,
    activeConversation,
    createConversation,
    selectConversation,
    pinnedConversations,
    searchActive,
    searchResults,
    isSearchingConversations,
  ]);

  if (isLoading && !forceShowUI) {
    return (
      <AppShell
        theme={resolvedTheme}
        sidebar={<Sidebar items={[]} header={<h2 className="text-lg font-semibold">{brandName}</h2>} />}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-[var(--quant-border)]">
            <LoadingSkeleton variant="model-card" count={1} />
          </div>
          <div className="flex-1">
            <LoadingSkeleton variant="chat-message" count={3} />
          </div>
        </div>
      </AppShell>
    );
  }

  if (error && !ignoreError) {
    return (
      <AppShell
        theme={resolvedTheme}
        sidebar={<Sidebar items={[]} header={<h2 className="text-lg font-semibold">{brandName}</h2>} />}
      >
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <ErrorState message={error} onRetry={() => window.location.reload()} />
          <button
            type="button"
            onClick={handleNavigateToLogin}
            className="px-4 py-2 rounded-lg bg-[var(--quant-surface-hover)] border border-[var(--quant-border)] text-sm hover:bg-[var(--quant-surface)] transition-colors"
          >
            Sign In
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
        theme={resolvedTheme}
      sidebar={
        <Sidebar
          items={sidebarItems}
          header={
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">{brandName}</h2>
              <div className="relative">
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--foreground-secondary)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  placeholder="Search conversations..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-[var(--quant-border)] bg-[var(--quant-surface)] text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--quant-accent)]"
                />
              </div>
            </div>
          }
          footer={
            <div className="px-3 py-2 space-y-2 border-t border-[var(--quant-border)] text-xs">
              <div className="text-[var(--foreground-secondary)] flex items-center justify-between">
                <span>Model:</span>
                <span className="font-medium text-[var(--foreground)] truncate ml-1">
                  {currentModel.icon} {currentModel.name}
                </span>
              </div>
              {isAuthenticated ? (
                <div className="flex items-center justify-between pt-1 border-t border-[var(--quant-border)]/50">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    <span className="truncate text-[11px] text-[var(--foreground)] font-medium">
                      {authUser?.email || 'Quant Member'}
                    </span>
                  </div>
                  <Link
                    href="/profile"
                    className="text-[10px] text-violet-400 hover:text-violet-300 font-semibold uppercase tracking-wider shrink-0"
                  >
                    Profile
                  </Link>
                </div>
              ) : (
                <div className="flex items-center justify-between pt-1 border-t border-[var(--quant-border)]/50">
                  <span className="text-[11px] text-zinc-400">Sign in to chat</span>
                  <button
                    type="button"
                    onClick={handleNavigateToLogin}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
                  >
                    Sign In →
                  </button>
                </div>
              )}
            </div>
          }
        />
      }
    >
      <AnimatedPage>
        <motion.div
          className="flex flex-col h-full"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', ...spring.gentle }}
        >
          {/* Header */}
          <div className="p-4 border-b border-[var(--quant-border)] bg-[var(--quant-surface)]/60 backdrop-blur-sm">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-lg font-semibold text-[var(--foreground)]">{brandName}</h1>

              {/* Mode Switcher: 💬 Chat Mode vs ⚡ Agent / Code Mode */}
              <div className="flex items-center gap-1 bg-[var(--quant-surface-hover)] p-1 rounded-xl border border-[var(--quant-border)]">
                <button
                  type="button"
                  onClick={() => setActiveMode('chat')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeMode === 'chat'
                      ? 'bg-[var(--quant-accent)] text-white shadow-sm'
                      : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                  }`}
                  aria-pressed={activeMode === 'chat'}
                  title="ChatGPT / Claude Conversational Chat"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                  </svg>
                  <span className="hidden sm:inline">Chat Mode</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('agent')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeMode === 'agent'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                  }`}
                  aria-pressed={activeMode === 'agent'}
                  title="Claude Code / Codex / Replit Agentic Terminal"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                  <span className="hidden sm:inline">Agent / Code Mode</span>
                </button>
              </div>

              <ModelSelector
                currentModel={currentModel}
                models={models}
                onSelect={handleModelSwitch}
              />

              {activeMode === 'chat' && (
                <PersonaSelector
                  personas={customPersonas}
                  activePersona={activePersona}
                  onSelect={handlePersonaSelect}
                  onCreateCustom={handleCreatePersona}
                />
              )}

              <div className="ml-auto flex items-center gap-2">
                {/* Split-Screen Canvas / Artifacts Toggle */}
                <button
                  type="button"
                  onClick={() => setIsCanvasOpen(!isCanvasOpen)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    isCanvasOpen
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                      : 'border-[var(--quant-border)] bg-[var(--quant-surface)] hover:bg-[var(--quant-surface-hover)] text-[var(--foreground)]'
                  }`}
                  title="Toggle Split-Screen Canvas / Artifacts Panel"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.995 15.995 0 00-4.648 4.764m3.42 3.42a15.952 15.952 0 01-5.339 2.03" />
                  </svg>
                  <span className="hidden md:inline">
                    {isCanvasOpen ? 'Close Canvas' : 'Work Canvas'}
                  </span>
                  {(currentArtifact || activeCanvasDoc) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </button>

                {/* Authentication surface / User Profile in Header */}
                {isAuthenticated ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowProfileMenu(!showProfileMenu)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 text-[var(--foreground)] text-xs font-semibold transition-all cursor-pointer"
                      title="User Profile & Account Menu"
                    >
                      <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-violet-500 to-indigo-600 flex items-center justify-center text-[10px] text-white font-bold">
                        {(authUser?.name || authUser?.email || 'Q').charAt(0).toUpperCase()}
                      </div>
                      <span className="hidden sm:inline truncate max-w-[120px]">
                        {authUser?.name || authUser?.email?.split('@')[0] || 'Member'}
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    </button>

                    {showProfileMenu && (
                      <div className="absolute right-0 mt-1.5 w-56 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] shadow-2xl p-2 z-50 text-xs">
                        <div className="px-3 py-2 border-b border-[var(--quant-border)]">
                          <div className="font-semibold text-[var(--foreground)] truncate">
                            {authUser?.name || 'Quant Member'}
                          </div>
                          <div className="text-[11px] text-[var(--foreground-secondary)] truncate">
                            {authUser?.email || 'user@quantmail.in'}
                          </div>
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            ACTIVE • CLOUD SYNC
                          </span>
                        </div>
                        <div className="py-1">
                          <Link
                            href="/profile"
                            onClick={() => setShowProfileMenu(false)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--quant-surface-hover)] text-[var(--foreground)] transition-colors"
                          >
                            <span>👤</span>
                            <span>Your Profile & Stats</span>
                          </Link>
                        </div>
                        <div className="pt-1 border-t border-[var(--quant-border)]">
                          <button
                            type="button"
                            onClick={handleSignOut}
                            className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors cursor-pointer"
                          >
                            <span>🚪</span>
                            <span>Sign Out</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleNavigateToLogin}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#8B5CF6] to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
                      title="Sign In to save chats and unlock cloud persistence"
                    >
                      <span>🔒</span>
                      <span>Sign In</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleQuantSSO}
                      className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] hover:bg-[var(--quant-surface-hover)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] text-xs font-semibold transition-all cursor-pointer"
                      title="Quick SSO with QuantMail"
                    >
                      <span>⚡</span>
                      <span>SSO</span>
                    </button>
                  </div>
                )}

                <ExportMenu conversation={activeConversation} messages={messages} />

                {/* Prominent Start Voice (Waveform Microphone) Button — Advanced Voice Mode */}
                <button
                  type="button"
                  onClick={() => setVoiceActive(true)}
                  aria-label={voiceActive ? 'Voice mode active' : 'Start Voice Mode'}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer shadow-sm ${
                    voiceActive
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-rose-950/30'
                      : 'bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-violet-400/30 shadow-violet-950/20'
                  }`}
                  title="Real-Time Advanced Voice Mode (ChatGPT Parity)"
                >
                  <span className="flex items-center gap-0.5 h-3.5" aria-hidden="true">
                    <span className="w-0.5 h-2 rounded-full bg-current animate-pulse" />
                    <span className="w-0.5 h-3.5 rounded-full bg-current animate-pulse" />
                    <span className="w-0.5 h-2.5 rounded-full bg-current animate-pulse" />
                    <span className="w-0.5 h-1.5 rounded-full bg-current" />
                  </span>
                  <span className="text-xs">🎙️</span>
                  <span className="hidden sm:inline font-semibold">
                    {voiceActive ? 'Voice Active' : 'Start Voice'}
                  </span>
                </button>

              </div>
            </div>
            <StatsHeader />
            {activePersona && activeMode === 'chat' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-2 flex items-center gap-2 text-xs text-[var(--foreground-secondary)]"
              >
                <span>{activePersona.icon}</span>
                <span>Active: {activePersona.name}</span>
              </motion.div>
            )}
          </div>

          {/* Main Content Area: Split-Screen Canvas support */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Panel: Chat Mode or Agent Mode Terminal */}
            <div
              className={`flex-1 flex flex-col min-w-0 transition-all ${
                isCanvasOpen ? 'w-full lg:w-1/2' : 'w-full'
              }`}
            >
              {/* Unauthenticated Onboarding Hero prompt */}
              {!isAuthenticated && hasCheckedAuth && (
                <div className="p-4 border-b border-[var(--quant-border)] bg-[var(--quant-surface)]/30 overflow-y-auto max-h-[60vh]">
                  <OnboardingHero
                    onContinueQuantSSO={handleQuantSSO}
                    onSignIn={handleNavigateToLogin}
                  />
                </div>
              )}

              {/* Sign-in gate: guest chat was removed (P0-2) — chat requires a Quant account */}
              {!isAuthenticated && !dismissGuestBanner && hasCheckedAuth && (
                <div className="px-4 py-2.5 m-3 rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-950/40 via-zinc-900/60 to-violet-950/30 backdrop-blur-md flex items-center justify-between gap-3 shadow-lg shadow-violet-950/20">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-violet-500/20 text-violet-400 text-xs shrink-0">
                      🔒
                    </span>
                    <div className="text-xs text-zinc-300 truncate">
                      <span className="font-semibold text-white">Sign in to chat with Quanty:</span>{' '}
                      <span className="text-zinc-400 hidden sm:inline">
                        chat requires a Quant account — sign in to start a conversation.
                      </span>
                      <span className="text-zinc-400 sm:hidden">
                        Chat requires sign-in.
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleNavigateToLogin}
                      className="px-3 py-1 rounded-lg bg-gradient-to-r from-[#8B5CF6] to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => setDismissGuestBanner(true)}
                      className="text-zinc-400 hover:text-zinc-200 p-1 text-xs cursor-pointer"
                      aria-label="Dismiss banner"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {activeMode === 'chat' ? (
                <>
                  {/* Chat Messages */}
                  <ChatMessages
                    messages={messages}
                    isStreaming={isStreaming}
                    onFeedback={setFeedback}
                    onRegenerate={retryLastMessage}
                    onSelectPrompt={(text) => sendMessageAuthed(text)}
                    onStartVoice={() => setVoiceActive(true)}
                    onOpenCanvas={() => setIsCanvasOpen(true)}
                    onAttachFile={() => fileInputRef.current?.click()}
                  />

                  {/* Multi-modal input area */}
                  {isStreaming && (
                    <div className="flex justify-center pb-1">
                      <button
                        type="button"
                        onClick={stopStreaming}
                        className="text-xs px-3 py-1 rounded-full border border-[var(--quant-border)] bg-[var(--quant-surface)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
                      >
                        ◼ Stop generating
                      </button>
                    </div>
                  )}
                  {/* Guest chat removed (P0-2): signed-out users get a clear
                      sign-in gate instead of a chat box that 401s. */}
                  {isAuthenticated ? (
                    <ChatInput
                      onSend={sendMessageAuthed}
                      isStreaming={isStreaming}
                      imagePreview={imagePreview}
                      attachedFile={attachedFile}
                      voiceRecording={voiceRecording}
                      onImageUpload={() => imageInputRef.current?.click()}
                      onFileAttach={() => fileInputRef.current?.click()}
                      onVoiceToggle={() => setVoiceRecording(!voiceRecording)}
                      onClearImage={() => setImagePreview(null)}
                      onClearFile={() => setAttachedFile(null)}
                      currentModel={currentModel.name}
                      onStop={stopStreaming}
                    />
                  ) : (
                    <div className="p-4">
                      <button
                        type="button"
                        onClick={handleNavigateToLogin}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-violet-500/20 transition-all cursor-pointer"
                      >
                        <span>🔒</span>
                        <span>Sign in to chat with Quanty</span>
                      </button>
                    </div>
                  )}

                  {/* Hidden file inputs */}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileAttach}
                    className="hidden"
                  />

                  {/* Agentic messages panel */}
                  <AnimatePresence>
                    {messages.some((m) => m.toolCalls && m.toolCalls.length > 0) && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ type: 'spring', ...spring.snappy }}
                        className="border-t border-[var(--quant-border)] overflow-hidden"
                      >
                        <div className="p-4 space-y-3 overflow-y-auto max-h-60">
                          {messages
                            .filter(
                              (m) =>
                                m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0,
                            )
                            .map((m) => (
                              <AgenticMessage
                                key={m.id}
                                content={m.content}
                                toolCalls={m.toolCalls || []}
                                reasoning={m.reasoning}
                              />
                            ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                /* Agent / Code Mode Terminal (Claude Code + Codex Parity) */
                <AgentCodeTerminal
                  currentModelName={currentModel.name}
                  onArtifactGenerated={(artifact) => {
                    setCurrentArtifact(artifact);
                    setIsCanvasOpen(true);
                  }}
                  onOpenCanvas={() => setIsCanvasOpen(true)}
                />
              )}
            </div>

            {/* Right Panel: Split-Screen Canvas / Artifacts Panel */}
            {isCanvasOpen && (
              <div className="w-full lg:w-1/2 border-l border-[var(--quant-border)] h-full overflow-hidden">
                <WorkCanvasPanel
                  workspaceMode="work"
                  onWorkspaceModeChange={(mode) => {
                    if (mode === 'chat') {
                      setIsCanvasOpen(false);
                    }
                  }}
                  activeDocument={activeCanvasDoc}
                  onDocumentChange={(doc) => setActiveCanvasDoc(doc)}
                  isStreaming={isStreaming}
                  onSendToChat={(prompt) => sendMessageAuthed(prompt)}
                  onClose={() => setIsCanvasOpen(false)}
                />
              </div>
            )}
          </div>

          {/* Real-Time Advanced Voice Mode Parity (Sovereign Personas + 3D Animated Orb) */}
          <VoiceModeModal
            isOpen={voiceActive}
            onClose={() => setVoiceActive(false)}
            onSendMessage={(text) => sendMessageAuthed(text)}
          />
        </motion.div>
      </AnimatedPage>
    </AppShell>
  );
}

/* ============ Chat Messages Area ============ */

function ChatMessages({
  messages,
  isStreaming,
  onFeedback,
  onRegenerate,
  onSelectPrompt,
  onStartVoice,
  onOpenCanvas,
  onAttachFile,
}: {
  messages: Array<{
    id: string;
    role: string;
    content: string;
    timestamp: string;
    isStreaming?: boolean;
    pending?: boolean;
    feedback?: 'POSITIVE' | 'NEGATIVE' | null;
  }>;
  isStreaming: boolean;
  onFeedback?: (messageId: string, value: 'POSITIVE' | 'NEGATIVE') => void;
  onRegenerate?: () => void;
  onSelectPrompt?: (text: string) => void;
  onStartVoice?: () => void;
  onOpenCanvas?: () => void;
  onAttachFile?: () => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isPinnedToBottomRef = useRef(true);
  const prefersReducedMotion = useReducedMotion();

  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]!.role === 'assistant') return messages[i]!.id;
    }
    return null;
  }, [messages]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isPinnedToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);

  useEffect(() => {
    if (!isPinnedToBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [messages, prefersReducedMotion]);

  if (messages.length === 0) {
    return (
      <HeroPromptBento
        onSelectPrompt={onSelectPrompt || (() => {})}
        onStartVoice={onStartVoice || (() => {})}
        onOpenCanvas={onOpenCanvas || (() => {})}
        onAttachFile={onAttachFile || (() => {})}
      />
    );
  }

  return (
    /*
     * role="log" + aria-live is the whole screen-reader channel for a streaming
     * answer, and it was missing: tokens arrived with no announcement at all.
     * aria-atomic="false" so only appended text is read rather than the entire
     * transcript on every delta, and aria-busy marks generation in progress.
     */
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      role="log"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions text"
      aria-busy={isStreaming}
      aria-label="Conversation"
      className="flex-1 overflow-y-auto px-4 py-6"
    >
      <div className="mx-auto max-w-3xl space-y-7">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', ...spring.snappy }}
              className={msg.role === 'user' ? 'flex justify-end' : 'flex flex-col'}
            >
              {/*
               * The 'U' / 'AI' letter circles are gone. They were the one thing
               * that made this read as a toy chat rather than a tool, and they
               * were also an accessibility defect: the letters are text content,
               * so a screen reader announced "U" before every user turn. Role is
               * now carried by position and a real label.
               */}
              {msg.role === 'user' ? (
                <div className="max-w-[80%] rounded-2xl bg-[var(--quant-surface-hover)] px-4 py-2.5">
                  <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-[var(--foreground)]">
                    {msg.content}
                  </p>
                </div>
              ) : (
                /*
                 * Assistant answers run full width on the canvas with no bubble,
                 * the way Claude and ChatGPT present them. A bubble caps line
                 * length and makes code blocks and tables — the things this
                 * surface exists to show — feel boxed in.
                 */
                <>
                  <span className="mb-1.5 select-none text-xs font-medium tracking-wide text-[var(--foreground-secondary)]">
                    Quanty
                  </span>
                  <div className="text-[0.9375rem] leading-relaxed text-[var(--foreground)]">
                    <MarkdownRenderer content={msg.content} />
                    {msg.isStreaming && <StreamingCursor />}
                  </div>
                </>
              )}

              {msg.role === 'assistant' && !msg.pending && (
                <div className="mt-2 flex items-center gap-1">
                  <CopyButton text={msg.content} />
                  {onRegenerate && msg.id === lastAssistantId && !isStreaming && (
                    <button
                      type="button"
                      aria-label="Regenerate response"
                      onClick={onRegenerate}
                      className="text-xs px-1.5 py-0.5 rounded-md text-[var(--foreground-secondary)] hover:bg-[var(--quant-surface-hover)] transition-colors"
                    >
                      ↻
                    </button>
                  )}
                  {onFeedback && !msg.id.startsWith('tmp-') && (
                    <>
                      <button
                        type="button"
                        aria-label="Good response"
                        aria-pressed={msg.feedback === 'POSITIVE'}
                        onClick={() => onFeedback(msg.id, 'POSITIVE')}
                        className={`text-xs px-1.5 py-0.5 rounded-md transition-colors ${
                          msg.feedback === 'POSITIVE'
                            ? 'bg-emerald-500/20 text-emerald-500'
                            : 'text-[var(--foreground-secondary)] hover:bg-[var(--quant-surface-hover)]'
                        }`}
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        aria-label="Bad response"
                        aria-pressed={msg.feedback === 'NEGATIVE'}
                        onClick={() => onFeedback(msg.id, 'NEGATIVE')}
                        className={`text-xs px-1.5 py-0.5 rounded-md transition-colors ${
                          msg.feedback === 'NEGATIVE'
                            ? 'bg-red-500/20 text-red-500'
                            : 'text-[var(--foreground-secondary)] hover:bg-[var(--quant-surface-hover)]'
                        }`}
                      >
                        👎
                      </button>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

/* ============ Copy Button ============ */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — ignore silently.
    }
  }, [text]);

  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : 'Copy message'}
      onClick={handleCopy}
      className={`text-xs px-1.5 py-0.5 rounded-md transition-colors ${
        copied
          ? 'bg-emerald-500/20 text-emerald-500'
          : 'text-[var(--foreground-secondary)] hover:bg-[var(--quant-surface-hover)]'
      }`}
    >
      {copied ? '✓' : '⧉'}
    </button>
  );
}

/* ============ Streaming Cursor ============ */

function StreamingCursor() {
  const prefersReducedMotion = useReducedMotion();

  // `ease: 'steps(2)'` was not a value framer-motion accepts, so the blink
  // silently fell back to its default easing — a soft fade rather than the
  // terminal-style tick it was written to be. `steps(2, 'start')` is the real
  // spelling. Under reduced motion the caret is shown solid instead of removed,
  // because it is the only signal that an answer is still arriving.
  if (prefersReducedMotion) {
    return (
      <span
        className="ml-0.5 inline-block h-[1.05em] w-0.5 translate-y-[0.15em] bg-[var(--quant-accent)]"
        aria-hidden="true"
      />
    );
  }

  return (
    <motion.span
      className="ml-0.5 inline-block h-[1.05em] w-0.5 translate-y-[0.15em] bg-[var(--quant-accent)]"
      animate={{ opacity: [1, 1, 0, 0] }}
      transition={{ duration: 1.06, repeat: Infinity, ease: 'linear', times: [0, 0.5, 0.5, 1] }}
      aria-hidden="true"
    />
  );
}

/* ============ Stats Header (real, activity-derived) ============ */

function StatsHeader() {
  const { stats, isLoading, error } = useUsageStats();

  // Stay quiet on error or before the first load resolves with no data — never
  // show fabricated numbers.
  if (error) return null;

  const fmt = (n: number) => n.toLocaleString();
  const placeholder = isLoading && !stats;

  return (
    <div className="mt-3 flex items-center gap-3 text-xs" aria-label="Your QuantAI activity">
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[var(--quant-surface)] border border-[var(--quant-border)]">
        <span aria-hidden="true">🔥</span>
        <span className="font-mono text-emerald-500">
          {placeholder ? '—' : (stats?.streakDays ?? 0)}
        </span>
        <span className="text-[var(--foreground-secondary)]">day streak</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-amber-500">{placeholder ? '—' : fmt(stats?.xp ?? 0)}</span>
        <span className="text-[var(--foreground-secondary)]">XP</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-purple-500">
          LVL {placeholder ? '—' : (stats?.level ?? 1)}
        </span>
      </div>
      <div className="hidden sm:flex items-center gap-1.5 text-[var(--foreground-secondary)]">
        <span className="font-mono">{placeholder ? '—' : fmt(stats?.totalConversations ?? 0)}</span>
        <span>chats</span>
      </div>
    </div>
  );
}

/* ============ Chat Input with Multi-modal ============ */

interface ChatInputProps {
  onSend: (content: string) => void;
  isStreaming: boolean;
  imagePreview: string | null;
  attachedFile: { name: string; size: string } | null;
  voiceRecording: boolean;
  onImageUpload: () => void;
  onFileAttach: () => void;
  onVoiceToggle: () => void;
  onClearImage: () => void;
  onClearFile: () => void;
  currentModel?: string;
  onStop?: () => void;
}

function ChatInput({
  onSend,
  isStreaming,
  imagePreview,
  attachedFile,
  voiceRecording,
  onImageUpload,
  onFileAttach,
  onVoiceToggle,
  onClearImage,
  onClearFile,
  currentModel,
  onStop,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // Quanty Feed "Discuss" handoff: pre-fill the composer with the feed post
  // context so the user reviews it before sending (never auto-sends).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('quanty:feed-discuss');
      if (!raw) return;
      sessionStorage.removeItem('quanty:feed-discuss');
      const parsed = JSON.parse(raw) as { openingPrompt?: string };
      if (parsed?.openingPrompt) {
        setInput(parsed.openingPrompt);
        textareaRef.current?.focus();
      }
    } catch {
      /* sessionStorage unavailable or corrupt — ignore */
    }
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (input.trim() && !isStreaming) {
        onSend(input.trim());
        setInput('');
        onClearImage();
        onClearFile();
        textareaRef.current?.focus();
      }
    },
    [input, isStreaming, onSend, onClearImage, onClearFile],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    },
    [handleSubmit],
  );

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 192) + 'px';
  }, [input]);

  // Trailing button state: mic (empty) -> send (has text) -> stop (streaming)
  const trailingState: 'mic' | 'send' | 'stop' = isStreaming ? 'stop' : input.trim() ? 'send' : 'mic';

  const handleTrailingClick = () => {
    if (trailingState === 'stop' && onStop) {
      onStop();
    } else if (trailingState === 'send') {
      handleSubmit(new Event('submit') as unknown as React.FormEvent);
    } else {
      onVoiceToggle();
    }
  };

  return (
    <div className="border-t border-[var(--quant-border)] px-3 sm:px-4 pt-3 pb-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      <div className="mx-auto max-w-3xl">
        {/* Attachment chips / recording indicator row */}
        <AnimatePresence>
          {(imagePreview || attachedFile || voiceRecording) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-2 flex items-center gap-2 flex-wrap"
            >
              {imagePreview && (
                <div className="relative group">
                  <img
                    src={imagePreview}
                    alt="Upload preview"
                    className="h-16 w-16 object-cover rounded-xl border border-[var(--quant-border)]"
                  />
                  <button
                    type="button"
                    onClick={onClearImage}
                    aria-label="Remove image"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              {attachedFile && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[var(--quant-surface-hover)] border border-[var(--quant-border)]">
                  <svg className="w-4 h-4 text-[var(--foreground-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <span className="text-xs font-medium text-[var(--foreground)] truncate max-w-[120px]">
                    {attachedFile.name}
                  </span>
                  <span className="text-[10px] text-[var(--foreground-secondary)]">
                    {attachedFile.size}
                  </span>
                  <button
                    type="button"
                    onClick={onClearFile}
                    aria-label="Remove file"
                    className="text-[var(--foreground-secondary)] hover:text-red-500 ml-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              {voiceRecording && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30">
                  <motion.span
                    className="w-2 h-2 rounded-full bg-red-500"
                    animate={prefersReducedMotion ? {} : { scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <span className="text-xs font-medium text-red-500">
                    Listening…
                  </span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pill composer */}
        <form onSubmit={handleSubmit}>
          <div className="rounded-[24px] border border-[var(--quant-border)] bg-[var(--quant-surface)]
            focus-within:border-[var(--quant-accent)] focus-within:ring-2 focus-within:ring-[var(--quant-accent)]/25
            transition-all duration-150 cursor-text"
            onClick={() => textareaRef.current?.focus()}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything…"
              aria-label="Message Quanty"
              aria-describedby="composer-hint"
              disabled={isStreaming}
              rows={1}
              className="w-full bg-transparent resize-none outline-none px-5 pt-3.5 pb-1
                text-base text-[var(--foreground)] placeholder-[var(--foreground-secondary)]
                disabled:opacity-50 max-h-48"
            />
            {/* Action row */}
            <div className="flex items-center gap-1 px-3 pb-2.5">
              <button
                type="button"
                onClick={onImageUpload}
                aria-label="Upload image"
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--quant-surface-hover)] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
              {currentModel && (
                <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium
                  bg-[var(--quant-surface-hover)] text-[var(--foreground-secondary)] border border-[var(--quant-border)]">
                  {currentModel}
                </span>
              )}
              <div className="flex-1" />
              {/* Morphing trailing button: mic -> send -> stop */}
              <button
                type={trailingState === 'send' ? 'submit' : 'button'}
                onClick={trailingState === 'send' ? undefined : handleTrailingClick}
                disabled={trailingState === 'send' && !input.trim()}
                aria-label={trailingState === 'stop' ? 'Stop generating' : trailingState === 'send' ? 'Send message' : 'Voice input'}
                className={`size-9 rounded-full grid place-items-center shrink-0 transition-all active:scale-95 ${
                  trailingState === 'send'
                    ? 'bg-[var(--foreground)] text-[var(--quant-background)]'
                    : trailingState === 'stop'
                      ? 'bg-red-500 text-white'
                      : 'bg-[var(--quant-surface-hover)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                } disabled:opacity-40`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={trailingState}
                    initial={prefersReducedMotion ? false : { scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={prefersReducedMotion ? {} : { scale: 0.6, opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="grid place-items-center"
                  >
                    {trailingState === 'mic' && (
                      <svg className="w-4.5 h-4.5 w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                      </svg>
                    )}
                    {trailingState === 'send' && (
                      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                      </svg>
                    )}
                    {trailingState === 'stop' && (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                    )}
                  </motion.span>
                </AnimatePresence>
              </button>
            </div>
          </div>
        </form>

        <p id="composer-hint" className="mt-2 text-center text-[11px] text-[var(--foreground-secondary)]">
          <kbd className="font-sans font-medium">Enter</kbd> to send ·{' '}
          <kbd className="font-sans font-medium">Shift</kbd>+<kbd className="font-sans font-medium">Enter</kbd> for a new line
        </p>
      </div>
    </div>
  );
}