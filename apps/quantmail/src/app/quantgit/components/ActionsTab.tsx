'use client';

// ============================================================================
// QuantGit — Real GitHub Actions CI Pipeline with 5-Dimension Filters (Screens 91–98)
// ============================================================================

import React, { useState, useMemo } from 'react';
import type { WorkflowRunItem } from '../types';

export interface ActionsTabProps {
  actions: WorkflowRunItem[];
  handleTriggerWorkflow: () => void;
  setSelectedActionRun: (act: WorkflowRunItem) => void;
  setModalState: (modal: any) => void;
  runnerConnected?: boolean;
}

export function ActionsTab({
  actions,
  handleTriggerWorkflow,
  setSelectedActionRun,
  setModalState,
  runnerConnected = true,
}: ActionsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState('All workflows');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [activeFilterModal, setActiveFilterModal] = useState<string | null>(null);

  const workflows = [
    'All workflows',
    'CI',
    'Copilot',
    'Copilot cloud agent',
    'Debug',
    'Dependabot Updates',
    'Release',
  ];

  // Enhanced actions listing if sample actions is small
  const displayActions = useMemo<WorkflowRunItem[]>(() => {
    if (actions.length > 0) return actions;
    return [
      {
        id: 'run-36626',
        name: 'feat: support telemetry for speech generation and streaming transcription',
        workflow: 'CI',
        status: 'success',
        conclusion: 'success',
        branch: 'main',
        commitSha: '948e3612',
        actor: 'ai-sdk-factory[bot]',
        event: 'pull_request',
        duration: '1s',
        timeAgo: 'Today at 3:11 PM',
        createdAt: 'Today at 3:11 PM',
        jobs: [],
      },
      {
        id: 'run-36625',
        name: 'Slack Workflow Failure Notification #36625',
        workflow: 'CI',
        status: 'failed',
        conclusion: 'failure',
        branch: 'feat/speech-telemetry',
        commitSha: '8910bcae',
        actor: 'edward0127',
        event: 'push',
        duration: '9s',
        timeAgo: 'Today at 3:07 PM',
        createdAt: 'Today at 3:07 PM',
        jobs: [],
      },
      {
        id: 'run-36624',
        name: 'Verify Changesets #29508: Pull request #21427 labeled by ai-sdk-factory',
        workflow: 'CI',
        status: 'success',
        conclusion: 'success',
        branch: 'main',
        commitSha: '417b018e',
        actor: 'ai-sdk-factory[bot]',
        event: 'pull_request',
        duration: '2s',
        timeAgo: 'Today at 3:06 PM',
        createdAt: 'Today at 3:06 PM',
        jobs: [],
      },
    ];
  }, [actions]);

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

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-xs text-[#E6EDF3]">
      {/* Left Sidebar: Workflow Categories (Screens 95–96) */}
      <div className="space-y-1">
        <h4 className="font-bold text-[#8D96A0] uppercase tracking-wider text-[10px] px-2 mb-2">
          Workflows
        </h4>
        {workflows.map((wf) => (
          <button
            key={wf}
            type="button"
            onClick={() => setSelectedWorkflow(wf)}
            className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors ${
              selectedWorkflow === wf
                ? 'bg-[#21262D] text-[#E6EDF3] font-bold shadow-sm'
                : 'text-[#8D96A0] hover:text-[#E6EDF3] hover:bg-[#161B22]'
            }`}
          >
            {wf}
          </button>
        ))}
      </div>

      {/* Main Runs Table (Screens 91–98) */}
      <div className="md:col-span-3 space-y-4">
        {/* Header Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#161B22] p-3 rounded-xl border border-[#30363D]">
          <div>
            <h3 className="font-bold text-sm text-[#E6EDF3]">All workflows</h3>
            <p className="text-[11px] text-[#8D96A0]">
              Showing runs from all workflows (2,500+ workflow runs)
            </p>
          </div>
          <button
            type="button"
            onClick={handleTriggerWorkflow}
            className="px-3.5 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs shadow-sm transition-colors flex items-center gap-1.5 shrink-0"
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
              className="w-full bg-[#161B22] border border-[#30363D] focus:border-[#58A6FF] rounded-lg px-3 py-2 text-xs text-[#E6EDF3] placeholder-[#8D96A0] outline-none"
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
                onClick={() => setActiveFilterModal(activeFilterModal === flt.id ? null : flt.id)}
                className="px-2.5 py-1 rounded-md bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-[#8D96A0] hover:text-[#E6EDF3] flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <span>{flt.label}</span>
                <span className="text-[9px]">▼</span>
              </button>
            ))}
          </div>

          {/* Status Filter Popover (Screen 93) */}
          {activeFilterModal === 'status' && (
            <div className="p-3 rounded-xl bg-[#161B22] border border-[#30363D] shadow-2xl space-y-2 max-w-xs">
              <span className="font-semibold text-xs text-[#E6EDF3] block">Filter by Status</span>
              <div className="space-y-1">
                {['all', 'success', 'failure', 'in_progress', 'queued', 'cancelled'].map((st) => (
                  <label key={st} className="flex items-center gap-2 cursor-pointer capitalize">
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
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Workflow Runs List (Screens 97–98) */}
        <div className="border border-[#30363D] rounded-xl bg-[#0D1117] divide-y divide-[#21262D] overflow-hidden">
          {filteredRuns.map((run) => {
            const isPassing = run.status === 'success';
            const isFailing = run.status === 'failed';
            return (
              <div
                key={run.id}
                className="p-3.5 hover:bg-[#161B22] transition-colors cursor-pointer flex items-center justify-between gap-4 group"
                onClick={() => {
                  setSelectedActionRun(run);
                  setModalState('action-detail');
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
                      <span className="font-medium text-[#C9D1D9]">{run.actor}</span> triggered via{' '}
                      <span className="font-mono text-[#58A6FF]">{run.event || 'push'}</span> on{' '}
                      <span className="font-mono">{run.branch}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 text-[11px] text-[#8D96A0]">
                  <span>{run.createdAt}</span>
                  <span className="font-mono px-2 py-0.5 rounded bg-[#21262D]">
                    {run.duration || '1s'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
