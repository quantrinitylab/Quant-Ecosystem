'use client';

import React from 'react';
import { BubbleAvatar } from '@quant/shared-ui';
import type {
  ChatMessage,
  Repo,
  MainDeckTab,
  ContextSubmenu,
  SettingsSubmenu,
  NotionMode,
  AIModelId,
  Effort,
} from '../types';

export interface QuantyCopilotViewProps {
  chatMessages: ChatMessage[];
  setPromptInput: (p: string | ((prev: string) => string)) => void;
  promptInput: string;
  isChatSubmitting: boolean;
  chatError: string | null;
  handleChatSubmit: () => void;
  expandedThoughts: Record<string, boolean>;
  setExpandedThoughts: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  isContextOpen: boolean;
  setIsContextOpen: (open: boolean) => void;
  activeContextSubmenu: ContextSubmenu;
  setActiveContextSubmenu: (menu: ContextSubmenu) => void;
  repoFileSearch: string;
  setRepoFileSearch: (s: string) => void;
  attachedFiles: string[];
  setAttachedFiles: React.Dispatch<React.SetStateAction<string[]>>;
  mentionSearch: string;
  setMentionSearch: (s: string) => void;
  skillsSearch: string;
  setSkillsSearch: (s: string) => void;
  activeSkills: Record<string, boolean>;
  setActiveSkills: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  activeSettingsSubmenu: SettingsSubmenu;
  setActiveSettingsSubmenu: (menu: SettingsSubmenu) => void;
  sourcesState: Record<string, boolean>;
  setSourcesState: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  mcpServers: string[];
  setMcpServers: React.Dispatch<React.SetStateAction<string[]>>;
  notionMode: NotionMode;
  setNotionMode: (mode: NotionMode) => void;
  activeModel: AIModelId;
  setActiveModel: (model: AIModelId) => void;
  effort: Effort;
  setEffort: (effort: Effort) => void;
  enableWorkersBeta: boolean;
  setEnableWorkersBeta: (b: boolean) => void;
  isRecording: boolean;
  setIsRecording: (rec: boolean) => void;
  setIsPersonalizeOpen: (open: boolean) => void;
  baseRepos: Repo[];
  openRepository: (repo: Repo) => void;
  fetchRepos: () => Promise<void>;
  setActiveDeckTab: (tab: MainDeckTab) => void;
  showToast: (msg: string) => void;
}

export function QuantyCopilotView({
  chatMessages,
  setPromptInput,
  promptInput,
  isChatSubmitting,
  chatError,
  handleChatSubmit,
  expandedThoughts,
  setExpandedThoughts,
  isContextOpen,
  setIsContextOpen,
  activeContextSubmenu,
  setActiveContextSubmenu,
  repoFileSearch,
  setRepoFileSearch,
  attachedFiles,
  setAttachedFiles,
  mentionSearch,
  setMentionSearch,
  skillsSearch,
  setSkillsSearch,
  activeSkills,
  setActiveSkills,
  isSettingsOpen,
  setIsSettingsOpen,
  activeSettingsSubmenu,
  setActiveSettingsSubmenu,
  sourcesState,
  setSourcesState,
  mcpServers,
  setMcpServers,
  notionMode,
  setNotionMode,
  activeModel,
  setActiveModel,
  effort,
  setEffort,
  enableWorkersBeta,
  setEnableWorkersBeta,
  isRecording,
  setIsRecording,
  setIsPersonalizeOpen,
  baseRepos,
  openRepository,
  fetchRepos,
  setActiveDeckTab,
  showToast,
}: QuantyCopilotViewProps) {
  return (
    <div className="flex-1 w-full min-h-0 flex flex-col max-w-4xl mx-auto px-4 pt-2 pb-[72px] justify-between overflow-hidden">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Welcome Screen (when no messages) */}
        {chatMessages.length === 0 ? (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-10 flex flex-col items-center justify-center text-center space-y-5">
            <BubbleAvatar state="coding" size={72} />
            <div className="space-y-1 max-w-lg">
              <h2 className="text-xl font-bold text-white tracking-tight">
                How can I help you build, analyze, or automate today?
              </h2>
              <p className="text-xs text-[#7D8590] leading-relaxed">
                Autonomous Swarm intelligence powered by Claude Opus 5 & GPT-6 Astra. Fully wired
                into monorepo ASTs, Git smart HTTP, and verified test pipelines.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl w-full text-left pt-2">
              {[
                {
                  icon: '⚡',
                  title: 'Code & Architecture',
                  prompt: 'Audit monorepo for performance and zero-mock parity',
                },
                {
                  icon: '🐛',
                  title: 'Deep Debugging',
                  prompt: 'Trace unhandled rejections and memory leaks in Fastify routes',
                },
                {
                  icon: '🚀',
                  title: 'CI/CD & Deploy',
                  prompt: 'Inspect GitHub Actions pipeline status and EKS cluster health',
                },
                {
                  icon: '🛡️',
                  title: 'Security Audit',
                  prompt: 'Scan for Dependabot alerts, token leakages, and timing vulnerabilities',
                },
              ].map((card) => (
                <button
                  key={card.title}
                  type="button"
                  onClick={() => {
                    setPromptInput(card.prompt);
                  }}
                  className="p-3 rounded-xl bg-[#161B22] border border-[#30363D] hover:border-[#58A6FF] hover:bg-[#1C2128] transition-all group"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#E6EDF3] group-hover:text-[#58A6FF]">
                    <span>{card.icon}</span>
                    <span>{card.title}</span>
                  </div>
                  <p className="text-[11px] text-[#7D8590] mt-1 line-clamp-2">{card.prompt}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Chat Stream (when messages exist) */
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 pr-1 pb-4">
            {chatMessages.map((msg) => (
              <div key={msg.id}>
                {msg.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="max-w-xl bg-[#1F242C] border border-[#30363D] text-white p-3.5 rounded-2xl text-xs space-y-1.5 shadow-md">
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                      <div className="flex items-center justify-between text-[10px] text-[#7D8590] pt-1">
                        <span>{msg.timestamp}</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(msg.text);
                            showToast('Copied user message');
                          }}
                          className="hover:text-white"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-2xl bg-[#161B22] border border-[#30363D] p-4 rounded-2xl text-xs space-y-3 shadow-md">
                    {/* Bot Message Header */}
                    <div className="flex items-center justify-between border-b border-[#21262D] pb-2">
                      <div className="flex items-center gap-2">
                        <BubbleAvatar state="coding" size={28} />
                        <span className="font-bold text-white">Quanty AI</span>
                        <span className="px-1.5 py-0.2 rounded bg-[#FF8C42]/20 text-[#FF8C42] text-[10px] font-mono font-bold">
                          {msg.model || 'Opus 5'}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#7D8590]">{msg.timestamp}</span>
                    </div>

                    {/* Notion AI Style Thought Accordion */}
                    {msg.thoughts && (
                      <div className="rounded-lg border border-[#21262D] bg-[#0B0C0E] overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedThoughts((prev) => ({
                              ...prev,
                              [msg.id]: !prev[msg.id],
                            }))
                          }
                          className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[#7D8590] hover:text-white transition-colors bg-[#111418]"
                        >
                          <span className="flex items-center gap-1.5 font-mono">
                            <span>{expandedThoughts[msg.id] ? '▼' : '▶'}</span>
                            <span className="font-semibold text-[#E6EDF3]">Thought</span>
                            <span className="text-[10px] text-[#7D8590]">
                              · Thought for {msg.thoughtDuration || '2.8s'}
                            </span>
                          </span>
                          <span className="text-[10px] text-[#58A6FF]">
                            {expandedThoughts[msg.id] ? 'Collapse' : 'Expand'}
                          </span>
                        </button>
                        {expandedThoughts[msg.id] && (
                          <div className="p-3 text-[11px] font-mono text-[#8B949E] space-y-2 leading-relaxed border-t border-[#21262D]">
                            <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[#7D8590]">
                              {msg.thoughts}
                            </pre>
                            {msg.steps && (
                              <div className="pt-1.5 border-t border-[#1C2128] space-y-1">
                                {msg.steps.map((st, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center gap-1.5 text-[11px] text-[#3FB950]"
                                  >
                                    <span>✓</span>
                                    <span>{st}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Response Text */}
                    <div className="space-y-2 leading-relaxed text-[#E6EDF3] whitespace-pre-wrap">
                      {msg.text}
                    </div>

                    {/* Autonomous Tool Call Executions */}
                    {msg.toolExecutions && msg.toolExecutions.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-[#21262D]">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-[#7D8590] flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-[#58A6FF] animate-pulse" />
                          <span>Autonomous Swarm Execution ({msg.toolExecutions.length})</span>
                        </div>
                        <div className="grid gap-2">
                          {msg.toolExecutions.map((exec, idx) => (
                            <div
                              key={exec.callId || idx}
                              className={`p-3 rounded-xl border text-xs font-mono transition-all ${
                                exec.status === 'succeeded'
                                  ? 'bg-[#0D1117] border-[#238636]/40 text-[#E6EDF3]'
                                  : 'bg-[#0D1117] border-[#DA3633]/40 text-[#F85149]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      exec.status === 'succeeded'
                                        ? 'bg-[#238636]/20 text-[#3FB950]'
                                        : 'bg-[#DA3633]/20 text-[#F85149]'
                                    }`}
                                  >
                                    {exec.status === 'succeeded' ? '✓ EXECUTED' : '✕ FAILED'}
                                  </span>
                                  <span className="font-semibold text-white">
                                    {exec.toolName === 'create_repository' &&
                                      `📦 Repository: ${exec.result?.name || exec.input?.name}`}
                                    {exec.toolName === 'commit_file' &&
                                      `⚡ Commit: ${exec.input?.path || exec.result?.path}`}
                                    {exec.toolName === 'read_file_blob' &&
                                      `📄 Read: ${exec.input?.path}`}
                                    {exec.toolName === 'deploy_agent' &&
                                      `🤖 Swarm Agent: ${exec.result?.name || exec.input?.name}`}
                                    {![
                                      'create_repository',
                                      'commit_file',
                                      'read_file_blob',
                                      'deploy_agent',
                                    ].includes(exec.toolName) && exec.toolName}
                                  </span>
                                </div>
                                {exec.durationMs && (
                                  <span className="text-[10px] text-[#7D8590]">
                                    {exec.durationMs}ms
                                  </span>
                                )}
                              </div>

                              {/* Details & Quick Action Buttons */}
                              <div className="mt-2 pt-2 border-t border-[#21262D]/60 text-[11px] text-[#8B949E] flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  {exec.toolName === 'create_repository' && (
                                    <span>
                                      Branch:{' '}
                                      <code className="text-[#58A6FF]">
                                        {exec.result?.defaultBranch || 'main'}
                                      </code>{' '}
                                      · Visibility:{' '}
                                      <code className="text-[#58A6FF]">
                                        {exec.result?.visibility || 'public'}
                                      </code>
                                    </span>
                                  )}
                                  {exec.toolName === 'commit_file' && (
                                    <span>
                                      SHA:{' '}
                                      <code className="text-[#3FB950]">
                                        {String(exec.result?.commitSha || '').slice(0, 8)}
                                      </code>{' '}
                                      · Branch:{' '}
                                      <code className="text-[#58A6FF]">
                                        {exec.result?.branch || 'main'}
                                      </code>
                                    </span>
                                  )}
                                  {exec.toolName === 'deploy_agent' && (
                                    <span>
                                      Role:{' '}
                                      <code className="text-[#FF8C42]">
                                        {exec.result?.role || exec.input?.role}
                                      </code>{' '}
                                      · Desk:{' '}
                                      <code className="text-[#58A6FF]">
                                        #{exec.result?.deskNumber || exec.input?.deskNumber}
                                      </code>
                                    </span>
                                  )}
                                  {exec.toolName === 'read_file_blob' && (
                                    <span>
                                      Bytes:{' '}
                                      <code className="text-[#58A6FF]">
                                        {exec.result?.size ?? 'N/A'}
                                      </code>{' '}
                                      · SHA:{' '}
                                      <code className="text-[#58A6FF]">
                                        {String(exec.result?.blobSha || '').slice(0, 8)}
                                      </code>
                                    </span>
                                  )}
                                  {exec.error && (
                                    <span className="text-[#F85149]">{exec.error}</span>
                                  )}
                                </div>

                                {exec.status === 'succeeded' && (
                                  <div className="flex items-center gap-2">
                                    {exec.toolName === 'create_repository' && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const targetName = exec.result?.name || exec.input?.name;
                                          const found = baseRepos.find(
                                            (r) => r.name === targetName,
                                          );
                                          if (found) {
                                            openRepository(found);
                                          } else {
                                            void fetchRepos();
                                            showToast(`Switching to ${targetName}`);
                                          }
                                        }}
                                        className="px-2 py-0.5 rounded bg-[#21262D] hover:bg-[#30363D] text-[#58A6FF] text-[10px] font-medium transition-colors"
                                      >
                                        Open Repo →
                                      </button>
                                    )}
                                    {exec.toolName === 'deploy_agent' && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveDeckTab('lab');
                                          showToast('Navigated to Agent Lab floor');
                                        }}
                                        className="px-2 py-0.5 rounded bg-[#21262D] hover:bg-[#30363D] text-[#FF8C42] text-[10px] font-medium transition-colors"
                                      >
                                        View in Agent Lab →
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action Suggestions */}
                    {msg.suggestions && (
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-[#21262D]/60">
                        {msg.suggestions.map((sug) => (
                          <button
                            key={sug}
                            type="button"
                            onClick={() => {
                              setPromptInput(sug.replace(' →', ''));
                            }}
                            className="px-2.5 py-1 rounded-md bg-[#21262D] hover:bg-[#30363D] text-[#58A6FF] text-[11px] font-semibold transition-colors"
                          >
                            {sug}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Message Bottom Action Bar */}
                    <div className="flex items-center gap-3 pt-2 text-[11px] text-[#7D8590] border-t border-[#21262D]">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(msg.text);
                          showToast('Copied response to clipboard');
                        }}
                        className="hover:text-white transition-colors flex items-center gap-1"
                      >
                        📋 Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => showToast('Saved to private pages')}
                        className="hover:text-white transition-colors flex items-center gap-1"
                      >
                        + Save to Docs
                      </button>
                      <button
                        type="button"
                        onClick={() => showToast('Feedback recorded: Helpful')}
                        className="hover:text-white transition-colors"
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        onClick={() => showToast('Feedback recorded: Needs improvement')}
                        className="hover:text-white transition-colors"
                      >
                        👎
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isChatSubmitting && (
              <div className="rounded-xl border border-[#30363D] bg-[#161B22] p-4 text-xs text-[#7D8590] animate-pulse">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#FF8C42] animate-ping" />
                  <span className="font-semibold text-white">
                    Quanty Copilot is generating a verified response...
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notion AI Bottom Floating Composer */}
      <div className="shrink-0 pt-2 pb-2 bg-[#0D1117] z-20">
        {chatError && (
          <div className="mb-2 rounded-lg border border-[#F85149]/40 bg-[#DA3633]/15 px-3 py-2 text-xs text-[#F85149]">
            {chatError}
          </div>
        )}
        <div className="relative">
          {/* Popup Menu for Give Context (+) */}
          {isContextOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-72 p-2 rounded-xl bg-[#161B22] border border-[#30363D] shadow-2xl z-30 text-xs animate-in fade-in slide-in-from-bottom-2">
              {activeContextSubmenu === 'none' ? (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setActiveContextSubmenu('repos-files')}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#21262D] text-[#E6EDF3] text-left transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">📁</span>
                      <div>
                        <div className="font-semibold text-white">Attach Repos & Files</div>
                        <div className="text-[10px] text-[#7D8590]">
                          Attach workspace repos, source files, or docs
                        </div>
                      </div>
                    </div>
                    <span className="text-[#7D8590] text-sm">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveContextSubmenu('mention')}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#21262D] text-[#E6EDF3] text-left transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base font-mono font-bold text-[#58A6FF]">@</span>
                      <div>
                        <div className="font-semibold text-white">Mention repo or file</div>
                        <div className="text-[10px] text-[#7D8590]">
                          Insert @reference into prompt input
                        </div>
                      </div>
                    </div>
                    <span className="text-[#7D8590] text-sm">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveContextSubmenu('skills')}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#21262D] text-[#E6EDF3] text-left transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base text-[#FF8C42]">⚡</span>
                      <div>
                        <div className="font-semibold text-white">Skills & Tools</div>
                        <div className="text-[10px] text-[#7D8590]">
                          Autonomous coding, QA & memory skills
                        </div>
                      </div>
                    </div>
                    <span className="text-[#7D8590] text-sm">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPromptInput(
                        'Create an interactive architecture diagram of Quant Ecosystem swarm',
                      );
                      setIsContextOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#21262D] text-[#E6EDF3] text-left transition-colors"
                  >
                    <span className="text-base">🖌️</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-white">Create image or diagram</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#58A6FF]/20 text-[#58A6FF]">
                          New
                        </span>
                      </div>
                      <div className="text-[10px] text-[#7D8590]">
                        Render system flowcharts & UI mockups
                      </div>
                    </div>
                  </button>
                </div>
              ) : activeContextSubmenu === 'repos-files' ? (
                /* Repos & Files Submenu */
                <div className="space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-[#21262D]">
                    <button
                      type="button"
                      onClick={() => setActiveContextSubmenu('none')}
                      className="flex items-center gap-1 text-[#58A6FF] font-semibold hover:underline"
                    >
                      <span>‹</span> Back
                    </button>
                    <span className="font-bold text-white text-xs">Attach Repos & Files</span>
                  </div>
                  <input
                    type="text"
                    value={repoFileSearch}
                    onChange={(e) => setRepoFileSearch(e.target.value)}
                    placeholder="Search repo or file…"
                    className="w-full bg-[#0D1117] border border-[#30363D] rounded px-2.5 py-1 text-xs text-white placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF]"
                  />
                  <div className="divide-y divide-[#21262D] max-h-52 overflow-y-auto space-y-1 pt-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#7D8590] pt-1">
                      Repositories
                    </div>
                    {[
                      { name: 'Quant-Ecosystem', desc: 'Root Monorepo · TypeScript' },
                      { name: 'quantmail-core', desc: 'Mail, Drive & Calendar · Fastify' },
                      { name: 'quantchat-meet', desc: 'LiveKit SFU & WebRTC Gateway' },
                      { name: 'quant-mobile-android', desc: 'Android APK · Jetpack Compose' },
                    ]
                      .filter((r) => r.name.toLowerCase().includes(repoFileSearch.toLowerCase()))
                      .map((r) => (
                        <button
                          key={r.name}
                          type="button"
                          onClick={() => {
                            if (!attachedFiles.includes(r.name)) {
                              setAttachedFiles((prev) => [...prev, r.name]);
                              showToast(`Attached: ${r.name}`);
                            } else {
                              showToast('Already attached');
                            }
                            setIsContextOpen(false);
                            setActiveContextSubmenu('none');
                          }}
                          className="w-full py-1.5 px-2 flex items-center justify-between text-left hover:bg-[#21262D] rounded transition-colors"
                        >
                          <div>
                            <div className="font-medium text-white text-xs flex items-center gap-1.5">
                              <span>📁</span>
                              <span>{r.name}</span>
                            </div>
                            <div className="text-[10px] text-[#7D8590]">{r.desc}</div>
                          </div>
                          <span className="text-[#58A6FF] text-xs font-semibold">+ Attach</span>
                        </button>
                      ))}
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#7D8590] pt-2">
                      Architecture Files
                    </div>
                    {[
                      { name: 'AGENT_MEMORY.md', desc: 'Swarm Memory & Architecture Ledger' },
                      { name: 'TASK_PLANNER.md', desc: 'Sprint Tasks & Roadmap Tracker' },
                      {
                        name: 'apps/quantmail/src/app/quantgit/page.tsx',
                        desc: 'QuantGit Sovereign UI',
                      },
                      {
                        name: 'packages/shared-ui/src/components/QuantSidekick/BubbleAvatar.tsx',
                        desc: 'Living Aurora Mascot',
                      },
                      { name: 'server/src/routes/git.ts', desc: 'Git Smart HTTP Daemon' },
                    ]
                      .filter((f) => f.name.toLowerCase().includes(repoFileSearch.toLowerCase()))
                      .map((f) => (
                        <button
                          key={f.name}
                          type="button"
                          onClick={() => {
                            if (!attachedFiles.includes(f.name)) {
                              setAttachedFiles((prev) => [...prev, f.name]);
                              showToast(`Attached: ${f.name}`);
                            } else {
                              showToast('Already attached');
                            }
                            setIsContextOpen(false);
                            setActiveContextSubmenu('none');
                          }}
                          className="w-full py-1.5 px-2 flex items-center justify-between text-left hover:bg-[#21262D] rounded transition-colors"
                        >
                          <div>
                            <div className="font-mono text-white text-[11px] flex items-center gap-1.5 truncate max-w-[180px]">
                              <span>📄</span>
                              <span className="truncate">{f.name}</span>
                            </div>
                            <div className="text-[10px] text-[#7D8590]">{f.desc}</div>
                          </div>
                          <span className="text-[#58A6FF] text-xs font-semibold shrink-0">
                            + Attach
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              ) : activeContextSubmenu === 'mention' ? (
                /* Mention Submenu */
                <div className="space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-[#21262D]">
                    <button
                      type="button"
                      onClick={() => setActiveContextSubmenu('none')}
                      className="flex items-center gap-1 text-[#58A6FF] font-semibold hover:underline"
                    >
                      <span>‹</span> Back
                    </button>
                    <span className="font-bold text-white text-xs">@ Mention Repo or File</span>
                  </div>
                  <input
                    type="text"
                    value={mentionSearch}
                    onChange={(e) => setMentionSearch(e.target.value)}
                    placeholder="Search mention…"
                    className="w-full bg-[#0D1117] border border-[#30363D] rounded px-2.5 py-1 text-xs text-white placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF]"
                  />
                  <div className="divide-y divide-[#21262D] max-h-52 overflow-y-auto pt-1">
                    {[
                      { token: '@Quant-Ecosystem', desc: 'Root repository' },
                      { token: '@quantmail-core', desc: 'Mail, drive & calendar engine' },
                      { token: '@quantchat-meet', desc: 'LiveKit WebRTC meet gateway' },
                      { token: '@quant-mobile-android', desc: 'Native Android project' },
                      { token: '@AGENT_MEMORY.md', desc: 'Ecosystem memory ledger' },
                      { token: '@TASK_PLANNER.md', desc: 'Sprint tasks planner' },
                      { token: '@BubbleAvatar.tsx', desc: 'Living aurora mascot' },
                      { token: '@git.ts', desc: 'Git wire protocol server' },
                    ]
                      .filter((m) => m.token.toLowerCase().includes(mentionSearch.toLowerCase()))
                      .map((m) => (
                        <button
                          key={m.token}
                          type="button"
                          onClick={() => {
                            setPromptInput((prev) => (prev ? prev + ' ' : '') + m.token + ' ');
                            showToast(`Mentioned ${m.token}`);
                            setIsContextOpen(false);
                            setActiveContextSubmenu('none');
                          }}
                          className="w-full py-1.5 px-2 flex items-center justify-between text-left hover:bg-[#21262D] rounded transition-colors"
                        >
                          <div>
                            <div className="font-mono text-[#58A6FF] text-xs font-semibold">
                              {m.token}
                            </div>
                            <div className="text-[10px] text-[#7D8590]">{m.desc}</div>
                          </div>
                          <span className="text-[#7D8590] text-xs">↵</span>
                        </button>
                      ))}
                  </div>
                </div>
              ) : (
                /* Skills Submenu */
                <div className="space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-[#21262D]">
                    <button
                      type="button"
                      onClick={() => setActiveContextSubmenu('none')}
                      className="flex items-center gap-1 text-[#58A6FF] font-semibold hover:underline"
                    >
                      <span>‹</span> Back
                    </button>
                    <span className="font-bold text-white text-xs">Skills & Tools</span>
                  </div>
                  <input
                    type="text"
                    value={skillsSearch}
                    onChange={(e) => setSkillsSearch(e.target.value)}
                    placeholder="Search skills…"
                    className="w-full bg-[#0D1117] border border-[#30363D] rounded px-2.5 py-1 text-xs text-white placeholder-[#7D8590] focus:outline-none focus:border-[#58A6FF]"
                  />
                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <button
                      type="button"
                      onClick={() => showToast('Opened Skills Library')}
                      className="text-[#58A6FF] hover:underline font-semibold"
                    >
                      See all skills in Library
                    </button>
                    <button
                      type="button"
                      onClick={() => showToast('Add custom skill modal')}
                      className="text-[#3FB950] hover:underline font-semibold"
                    >
                      + Add skill
                    </button>
                  </div>
                  <div className="divide-y divide-[#21262D] max-h-52 overflow-y-auto pt-1">
                    {[
                      {
                        name: 'Git Smart HTTP Engine',
                        cat: 'GIT',
                        catColor: 'bg-[#FF8C42]/20 text-[#FF8C42]',
                        desc: 'Wire protocol & push/clone validation',
                      },
                      {
                        name: 'Monorepo AST Parser',
                        cat: 'CODE',
                        catColor: 'bg-[#58A6FF]/20 text-[#58A6FF]',
                        desc: 'Deep TypeScript symbol & import inspection',
                      },
                      {
                        name: 'Vitest QA Sentinel',
                        cat: 'QA',
                        catColor: 'bg-[#3FB950]/20 text-[#3FB950]',
                        desc: 'Automated regression test runs & zero-mock gates',
                      },
                      {
                        name: 'LiveKit WebRTC Gateway',
                        cat: 'VOICE',
                        catColor: 'bg-[#A371F7]/20 text-[#A371F7]',
                        desc: 'Realtime audio/video streaming & room controls',
                      },
                      {
                        name: 'Redis 3-Layer Memory',
                        cat: 'MEMORY',
                        catColor: 'bg-[#F0883E]/20 text-[#F0883E]',
                        desc: 'Hierarchical cache, Prisma & vector persistence',
                      },
                      {
                        name: 'Prisma Schema Auditor',
                        cat: 'DB',
                        catColor: 'bg-[#79C0FF]/20 text-[#79C0FF]',
                        desc: 'Schema migrations, quota sum & index verification',
                      },
                    ]
                      .filter((s) => s.name.toLowerCase().includes(skillsSearch.toLowerCase()))
                      .map((sk) => {
                        const isEnabled = activeSkills[sk.name] ?? false;
                        return (
                          <div
                            key={sk.name}
                            className="py-2 px-1 flex items-center justify-between text-xs hover:bg-[#21262D]/50 rounded"
                          >
                            <div className="pr-2 min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${sk.catColor}`}
                                >
                                  {sk.cat}
                                </span>
                                <span className="font-medium text-white truncate">{sk.name}</span>
                              </div>
                              <div className="text-[10px] text-[#7D8590] leading-snug mt-0.5">
                                {sk.desc}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const next = !isEnabled;
                                setActiveSkills((prev) => ({
                                  ...prev,
                                  [sk.name]: next,
                                }));
                                showToast(`${sk.name} ${next ? 'Enabled' : 'Disabled'}`);
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 transition-colors ${
                                isEnabled
                                  ? 'bg-[#238636] text-white hover:bg-[#2ea043]'
                                  : 'bg-[#21262D] text-[#7D8590] hover:text-white'
                              }`}
                            >
                              {isEnabled ? 'ON' : 'OFF'}
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Popup Menu for Settings (⊶) */}
          {isSettingsOpen && (
            <div className="absolute bottom-full left-10 mb-2 w-80 p-2.5 rounded-xl bg-[#161B22] border border-[#30363D] shadow-2xl z-30 text-xs animate-in fade-in slide-in-from-bottom-2">
              {activeSettingsSubmenu === 'none' ? (
                <div className="space-y-1">
                  {/* Computer */}
                  <button
                    type="button"
                    onClick={() => setActiveSettingsSubmenu('computer')}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#21262D] text-[#E6EDF3] text-left transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span>💻</span>
                      <span className="font-semibold text-white">Computer</span>
                    </div>
                    <span className="text-[#7D8590]">›</span>
                  </button>

                  {/* My sources */}
                  <button
                    type="button"
                    onClick={() => setActiveSettingsSubmenu('sources')}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#21262D] text-[#E6EDF3] text-left transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span>📚</span>
                      <span className="font-semibold text-white">My sources</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-[#21262D] text-[10px] text-[#58A6FF] font-bold">
                        3
                      </span>
                    </div>
                    <span className="text-[#7D8590]">›</span>
                  </button>

                  {/* MCP servers */}
                  <button
                    type="button"
                    onClick={() => setActiveSettingsSubmenu('mcp')}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#21262D] text-[#E6EDF3] text-left transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span>🔌</span>
                      <span className="font-semibold text-white">MCP servers</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-[#21262D] text-[10px] text-[#3FB950] font-bold">
                        {mcpServers.length}
                      </span>
                    </div>
                    <span className="text-[#7D8590]">›</span>
                  </button>

                  {/* Mode */}
                  <button
                    type="button"
                    onClick={() => setActiveSettingsSubmenu('mode')}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#21262D] text-[#E6EDF3] text-left transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span>⚡</span>
                      <span className="font-semibold text-white">Mode</span>
                      <span className="text-[10px] text-[#7D8590] capitalize">({notionMode})</span>
                    </div>
                    <span className="text-[#7D8590]">›</span>
                  </button>

                  {/* Personalize */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsPersonalizeOpen(true);
                      setIsSettingsOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#21262D] text-[#E6EDF3] text-left transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span>🎨</span>
                      <span className="font-semibold text-white">Personalize</span>
                    </div>
                    <span className="text-[#7D8590]">›</span>
                  </button>

                  <div className="pt-2 border-t border-[#21262D]">
                    <span className="font-bold text-[#7D8590] uppercase tracking-wider text-[10px]">
                      Model Selector
                    </span>
                    <div className="grid grid-cols-1 gap-1 mt-1">
                      {[
                        {
                          id: 'opus-5',
                          name: 'Claude Opus 5 / GPT-6 Astra',
                          desc: 'Deep architecture, reasoning & swarm leader',
                        },
                        {
                          id: 'sonnet-35',
                          name: 'Claude 3.5 Sonnet',
                          desc: 'High-speed code synthesis & diff generation',
                        },
                        {
                          id: 'quant-slm',
                          name: 'Quant AI Fast SLM',
                          desc: 'Instant local triage & AST queries',
                        },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setActiveModel(m.id as any);
                            showToast(`Selected: ${m.name}`);
                          }}
                          className={`p-2 rounded-lg text-left transition-colors border ${
                            activeModel === m.id
                              ? 'border-[#FF8C42] bg-[#FF8C42]/10 text-white'
                              : 'border-transparent hover:bg-[#21262D] text-[#7D8590]'
                          }`}
                        >
                          <div className="font-bold text-xs text-white">{m.name}</div>
                          <div className="text-[10px] text-[#7D8590]">{m.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#21262D]">
                    <span className="font-bold text-[#7D8590] uppercase tracking-wider text-[10px]">
                      Reasoning Effort
                    </span>
                    <div className="flex items-center gap-1 mt-1">
                      {(['fast', 'deep'] as const).map((eff) => (
                        <button
                          key={eff}
                          type="button"
                          onClick={() => setEffort(eff)}
                          className={`flex-1 py-1 rounded text-[11px] font-bold capitalize transition-colors ${
                            effort === eff
                              ? 'bg-[#58A6FF] text-black'
                              : 'bg-[#21262D] text-[#7D8590] hover:text-white'
                          }`}
                        >
                          {eff} ({eff === 'deep' ? '32k' : '1k'})
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : activeSettingsSubmenu === 'computer' ? (
                /* Computer Submenu */
                <div className="space-y-3 p-1">
                  <div className="flex items-center justify-between pb-2 border-b border-[#21262D]">
                    <button
                      type="button"
                      onClick={() => setActiveSettingsSubmenu('none')}
                      className="flex items-center gap-1 text-[#58A6FF] font-semibold hover:underline"
                    >
                      <span>‹</span> Back
                    </button>
                    <span className="font-bold text-white text-xs">Computer Settings</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white text-xs">Enable Workers Beta</div>
                      <div className="text-[10px] text-[#7D8590] max-w-[210px] leading-relaxed mt-0.5">
                        Allows the computer to create, deploy, update, and delete Notion Workers in
                        this workspace.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEnableWorkersBeta(!enableWorkersBeta)}
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                        enableWorkersBeta ? 'bg-[#238636]' : 'bg-[#30363D]'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform ${
                          enableWorkersBeta ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ) : activeSettingsSubmenu === 'sources' ? (
                /* Sources Submenu */
                <div className="space-y-2.5 p-1">
                  <div className="flex items-center justify-between pb-2 border-b border-[#21262D]">
                    <button
                      type="button"
                      onClick={() => setActiveSettingsSubmenu('none')}
                      className="flex items-center gap-1 text-[#58A6FF] font-semibold hover:underline"
                    >
                      <span>‹</span> Back
                    </button>
                    <span className="font-bold text-white text-xs">Knowledge Sources</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { key: 'all', label: 'All sources I can access' },
                      {
                        key: 'dev6',
                        label: 'Developer 6 with gpt 5.6 sol , opus 5 and kimi k3',
                      },
                      { key: 'helpCenter', label: 'Quant Help Center' },
                      { key: 'webAccess', label: 'Web access' },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center justify-between">
                        <span className="text-xs text-white truncate max-w-[210px]">
                          {item.label}
                        </span>
                        <input
                          type="checkbox"
                          checked={(sourcesState as any)[item.key]}
                          onChange={() =>
                            setSourcesState((prev) => ({
                              ...prev,
                              [item.key]: !(prev as any)[item.key],
                            }))
                          }
                          className="accent-[#58A6FF] w-4 h-4 cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-[#21262D] flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => showToast('Source connector dialog')}
                      className="text-[#58A6FF] hover:underline text-[11px] font-semibold"
                    >
                      + Add sources
                    </button>
                    <span className="text-[9px] text-[#7D8590]">Sources scoped</span>
                  </div>
                  <p className="text-[10px] text-[#7D8590] leading-relaxed">
                    Quanty AI will only search information from the sources selected here.
                  </p>
                </div>
              ) : activeSettingsSubmenu === 'mcp' ? (
                /* MCP Servers Submenu */
                <div className="space-y-2.5 p-1">
                  <div className="flex items-center justify-between pb-2 border-b border-[#21262D]">
                    <button
                      type="button"
                      onClick={() => setActiveSettingsSubmenu('none')}
                      className="flex items-center gap-1 text-[#58A6FF] font-semibold hover:underline"
                    >
                      <span>‹</span> Back
                    </button>
                    <span className="font-bold text-white text-xs">MCP Servers</span>
                  </div>
                  <div className="space-y-1.5">
                    {mcpServers.map((server) => (
                      <div
                        key={server}
                        className="p-2 rounded bg-[#0D1117] border border-[#30363D] flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#3FB950]" />
                          <span className="font-semibold text-white">{server}</span>
                        </div>
                        <span className="text-[10px] text-[#7D8590]">Connected</span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMcpServers([...mcpServers, `Server-${mcpServers.length + 1}`]);
                      showToast('Added MCP Server connection');
                    }}
                    className="w-full py-1.5 rounded bg-[#21262D] hover:bg-[#30363D] text-[#58A6FF] font-semibold text-xs border border-[#30363D] transition-colors"
                  >
                    + Add MCP server
                  </button>
                </div>
              ) : (
                /* Mode Submenu */
                <div className="space-y-2.5 p-1">
                  <div className="flex items-center justify-between pb-2 border-b border-[#21262D]">
                    <button
                      type="button"
                      onClick={() => setActiveSettingsSubmenu('none')}
                      className="flex items-center gap-1 text-[#58A6FF] font-semibold hover:underline"
                    >
                      <span>‹</span> Back
                    </button>
                    <span className="font-bold text-white text-xs">Operating Mode</span>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { id: 'default', title: 'Default', desc: 'Can search, edit, and more' },
                      { id: 'ask', title: 'Ask', desc: 'Answers only, won’t make edits' },
                    ].map((md) => (
                      <button
                        key={md.id}
                        type="button"
                        onClick={() => setNotionMode(md.id as any)}
                        className={`w-full p-2 rounded-lg text-left border transition-colors ${
                          notionMode === md.id
                            ? 'bg-[#58A6FF]/10 border-[#58A6FF] text-white'
                            : 'border-transparent hover:bg-[#21262D] text-[#7D8590]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white">{md.title}</span>
                          {notionMode === md.id && (
                            <span className="text-[#58A6FF] font-bold">●</span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#7D8590] mt-0.5">{md.desc}</div>
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] text-[#7D8590] pt-1 border-t border-[#21262D]">
                    Tip: Cycle through modes with shift+tab
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Input Textarea Container */}
          <div className="relative rounded-2xl bg-[#161B22] border border-[#30363D] p-3 shadow-2xl focus-within:border-[#58A6FF] transition-all">
            {/* Attached Files Row */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-2 border-b border-[#21262D]/60 mb-2">
                {attachedFiles.map((f, idx) => (
                  <span
                    key={idx}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#21262D] border border-[#30363D] text-[11px] text-[#E6EDF3]"
                  >
                    <span>📎</span>
                    <span className="font-mono text-[10px]">{f}</span>
                    <button
                      type="button"
                      onClick={() => setAttachedFiles(attachedFiles.filter((_, i) => i !== idx))}
                      className="text-[#7D8590] hover:text-[#F85149] font-bold"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}

            <textarea
              rows={2}
              value={promptInput}
              disabled={isChatSubmitting}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleChatSubmit();
                }
              }}
              placeholder={isChatSubmitting ? 'Quanty is thinking...' : 'Do anything with AI...'}
              className="w-full bg-transparent border-0 resize-none text-xs text-[#E6EDF3] placeholder-[#7D8590] focus:outline-none leading-relaxed disabled:opacity-60"
            />

            {/* Bottom Action Bar inside Textarea container */}
            <div className="flex items-center justify-between pt-2 border-t border-[#21262D]/60 text-xs">
              <div className="flex items-center gap-2">
                {/* Give context (+) button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsContextOpen(!isContextOpen);
                    setIsSettingsOpen(false);
                    setActiveContextSubmenu('none');
                  }}
                  className={`p-1.5 rounded-lg border transition-colors ${
                    isContextOpen
                      ? 'bg-[#30363D] border-[#58A6FF] text-white'
                      : 'bg-[#21262D] border-[#30363D] text-[#7D8590] hover:text-white hover:bg-[#30363D]'
                  }`}
                  title="Give context (Files, @ Mention, Skills)"
                >
                  <span className="font-bold text-sm leading-none">+</span>
                </button>

                {/* Settings (⊶) button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsSettingsOpen(!isSettingsOpen);
                    setIsContextOpen(false);
                    setActiveSettingsSubmenu('none');
                  }}
                  className={`p-1.5 rounded-lg border transition-colors ${
                    isSettingsOpen
                      ? 'bg-[#30363D] border-[#58A6FF] text-white'
                      : 'bg-[#21262D] border-[#30363D] text-[#7D8590] hover:text-white hover:bg-[#30363D]'
                  }`}
                  title="Model & Execution Settings"
                >
                  <svg height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                    <path d="M14 10.5a.75.75 0 0 1-.75.75H10v1.5a.75.75 0 0 1-1.5 0v-1.5H2.75a.75.75 0 0 1 0-1.5H8.5V8.25a.75.75 0 0 1 1.5 0V9.75h3.25a.75.75 0 0 1 .75.75ZM6 5.5a.75.75 0 0 1-.75.75H2.75a.75.75 0 0 1 0-1.5H5.25V3.25a.75.75 0 0 1 1.5 0v1.5h6.5a.75.75 0 0 1 0 1.5H6.75v1.5a.75.75 0 0 1-1.5 0v-1.5Z" />
                  </svg>
                </button>

                {/* Active model & mode pill */}
                <span className="text-[10px] font-semibold text-[#7D8590] bg-[#21262D] px-2 py-0.5 rounded-md border border-[#30363D]">
                  {activeModel === 'opus-5'
                    ? 'Opus 5'
                    : activeModel === 'sonnet-35'
                      ? 'Sonnet 3.5'
                      : 'Quant SLM'}{' '}
                  · {notionMode === 'default' ? 'Default' : 'Ask'} ·{' '}
                  {effort === 'deep' ? '32k' : '1k'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Voice recording button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsRecording(!isRecording);
                    showToast(
                      isRecording ? 'Voice dictation stopped' : 'Listening... speak your prompt',
                    );
                  }}
                  className={`p-1.5 rounded-lg border transition-colors ${
                    isRecording
                      ? 'bg-[#DA3633] border-[#F85149] text-white animate-pulse'
                      : 'bg-[#21262D] border-[#30363D] text-[#7D8590] hover:text-white hover:bg-[#30363D]'
                  }`}
                  title="Start voice recording"
                >
                  🎙️
                </button>

                {/* Submit button */}
                <button
                  type="button"
                  disabled={!promptInput.trim() || isChatSubmitting}
                  onClick={() => handleChatSubmit()}
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold transition-all ${
                    promptInput.trim() && !isChatSubmitting
                      ? 'bg-[#FF8C42] text-black shadow-lg hover:scale-105 cursor-pointer'
                      : 'bg-[#21262D] text-[#7D8590] cursor-not-allowed opacity-50'
                  }`}
                  title="Submit AI message"
                >
                  {isChatSubmitting ? '…' : '↑'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
