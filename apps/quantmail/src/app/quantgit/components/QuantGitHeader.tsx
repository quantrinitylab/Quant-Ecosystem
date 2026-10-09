'use client';

import React, { useState } from 'react';
import { BubbleAvatar } from '@quant/shared-ui';
import type { MainDeckTab, GitHubTab, Repo, FileNode, ChatSession, ChatMessage } from '../types';

export interface QuantGitHeaderProps {
  activeDeckTab: MainDeckTab;
  setActiveDeckTab: (tab: MainDeckTab) => void;
  selectedRepo: Repo | null;
  setSelectedRepo: (repo: Repo | null) => void;
  viewingFile: FileNode | null;
  setViewingFile: (file: FileNode | null) => void;
  activeGitHubTab?: GitHubTab;
  setActiveGitHubTab: (tab: GitHubTab) => void;
  currentUsername: string;
  isHistoryOpen: boolean;
  setIsHistoryOpen: (open: boolean) => void;
  chatSessions: ChatSession[];
  setChatSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  activeSessionId: string;
  setActiveSessionId: (id: string) => void;
  pinnedSessionIds: string[];
  setPinnedSessionIds: React.Dispatch<React.SetStateAction<string[]>>;
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setModalState: (modal: any) => void;
  setIsPersonalizeOpen: (open: boolean) => void;
  showToast: (msg: string) => void;
  isCopilotDrawerOpen?: boolean;
  setIsCopilotDrawerOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}

export function QuantGitHeader({
  activeDeckTab,
  setActiveDeckTab,
  selectedRepo,
  setSelectedRepo,
  activeGitHubTab,
  setActiveGitHubTab,
  viewingFile,
  setViewingFile,
  currentUsername,
  setModalState,
  chatSessions,
  setChatSessions,
  activeSessionId,
  setActiveSessionId,
  pinnedSessionIds,
  setPinnedSessionIds,
  setChatMessages,
  isHistoryOpen,
  setIsHistoryOpen,
  setIsPersonalizeOpen,
  showToast,
  isCopilotDrawerOpen,
  setIsCopilotDrawerOpen,
}: QuantGitHeaderProps) {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);

  return (
    <>
      {activeDeckTab === 'quanty' ? (
        <div className="shrink-0 z-20 bg-[var(--quant-background)] border-b border-[#21262D] px-4 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className="p-1.5 rounded-lg hover:bg-[#21262D] text-[#7D8590] hover:text-white transition-colors"
              title="Chat History"
            >
              <svg height="16" viewBox="0 0 16 16" width="16" fill="currentColor">
                <path d="M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75Zm0 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75ZM1.75 12h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5Z" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <BubbleAvatar state="coding" size={32} />
              <span className="font-bold text-[#E6EDF3] text-sm">Quanty AI</span>
              <span className="text-[#7D8590]">/</span>
              <button
                type="button"
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                className="flex items-center gap-1 text-[#E6EDF3] hover:text-white font-medium hover:bg-[#21262D] px-2 py-1 rounded transition-colors"
              >
                <span className="max-w-[180px] sm:max-w-xs truncate">
                  {chatSessions.find((s) => s.id === activeSessionId)?.title ||
                    'Urgent GitHub parity & Notion AI overhaul'}
                </span>
                <span className="text-[#7D8590] text-[10px]">▾</span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => {
                const newId = `sess-${Date.now()}`;
                setChatSessions([
                  { id: newId, title: 'New Conversation', date: 'Just now', count: 0 },
                  ...chatSessions,
                ]);
                setActiveSessionId(newId);
                setChatMessages([]);
                showToast('Started new chat');
              }}
              className="p-1.5 rounded-md hover:bg-[#21262D] text-[#7D8590] hover:text-white transition-colors"
              title="New Chat"
            >
              <svg height="16" viewBox="0 0 16 16" width="16" fill="currentColor">
                <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setIsPersonalizeOpen(true)}
              className="p-1.5 rounded-md hover:bg-[#21262D] text-[#7D8590] hover:text-white transition-colors flex items-center justify-center"
              title="Personalize Quanty AI"
              aria-label="Personalize Quanty AI"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
                <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
                <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
                <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2Z" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <div className="shrink-0 z-20 bg-[var(--quant-background)] border-b border-[#21262D] px-4 sm:px-6 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Git Branch / Sovereign Repository Icon */}
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA]">
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
            </div>

            {/* Breadcrumbs & Contextual Path */}
            {activeDeckTab === 'lab' ? (
              <div className="flex items-center gap-2 text-xs sm:text-sm">
                <span className="text-white font-bold flex items-center gap-1.5">
                  <svg className="size-4 text-[#A78BFA]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10 2v7.31L4.65 18.23A2 2 0 0 0 6.36 21h11.28a2 2 0 0 0 1.71-2.77L14 9.31V2" />
                    <path d="M8.5 2h7" />
                    <path d="M7 16h10" />
                  </svg>
                  Agent Lab
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border border-[#30363D] text-[#7D8590] uppercase tracking-wider">
                  Fleet Command
                </span>
              </div>
            ) : selectedRepo ? (
              <div className="flex items-center gap-1.5 text-xs sm:text-sm min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveDeckTab('repos');
                    setSelectedRepo(null);
                    setViewingFile(null);
                  }}
                  className="text-[#58A6FF] hover:underline font-medium shrink-0"
                >
                  ← Repos
                </button>
                <span className="text-[#7D8590]">/</span>
                <span className="text-[#8B949E] truncate max-w-[80px] sm:max-w-none" title={currentUsername}>
                  {currentUsername}
                </span>
                <span className="text-[#7D8590]">/</span>
                <button
                  type="button"
                  onClick={() => {
                    setViewingFile(null);
                    setActiveGitHubTab('code');
                  }}
                  className="text-white font-bold hover:text-[#A78BFA] transition-colors truncate max-w-[120px] sm:max-w-none"
                  title={selectedRepo.name}
                >
                  {selectedRepo.name}
                </button>
                {viewingFile && (
                  <>
                    <span className="text-[#7D8590]">/</span>
                    <span
                      className="text-[#A78BFA] font-mono text-xs truncate max-w-[100px] sm:max-w-[180px]"
                      title={viewingFile.path}
                    >
                      {viewingFile.path}
                    </span>
                  </>
                )}
                <span className="ml-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[var(--q-type-xs)] sm:text-[10px] font-semibold uppercase tracking-wider border border-[#30363D] text-[#7D8590] shrink-0">
                  {selectedRepo.visibility}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0">
                <span
                  className="text-white font-bold truncate max-w-[120px] sm:max-w-none"
                  title={currentUsername}
                >
                  {currentUsername}
                </span>
                <span className="text-[#7D8590] text-xs shrink-0">· Repositories</span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#A78BFA]/15 text-[#A78BFA] border border-[#A78BFA]/30 min-w-0 truncate"
                  title="Sovereign Git"
                >
                  SOVEREIGN GIT
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons: + Create New, Notifications, Copilot, Astra Swarm */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="relative">
              <button
                type="button"
                data-testid="create-new-dropdown-btn"
                onClick={() => setIsCreateMenuOpen((prev) => !prev)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] transition-colors text-xs font-semibold"
                title="Create New..."
              >
                <span className="text-[#A78BFA] font-bold">+</span>
                <span className="hidden sm:inline text-xs ml-0.5">New</span>
                <span className="text-[#7D8590] text-[10px] ml-0.5">▼</span>
              </button>

              {isCreateMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsCreateMenuOpen(false)} />
                  <div
                    data-testid="create-new-dropdown-menu"
                    className="absolute right-0 mt-1.5 w-48 rounded-lg bg-[var(--quant-surface-elevated)] border border-[#30363D] shadow-xl py-1 z-50 text-xs text-[#E6EDF3] divide-y divide-[#21262D] animate-in fade-in"
                  >
                    <div className="py-1">
                      {/* SIA-P1-7: "New repository" lives as the single primary
                          CTA on the repos view — it is intentionally not
                          duplicated here. This menu keeps Import repository,
                          New pull request and New issue. */}
                      <button
                        type="button"
                        data-testid="dropdown-import-repo-btn"
                        onClick={() => {
                          setIsCreateMenuOpen(false);
                          setModalState('repo-import');
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-[#21262D] hover:text-white flex items-center gap-2"
                      >
                        <span className="text-[#58A6FF]">↓</span> Import repository
                      </button>
                    </div>
                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreateMenuOpen(false);
                          setModalState('new-pr');
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-[#21262D] hover:text-white"
                      >
                        New pull request
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreateMenuOpen(false);
                          setModalState('new-issue');
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-[#21262D] hover:text-white"
                      >
                        New issue
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setActiveGitHubTab('notifications')}
              className="p-1.5 rounded-md hover:bg-[#21262D] text-[#7D8590] hover:text-white transition-colors relative"
              title="Notifications"
            >
              <svg height="16" viewBox="0 0 16 16" width="16" fill="currentColor">
                <path d="M8 16a2 2 0 0 0 1.985-1.75c.001-.014.004-.028.005-.042.005-.07.01-.14.01-.208H6a2 2 0 0 0 2 2Zm.636-14.708a.75.75 0 0 0-1.272 0A5.5 5.5 0 0 0 3 6.5v3.428l-.78 1.56a.75.75 0 0 0 .67 1.012h10.22a.75.75 0 0 0 .67-1.012L13 9.928V6.5a5.5 5.5 0 0 0-4.364-5.208Z" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => setIsCopilotDrawerOpen?.((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold transition-all ${
                isCopilotDrawerOpen
                  ? 'bg-[color-mix(in_srgb,var(--app-accent)_20%,transparent)] border-[var(--app-accent)] text-[var(--app-accent)]'
                  : 'bg-[#21262D] border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D]'
              }`}
              title="Toggle Quanty Copilot"
            >
              <svg className="size-3.5 text-[var(--app-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                <path d="M5 3v4" />
                <path d="M19 17v4" />
                <path d="M3 5h4" />
                <path d="M17 19h4" />
              </svg>
              <span className="hidden md:inline">Copilot</span>
            </button>

            <div className="flex items-center gap-1.5 pl-1 border-l border-[#30363D]">
              <BubbleAvatar state="coding" size={24} />
              <span className="hidden md:inline text-[11px] font-bold text-[var(--app-accent)]">
                Astra Swarm
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Sliding Left History Drawer with Backdrop */}
      {isHistoryOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
            onClick={() => setIsHistoryOpen(false)}
          />
          <aside className="fixed top-0 left-0 bottom-0 w-80 bg-[var(--quant-surface-elevated)] border-r border-[#30363D] z-50 p-4 flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#21262D]">
              <div className="flex items-center gap-2">
                <BubbleAvatar state="coding" size={28} />
                <span className="font-bold text-sm text-white">Chat History</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const newId = `sess-${Date.now()}`;
                    setChatSessions([
                      { id: newId, title: 'New Conversation', date: 'Just now', count: 0 },
                      ...chatSessions,
                    ]);
                    setActiveSessionId(newId);
                    setChatMessages([]);
                    setIsHistoryOpen(false);
                    showToast('Started new chat');
                  }}
                  className="px-2.5 py-1 rounded bg-[#21262D] hover:bg-[#30363D] text-[11px] text-[#58A6FF] font-semibold transition-colors"
                >
                  + New
                </button>
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(false)}
                  className="p-1 rounded text-[#7D8590] hover:text-white transition-colors"
                  aria-label="Close history"
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pt-3 space-y-4 pr-1">
              {/* Pinned Chats Section */}
              {pinnedSessionIds.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--app-accent)] px-2 flex items-center gap-1.5">
                    <svg className="size-3 text-[var(--app-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="12" y1="17" x2="12" y2="22" />
                      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                    </svg>
                    <span>Pinned</span>
                  </div>
                  <div className="space-y-0.5">
                    {chatSessions
                      .filter((s) => pinnedSessionIds.includes(s.id))
                      .map((s) => {
                        const isActive = activeSessionId === s.id;
                        const isEditing = editingSessionId === s.id;
                        return (
                          <div
                            key={s.id}
                            className={`group relative flex items-center justify-between py-2 px-2.5 rounded-lg text-xs transition-colors ${
                              isActive
                                ? 'bg-[#21262D] text-white font-semibold'
                                : 'text-[#7D8590] hover:text-white hover:bg-[#1F242C]'
                            }`}
                          >
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    if (editingTitle.trim()) {
                                      setChatSessions((prev) =>
                                        prev.map((cs) =>
                                          cs.id === s.id
                                            ? { ...cs, title: editingTitle.trim() }
                                            : cs,
                                        ),
                                      );
                                      showToast('Chat renamed');
                                    }
                                    setEditingSessionId(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingSessionId(null);
                                  }
                                }}
                                onBlur={() => {
                                  if (editingTitle.trim()) {
                                    setChatSessions((prev) =>
                                      prev.map((cs) =>
                                        cs.id === s.id ? { ...cs, title: editingTitle.trim() } : cs,
                                      ),
                                    );
                                  }
                                  setEditingSessionId(null);
                                }}
                                autoFocus
                                className="w-full bg-[#0D1117] border border-[#58A6FF] rounded px-2 py-0.5 text-xs text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                              />
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveSessionId(s.id);
                                    setIsHistoryOpen(false);
                                    showToast(`Switched to: ${s.title}`);
                                  }}
                                  className="flex-1 text-left truncate mr-2"
                                  title={s.title}
                                >
                                  <span className="truncate block max-w-[150px]">{s.title}</span>
                                  <span className="text-[10px] text-[#7D8590] block">{s.date}</span>
                                </button>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPinnedSessionIds((prev) =>
                                        prev.filter((id) => id !== s.id),
                                      );
                                      showToast('Chat unpinned');
                                    }}
                                    className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-[#30363D] text-[var(--app-accent)] hover:text-white"
                                    title="Unpin chat"
                                    aria-label="Unpin chat"
                                  >
                                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <line x1="12" y1="17" x2="12" y2="22" />
                                      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingSessionId(s.id);
                                      setEditingTitle(s.title);
                                    }}
                                    className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-[#30363D] text-[#7D8590] hover:text-white"
                                    title="Rename chat"
                                    aria-label="Rename chat"
                                  >
                                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setChatSessions((prev) =>
                                        prev.filter((cs) => cs.id !== s.id),
                                      );
                                      setPinnedSessionIds((prev) =>
                                        prev.filter((id) => id !== s.id),
                                      );
                                      if (activeSessionId === s.id) {
                                        const remaining = chatSessions.filter(
                                          (cs) => cs.id !== s.id,
                                        );
                                        setActiveSessionId(remaining[0]?.id || '');
                                      }
                                      showToast('Chat deleted');
                                    }}
                                    className="p-1 rounded hover:bg-[#30363D] text-[#7D8590] hover:text-[#F85149]"
                                    title="Delete chat"
                                    aria-label="Delete chat"
                                  >
                                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M3 6h18" />
                                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                      <line x1="10" y1="11" x2="10" y2="17" />
                                      <line x1="14" y1="11" x2="14" y2="17" />
                                    </svg>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Recent Chats Section */}
              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#7D8590] px-2">
                  Recent
                </div>
                <div className="space-y-0.5">
                  {chatSessions
                    .filter((s) => !pinnedSessionIds.includes(s.id))
                    .map((s) => {
                      const isActive = activeSessionId === s.id;
                      const isEditing = editingSessionId === s.id;
                      return (
                        <div
                          key={s.id}
                          className={`group relative flex items-center justify-between py-2 px-2.5 rounded-lg text-xs transition-colors ${
                            isActive
                              ? 'bg-[#21262D] text-white font-semibold'
                              : 'text-[#7D8590] hover:text-white hover:bg-[#1F242C]'
                          }`}
                        >
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (editingTitle.trim()) {
                                    setChatSessions((prev) =>
                                      prev.map((cs) =>
                                        cs.id === s.id ? { ...cs, title: editingTitle.trim() } : cs,
                                      ),
                                    );
                                    showToast('Chat renamed');
                                  }
                                  setEditingSessionId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingSessionId(null);
                                }
                              }}
                              onBlur={() => {
                                if (editingTitle.trim()) {
                                  setChatSessions((prev) =>
                                    prev.map((cs) =>
                                      cs.id === s.id ? { ...cs, title: editingTitle.trim() } : cs,
                                    ),
                                  );
                                }
                                setEditingSessionId(null);
                              }}
                              autoFocus
                              className="w-full bg-[#0D1117] border border-[#58A6FF] rounded px-2 py-0.5 text-xs text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                            />
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveSessionId(s.id);
                                  setIsHistoryOpen(false);
                                  showToast(`Switched to: ${s.title}`);
                                }}
                                className="flex-1 text-left truncate mr-2"
                                title={s.title}
                              >
                                <span className="truncate block max-w-[150px]">{s.title}</span>
                                <span className="text-[10px] text-[#7D8590] block">{s.date}</span>
                              </button>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPinnedSessionIds((prev) => [...prev, s.id]);
                                    showToast('Chat pinned');
                                  }}
                                  className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-[#30363D] text-[#7D8590] hover:text-white"
                                  title="Pin chat"
                                  aria-label="Pin chat"
                                >
                                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <line x1="12" y1="17" x2="12" y2="22" />
                                    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSessionId(s.id);
                                    setEditingTitle(s.title);
                                  }}
                                  className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-[#30363D] text-[#7D8590] hover:text-white"
                                  title="Rename chat"
                                  aria-label="Rename chat"
                                >
                                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setChatSessions((prev) => prev.filter((cs) => cs.id !== s.id));
                                    if (activeSessionId === s.id) {
                                      const remaining = chatSessions.filter((cs) => cs.id !== s.id);
                                      setActiveSessionId(remaining[0]?.id || '');
                                    }
                                    showToast('Chat deleted');
                                  }}
                                  className="p-1 rounded hover:bg-[#30363D] text-[#7D8590] hover:text-[#F85149]"
                                  title="Delete chat"
                                  aria-label="Delete chat"
                                >
                                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M3 6h18" />
                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                    <line x1="10" y1="11" x2="10" y2="17" />
                                    <line x1="14" y1="11" x2="14" y2="17" />
                                  </svg>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
