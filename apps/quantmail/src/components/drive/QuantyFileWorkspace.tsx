'use client';

/**
 * QuantyFileWorkspace — M39 screen 31: the Quanty-assisted file operations
 * workspace for Drive (QM-M39-011).
 *
 * One surface where Quanty helps organize files:
 *   - Ask Quanty: natural-language command -> real /api/quanty/tasks
 *     execution against the real drive.* tools (drive.searchFiles,
 *     drive.suggestDestination, drive.summarizeFile, drive.organizeFile).
 *     The UI polls the REAL task status — there is no simulated streaming:
 *     every status line rendered comes from a poll response.
 *   - Find files: real /api/drive/ai/search results.
 *   - Organize: real /api/drive/ai/organize suggest (apply=false) then a
 *     real move (apply=true) or a real copy into the suggested folder.
 *   - Summarize: real /api/drive/ai/summarize output.
 *   - Clean duplicates: opens the existing AI duplicate cleaner modal.
 *
 * Every visible word is an instruction or a provable truth: no fake counts,
 * no fake scores, no invented summaries.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { browserApiRequest } from '../../services/browser-api-request';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceFile {
  id: string;
  name: string;
  mimeType: string;
}

export type QuantyTaskStepStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'error'
  | 'waiting-confirm'
  | 'skipped';

export interface QuantyWorkspaceStep {
  id: string;
  label: string;
  status: QuantyTaskStepStatus;
  destructive?: boolean;
}

export type QuantyWorkspaceTaskStatus =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'waiting-confirm'
  | 'done'
  | 'failed';

export interface QuantyWorkspaceTask {
  id: string;
  command: string;
  status: QuantyWorkspaceTaskStatus;
  steps: QuantyWorkspaceStep[];
  resultSummary?: string;
  error?: string;
}

export interface WorkspaceSearchResult {
  fileId: string;
  fileName: string;
  snippet: string;
  score: number | null;
}

export interface OrganizeSuggestion {
  fileId: string;
  suggestedFolder: string;
  category: string;
  confidence: number;
  folderId: string | null;
}

export interface FileSummary {
  summary: string;
  keyPoints: string[];
  fileType: string;
  wordCount: number;
}

type AsyncStatus = 'idle' | 'busy' | 'done' | 'error';

export interface QuantyFileWorkspaceState {
  currentFile: WorkspaceFile | null;
  ask: {
    command: string;
    status: AsyncStatus;
    task: QuantyWorkspaceTask | null;
    error: string | null;
    /** True while the poll loop is watching a live task. */
    polling: boolean;
  };
  search: {
    query: string;
    status: AsyncStatus;
    results: WorkspaceSearchResult[];
    error: string | null;
  };
  organize: {
    status: AsyncStatus;
    suggestion: OrganizeSuggestion | null;
    appliedResult: { action: 'moved' | 'copied'; folder: string } | null;
    error: string | null;
  };
  summarize: {
    status: AsyncStatus;
    data: FileSummary | null;
    error: string | null;
  };
}

export interface QuantyFileWorkspaceManagerOptions {
  apiFetch?: typeof browserApiRequest;
  /** Poll interval for live Quanty tasks (ms). */
  pollIntervalMs?: number;
  onFilesChanged?: () => void;
}

const TERMINAL_TASK_STATUSES: QuantyWorkspaceTaskStatus[] = ['done', 'failed'];

// ---------------------------------------------------------------------------
// Headless manager
// ---------------------------------------------------------------------------

export class QuantyFileWorkspaceManager {
  private state: QuantyFileWorkspaceState;
  private listeners: Set<(state: QuantyFileWorkspaceState) => void> = new Set();
  private apiFetch: typeof browserApiRequest;
  private pollIntervalMs: number;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private onFilesChanged?: () => void;

  constructor(options?: QuantyFileWorkspaceManagerOptions) {
    this.apiFetch = options?.apiFetch ?? browserApiRequest;
    this.pollIntervalMs = options?.pollIntervalMs ?? 1500;
    this.onFilesChanged = options?.onFilesChanged;
    this.state = {
      currentFile: null,
      ask: { command: '', status: 'idle', task: null, error: null, polling: false },
      search: { query: '', status: 'idle', results: [], error: null },
      organize: { status: 'idle', suggestion: null, appliedResult: null, error: null },
      summarize: { status: 'idle', data: null, error: null },
    };
  }

  public getState(): QuantyFileWorkspaceState {
    return {
      ...this.state,
      ask: { ...this.state.ask, task: this.state.ask.task ? { ...this.state.ask.task } : null },
      search: { ...this.state.search, results: [...this.state.search.results] },
      organize: { ...this.state.organize },
      summarize: { ...this.state.summarize },
    };
  }

  public subscribe(listener: (state: QuantyFileWorkspaceState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const current = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(current);
      } catch {
        // A broken listener must not break the workspace.
      }
    });
  }

  /** Stop the task poll loop (called on unmount / close). */
  public dispose(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.state.ask.polling) {
      this.state.ask.polling = false;
      this.notify();
    }
  }

  public setCurrentFile(file: WorkspaceFile | null): void {
    if (this.state.currentFile?.id === file?.id) return;
    this.state.currentFile = file;
    // A different file invalidates the previous organize/summarize results.
    this.state.organize = { status: 'idle', suggestion: null, appliedResult: null, error: null };
    this.state.summarize = { status: 'idle', data: null, error: null };
    this.notify();
  }

  // -- Ask Quanty (natural language -> real task) ---------------------------

  public setCommand(command: string): void {
    this.state.ask.command = command;
    this.notify();
  }

  public async askQuanty(): Promise<void> {
    const command = this.state.ask.command.trim();
    if (!command || this.state.ask.status === 'busy') return;
    this.stopPolling();
    this.state.ask = { command, status: 'busy', task: null, error: null, polling: false };
    this.notify();
    try {
      const res = await this.apiFetch('/api/quanty/tasks', {
        method: 'POST',
        body: JSON.stringify({ command }),
      });
      const data = await this.parseJson(res);
      if (!res.ok || !data?.taskId) {
        throw new Error(this.errorMessage(data, 'Quanty could not start the task.'));
      }
      // Fetch the first real status immediately, then keep polling the real
      // status — never render progress that did not come from the backend.
      await this.pollTaskOnce(String(data.taskId));
      this.startPolling(String(data.taskId));
    } catch (error) {
      this.state.ask.status = 'error';
      this.state.ask.error = error instanceof Error ? error.message : 'Quanty is unavailable.';
      this.notify();
    }
  }

  private async pollTaskOnce(taskId: string): Promise<void> {
    const res = await this.apiFetch(`/api/quanty/tasks/${encodeURIComponent(taskId)}`, {
      method: 'GET',
    });
    const data = await this.parseJson(res);
    if (!res.ok) {
      throw new Error(this.errorMessage(data, 'Could not read the task status.'));
    }
    const task = this.normalizeTask(data);
    const terminal = TERMINAL_TASK_STATUSES.includes(task.status);
    this.state.ask = {
      ...this.state.ask,
      command: this.state.ask.command,
      status: terminal ? 'done' : 'busy',
      task,
      error: null,
      polling: !terminal,
    };
    if (terminal) this.stopPolling();
    this.notify();
  }

  private startPolling(taskId: string): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      void this.pollTaskOnce(taskId).catch((error: unknown) => {
        // A single failed poll must not kill the loop; surface it only when
        // the task never produced any status at all.
        if (!this.state.ask.task) {
          this.stopPolling();
          this.state.ask.status = 'error';
          this.state.ask.error =
            error instanceof Error ? error.message : 'Could not read the task status.';
          this.state.ask.polling = false;
          this.notify();
        }
      });
    }, this.pollIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public async confirmTask(approved: boolean): Promise<void> {
    const task = this.state.ask.task;
    if (!task || task.status !== 'waiting-confirm') return;
    this.state.ask.status = 'busy';
    this.notify();
    try {
      const res = await this.apiFetch(
        `/api/quanty/tasks/${encodeURIComponent(task.id)}/confirm`,
        { method: 'POST', body: JSON.stringify({ approved }) },
      );
      const data = await this.parseJson(res);
      if (!res.ok) throw new Error(this.errorMessage(data, 'Could not send the confirmation.'));
      await this.pollTaskOnce(task.id);
      this.startPolling(task.id);
    } catch (error) {
      this.state.ask.status = 'error';
      this.state.ask.error = error instanceof Error ? error.message : 'Confirmation failed.';
      this.notify();
    }
  }

  public async interruptTask(): Promise<void> {
    const task = this.state.ask.task;
    if (!task || TERMINAL_TASK_STATUSES.includes(task.status)) return;
    try {
      await this.apiFetch(`/api/quanty/tasks/${encodeURIComponent(task.id)}/interrupt`, {
        method: 'POST',
      });
    } catch {
      // Best effort — the next poll reports the real status either way.
    }
    await this.pollTaskOnce(task.id).catch(() => undefined);
  }

  public resetAsk(): void {
    this.stopPolling();
    this.state.ask = { command: '', status: 'idle', task: null, error: null, polling: false };
    this.notify();
  }

  // -- Find files ------------------------------------------------------------

  public async searchFiles(query: string): Promise<void> {
    const trimmed = query.trim();
    this.state.search.query = query;
    if (!trimmed) {
      this.state.search = { query, status: 'idle', results: [], error: null };
      this.notify();
      return;
    }
    this.state.search.status = 'busy';
    this.state.search.error = null;
    this.notify();
    try {
      const res = await this.apiFetch('/api/drive/ai/search', {
        method: 'POST',
        body: JSON.stringify({ query: trimmed, limit: 10 }),
      });
      const data = await this.parseJson(res);
      if (!res.ok) throw new Error(this.errorMessage(data, 'Search failed.'));
      const results: WorkspaceSearchResult[] = Array.isArray(data?.results)
        ? data.results.map((r: Record<string, unknown>) => ({
            fileId: String(r.fileId ?? ''),
            fileName: String(r.fileName ?? r.name ?? ''),
            snippet: String(r.snippet ?? ''),
            score:
              typeof r.relevanceScore === 'number'
                ? r.relevanceScore
                : typeof r.score === 'number'
                  ? r.score
                  : null,
          }))
        : [];
      this.state.search = { query, status: 'done', results, error: null };
    } catch (error) {
      this.state.search = {
        query,
        status: 'error',
        results: [],
        error: error instanceof Error ? error.message : 'Search failed.',
      };
    }
    this.notify();
  }

  // -- Organize (suggest -> move / copy) -------------------------------------

  public async suggestDestination(): Promise<void> {
    const file = this.state.currentFile;
    if (!file) return;
    this.state.organize = { status: 'busy', suggestion: null, appliedResult: null, error: null };
    this.notify();
    try {
      const res = await this.apiFetch('/api/drive/ai/organize', {
        method: 'POST',
        body: JSON.stringify({ fileId: file.id, apply: false }),
      });
      const data = await this.parseJson(res);
      if (!res.ok) throw new Error(this.errorMessage(data, 'Could not suggest a destination.'));
      this.state.organize = {
        status: 'done',
        suggestion: {
          fileId: String(data.fileId ?? file.id),
          suggestedFolder: String(data.suggestedFolder ?? ''),
          category: String(data.category ?? ''),
          confidence: typeof data.confidence === 'number' ? data.confidence : 0,
          folderId: typeof data.folderId === 'string' ? data.folderId : null,
        },
        appliedResult: null,
        error: null,
      };
    } catch (error) {
      this.state.organize = {
        status: 'error',
        suggestion: null,
        appliedResult: null,
        error: error instanceof Error ? error.message : 'Could not suggest a destination.',
      };
    }
    this.notify();
  }

  /** Execute the real move after the user confirmed the suggestion. */
  public async applyMove(): Promise<void> {
    const file = this.state.currentFile;
    const suggestion = this.state.organize.suggestion;
    if (!file || !suggestion) return;
    this.state.organize = { ...this.state.organize, status: 'busy', error: null };
    this.notify();
    try {
      const res = await this.apiFetch('/api/drive/ai/organize', {
        method: 'POST',
        body: JSON.stringify({ fileId: file.id, apply: true }),
      });
      const data = await this.parseJson(res);
      if (!res.ok || data?.applied !== true) {
        throw new Error(this.errorMessage(data, 'The move did not complete.'));
      }
      this.state.organize = {
        ...this.state.organize,
        status: 'done',
        appliedResult: {
          action: 'moved',
          folder: String(data.suggestedFolder ?? suggestion.suggestedFolder),
        },
        error: null,
      };
      this.onFilesChanged?.();
    } catch (error) {
      this.state.organize = {
        ...this.state.organize,
        status: 'error',
        error: error instanceof Error ? error.message : 'The move did not complete.',
      };
    }
    this.notify();
  }

  /** Copy the file into the suggested folder (resolved by name when needed). */
  public async copyToSuggestedFolder(): Promise<void> {
    const file = this.state.currentFile;
    const suggestion = this.state.organize.suggestion;
    if (!file || !suggestion) return;
    this.state.organize = { ...this.state.organize, status: 'busy', error: null };
    this.notify();
    try {
      // The organize-suggest call does not create the folder (apply=false), so
      // resolve the destination folder id via the folder listing first.
      const folderId = await this.resolveFolderId(suggestion.category);
      const res = await this.apiFetch(`/api/drive/files/${encodeURIComponent(file.id)}/copy`, {
        method: 'POST',
        body: JSON.stringify({ targetFolderId: folderId }),
      });
      const data = await this.parseJson(res);
      if (!res.ok) throw new Error(this.errorMessage(data, 'The copy did not complete.'));
      this.state.organize = {
        ...this.state.organize,
        status: 'done',
        appliedResult: { action: 'copied', folder: suggestion.suggestedFolder },
        error: null,
      };
      this.onFilesChanged?.();
    } catch (error) {
      this.state.organize = {
        ...this.state.organize,
        status: 'error',
        error: error instanceof Error ? error.message : 'The copy did not complete.',
      };
    }
    this.notify();
  }

  private async resolveFolderId(category: string): Promise<string | null> {
    const res = await this.apiFetch('/api/drive/folders', { method: 'GET' });
    const data = await this.parseJson(res);
    if (!res.ok || !Array.isArray(data?.folders)) return null;
    const match = data.folders.find(
      (f: Record<string, unknown>) =>
        typeof f.name === 'string' && f.name.toLowerCase() === category.toLowerCase(),
    );
    return typeof match?.id === 'string' ? match.id : null;
  }

  // -- Summarize ---------------------------------------------------------------

  public async summarizeCurrentFile(): Promise<void> {
    const file = this.state.currentFile;
    if (!file) return;
    this.state.summarize = { status: 'busy', data: null, error: null };
    this.notify();
    try {
      const res = await this.apiFetch('/api/drive/ai/summarize', {
        method: 'POST',
        body: JSON.stringify({ fileId: file.id }),
      });
      const data = await this.parseJson(res);
      if (!res.ok) throw new Error(this.errorMessage(data, 'Could not summarize this file.'));
      this.state.summarize = {
        status: 'done',
        data: {
          summary: String(data.summary ?? ''),
          keyPoints: Array.isArray(data.keyPoints)
            ? data.keyPoints.filter((k: unknown): k is string => typeof k === 'string')
            : [],
          fileType: String(data.fileType ?? ''),
          wordCount: typeof data.wordCount === 'number' ? data.wordCount : 0,
        },
        error: null,
      };
    } catch (error) {
      this.state.summarize = {
        status: 'error',
        data: null,
        error: error instanceof Error ? error.message : 'Could not summarize this file.',
      };
    }
    this.notify();
  }

  // -- helpers -----------------------------------------------------------------

  private errorMessage(data: Record<string, unknown>, fallback: string): string {
    return typeof data.error === 'string' && data.error ? data.error : fallback;
  }

  private async parseJson(res: Response): Promise<Record<string, unknown>> {
    try {
      const data = (await res.json()) as unknown;
      return typeof data === 'object' && data !== null
        ? (data as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private normalizeTask(data: Record<string, unknown>): QuantyWorkspaceTask {
    const rawSteps = Array.isArray(data.steps) ? data.steps : [];
    return {
      id: String(data.id ?? ''),
      command: String(data.command ?? ''),
      status: this.normalizeTaskStatus(data.status),
      steps: rawSteps.map((s) => {
        const step = s as Record<string, unknown>;
        return {
          id: String(step.id ?? ''),
          label: String(step.label ?? ''),
          status: this.normalizeStepStatus(step.status),
          destructive: step.destructive === true,
        };
      }),
      resultSummary:
        typeof data.resultSummary === 'string' ? data.resultSummary : undefined,
      error: typeof data.error === 'string' ? data.error : undefined,
    };
  }

  private normalizeTaskStatus(status: unknown): QuantyWorkspaceTaskStatus {
    switch (status) {
      case 'thinking':
      case 'working':
      case 'waiting-confirm':
      case 'done':
      case 'failed':
        return status;
      default:
        return 'thinking';
    }
  }

  private normalizeStepStatus(status: unknown): QuantyTaskStepStatus {
    switch (status) {
      case 'pending':
      case 'running':
      case 'done':
      case 'error':
      case 'waiting-confirm':
      case 'skipped':
        return status;
      default:
        return 'pending';
    }
  }
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A8D96]">
      {children}
    </h3>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-2 text-xs leading-relaxed text-[#FF6B6B]">{message}</p>;
}

function BusyLine({ label }: { label: string }) {
  return (
    <p className="mt-2 flex items-center gap-2 text-xs text-[#A1A4AC]" aria-live="polite">
      <span className="inline-block size-3 animate-spin rounded-full border-2 border-[#FF8C42]/30 border-t-[#FF8C42]" />
      {label}
    </p>
  );
}

const STEP_DOT: Record<QuantyTaskStepStatus, string> = {
  pending: 'bg-[#3A3D45]',
  running: 'bg-[#FF8C42] animate-pulse',
  done: 'bg-[#4ADE80]',
  error: 'bg-[#FF6B6B]',
  'waiting-confirm': 'bg-[#FACC15]',
  skipped: 'bg-[#3A3D45]',
};

// ---------------------------------------------------------------------------
// The drawer
// ---------------------------------------------------------------------------

export interface QuantyFileWorkspaceProps {
  isOpen: boolean;
  onClose: () => void;
  /** The file the workspace acts on (from the Drive page selection). */
  file: WorkspaceFile | null;
  /** Opens the existing AI duplicate cleaner modal. */
  onOpenDuplicateCleaner: () => void;
  /** Refresh the Drive listing after a real move/copy. */
  onFilesChanged?: () => void;
  manager?: QuantyFileWorkspaceManager;
  className?: string;
}

const EXAMPLE_COMMANDS = [
  'find files quarterly report',
  'summarize file notes.txt',
  'where should invoice.pdf go',
  'move budget.xlsx to its folder',
];

export function QuantyFileWorkspace({
  isOpen,
  onClose,
  file,
  onOpenDuplicateCleaner,
  onFilesChanged,
  manager: providedManager,
  className = '',
}: QuantyFileWorkspaceProps) {
  const onFilesChangedRef = useRef(onFilesChanged);

  useEffect(() => {
    onFilesChangedRef.current = onFilesChanged;
  }, [onFilesChanged]);

  const manager = useMemo(() => {
    if (providedManager) return providedManager;
    return new QuantyFileWorkspaceManager({ onFilesChanged: () => onFilesChangedRef.current?.() });
  }, [providedManager]);

  const [state, setState] = useState<QuantyFileWorkspaceState>(() => manager.getState());
  const [searchInput, setSearchInput] = useState('');
  const commandInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return manager.subscribe((next) => setState(next));
  }, [manager]);

  useEffect(() => {
    return () => manager.dispose();
  }, [manager]);

  // Keep the workspace's current file in sync with the Drive page selection.
  useEffect(() => {
    manager.setCurrentFile(file);
  }, [file, manager]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const pickSearchResult = useCallback(
    (result: WorkspaceSearchResult) => {
      manager.setCurrentFile({ id: result.fileId, name: result.fileName, mimeType: '' });
    },
    [manager],
  );

  if (!isOpen) return null;

  const { ask, search, organize, summarize, currentFile } = state;
  const task = ask.task;
  const taskRunning = ask.polling || ask.status === 'busy';

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        data-testid="quanty-workspace-backdrop"
        aria-hidden="true"
      />
      <aside
        role="complementary"
        aria-label="Quanty file workspace"
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-[#0E0F14] shadow-2xl ${className}`}
        data-testid="quanty-file-workspace"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#F5F5F5]">Quanty file workspace</h2>
            <p className="mt-1 text-xs leading-relaxed text-[#8A8D96]">
              Quanty organizes your Drive with real tools. Every result below comes
              from a real operation — nothing here is simulated.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Quanty file workspace"
            className="rounded-lg p-2 text-[#8A8D96] hover:bg-white/[0.06] hover:text-[#F5F5F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* 1. Ask Quanty */}
          <section aria-label="Ask Quanty">
            <SectionTitle>Ask Quanty</SectionTitle>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void manager.askQuanty();
              }}
            >
              <input
                ref={commandInputRef}
                type="text"
                value={ask.command}
                onChange={(e) => manager.setCommand(e.target.value)}
                placeholder='Try "find files quarterly report"'
                aria-label="Ask Quanty to do something with your files"
                disabled={taskRunning}
                className="h-10 min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-sm text-[#F5F5F5] placeholder:text-[#5A5D66] focus:border-[#FF8C42]/60 focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={taskRunning || !ask.command.trim()}
                className="h-10 shrink-0 rounded-lg bg-[#FF8C42] px-4 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Ask
              </button>
            </form>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLE_COMMANDS.map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  disabled={taskRunning}
                  onClick={() => {
                    manager.setCommand(cmd);
                    commandInputRef.current?.focus();
                  }}
                  className="rounded-full border border-white/[0.1] px-2.5 py-1 text-[11px] text-[#A1A4AC] hover:border-[#FF8C42]/40 hover:text-[#F5F5F5] disabled:opacity-50"
                >
                  {cmd}
                </button>
              ))}
            </div>

            {taskRunning && !task && <BusyLine label="Starting the task…" />}
            {task && (
              <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3" aria-live="polite">
                <p className="text-xs text-[#8A8D96]">
                  Task: <span className="text-[#F5F5F5]">“{task.command}”</span>
                </p>
                <ul className="mt-2 space-y-1.5">
                  {task.steps.map((step) => (
                    <li key={step.id} className="flex items-start gap-2 text-xs">
                      <span
                        className={`mt-1 size-2 shrink-0 rounded-full ${STEP_DOT[step.status]}`}
                        aria-hidden="true"
                      />
                      <span className="text-[#D6D8DD]">
                        {step.label}
                        {step.destructive && (
                          <span className="ml-1.5 rounded bg-[#FACC15]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#FACC15]">
                            needs confirmation
                          </span>
                        )}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-[#8A8D96]">
                        {step.status === 'waiting-confirm'
                          ? 'waiting'
                          : step.status === 'error'
                            ? 'failed'
                            : step.status}
                      </span>
                    </li>
                  ))}
                </ul>
                {task.status === 'waiting-confirm' && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void manager.confirmTask(true)}
                      className="h-9 flex-1 rounded-lg bg-[#FF8C42] text-xs font-semibold text-black hover:opacity-90"
                    >
                      Yes, do it
                    </button>
                    <button
                      type="button"
                      onClick={() => void manager.confirmTask(false)}
                      className="h-9 flex-1 rounded-lg border border-white/[0.12] text-xs font-semibold text-[#D6D8DD] hover:bg-white/[0.04]"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {(task.status === 'thinking' || task.status === 'working') && (
                  <button
                    type="button"
                    onClick={() => void manager.interruptTask()}
                    className="mt-3 h-8 rounded-lg border border-white/[0.12] px-3 text-xs text-[#A1A4AC] hover:bg-white/[0.04]"
                  >
                    Stop task
                  </button>
                )}
                {task.resultSummary && (
                  <p className="mt-2 border-t border-white/[0.06] pt-2 text-xs leading-relaxed text-[#D6D8DD]">
                    {task.resultSummary}
                  </p>
                )}
                {task.error && <ErrorLine message={task.error} />}
                {TERMINAL_TASK_STATUSES.includes(task.status) && (
                  <button
                    type="button"
                    onClick={() => manager.resetAsk()}
                    className="mt-2 text-xs text-[#8A8D96] underline-offset-2 hover:text-[#F5F5F5] hover:underline"
                  >
                    Start a new request
                  </button>
                )}
              </div>
            )}
            <ErrorLine message={ask.error} />
          </section>

          {/* 2. Find files */}
          <section aria-label="Find files">
            <SectionTitle>Find files</SectionTitle>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void manager.searchFiles(searchInput);
              }}
            >
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search file names and contents"
                aria-label="Search your Drive files"
                className="h-10 min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-sm text-[#F5F5F5] placeholder:text-[#5A5D66] focus:border-[#FF8C42]/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={search.status === 'busy'}
                className="h-10 shrink-0 rounded-lg border border-white/[0.12] px-4 text-sm font-semibold text-[#D6D8DD] hover:bg-white/[0.04] disabled:opacity-40"
              >
                Search
              </button>
            </form>
            {search.status === 'busy' && <BusyLine label="Searching your Drive…" />}
            {search.status === 'done' && search.results.length === 0 && (
              <p className="mt-2 text-xs text-[#8A8D96]">
                No files matched “{search.query}”.
              </p>
            )}
            {search.results.length > 0 && (
              <ul className="mt-2 space-y-1">
                {search.results.map((result) => (
                  <li key={result.fileId}>
                    <button
                      type="button"
                      onClick={() => pickSearchResult(result)}
                      className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left hover:border-[#FF8C42]/40 ${
                        currentFile?.id === result.fileId
                          ? 'border-[#FF8C42]/50 bg-[#FF8C42]/[0.06]'
                          : 'border-white/[0.08] bg-white/[0.02]'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-[#F5F5F5]">
                          {result.fileName || 'Untitled file'}
                        </span>
                        {result.snippet && (
                          <span className="mt-0.5 block truncate text-[11px] text-[#8A8D96]">
                            {result.snippet}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <ErrorLine message={search.error} />
          </section>

          {/* 3. Organize */}
          <section aria-label="Organize this file">
            <SectionTitle>Organize this file</SectionTitle>
            {currentFile ? (
              <div className="mt-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                <p className="truncate text-xs font-medium text-[#F5F5F5]">
                  {currentFile.name}
                </p>
                {!organize.suggestion && organize.status !== 'busy' && (
                  <button
                    type="button"
                    onClick={() => void manager.suggestDestination()}
                    className="mt-2 h-9 w-full rounded-lg bg-[#FF8C42] text-xs font-semibold text-black hover:opacity-90"
                  >
                    Suggest a destination
                  </button>
                )}
                {organize.status === 'busy' && <BusyLine label="Working…" />}
                {organize.suggestion && (
                  <div className="mt-2 text-xs leading-relaxed text-[#D6D8DD]" aria-live="polite">
                    <p>
                      Suggested folder:{' '}
                      <span className="font-semibold text-[#F5F5F5]">
                        {organize.suggestion.suggestedFolder || '—'}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[#8A8D96]">
                      Category {organize.suggestion.category || '—'}
                      {organize.suggestion.confidence > 0 &&
                        ` · confidence ${Math.round(organize.suggestion.confidence * 100)}%`}
                    </p>
                    {!organize.appliedResult && organize.status !== 'busy' && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void manager.applyMove()}
                          className="h-9 flex-1 rounded-lg bg-[#FF8C42] text-xs font-semibold text-black hover:opacity-90"
                        >
                          Move here
                        </button>
                        <button
                          type="button"
                          onClick={() => void manager.copyToSuggestedFolder()}
                          className="h-9 flex-1 rounded-lg border border-white/[0.12] text-xs font-semibold text-[#D6D8DD] hover:bg-white/[0.04]"
                        >
                          Copy here
                        </button>
                      </div>
                    )}
                    {organize.appliedResult && (
                      <p className="mt-2 rounded-lg bg-[#4ADE80]/10 px-2.5 py-2 text-xs text-[#4ADE80]">
                        {organize.appliedResult.action === 'moved' ? 'Moved' : 'Copied'} to{' '}
                        {organize.appliedResult.folder}.
                      </p>
                    )}
                  </div>
                )}
                <ErrorLine message={organize.error} />
              </div>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-[#8A8D96]">
                Find a file above and tap it, or open this workspace from a file in
                Drive, to get a destination suggestion.
              </p>
            )}
          </section>

          {/* 4. Summarize */}
          <section aria-label="Summarize this file">
            <SectionTitle>Summarize this file</SectionTitle>
            {currentFile ? (
              <div className="mt-2">
                {summarize.status !== 'done' && (
                  <button
                    type="button"
                    onClick={() => void manager.summarizeCurrentFile()}
                    disabled={summarize.status === 'busy'}
                    className="h-9 w-full rounded-lg border border-white/[0.12] text-xs font-semibold text-[#D6D8DD] hover:bg-white/[0.04] disabled:opacity-40"
                  >
                    Summarize “{currentFile.name}”
                  </button>
                )}
                {summarize.status === 'busy' && <BusyLine label="Reading the file…" />}
                {summarize.data && (
                  <div className="mt-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3" aria-live="polite">
                    <p className="text-xs leading-relaxed text-[#D6D8DD]">
                      {summarize.data.summary || 'No summary was returned.'}
                    </p>
                    {summarize.data.keyPoints.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-[#A1A4AC]">
                        {summarize.data.keyPoints.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={() => void manager.summarizeCurrentFile()}
                      className="mt-2 text-xs text-[#8A8D96] underline-offset-2 hover:text-[#F5F5F5] hover:underline"
                    >
                      Summarize again
                    </button>
                  </div>
                )}
                <ErrorLine message={summarize.error} />
              </div>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-[#8A8D96]">
                Find a file above and tap it, or open this workspace from a file in
                Drive, to summarize it.
              </p>
            )}
          </section>

          {/* 5. Clean duplicates */}
          <section aria-label="Clean duplicates">
            <SectionTitle>Clean duplicates</SectionTitle>
            <p className="mt-2 text-xs leading-relaxed text-[#8A8D96]">
              Scan your Drive for byte-identical files and reclaim the space.
            </p>
            <button
              type="button"
              onClick={onOpenDuplicateCleaner}
              className="mt-2 h-9 w-full rounded-lg border border-white/[0.12] text-xs font-semibold text-[#D6D8DD] hover:bg-white/[0.04]"
            >
              Scan for duplicates
            </button>
          </section>
        </div>
      </aside>
    </>
  );
}
