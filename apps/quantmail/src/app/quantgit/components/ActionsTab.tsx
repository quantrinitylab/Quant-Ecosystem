'use client';

// ============================================================================
// QuantGit — Actions CI Pipeline with Terminal Log Viewer (Screens 91–98)
// Steps render from the run's real job data; logs only when the backend
// provides them. Never fabricate runner output.
// ============================================================================

import React, { useState, useMemo } from 'react';
import type { WorkflowRunItem, WorkflowStepItem } from '../types';

export interface ActionsTabProps {
  actions: WorkflowRunItem[];
  handleTriggerWorkflow: () => void;
  setSelectedActionRun: (act: WorkflowRunItem) => void;
  setModalState?: (modal: any) => void;
  runnerConnected?: boolean;
  initialSelectedRun?: WorkflowRunItem | null;
}

export function ActionsTab({
  actions,
  handleTriggerWorkflow,
  setSelectedActionRun,
  setModalState,
  runnerConnected = true,
  initialSelectedRun = null,
}: ActionsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState('All workflows');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeFilterModal, setActiveFilterModal] = useState<string | null>(null);

  // Live Step-by-Step Terminal & Run View State
  const [activeRun, setActiveRun] = useState<WorkflowRunItem | null>(initialSelectedRun);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  const workflows = [
    'All workflows',
    'CI',
    'Copilot',
    'Copilot cloud agent',
    'Debug',
    'Dependabot Updates',
    'Release',
  ];

  // Honest listing: only real workflow runs from the API. Never invent runs.
  const displayActions = useMemo<WorkflowRunItem[]>(() => actions, [actions]);

  const filteredRuns = useMemo(() => {
    return displayActions.filter((run) => {
      if (searchQuery.trim() && !run.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (statusFilter !== 'all' && run.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [displayActions, searchQuery, statusFilter]);

  // Honest workflow steps: derived ONLY from the run's real job data.
  // There is no backend log stream for workflow runs, so logs are never
  // invented here — steps render with an honest "No logs available" state.
  const runSteps = useMemo<WorkflowStepItem[]>(() => {
    if (!activeRun) return [];
    const jobs = activeRun.jobs || [];
    return jobs.map((job, idx) => ({
      id: `step-${idx + 1}`,
      name: job.name,
      status:
        job.status === 'in_progress'
          ? 'in_progress'
          : job.status === 'failed'
            ? 'failed'
            : job.status === 'pending'
              ? 'queued'
              : 'success',
      duration: job.duration,
      logs: [],
    }));
  }, [activeRun]);

  // Only offer "copy logs" when at least one real log line exists.
  const hasAnyLogs = runSteps.some((s) => s.logs.length > 0);

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [stepId]: !prev[stepId],
    }));
  };

  const handleCopyFullLogs = () => {
    const allLogs = runSteps
      .map((s) => `=== ${s.name} (${s.duration}) ===\n${s.logs.join('\n')}`)
      .join('\n\n');
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(allLogs).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-4 gap-6 text-xs text-[#E6EDF3]"
      data-testid="actions-tab"
    >
      {/* Left Sidebar: Workflow Categories (Screens 95–96) */}
      <div className="space-y-1">
        <h4 className="font-bold text-[#8D96A0] uppercase tracking-wider text-[10px] px-2 mb-2">
          Workflows
        </h4>
        {workflows.map((wf) => (
          <button
            key={wf}
            type="button"
            onClick={() => {
              setSelectedWorkflow(wf);
              setActiveRun(null);
            }}
            className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors cursor-pointer ${
              selectedWorkflow === wf
                ? 'bg-[#21262D] text-[#E6EDF3] font-bold shadow-sm'
                : 'text-[#8D96A0] hover:text-[#E6EDF3] hover:bg-[var(--quant-surface-elevated)]'
            }`}
          >
            {wf}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="md:col-span-3 space-y-4">
        {activeRun ? (
          /* Step-by-Step Live Terminal Streaming Log Viewer (Task W39-GIT07) */
          <div className="space-y-4" data-testid="workflow-run-detail">
            {/* Header & Breadcrumb */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--quant-surface-elevated)] p-4 rounded-xl border border-[#30363D]">
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setActiveRun(null)}
                  data-testid="back-to-runs-btn"
                  className="text-[#58A6FF] hover:underline flex items-center gap-1.5 font-medium cursor-pointer"
                >
                  <span>← Back to workflow runs</span>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-base text-[#E6EDF3]">{activeRun.name}</h3>
                  <span className="text-[#8D96A0] font-mono text-xs">#{activeRun.id}</span>

                  {/* Live workflow status badge */}
                  <span
                    data-testid="workflow-status-badge"
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1.5 capitalize ${
                      activeRun.status === 'success' || activeRun.status === 'completed'
                        ? 'bg-[#238636]/20 text-[#3FB950] border border-[#238636]/40'
                        : activeRun.status === 'failed'
                          ? 'bg-[#DA3633]/20 text-[#F85149] border border-[#DA3633]/40'
                          : activeRun.status === 'in_progress'
                            ? 'bg-[#D29922]/20 text-[#D29922] border border-[#D29922]/40 animate-pulse'
                            : 'bg-[#8B949E]/20 text-[#8B949E] border border-[#8B949E]/40'
                    }`}
                  >
                    <span>
                      {activeRun.status === 'success' || activeRun.status === 'completed'
                        ? '✓'
                        : activeRun.status === 'failed'
                          ? '✕'
                          : activeRun.status === 'in_progress'
                            ? '●'
                            : '○'}
                    </span>
                    <span>{activeRun.status}</span>
                  </span>
                </div>

                <p className="text-[11px] text-[#8D96A0]">
                  Triggered by{' '}
                  <span className="text-[#C9D1D9] font-medium">
                    {activeRun.actor || 'ai-agent'}
                  </span>{' '}
                  via <span className="font-mono text-[#58A6FF]">{activeRun.event || 'push'}</span>{' '}
                  on branch <span className="font-mono text-[#E6EDF3]">{activeRun.branch}</span> ·
                  Commit <span className="font-mono text-[#58A6FF]">{activeRun.commitSha}</span> ·
                  Duration <span className="font-mono">{activeRun.duration}</span>
                </p>
              </div>

              {/* Streaming Log Controls */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setAutoScroll((prev) => !prev)}
                  data-testid="log-autoscroll-toggle"
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    autoScroll
                      ? 'bg-[#238636]/20 border-[#238636]/40 text-[#3FB950]'
                      : 'bg-[#21262D] border-[#30363D] text-[#8D96A0]'
                  }`}
                >
                  <span>{autoScroll ? '▼' : '⏸'}</span>
                  <span>Auto-scroll: {autoScroll ? 'ON' : 'OFF'}</span>
                </button>

                {hasAnyLogs && (
                  <button
                    type="button"
                    onClick={handleCopyFullLogs}
                    data-testid="copy-full-logs-btn"
                    className="px-3 py-1.5 rounded-lg bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] text-[#E6EDF3] font-semibold text-xs transition-colors cursor-pointer"
                  >
                    {copied ? 'Copied full logs!' : 'Copy full logs'}
                  </button>
                )}
              </div>
            </div>

            {/* Step-by-Step Accordion List */}
            <div className="space-y-2" data-testid="workflow-steps-accordion">
              {runSteps.length === 0 ? (
                <div
                  data-testid="workflow-steps-empty"
                  className="border border-[#30363D] rounded-xl bg-[#0D1117] p-10 text-center"
                >
                  <p className="text-sm font-medium text-[#E6EDF3]">
                    No steps recorded for this run
                  </p>
                  <p className="mt-1 text-xs text-[#8D96A0]">
                    Step data is only shown when the CI backend provides it.
                  </p>
                </div>
              ) : (
                runSteps.map((step) => {
                const isExpanded = Boolean(expandedSteps[step.id]);
                const isStepSuccess = step.status === 'success';
                const isStepFailed = step.status === 'failed';

                return (
                  <div
                    key={step.id}
                    data-testid={`step-item-${step.id}`}
                    className="border border-[#30363D] rounded-xl bg-[#0D1117] overflow-hidden"
                  >
                    {/* Accordion Step Header */}
                    <button
                      type="button"
                      onClick={() => toggleStep(step.id)}
                      data-testid={`step-accordion-${step.id}`}
                      className="w-full px-4 py-3 bg-[var(--quant-surface-elevated)] hover:bg-[#21262D] transition-colors flex items-center justify-between gap-4 cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            isStepSuccess
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : isStepFailed
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-yellow-500/20 text-yellow-400'
                          }`}
                        >
                          {isStepSuccess ? '✓' : isStepFailed ? '✕' : '●'}
                        </span>
                        <span className="font-semibold text-xs text-[#E6EDF3]">{step.name}</span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-[#8D96A0]">
                        <span className="font-mono">{step.duration}</span>
                        <span className="text-xs transition-transform duration-200">
                          {isExpanded ? '▼' : '▶'}
                        </span>
                      </div>
                    </button>

                    {/* Step Terminal Output Container */}
                    {isExpanded && (
                      <div
                        data-testid={`terminal-logs-${step.id}`}
                        className="p-3 bg-[#0D1117] font-mono text-xs overflow-x-auto border-t border-[#30363D]"
                      >
                        {step.logs.length === 0 ? (
                          <p className="px-1 py-6 text-center text-[#7D8590] font-sans">
                            No logs available for this step.
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {step.logs.map((logLine, lineIdx) => {
                            const isGreen =
                              logLine.includes('✓') ||
                              logLine.includes('PASS') ||
                              logLine.includes('passed') ||
                              logLine.includes('Successfully');
                            const isRed =
                              logLine.includes('✕') ||
                              logLine.includes('FAIL') ||
                              logLine.includes('Error:') ||
                              logLine.includes('failed');
                            const isBlue =
                              logLine.includes('[INFO]') ||
                              logLine.includes('@quant/') ||
                              logLine.includes('Scope:');

                            return (
                              <div
                                key={lineIdx}
                                data-seq={lineIdx + 1}
                                className="flex items-start gap-3 hover:bg-[var(--quant-surface-elevated)]/50 px-1 py-0.5 rounded leading-relaxed"
                              >
                                <span className="select-none text-[#7D8590] w-6 text-right shrink-0 text-[10px]">
                                  {lineIdx + 1}
                                </span>
                                <span
                                  className={`flex-1 break-all ${
                                    isGreen
                                      ? 'text-[#3FB950]'
                                      : isRed
                                        ? 'text-[#F85149]'
                                        : isBlue
                                          ? 'text-[#58A6FF]'
                                          : 'text-[#C9D1D9]'
                                  }`}
                                >
                                  {logLine}
                                </span>
                              </div>
                            );
                          })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
                })
              )}
            </div>
          </div>
        ) : (
          /* Workflow Runs List Table (Screens 91–98) */
          <div className="space-y-4">
            {/* Header Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--quant-surface-elevated)] p-3 rounded-xl border border-[#30363D]">
              <div>
                <h3 className="font-bold text-sm text-[#E6EDF3]">{selectedWorkflow}</h3>
                <p className="text-[11px] text-[#8D96A0]">
                  Showing runs from {selectedWorkflow} ({filteredRuns.length}{' '}
                  {filteredRuns.length === 1 ? 'run' : 'runs'})
                </p>
              </div>
              <button
                type="button"
                onClick={handleTriggerWorkflow}
                data-testid="run-workflow-btn"
                className="px-3.5 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs shadow-sm transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <span>▶</span> Run workflow
              </button>
            </div>

            {/* 5-Dimension Filter Pills (Screens 91–96) */}
            <div className="space-y-2">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter workflow runs..."
                  data-testid="actions-search-input"
                  className="w-full bg-[var(--quant-surface-elevated)] border border-[#30363D] focus:border-[#58A6FF] rounded-lg px-3 py-2 text-xs text-[#E6EDF3] placeholder-[#8D96A0] outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] text-[#8D96A0]">
                {[
                  { id: 'actor', label: 'Filter by Actor' },
                  { id: 'branch', label: 'Filter by Branch' },
                  { id: 'status', label: 'Filter by Status' },
                  { id: 'event', label: 'Filter by Event' },
                  { id: 'workflow', label: 'Filter by Workflow' },
                ].map((flt) => (
                  <button
                    key={flt.id}
                    onClick={() =>
                      setActiveFilterModal(activeFilterModal === flt.id ? null : flt.id)
                    }
                    data-testid={`filter-${flt.id}`}
                    className="px-2.5 py-1 rounded-md bg-[var(--quant-surface-elevated)] hover:bg-[#21262D] border border-[#30363D] text-[#8D96A0] hover:text-[#E6EDF3] flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <span>{flt.label}</span>
                    <span className="text-[var(--q-type-xs)]">▼</span>
                  </button>
                ))}
              </div>

              {/* Status Filter Popover */}
              {activeFilterModal === 'status' && (
                <div
                  data-testid="status-filter-popover"
                  className="p-3 rounded-xl bg-[var(--quant-surface-elevated)] border border-[#30363D] shadow-2xl space-y-2 max-w-xs"
                >
                  <span className="font-semibold text-xs text-[#E6EDF3] block">
                    Filter by Status
                  </span>
                  <div className="space-y-1">
                    {['all', 'success', 'failed', 'in_progress', 'queued', 'cancelled'].map(
                      (st) => (
                        <label
                          key={st}
                          className="flex items-center gap-2 cursor-pointer capitalize"
                        >
                          <input
                            type="radio"
                            name="status_filter"
                            checked={statusFilter === st}
                            onChange={() => {
                              setStatusFilter(st);
                              setActiveFilterModal(null);
                            }}
                            className="text-[#58A6FF]"
                          />
                          <span>{st === 'all' ? 'All statuses' : st}</span>
                        </label>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Workflow Runs List Table */}
            <div
              data-testid="workflow-runs-list"
              className="border border-[#30363D] rounded-xl bg-[#0D1117] divide-y divide-[#21262D] overflow-hidden"
            >
              {filteredRuns.length === 0 && (
                <div
                  data-testid="workflow-runs-empty"
                  className="p-10 text-center"
                >
                  <p className="text-sm font-medium text-[#E6EDF3]">
                    {actions.length === 0 ? 'No workflow runs yet' : 'No runs match your filters'}
                  </p>
                  <p className="mt-1 text-xs text-[#8D96A0]">
                    {actions.length === 0
                      ? 'Trigger a workflow to see runs appear here.'
                      : 'Try clearing the search or status filter.'}
                  </p>
                </div>
              )}
              {filteredRuns.map((run) => {
                const isPassing = run.status === 'success' || run.status === 'completed';
                const isFailing = run.status === 'failed';
                return (
                  <div
                    key={run.id}
                    data-testid={`run-row-${run.id}`}
                    className="p-3.5 hover:bg-[var(--quant-surface-elevated)] transition-colors cursor-pointer flex items-center justify-between gap-4 group"
                    onClick={() => {
                      setActiveRun(run);
                      setSelectedActionRun(run);
                      setModalState?.('action-detail');
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="pt-0.5 text-base">
                        {isPassing && <span className="text-[#3FB950]">✓</span>}
                        {isFailing && <span className="text-[#F85149]">✕</span>}
                        {!isPassing && !isFailing && <span className="text-[#D29922]">●</span>}
                      </div>

                      <div className="space-y-1">
                        <h5 className="font-semibold text-xs text-[#E6EDF3] group-hover:text-[#58A6FF] transition-colors">
                          {run.name}
                        </h5>

                        <p className="text-[11px] text-[#8D96A0]">
                          <span className="font-medium text-[#C9D1D9]">{run.actor}</span> triggered
                          via{' '}
                          <span className="font-mono text-[#58A6FF]">{run.event || 'push'}</span> on{' '}
                          <span className="font-mono">{run.branch}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-[11px] text-[#8D96A0]">
                      <span>{run.createdAt}</span>
                      <span className="font-mono px-2 py-0.5 rounded bg-[#21262D]">
                        {run.duration || '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
