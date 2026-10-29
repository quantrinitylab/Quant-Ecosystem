'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { spring } from '@quant/brand';
import { AnimatedPage, AppShell, Sidebar } from '@quant/shared-ui';
import type { SidebarItem } from '@quant/shared-ui';
import { useBrandName } from '../components/BrandProvider';
import { SideChatsSection } from '../components/chat/SideChatsSection';
import { ChatMessages } from '../components/chat/ChatMessages';
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
import { useAuth } from '../providers/auth-provider';
import {
  getAuthToken,
  getAuthUser,
  savePreservedChatState,
  type AuthUser,
} from '../lib/auth';
import { LOGIN_REDIRECT_URL, mustRedirectToLogin } from '../lib/auth-gate';
import { QuantAIPageErrorBoundary } from '../components/QuantAIPageErrorBoundary';
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
import { ShellDrawer } from '../components/shell/ShellDrawer';
import { ShellComposer } from '../components/shell/ShellComposer';

export default function AIPage() {
  const brandName = useBrandName();
  const { resolvedTheme } = useTheme();
  const { logout: providerLogout } = useAuth();
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
    moveConversationToTopic,
    switchModel: hookSwitchModel,
    setFeedback,
    retryLastMessage,
    stopStreaming,
    aiUnavailable,
  // Defensive: currentModel is guaranteed non-null by useModelSelector, but
  // optional chaining here ensures a future regression can never again throw
  // "Cannot read properties of undefined" during render (P0 Sept 2026 crash).
  } = useAIChat({ defaultModel: currentModel?.id ?? 'quant-1' });

  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  // Side chats (Muse parity): toggle the sidebar between the date-grouped
  // "Chats" list and the topic-grouped "Side chats" section.
  const [sidebarView, setSidebarView] = useState<'chats' | 'side-chats'>('chats');
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
  // Shell navigation drawer: closed by default, toggled from the header menu
  // button (rendered only after the auth decision — never pre-auth).
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [forceShowUI, setForceShowUI] = useState(false);
  const [ignoreError, setIgnoreError] = useState(false);

  // A dismissed banner must reappear when a *new* error arrives — otherwise a
  // single dismiss would silence every future failure.
  useEffect(() => {
    if (error) setIgnoreError(false);
  }, [error]);

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

  // P0 (blank white page): safety net — if the auth check effect above never
  // fires (e.g. a render-phase error earlier in the tree, or a hung module),
  // force the auth check to complete after 5s so anonymous users
  // deterministically hit the /login redirect below instead of a dead blank
  // surface.
  useEffect(() => {
    if (hasCheckedAuth) return;
    const t = setTimeout(() => setHasCheckedAuth(true), 5000);
    return () => clearTimeout(t);
  }, [hasCheckedAuth]);

  // P0 (2026-10-10, user-locked): QuantAI requires a Quant account — guests
  // are redirected to /login instead of seeing the chat UI. returnTo keeps
  // login returning to /.
  useEffect(() => {
    if (mustRedirectToLogin(hasCheckedAuth, isAuthenticated)) {
      router.replace(LOGIN_REDIRECT_URL);
    }
  }, [hasCheckedAuth, isAuthenticated, router]);

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

  // Sign-out must go through the AuthProvider: it clears the in-memory token,
  // localStorage, AND the server-side refresh cookie, and flips the provider's
  // own isAuthenticated. The old bare clearAuthSession() left the provider
  // thinking the user was still signed in, which bounced /login straight back
  // to / — an infinite redirect loop that looked like a stuck spinner.
  const handleSignOut = useCallback(async () => {
    try {
      await providerLogout();
    } catch {
      // Server logout is best-effort; client state is still cleared below.
    }
    setIsAuthenticated(false);
    setAuthUser(null);
    setShowProfileMenu(false);
  }, [providerLogout]);

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
    (text: string, attachments?: string[]) => {
      if (!isAuthenticated) {
        handleNavigateToLogin();
        return;
      }
      return sendMessage(text, attachments);
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

  // Side chats: create a new conversation and tag it with the given topic.
  const handleNewSideChat = useCallback(
    async (topic: string) => {
      const id = await createConversation();
      if (id) {
        await moveConversationToTopic(id, topic);
      }
    },
    [createConversation, moveConversationToTopic],
  );

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

  // Pre-auth-decision render: a dark branded splash ONLY — no AppShell, no
  // sidebar, no hamburger, no drawer, no token-based loading items. Tokens
  // resolve light before the theme loads (root tokens are light), which is
  // exactly what produced the pre-login white flash and the invisible
  // white-on-white loading items, so this splash uses explicit near-black
  // hex matching /login's #06070B treatment (near-black + logo + spinner).
  if (!hasCheckedAuth) {
    return <DarkBrandSplash brandName={brandName} />;
  }

  // P0 (2026-10-10, user-locked): guests never see the chat shell — the
  // redirect effect above sends them to /login; this renders a brief
  // interstitial instead of the full chat UI. The gate copy is unified to
  // this single string (the previous Hinglish placeholder is removed).
  if (mustRedirectToLogin(hasCheckedAuth, isAuthenticated)) {
    return <DarkBrandSplash brandName={brandName} message="Redirecting to sign-in…" />;
  }

  if (isLoading && !forceShowUI) {
    return (
      <AppShell
        theme={resolvedTheme}
        sidebar={<Sidebar items={[]} header={<h2 className="text-lg font-semibold">{brandName}</h2>} />}
      >
        <QuantAIPageErrorBoundary
          brandName={brandName}
          onSignIn={handleNavigateToLogin}
          onQuantSSO={handleQuantSSO}
        >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-[var(--quant-border)]">
            <LoadingSkeleton variant="model-card" count={1} />
          </div>
          <div className="flex-1">
            <LoadingSkeleton variant="chat-message" count={3} />
          </div>
        </div>
        </QuantAIPageErrorBoundary>
      </AppShell>
    );
  }

  // P1 fix (2026-10-11): a failed message must NEVER nuke the whole chat UI
  // into a full-page error (which destroyed the composer draft and scroll
  // position, with only window.location.reload() as recovery). Send failures
  // now render as the inline dismissible ChatErrorBanner below. The full-page
  // ErrorState path is intentionally gone here: initial-load/render failures
  // are handled by QuantAIPageErrorBoundary (render crashes) and the loading
  // skeleton above.

  // ---- Sidebar (Chats / Side chats views) ---------------------------------
  // Shared header/footer are extracted so both the date-grouped "Chats" list
  // and the topic-grouped "Side chats" section reuse the same chrome.
  const sidebarHeader = (
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
      {/* Chats / Side chats view toggle (Muse parity) */}
      <div
        className="flex rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-0.5"
        role="tablist"
        aria-label="Conversation list view"
      >
        {(
          [
            { id: 'chats', label: 'Chats', icon: '💬' },
            { id: 'side-chats', label: 'Side chats', icon: '🏷️' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={sidebarView === tab.id}
            onClick={() => setSidebarView(tab.id)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
              sidebarView === tab.id
                ? 'bg-[var(--quant-accent)] text-white'
                : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            <span aria-hidden>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );

  const sidebarFooter = (
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
              {authUser?.email || 'Signed in'}
            </span>
          </div>
          <Link
            href="/profile"
            className="text-[10px] text-violet-400 hover:text-violet-300 font-semibold uppercase tracking-wider shrink-0"
          >
            Profile
          </Link>
        </div>
      ) : null}
    </div>
  );

  const sidebar =
    sidebarView === 'side-chats' ? (
      <nav
        className="flex flex-col h-full w-64 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700"
        aria-label="Side chats navigation"
      >
        <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700">
          {sidebarHeader}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <SideChatsSection
            conversations={conversations}
            activeConversationId={activeConversation?.id ?? null}
            onSelect={selectConversation}
            onMoveToTopic={moveConversationToTopic}
            onNewSideChat={(topic) => void handleNewSideChat(topic)}
          />
        </div>
        <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700">
          {sidebarFooter}
        </div>
      </nav>
    ) : (
      <Sidebar items={sidebarItems} header={sidebarHeader} footer={sidebarFooter} />
    );

  // P0 (blank white page): the entire page content sits inside a dedicated
  // error boundary. Any render-phase exception in the chat UI (hooks, motion,
  // dynamic panels) renders an honest branded sign-in surface instead of a
  // dead blank page. Anonymous users always see *something* actionable.
  return (
    <AppShell
        theme={resolvedTheme}
      sidebar={sidebar}
    >
      {/* Shell navigation drawer (renders null while closed). Mounted here,
          outside the chat error boundary: navigation chrome is not chat
          content. The conversations Sidebar above is untouched — it is
          history, not navigation. */}
      <ShellDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <QuantAIPageErrorBoundary
        brandName={brandName}
        onSignIn={handleNavigateToLogin}
        onQuantSSO={handleQuantSSO}
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
              {/* Navigation drawer toggle. Gated on hasCheckedAuth so no nav
                  chrome renders before the auth decision completes (this
                  render path is post-decision by construction; the gate is
                  explicit so a future reorder cannot reintroduce the
                  pre-auth hamburger). Label differs from AppShell's "Show
                  navigation" on purpose: that toggles the conversations
                  sidebar, this opens the navigation drawer. */}
              {hasCheckedAuth && (
                <button
                  type="button"
                  onClick={() => setDrawerOpen((v) => !v)}
                  aria-label="Open navigation"
                  aria-expanded={drawerOpen}
                  title="Navigation"
                  className="flex items-center justify-center w-9 h-9 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] text-[var(--foreground)] hover:bg-[var(--quant-surface-hover)] transition-colors cursor-pointer"
                >
                  <svg
                    className="w-[18px] h-[18px]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.9}
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
              )}
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
                  title="Conversational Chat"
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
                  title="Agentic Terminal"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                  <span className="hidden sm:inline">Agent / Code Mode</span>
                </button>
              </div>

              {/* The picker is decorative with a single model — hide it until
                  multiple real models exist. A one-option "picker" whose
                  switching is a no-op is a fake control. */}
              {models.length > 1 ? (
                <ModelSelector
                  currentModel={currentModel}
                  models={models}
                  onSelect={handleModelSwitch}
                />
              ) : null}

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
                            {authUser?.name || authUser?.email || 'My Account'}
                          </div>
                          {authUser?.email ? (
                            <div className="text-[11px] text-[var(--foreground-secondary)] truncate">
                              {authUser.email}
                            </div>
                          ) : null}
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            SIGNED IN
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
                  <div>
                    <button
                      type="button"
                      onClick={handleNavigateToLogin}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#8B5CF6] to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
                      title="Sign In to save chats and unlock cloud persistence"
                    >
                      <span>🔒</span>
                      <span>Sign In</span>
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
                  title="Start Voice Mode"
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
              {activeMode === 'chat' ? (
                <>
                  {/* Inline send-failure banner — never a full-page takeover */}
                  {error && !ignoreError && (
                    <ChatErrorBanner
                      message={error}
                      onRetry={retryLastMessage}
                      onDismiss={() => setIgnoreError(true)}
                    />
                  )}
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
                      aiUnavailable={aiUnavailable}
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

          {/* Real-Time Voice Mode (Sovereign Personas + 3D Animated Orb) */}
          <VoiceModeModal
            isOpen={voiceActive}
            onClose={() => setVoiceActive(false)}
            onSendMessage={(text) => sendMessageAuthed(text)}
          />
        </motion.div>
      </AnimatedPage>
      </QuantAIPageErrorBoundary>
    </AppShell>
  );
}

/* ============ Dark branded splash (pre-auth + redirect gate) ============ */
// /login treatment: near-black + logo + spinner. Every color here is an
// explicit hex — never a :root token, which resolves light before the
// theme loads and would flash white. The tile reuses the in-repo gradient
// + Q pattern from the error boundary and the layout favicon.
function DarkBrandSplash({ brandName, message }: { brandName: string; message?: string }) {
  return (
    <div
      role="status"
      aria-label={message ?? 'Loading'}
      className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center"
      style={{ backgroundColor: '#06070B', color: '#f8fafc' }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-bold text-white shadow-lg"
        style={{ background: 'linear-gradient(to top right, #7c3aed, #4f46e5)' }}
        aria-hidden="true"
      >
        Q
      </div>
      <div className="text-xl font-bold">{brandName}</div>
      <svg
        className="h-5 w-5 animate-spin"
        style={{ color: '#a78bfa' }}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
        <path
          d="M22 12a10 10 0 0 0-10-10"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="4"
        />
      </svg>
      {message ? (
        <p className="text-sm" style={{ color: '#a1a4ac' }}>
          {message}
        </p>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );
}

/* ============ Inline chat error banner ============ */
// P1 fix (2026-10-11): send/stream failures render here — dismissible, with
// Retry wired to the existing retryLastMessage(). Never a full-page takeover.
function ChatErrorBanner({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="mx-4 mt-3 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3"
    >
      <span aria-hidden="true" className="text-lg leading-none mt-0.5">
        ⚠️
      </span>
      <p className="flex-1 text-sm leading-relaxed text-red-200">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-lg bg-red-500/20 border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-500/30 transition-colors"
      >
        Retry
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-red-300/70 hover:text-red-200 hover:bg-red-500/10 transition-colors"
      >
        ✕
      </button>
    </div>
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
  onSend: (content: string, attachments?: string[]) => void;
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
  /** True when the backend reported no AI provider is configured (AI_UNAVAILABLE). */
  aiUnavailable?: boolean;
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
  aiUnavailable = false,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const prefersReducedMotion = useReducedMotion();
  const composerRef = useRef<HTMLTextAreaElement>(null);

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
        composerRef.current?.focus();
      }
    } catch {
      /* sessionStorage unavailable or corrupt — ignore */
    }
  }, []);

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

        {/* Shell composer. Modes and effort are intentionally NOT passed on
            home — no fake controls, so the chips row and effort toggle stay
            hidden. Attach opens the existing image picker; voice toggles
            the existing recording indicator. Stop stays on the separate
            "Stop generating" button above the composer (AIPage level);
            ShellComposer has no stop prop. The composer is a multi-line
            textarea: Enter sends, Shift + Enter inserts a newline (hint
            rendered by ShellComposer). */}
        <ShellComposer
          ref={composerRef}
          value={input}
          onChange={setInput}
          onSend={() => {
            if (input.trim() && !isStreaming) {
              // Hand the attachments off FIRST, then clear the chips:
              // clearing before the handoff would silently drop them.
              // Image = its data URL; file = "name (size)" (content is
              // never stored, only the picker's name/size — see
              // handleFileAttach), rendered back as a file chip.
              const attachments: string[] = [];
              if (imagePreview) attachments.push(imagePreview);
              if (attachedFile) attachments.push(`${attachedFile.name} (${attachedFile.size})`);
              onSend(input.trim(), attachments.length > 0 ? attachments : undefined);
              setInput('');
              onClearImage();
              onClearFile();
              composerRef.current?.focus();
            }
          }}
          isLoading={isStreaming}
          disabled={aiUnavailable}
          placeholder={
            aiUnavailable ? "AI chat isn't available right now" : 'Type a message'
          }
          onAttach={onImageUpload}
          onVoice={onVoiceToggle}
        />
      </div>
    </div>
  );
}
