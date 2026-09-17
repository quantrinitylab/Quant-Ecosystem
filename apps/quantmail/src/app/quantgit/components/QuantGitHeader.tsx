'use client';

import React, { useState } from 'react';
import { BubbleAvatar } from '@quant/shared-ui';
import { QuantGitLogo } from '../../../components/QuantGitLogo';
import type { MainDeckTab, GitHubTab, Repo, FileNode, ChatSession, ChatMessage } from '../types';

export interface QuantGitHeaderProps {
  activeDeckTab: MainDeckTab;
  setActiveDeckTab: (tab: MainDeckTab) => void;
  selectedRepo: Repo | null;
  setSelectedRepo: (repo: Repo | null) => void;
  viewingFile: FileNode | null;
  setViewingFile: (file: FileNode | null) => void;
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
}

export function QuantGitHeader({
  activeDeckTab,
  setActiveDeckTab,
  selectedRepo,
  setSelectedRepo,
  viewingFile,
  setViewingFile,
  setActiveGitHubTab,
  currentUsername,
  isHistoryOpen,
  setIsHistoryOpen,
  chatSessions,
  setChatSessions,
  activeSessionId,
  setActiveSessionId,
  pinnedSessionIds,
  setPinnedSessionIds,
  setChatMessages,
  setModalState,
  setIsPersonalizeOpen,
  showToast,
}: QuantGitHeaderProps) {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  return (
    <>
      {activeDeckTab === 'quanty' ? (
        <header className="shrink-0 z-30 bg-[#0D1117] border-b border-[#21262D] px-4 py-2.5 flex items-center justify-between text-xs">
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
              className="p-1.5 rounded-md hover:bg-[#21262D] text-[#7D8590] hover:text-white transition-colors"
              title="Personalize Quanty AI"
            >
              🎨
            </button>
          </div>
        </header>
      ) : (
        <header className="shrink-0 z-30 bg-[#010409] border-b border-[#30363D] px-4 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            {/* Sovereign QuantGit Logo */}
            <button
              type="button"
              onClick={() => {
                setActiveDeckTab('repos');
                setSelectedRepo(null);
                setViewingFile(null);
              }}
              className="flex items-center gap-2 text-white hover:text-[#FF8C42] transition-colors p-1 rounded-md"
              title="QuantGit Home"
            >
              <QuantGitLogo size={28} />
              <span className="font-bold text-sm tracking-tight text-[#E6EDF3]">QuantGit</span>
            </button>

            {/* Breadcrumbs */}
            {activeDeckTab === 'lab' ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[#7D8590]">/</span>
                <span className="text-white font-bold flex items-center gap-1.5">
                  <span>🧪</span> Agent Lab
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border border-[#30363D] text-[#7D8590] uppercase tracking-wider">
                  Fleet Command
                </span>
              </div>
            ) : selectedRepo ? (
              <div className="flex items-center gap-1.5 text-xs sm:text-sm min-w-0">
                <span className="text-[#7D8590]">/</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRepo(null);
                    setViewingFile(null);
                  }}
                  className="text-[#58A6FF] hover:underline font-medium truncate max-w-[70px] sm:max-w-[120px] md:max-w-none"
                  title={currentUsername}
                >
                  {currentUsername}
                </button>
                <span className="text-[#7D8590]">/</span>
                <button
                  type="button"
                  onClick={() => {
                    setViewingFile(null);
                    setActiveGitHubTab('code');
                  }}
                  className="text-[#58A6FF] hover:underline font-bold text-white truncate max-w-[80px] sm:max-w-[140px] md:max-w-none"
                  title={selectedRepo.name}
                >
                  {selectedRepo.name}
                </button>
                {viewingFile && (
                  <>
                    <span className="text-[#7D8590]">/</span>
                    <span
                      className="text-[#7D8590] font-mono text-xs truncate max-w-[90px] sm:max-w-[160px] md:max-w-none"
                      title={viewingFile.path}
                    >
                      {viewingFile.path}
                    </span>
                  </>
                )}
                <span className="ml-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider border border-[#30363D] text-[#7D8590] shrink-0">
                  {selectedRepo.visibility}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs sm:text-sm min-w-0">
                <span className="text-[#7D8590]">/</span>
                <span
                  className="text-white font-bold truncate max-w-[100px] sm:max-w-[160px] md:max-w-none"
                  title={currentUsername}
                >
                  {currentUsername}
                </span>
                <span className="text-[#7D8590] text-xs shrink-0">· Repositories</span>
              </div>
            )}
          </div>

          {/* Global Search & Action Buttons */}
          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block">
              <input
                id="global-search-input"
                type="text"
                placeholder="Type / to search"
                className="w-56 lg:w-72 bg-[#161B22] border border-[#30363D] rounded-md px-2.5 py-1 text-xs text-[#E6EDF3] placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF] focus:w-80 transition-all"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded border border-[#30363D] bg-[#21262D] text-[10px] font-mono text-[#7D8590]">
                /
              </span>
            </div>

            <button
              type="button"
              onClick={() => setModalState('new-repo')}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:bg-[#30363D] transition-colors text-xs font-semibold"
              title="Create New..."
            >
              <span className="text-[#7D8590]">+</span> ▼
            </button>

            <button
              type="button"
              onClick={() => showToast('All notifications read')}
              className="p-1.5 rounded-md hover:bg-[#21262D] text-[#7D8590] hover:text-white transition-colors relative"
              title="Notifications"
            >
              <svg height="16" viewBox="0 0 16 16" width="16" fill="currentColor">
                <path d="M8 16a2 2 0 0 0 1.985-1.75c.001-.014.004-.028.005-.042.005-.07.01-.14.01-.208H6a2 2 0 0 0 2 2Zm.636-14.708a.75.75 0 0 0-1.272 0A5.5 5.5 0 0 0 3 6.5v3.428l-.78 1.56a.75.75 0 0 0 .67 1.012h10.22a.75.75 0 0 0 .67-1.012L13 9.928V6.5a5.5 5.5 0 0 0-4.364-5.208Z" />
              </svg>
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#58A6FF]" />
            </button>

            <div className="flex items-center gap-1.5 pl-1 border-l border-[#30363D]">
              <BubbleAvatar state="coding" size={24} />
              <span className="hidden md:inline text-[11px] font-bold text-[#FF8C42]">
                Astra Swarm
              </span>
            </div>
          </div>
        </header>
      )}

      {/* Sliding Left History Drawer with Backdrop */}
      {isHistoryOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
            onClick={() => setIsHistoryOpen(false)}
          />
          <aside className="fixed top-0 left-0 bottom-0 w-80 bg-[#161B22] border-r border-[#30363D] z-50 p-4 flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
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
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pt-3 space-y-4 pr-1">
              {/* Pinned Chats Section */}
              {pinnedSessionIds.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#FF8C42] px-2 flex items-center gap-1">
                    <span>📌</span> Pinned
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
                                className="w-full bg-[#0D1117] border border-[#58A6FF] rounded px-2 py-0.5 text-xs text-white focus:outline-none"
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
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPinnedSessionIds((prev) =>
                                        prev.filter((id) => id !== s.id),
                                      );
                                      showToast('Chat unpinned');
                                    }}
                                    className="p-1 rounded hover:bg-[#30363D] text-[#FF8C42] hover:text-white"
                                    title="Unpin chat"
                                  >
                                    📌
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingSessionId(s.id);
                                      setEditingTitle(s.title);
                                    }}
                                    className="p-1 rounded hover:bg-[#30363D] text-[#7D8590] hover:text-white"
                                    title="Rename chat"
                                  >
                                    ✎
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
                                  >
                                    🗑
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
                              className="w-full bg-[#0D1117] border border-[#58A6FF] rounded px-2 py-0.5 text-xs text-white focus:outline-none"
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
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPinnedSessionIds((prev) => [...prev, s.id]);
                                    showToast('Chat pinned');
                                  }}
                                  className="p-1 rounded hover:bg-[#30363D] text-[#7D8590] hover:text-white"
                                  title="Pin chat"
                                >
                                  📌
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSessionId(s.id);
                                    setEditingTitle(s.title);
                                  }}
                                  className="p-1 rounded hover:bg-[#30363D] text-[#7D8590] hover:text-white"
                                  title="Rename chat"
                                >
                                  ✎
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
                                >
                                  🗑
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
