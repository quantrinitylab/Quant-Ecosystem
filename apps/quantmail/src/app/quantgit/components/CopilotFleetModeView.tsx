'use client';

// ============================================================================
// QuantGit — Copilot Cloud Agent OS & Fleet Mode (Screens 1–14, 135–142)
// ============================================================================

import React, { useState } from 'react';

export interface CopilotModel {
  id: string;
  name: string;
  badge?: string;
  tier: 'fast' | 'versatile' | 'powerful';
  description?: string;
}

const COPILOT_MODELS: CopilotModel[] = [
  // Fast & cost-efficient
  {
    id: 'kimi-k2',
    name: 'Kimi K2.7 Code',
    tier: 'fast',
    description: 'Blazing fast code generation',
  },
  {
    id: 'gpt-6-luna',
    name: 'GPT-6 Luna',
    tier: 'fast',
    badge: 'New',
    description: 'Ultra-low latency reasoning',
  },
  {
    id: 'gpt-5-4-flash',
    name: 'GPT-5.4 Flash',
    tier: 'fast',
    description: 'Quick code snippets & syntax checks',
  },
  // Versatile & highly intelligent
  {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    tier: 'versatile',
    description: 'Industry gold standard coding',
  },
  {
    id: 'gpt-5-5-codex',
    name: 'GPT-5.5 Codex',
    tier: 'versatile',
    description: 'Deep logic & unit tests',
  },
  {
    id: 'gemini-3-flash',
    name: 'Gemini 3 Flash',
    tier: 'versatile',
    description: 'High context window search',
  },
  // Most powerful for complex tasks
  {
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5 Pro',
    tier: 'powerful',
    badge: 'Pro',
    description: 'Exhaustive systems architecture',
  },
  {
    id: 'gpt-6-astra',
    name: 'GPT-6 Astra Pro',
    tier: 'powerful',
    badge: 'Pro',
    description: 'Autonomous agent coordinator',
  },
  {
    id: 'claude-opus-5',
    name: 'Claude Opus 5',
    tier: 'powerful',
    badge: 'Pro',
    description: 'Complex multi-repo refactoring',
  },
];

export interface CopilotAgentTask {
  id: string;
  title: string;
  // Tasks created in this view are local session drafts only — no cloud
  // agent backend is connected, so nothing is ever 'running' or dispatched.
  status: 'local';
  model: string;
  startedAt: string;
}

export interface CopilotFleetModeViewProps {
  repoOwner?: string;
  repoName?: string;
  onDispatchTask?: (prompt: string, model: string, mode: string) => void;
}

export const CopilotFleetModeView: React.FC<CopilotFleetModeViewProps> = ({
  repoOwner = 'quantrinitylab',
  repoName = 'Quant-Ecosystem',
  onDispatchTask,
}) => {
  const [selectedModel, setSelectedModel] = useState<CopilotModel>(COPILOT_MODELS[3]); // Claude Sonnet 4.5
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<'ask' | 'agent' | 'debug'>('agent');
  const [promptText, setPromptText] = useState('');
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [selectedContext, setSelectedContext] = useState<string[]>([
    '@repo:' + repoOwner + '/' + repoName,
  ]);

  // Local session drafts only. There is no cloud agent backend wired to
  // this view, so the list starts empty and entries added here are never
  // presented as running or dispatched work.
  const [agentTasks, setAgentTasks] = useState<CopilotAgentTask[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim()) return;

    const newTask: CopilotAgentTask = {
      id: `task-${Date.now().toString().slice(-4)}`,
      title: promptText,
      status: 'local',
      model: selectedModel.name,
      startedAt: 'Just now',
    };
    setAgentTasks((prev) => [newTask, ...prev]);
    onDispatchTask?.(promptText, selectedModel.id, activeMode);
    setPromptText('');
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col h-[calc(100vh-140px)] text-[#E6EDF3] py-2 relative">
      {/* Copilot Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#30363D]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-blue-500 flex items-center justify-center text-white text-base font-bold shadow-md">
            🤖
          </div>
          <div>
            <h3 className="font-semibold text-sm text-[#E6EDF3] flex items-center gap-2">
              <span>GitHub Copilot Fleet Mode</span>
              <span className="text-[10px] px-2 py-px rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Cloud Agents
              </span>
            </h3>
            <p className="text-[11px] text-[#8D96A0]">
              Task planning for {repoOwner}/{repoName}. Workspace tasks you add here are local to
              this session — connect a real agent backend to enable autonomous dispatch.
            </p>
          </div>
        </div>

        {/* No usage meter: there is no connected backend metering tokens or
            credits for this view, so no usage figure is shown. */}
      </div>

      {/* Cloud Agent Sessions Banner (Screens 140–142) */}
      <div className="my-3 p-4 rounded-xl bg-gradient-to-r from-[var(--quant-surface-elevated)]/70 to-[#0F172A]/70 border border-[#30363D] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-xl shrink-0">
            ⚡
          </div>
          <div>
            <h4 className="font-semibold text-xs text-[#E6EDF3]">
              Plan tasks for Copilot cloud agents
            </h4>
            <p className="text-[11px] text-[#8D96A0]">
              Dispatch is not connected yet — tasks stay in this browser session and are not
              executed by any agent.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-purple-300">
            {agentTasks.length} local {agentTasks.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>
      </div>

      {/* Local Tasks Feed */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {agentTasks.length === 0 ? (
          <div
            data-testid="fleet-tasks-empty"
            className="p-4 rounded-xl bg-[var(--quant-surface-elevated)] border border-[#30363D] text-[11px] text-[#8D96A0]"
          >
            No agent tasks yet. Tasks you add below appear here as local session drafts — nothing
            is dispatched or executed until a real agent backend is connected.
          </div>
        ) : (
          agentTasks.map((task) => (
            <div
              key={task.id}
              className="p-3.5 rounded-xl bg-[var(--quant-surface-elevated)] border border-[#30363D] hover:border-[#58A6FF]/60 transition-all space-y-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-[#21262D] text-[#8D96A0] flex items-center justify-center text-xs">
                    ○
                  </div>
                  <div>
                    <h5 className="font-semibold text-xs text-[#E6EDF3]">{task.title}</h5>
                    <div className="flex items-center gap-2 text-[10px] text-[#8D96A0] pt-0.5">
                      <span className="font-mono">{task.model}</span>
                      <span>•</span>
                      <span>{task.startedAt}</span>
                    </div>
                  </div>
                </div>

                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider bg-[#21262D] text-[#8D96A0] border border-[#30363D]">
                  Local only
                </span>
              </div>

              <p className="text-[10px] text-[#8D96A0]">
                Saved locally — not dispatched to any agent backend.
              </p>
            </div>
          ))
        )}
      </div>

      {/* Preset Prompts (Screens 137–139) */}
      <div className="grid grid-cols-2 gap-2 pt-2 pb-2">
        <button
          onClick={() =>
            setPromptText('Explain database indexing benefits and recommend GIN trigram indexes')
          }
          className="p-2.5 rounded-lg bg-[var(--quant-surface-elevated)] border border-[#30363D] hover:border-[#58A6FF] text-left transition-colors"
        >
          <p className="font-semibold text-xs text-[#E6EDF3]">Performance & Optimization</p>
          <p className="text-[10px] text-[#8D96A0] truncate">Explain database indexing benefits</p>
        </button>
        <button
          onClick={() =>
            setPromptText(
              'Audit Signal protocol prekey rotation and check for timing vulnerabilities',
            )
          }
          className="p-2.5 rounded-lg bg-[var(--quant-surface-elevated)] border border-[#30363D] hover:border-[#58A6FF] text-left transition-colors"
        >
          <p className="font-semibold text-xs text-[#E6EDF3]">Security & Auditing</p>
          <p className="text-[10px] text-[#8D96A0] truncate">Audit Signal protocol prekeys</p>
        </button>
      </div>

      {/* Input Composer & Toolbar */}
      <form onSubmit={handleSubmit} className="pt-2 border-t border-[#30363D] space-y-2">
        {/* Context chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {selectedContext.map((ctx) => (
            <span
              key={ctx}
              className="text-[11px] px-2 py-0.5 rounded-md bg-[#21262D] border border-[#30363D] text-[#58A6FF] font-mono flex items-center gap-1"
            >
              <span>{ctx}</span>
              <button
                type="button"
                onClick={() => setSelectedContext(selectedContext.filter((c) => c !== ctx))}
                className="hover:text-red-400"
              >
                ✕
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() =>
              setSelectedContext([...selectedContext, '@files:backend/routes/repos.ts'])
            }
            className="text-[11px] text-[#8D96A0] hover:text-[#E6EDF3] transition-colors"
          >
            + Add context
          </button>
        </div>

        {/* Input box */}
        <div className="relative rounded-xl bg-[var(--quant-surface-elevated)] border border-[#30363D] focus-within:border-[#58A6FF] transition-all p-2.5 space-y-2">
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Ask Copilot anything or type @ to add context..."
            rows={2}
            className="w-full bg-transparent text-xs text-[#E6EDF3] placeholder-[#8D96A0] outline-none resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />

          {/* Bottom Toolbar: Mode pills + Model selector + Send */}
          <div className="flex items-center justify-between pt-1 border-t border-[#21262D]">
            {/* Mode Selector */}
            <div className="flex items-center gap-1 bg-[#0D1117] p-0.5 rounded-lg border border-[#30363D]">
              {(['ask', 'agent', 'debug'] as const).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  onClick={() => setActiveMode(mode)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize transition-colors ${
                    activeMode === mode
                      ? 'bg-[#21262D] text-[#E6EDF3]'
                      : 'text-[#8D96A0] hover:text-[#E6EDF3]'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Model Selector Dropdown (Screens 12–13) */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#21262D] hover:bg-[#30363D] text-[11px] font-medium text-[#E6EDF3] border border-[#30363D] transition-colors"
                >
                  <span>{selectedModel.name}</span>
                  {selectedModel.badge && (
                    <span className="px-1 py-0.1 rounded text-[var(--q-type-xs)] bg-purple-500/30 text-purple-300">
                      {selectedModel.badge}
                    </span>
                  )}
                  <span className="text-[var(--q-type-xs)] text-[#8D96A0]">▼</span>
                </button>

                {isModelMenuOpen && (
                  <div className="absolute right-0 bottom-full mb-1.5 w-64 rounded-xl bg-[var(--quant-surface-elevated)] border border-[#30363D] shadow-2xl p-2 z-50 space-y-2 max-h-72 overflow-y-auto">
                    <div className="text-[10px] font-semibold text-[#8D96A0] px-2 uppercase">
                      Select Model
                    </div>
                    {COPILOT_MODELS.map((m) => (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => {
                          setSelectedModel(m);
                          setIsModelMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left hover:bg-[#21262D] transition-colors ${
                          selectedModel.id === m.id
                            ? 'bg-[#1F242C] text-[#58A6FF]'
                            : 'text-[#E6EDF3]'
                        }`}
                      >
                        <div>
                          <div className="font-medium text-xs flex items-center gap-1.5">
                            <span>{m.name}</span>
                            {m.badge && (
                              <span className="px-1 py-0.1 rounded text-[var(--q-type-xs)] bg-purple-500/30 text-purple-300">
                                {m.badge}
                              </span>
                            )}
                          </div>
                          {m.description && (
                            <p className="text-[10px] text-[#8D96A0]">{m.description}</p>
                          )}
                        </div>
                        {selectedModel.id === m.id && <span>✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!promptText.trim()}
                className="w-7 h-7 rounded-lg bg-[#238636] hover:bg-[#2EA043] disabled:opacity-50 disabled:hover:bg-[#238636] text-white flex items-center justify-center transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 12h14M12 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
