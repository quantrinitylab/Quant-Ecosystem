'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { spring } from '@quant/brand';
import { AnimatedPage, AppShell, Sidebar } from '@quant/shared-ui';
import { ErrorState } from '@quant/shared-ui';
import type { SidebarItem } from '@quant/shared-ui';
import { useAIChat } from '../hooks/useAIChat';
import { useModelSelector } from '../hooks/useModelSelector';
import { useUsageStats } from '../hooks/useUsageStats';
import { useConversationSearch } from '../hooks/useConversationSearch';
import { ModelSelector } from '../components/ModelSelector';
import { VoiceToggle } from '../components/VoiceToggle';
import { ExportMenu } from '../components/ExportMenu';
import { AgenticMessage } from '../components/AgenticMessage';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { PersonaSelector } from '../components/PersonaSelector';
import type { Persona } from '../components/PersonaSelector';
import { getAuthToken } from '../lib/auth';
import { OnboardingHero } from '../components/OnboardingHero';
import { AgentCodeTerminal } from '../components/AgentCodeTerminal';
import { CanvasArtifactsPanel } from '../components/CanvasArtifactsPanel';
import type { CanvasArtifact } from '../types/agent-mode';

export default function AIPage() {
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
  } = useAIChat({ defaultModel: currentModel.id });

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

  // Authentication & Guest State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

  useEffect(() => {
    try {
      const token =
        getAuthToken() ||
        localStorage.getItem('token') ||
        localStorage.getItem('quant_token') ||
        localStorage.getItem('quantchat_access_token');
      const guestStored = localStorage.getItem('quantai_guest') === 'true';
      if (token) {
        setIsAuthenticated(true);
      } else if (guestStored) {
        setIsGuest(true);
      }
    } catch {}
    setHasCheckedAuth(true);
  }, []);

  const handleQuantSSO = useCallback(() => {
    try {
      const stored =
        localStorage.getItem('token') ||
        localStorage.getItem('quant_token') ||
        localStorage.getItem('quantchat_access_token');
      if (stored) {
        localStorage.setItem('token', stored);
        setIsAuthenticated(true);
        return;
      }
    } catch {}
    const returnTo = encodeURIComponent(window.location.href);
    window.location.href = `https://quantmail.in/login?returnTo=${returnTo}`;
  }, []);

  const handleContinueAsGuest = useCallback(() => {
    try {
      localStorage.setItem('quantai_guest', 'true');
    } catch {}
    setIsGuest(true);
  }, []);

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

  if (isLoading) {
    return (
      <AppShell
        sidebar={<Sidebar items={[]} header={<h2 className="text-lg font-semibold">QuantAI</h2>} />}
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

  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  return (
    <AppShell
      sidebar={
        <Sidebar
          items={sidebarItems}
          header={
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">QuantAI</h2>
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
            <div className="px-3 py-2 text-xs text-[var(--foreground-secondary)]">
              Model: {currentModel.icon} {currentModel.name}
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
              <h1 className="text-lg font-semibold text-[var(--foreground)]">QuantAI</h1>

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
                  <span>💬</span>
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
                  <span>⚡</span>
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
                  <span>🎨</span>
                  <span className="hidden md:inline">
                    {isCanvasOpen ? 'Close Canvas' : 'Artifacts'}
                  </span>
                  {currentArtifact && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </button>

                {/* 1-Click Quant Account SSO button if unauthenticated or guest */}
                {!isAuthenticated && (
                  <button
                    type="button"
                    onClick={handleQuantSSO}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
                    title="Sign in with Quant Account (1-Click SSO)"
                  >
                    <span>⚡</span>
                    <span className="hidden sm:inline">Sign In</span>
                  </button>
                )}

                <ExportMenu conversation={activeConversation} messages={messages} />
                <VoiceToggle isActive={voiceActive} onToggle={() => setVoiceActive(!voiceActive)} />
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
              {!isAuthenticated && !isGuest && hasCheckedAuth && (
                <div className="p-4 border-b border-[var(--quant-border)] bg-[var(--quant-surface)]/30 overflow-y-auto max-h-[60vh]">
                  <OnboardingHero
                    onContinueQuantSSO={handleQuantSSO}
                    onContinueAsGuest={handleContinueAsGuest}
                  />
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
                  <ChatInput
                    onSend={sendMessage}
                    isStreaming={isStreaming}
                    imagePreview={imagePreview}
                    attachedFile={attachedFile}
                    voiceRecording={voiceRecording}
                    onImageUpload={() => imageInputRef.current?.click()}
                    onFileAttach={() => fileInputRef.current?.click()}
                    onVoiceToggle={() => setVoiceRecording(!voiceRecording)}
                    onClearImage={() => setImagePreview(null)}
                    onClearFile={() => setAttachedFile(null)}
                  />

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
                <CanvasArtifactsPanel
                  artifact={currentArtifact}
                  onClose={() => setIsCanvasOpen(false)}
                  onUpdateArtifact={(updated) => setCurrentArtifact(updated)}
                />
              </div>
            )}
          </div>
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
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether the reader is still following the tail. Autoscroll used to be
  // unconditional, so scrolling up to re-read something mid-stream yanked you
  // back down on the next token — the transcript fought the reader.
  const isPinnedToBottomRef = useRef(true);
  const prefersReducedMotion = useReducedMotion();

  // Id of the last assistant message — only it offers "Regenerate".
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]!.role === 'assistant') return messages[i]!.id;
    }
    return null;
  }, [messages]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // 48px of slack: "near the bottom" rather than "exactly at it", so a
    // fractional scroll position or a half-rendered code block does not read as
    // the reader having scrolled away.
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
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', ...spring.gentle }}
          className="w-full max-w-xl"
        >
          {/* No mascot and no gradient tile. The empty state is the product's
              first sentence, so it carries a specific explanation rather than
              decoration — QUANT_DESIGN_OS §6: "no low-contrast decorative
              filler". */}
          <h2 className="text-[1.375rem] font-semibold tracking-[-0.01em] text-[var(--foreground)]">
            What can I help with?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-secondary)]">
            Ask a question, paste code to review, or describe a task across your Quant apps.
          </p>
        </motion.div>
      </div>
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
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (input.trim() && !isStreaming) {
        onSend(input.trim());
        setInput('');
        onClearImage();
        onClearFile();
        // Keep the caret in the composer. Without this, submitting drops focus
        // to the document body, so a keyboard user has to tab back in before
        // they can ask a follow-up.
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

  return (
    <div className="border-t border-[var(--quant-border)] p-3">
      {/* Attachments preview */}
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
                  className="h-16 w-16 object-cover rounded-lg border border-[var(--quant-border)]"
                />
                <button
                  onClick={onClearImage}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  x
                </button>
              </div>
            )}
            {attachedFile && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--quant-surface-hover)] border border-[var(--quant-border)]">
                <span className="text-sm">📎</span>
                <span className="text-xs font-medium text-[var(--foreground)] truncate max-w-[120px]">
                  {attachedFile.name}
                </span>
                <span className="text-[10px] text-[var(--foreground-secondary)]">
                  {attachedFile.size}
                </span>
                <button
                  onClick={onClearFile}
                  className="text-xs text-[var(--foreground-secondary)] hover:text-red-500 ml-1"
                >
                  x
                </button>
              </div>
            )}
            {voiceRecording && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <motion.span
                  className="w-2 h-2 rounded-full bg-red-500"
                  animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                <span className="text-xs font-medium text-red-600 dark:text-red-400">
                  Recording...
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input row */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        {/* Image upload button */}
        <button
          type="button"
          onClick={onImageUpload}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--quant-surface-hover)] transition-colors"
          aria-label="Upload image"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>

        {/* File attachment button */}
        <button
          type="button"
          onClick={onFileAttach}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--quant-surface-hover)] transition-colors"
          aria-label="Attach file"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
            />
          </svg>
        </button>

        {/* Voice toggle */}
        <button
          type="button"
          onClick={onVoiceToggle}
          className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors ${
            voiceRecording
              ? 'bg-red-100 dark:bg-red-900/30 text-red-500'
              : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--quant-surface-hover)]'
          }`}
          aria-label={voiceRecording ? 'Stop recording' : 'Start voice input'}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        </button>

        {/* Text input. A placeholder is not an accessible name — it disappears
            on first keystroke and several screen readers ignore it outright — so
            the composer had no name at all. aria-describedby carries the
            Enter/Shift+Enter affordance that was previously invisible to
            assistive tech and to anyone who never guessed it. */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything..."
          aria-label="Message Quanty"
          aria-describedby="composer-hint"
          disabled={isStreaming}
          rows={1}
          className="flex-1 min-h-[44px] max-h-32 resize-none rounded-xl border border-[var(--quant-border)] px-4 py-2.5 text-sm bg-[var(--quant-surface)] text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--quant-accent)]/30 focus:border-[var(--quant-accent)] disabled:opacity-50 transition-colors"
        />

        {/* Send button */}
        <button
          type="submit"
          disabled={!input.trim() || isStreaming}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-[var(--quant-accent)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Send message"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      </form>

      {/* The keyboard contract, stated once. Visible to sighted users and
          referenced by the composer's aria-describedby, rather than being folk
          knowledge. */}
      <p
        id="composer-hint"
        className="mt-2 text-center text-[11px] text-[var(--foreground-secondary)]"
      >
        <kbd className="font-sans font-medium">Enter</kbd> to send ·{' '}
        <kbd className="font-sans font-medium">Shift</kbd>+
        <kbd className="font-sans font-medium">Enter</kbd> for a new line
      </p>
    </div>
  );
}
