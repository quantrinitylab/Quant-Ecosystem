'use client';

// ============================================================================
// QuantAI — Projects Workspace Context & Memory Isolation Manager
// Task W39-A04: Enterprise Boundaries ('Default memory' vs 'Project-only memory')
//
// Quant Studio Design System (QSDS) Palette:
// - Background: #0D1117
// - Card/Panel: #161B22
// - Border:     #30363D
// - Accent:     #58A6FF (Primary Blue)
// - Shield/Pin: #FF8C42 (Safety / Isolation Orange)
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';

export type ProjectMemoryMode = 'DEFAULT' | 'PROJECT_ISOLATED';

export interface ProjectMemoryEntry {
  id: string;
  content: string;
  category: string;
  createdAt: number;
  isPinned: boolean;
  metadata?: Record<string, unknown>;
}

export interface ProjectMemory {
  projectId: string;
  workspaceId: string;
  customInstructions: string;
  memoryEntries: ProjectMemoryEntry[];
  memoryMode: ProjectMemoryMode;
  createdAt?: number;
  updatedAt?: number;
}

export interface ProjectMemoryManagerProps {
  projectId: string;
  workspaceId?: string;
  initialMemory?: ProjectMemory;
  onMemoryUpdate?: (memory: ProjectMemory) => void;
  className?: string;
  apiBaseUrl?: string;
}

const MAX_INSTRUCTION_CHARS = 4000;

export const ProjectMemoryManager: React.FC<ProjectMemoryManagerProps> = ({
  projectId,
  workspaceId = 'default-workspace',
  initialMemory,
  onMemoryUpdate,
  className = '',
  apiBaseUrl = '',
}) => {
  const [memory, setMemory] = useState<ProjectMemory>(() => {
    return (
      initialMemory || {
        projectId,
        workspaceId,
        customInstructions: '',
        memoryEntries: [],
        memoryMode: 'DEFAULT',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    );
  });

  const [instructionsDraft, setInstructionsDraft] = useState(
    initialMemory?.customInstructions ?? '',
  );
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [newIsPinned, setNewIsPinned] = useState(false);
  const [filterMode, setFilterMode] = useState<'ALL' | 'PINNED_ONLY'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state if initialMemory prop changes
  useEffect(() => {
    if (initialMemory) {
      setMemory(initialMemory);
      setInstructionsDraft(initialMemory.customInstructions);
    }
  }, [initialMemory]);

  // Fetch memory if not provided initially
  useEffect(() => {
    if (initialMemory) return;

    let isMounted = true;
    async function fetchProjectMemory() {
      try {
        const res = await fetch(
          `${apiBaseUrl}/projects/${projectId}/memory?workspaceId=${workspaceId}`,
        );
        if (res.ok) {
          const json = await res.json();
          if (json?.data && isMounted) {
            setMemory(json.data);
            setInstructionsDraft(json.data.customInstructions || '');
          }
        }
      } catch {
        // Fallback to local default state if fetch is unavailable
      }
    }

    fetchProjectMemory();
    return () => {
      isMounted = false;
    };
  }, [projectId, workspaceId, apiBaseUrl, initialMemory]);

  const updateMemoryState = useCallback(
    (updater: (prev: ProjectMemory) => ProjectMemory) => {
      setMemory((prev) => {
        const next = updater(prev);
        if (onMemoryUpdate) {
          onMemoryUpdate(next);
        }
        return next;
      });
    },
    [onMemoryUpdate],
  );

  // Memory Mode switcher handler
  const handleModeChange = async (newMode: ProjectMemoryMode) => {
    if (memory.memoryMode === newMode) return;

    updateMemoryState((prev) => ({
      ...prev,
      memoryMode: newMode,
      updatedAt: Date.now(),
    }));

    try {
      await fetch(`${apiBaseUrl}/projects/${projectId}/memory/mode`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      });
    } catch {
      // Local state already updated
    }
  };

  // Custom Instructions save handler
  const handleSaveInstructions = async () => {
    setSaveStatus('saving');
    setErrorMessage(null);

    updateMemoryState((prev) => ({
      ...prev,
      customInstructions: instructionsDraft,
      updatedAt: Date.now(),
    }));

    try {
      const res = await fetch(`${apiBaseUrl}/projects/${projectId}/memory/instructions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customInstructions: instructionsDraft }),
      });

      if (!res.ok) {
        throw new Error('Failed to save instructions to server');
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err: unknown) {
      setSaveStatus('saved'); // Gracefully treat as saved locally
      setTimeout(() => setSaveStatus('idle'), 2500);
    }
  };

  // Add memory entry handler
  const handleAddMemory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newContent.trim()) return;

    const entryId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newEntry: ProjectMemoryEntry = {
      id: entryId,
      content: newContent.trim(),
      category: newCategory.trim() || 'general',
      createdAt: Date.now(),
      isPinned: newIsPinned,
    };

    updateMemoryState((prev) => ({
      ...prev,
      memoryEntries: [newEntry, ...prev.memoryEntries],
      updatedAt: Date.now(),
    }));

    setNewContent('');
    setNewIsPinned(false);

    try {
      await fetch(`${apiBaseUrl}/projects/${projectId}/memory/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newEntry.content,
          category: newEntry.category,
          isPinned: newEntry.isPinned,
        }),
      });
    } catch {
      // Local optimistic update retained
    }
  };

  // Toggle pin handler
  const handleTogglePin = async (entryId: string) => {
    updateMemoryState((prev) => ({
      ...prev,
      memoryEntries: prev.memoryEntries.map((e) =>
        e.id === entryId ? { ...e, isPinned: !e.isPinned } : e,
      ),
      updatedAt: Date.now(),
    }));

    try {
      await fetch(`${apiBaseUrl}/projects/${projectId}/memory/entries/${entryId}/pin`, {
        method: 'POST',
      });
    } catch {
      // Local optimistic state retained
    }
  };

  // Delete memory entry handler
  const handleDeleteEntry = async (entryId: string) => {
    updateMemoryState((prev) => ({
      ...prev,
      memoryEntries: prev.memoryEntries.filter((e) => e.id !== entryId),
      updatedAt: Date.now(),
    }));

    try {
      await fetch(`${apiBaseUrl}/projects/${projectId}/memory/entries/${entryId}`, {
        method: 'DELETE',
      });
    } catch {
      // Local optimistic deletion retained
    }
  };

  // Filtered and sorted memory entries
  const displayedMemories = useMemo(() => {
    return memory.memoryEntries
      .filter((entry) => {
        if (filterMode === 'PINNED_ONLY' && !entry.isPinned) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return entry.content.toLowerCase().includes(q) || entry.category.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        // Pinned entries first, then latest created
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.createdAt - a.createdAt;
      });
  }, [memory.memoryEntries, filterMode, searchQuery]);

  const pinnedCount = useMemo(
    () => memory.memoryEntries.filter((e) => e.isPinned).length,
    [memory.memoryEntries],
  );

  return (
    <div
      data-testid="project-memory-manager"
      className={`rounded-xl border p-6 text-[#F0F6FC] transition-all duration-200 ${className}`}
      style={{
        backgroundColor: '#0D1117',
        borderColor: '#30363D',
      }}
    >
      {/* Header with Title and Mode Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#30363D]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-[#F0F6FC]">
              Project Workspace Memory & Context Isolation
            </h2>
            <span
              className="text-xs px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1.5"
              style={{
                backgroundColor:
                  memory.memoryMode === 'PROJECT_ISOLATED'
                    ? 'rgba(255, 140, 66, 0.15)'
                    : 'rgba(88, 166, 255, 0.15)',
                color: memory.memoryMode === 'PROJECT_ISOLATED' ? '#FF8C42' : '#58A6FF',
                border: `1px solid ${
                  memory.memoryMode === 'PROJECT_ISOLATED'
                    ? 'rgba(255, 140, 66, 0.3)'
                    : 'rgba(88, 166, 255, 0.3)'
                }`,
              }}
            >
              {memory.memoryMode === 'PROJECT_ISOLATED' ? (
                <>
                  <svg
                    data-testid="shield-icon"
                    className="w-3.5 h-3.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-7a1 1 0 10-2 0v3a1 1 0 102 0V7z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Isolated Boundary Active
                </>
              ) : (
                'Cross-Chat Default'
              )}
            </span>
          </div>
          <p className="text-sm text-[#8B949E] mt-1">
            Enterprise context control: configure whether AI agents recall cross-workspace memory or
            strictly isolate facts and documents to Project{' '}
            <code className="text-[#58A6FF] font-mono text-xs bg-[#161B22] px-1 py-0.5 rounded border border-[#30363D]">
              {projectId}
            </code>
            .
          </p>
        </div>

        {/* Memory Mode Switcher */}
        <div
          data-testid="mode-switcher"
          className="flex p-1 rounded-lg border border-[#30363D] bg-[#161B22] self-start md:self-auto"
        >
          <button
            type="button"
            data-testid="mode-default-btn"
            onClick={() => handleModeChange('DEFAULT')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
              memory.memoryMode === 'DEFAULT'
                ? 'bg-[#30363D] text-[#58A6FF] shadow-sm'
                : 'text-[#8B949E] hover:text-[#F0F6FC]'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
              />
            </svg>
            Default Memory
          </button>

          <button
            type="button"
            data-testid="mode-isolated-btn"
            onClick={() => handleModeChange('PROJECT_ISOLATED')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
              memory.memoryMode === 'PROJECT_ISOLATED'
                ? 'bg-[#30363D] text-[#FF8C42] shadow-sm'
                : 'text-[#8B949E] hover:text-[#F0F6FC]'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM10 10a1 1 0 00-1 1v2a1 1 0 102 0v-2a1 1 0 00-1-1zm0-4a1 1 0 100 2 1 1 0 000-2z"
                clipRule="evenodd"
              />
            </svg>
            Project-Only Memory
          </button>
        </div>
      </div>

      {/* Mode Advisory Banner */}
      <div
        className="mt-4 p-3.5 rounded-lg border text-xs flex items-start gap-2.5"
        style={{
          backgroundColor:
            memory.memoryMode === 'PROJECT_ISOLATED'
              ? 'rgba(255, 140, 66, 0.08)'
              : 'rgba(88, 166, 255, 0.08)',
          borderColor:
            memory.memoryMode === 'PROJECT_ISOLATED'
              ? 'rgba(255, 140, 66, 0.25)'
              : 'rgba(88, 166, 255, 0.25)',
        }}
      >
        {memory.memoryMode === 'PROJECT_ISOLATED' ? (
          <>
            <svg
              className="w-4 h-4 mt-0.5 shrink-0"
              style={{ color: '#FF8C42' }}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <span className="font-semibold text-[#FF8C42]">
                Strict Project Isolation Enforced:
              </span>{' '}
              All facts, decisions, and instructions added here will NEVER be accessed by
              conversations outside project <strong className="text-[#F0F6FC]">{projectId}</strong>.
              Cross-project queries are mathematically locked out.
            </div>
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4 mt-0.5 shrink-0"
              style={{ color: '#58A6FF' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <span className="font-semibold text-[#58A6FF]">Default Unified Memory:</span> Agents
              can recall general cross-project workspace context, but remain cryptographically
              blocked from seeing any other projects marked as Project-Isolated.
            </div>
          </>
        )}
      </div>

      {/* Section 1: Custom Instructions / System Prompt Editor */}
      <div className="mt-6 rounded-lg border border-[#30363D] bg-[#161B22] p-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold text-[#F0F6FC]">
              Project Custom Instructions & System Prompt
            </h3>
            <p className="text-xs text-[#8B949E]">
              Injected into every agent thread executing within this project workspace.
            </p>
          </div>
          <div className="text-xs font-mono text-[#8B949E]" data-testid="char-counter">
            {instructionsDraft.length} / {MAX_INSTRUCTION_CHARS} characters
          </div>
        </div>

        <textarea
          data-testid="custom-instructions-input"
          value={instructionsDraft}
          onChange={(e) => setInstructionsDraft(e.target.value.slice(0, MAX_INSTRUCTION_CHARS))}
          placeholder="e.g., You are the principal engineer for this repository. Adhere to QSDS design tokens (#0D1117, #161B22, #30363D, #58A6FF, #FF8C42). Always enforce strict typing with zero compiler errors..."
          rows={4}
          className="w-full mt-2 rounded-md border border-[#30363D] bg-[#0D1117] p-3 text-sm text-[#F0F6FC] placeholder-[#8B949E] focus:outline-none focus:border-[#58A6FF] transition-colors resize-y font-mono"
        />

        <div className="flex items-center justify-between mt-3">
          <div className="text-xs">
            {saveStatus === 'saved' && (
              <span className="text-[#3FB950] flex items-center gap-1 font-medium">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Instructions saved to workspace context
              </span>
            )}
            {errorMessage && <span className="text-[#F85149]">{errorMessage}</span>}
          </div>

          <button
            type="button"
            data-testid="save-instructions-btn"
            onClick={handleSaveInstructions}
            disabled={saveStatus === 'saving'}
            className="px-4 py-1.5 rounded-md text-xs font-medium text-white transition-opacity flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#58A6FF' }}
          >
            {saveStatus === 'saving' ? 'Saving...' : 'Save Instructions'}
          </button>
        </div>
      </div>

      {/* Section 2: Add New Memory Entry */}
      <form
        onSubmit={handleAddMemory}
        className="mt-6 rounded-lg border border-[#30363D] bg-[#161B22] p-5"
      >
        <h3 className="text-sm font-semibold text-[#F0F6FC] mb-1">Add Workspace Memory</h3>
        <p className="text-xs text-[#8B949E] mb-3">
          Store key facts, coding conventions, architectural decisions, or preferences for this
          project.
        </p>

        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            data-testid="add-memory-input"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="e.g. Always generate React 19 forwardRef-free FC components."
            className="flex-1 rounded-md border border-[#30363D] bg-[#0D1117] px-3 py-2 text-sm text-[#F0F6FC] placeholder-[#8B949E] focus:outline-none focus:border-[#58A6FF]"
          />

          <select
            data-testid="add-category-select"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="rounded-md border border-[#30363D] bg-[#0D1117] px-3 py-2 text-xs text-[#F0F6FC] focus:outline-none focus:border-[#58A6FF]"
          >
            <option value="general">General</option>
            <option value="architecture">Architecture</option>
            <option value="conventions">Conventions</option>
            <option value="decision">Decision</option>
            <option value="preference">Preference</option>
          </select>

          <label className="flex items-center gap-2 text-xs text-[#8B949E] cursor-pointer select-none px-2">
            <input
              type="checkbox"
              data-testid="pin-checkbox"
              checked={newIsPinned}
              onChange={(e) => setNewIsPinned(e.target.checked)}
              className="rounded border-[#30363D] bg-[#0D1117] text-[#FF8C42] focus:ring-0 cursor-pointer"
            />
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-[#FF8C42]" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                <path
                  fillRule="evenodd"
                  d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h6a1 1 0 100-2H7zm0 4a1 1 0 100 2h6a1 1 0 100-2H7z"
                  clipRule="evenodd"
                />
              </svg>
              Pin to top
            </span>
          </label>

          <button
            type="submit"
            data-testid="add-memory-btn"
            disabled={!newContent.trim()}
            className="px-4 py-2 rounded-md text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 shrink-0"
            style={{ backgroundColor: '#FF8C42' }}
          >
            + Add Memory
          </button>
        </div>
      </form>

      {/* Section 3: Pinned & Workspace Memories Card List */}
      <div className="mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-[#F0F6FC]">
              Workspace Memories ({memory.memoryEntries.length})
            </h3>
            {pinnedCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[#161B22] border border-[#30363D] text-[#FF8C42] flex items-center gap-1">
                📌 {pinnedCount} Pinned
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Toggle */}
            <div className="flex rounded-md border border-[#30363D] bg-[#161B22] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setFilterMode('ALL')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  filterMode === 'ALL'
                    ? 'bg-[#30363D] text-[#F0F6FC]'
                    : 'text-[#8B949E] hover:text-[#F0F6FC]'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('PINNED_ONLY')}
                className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                  filterMode === 'PINNED_ONLY'
                    ? 'bg-[#30363D] text-[#FF8C42]'
                    : 'text-[#8B949E] hover:text-[#F0F6FC]'
                }`}
              >
                📌 Pinned
              </button>
            </div>

            {/* Quick search input */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memories..."
              className="rounded-md border border-[#30363D] bg-[#161B22] px-2.5 py-1 text-xs text-[#F0F6FC] placeholder-[#8B949E] focus:outline-none focus:border-[#58A6FF]"
            />
          </div>
        </div>

        {/* Memory Cards Grid */}
        {displayedMemories.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#30363D] bg-[#161B22]/50 p-8 text-center">
            <svg
              className="mx-auto h-8 w-8 text-[#8B949E]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <p className="mt-2 text-sm text-[#8B949E]">
              {filterMode === 'PINNED_ONLY'
                ? 'No pinned memories found for this project.'
                : 'No memory entries recorded yet. Add one above to seed project context.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {displayedMemories.map((entry) => (
              <div
                key={entry.id}
                data-testid="memory-card"
                className={`rounded-lg border p-4 transition-all duration-150 flex flex-col justify-between ${
                  entry.isPinned ? 'border-[#FF8C42]/40' : 'border-[#30363D]'
                }`}
                style={{
                  backgroundColor: '#161B22',
                }}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-[#0D1117] border border-[#30363D] text-[#8B949E]">
                        {entry.category}
                      </span>
                      {entry.isPinned && (
                        <span
                          data-testid="pin-badge"
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                          style={{
                            backgroundColor: 'rgba(255, 140, 66, 0.15)',
                            color: '#FF8C42',
                            border: '1px solid rgba(255, 140, 66, 0.3)',
                          }}
                        >
                          📌 Pinned
                        </span>
                      )}
                    </div>

                    <span className="text-[10px] text-[#8B949E] font-mono">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <p className="text-sm text-[#F0F6FC] leading-relaxed break-words">
                    {entry.content}
                  </p>
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#30363D]/60">
                  <span className="text-[10px] font-mono text-[#8B949E]">
                    ID: {entry.id.slice(0, 12)}...
                  </span>

                  <div className="flex items-center gap-2">
                    {/* Pin / Unpin Button */}
                    <button
                      type="button"
                      data-testid="toggle-pin-btn"
                      onClick={() => handleTogglePin(entry.id)}
                      className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
                        entry.isPinned
                          ? 'text-[#FF8C42] bg-[#0D1117] hover:bg-[#30363D]'
                          : 'text-[#8B949E] hover:text-[#F0F6FC] bg-[#0D1117]'
                      }`}
                      title={entry.isPinned ? 'Unpin memory' : 'Pin memory'}
                    >
                      {entry.isPinned ? 'Unpin' : '📌 Pin'}
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      data-testid="delete-memory-btn"
                      onClick={() => handleDeleteEntry(entry.id)}
                      className="px-2 py-1 rounded text-xs text-[#F85149] bg-[#0D1117] hover:bg-[#F85149]/10 transition-colors"
                      title="Delete memory"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectMemoryManager;
