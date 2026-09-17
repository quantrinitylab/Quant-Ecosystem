'use client';

import React from 'react';
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
  runnerConnected = false,
}: ActionsTabProps) {
  const workflows = [
    'All workflows',
    'CI',
    'Deploy staging (OIDC)',
    'CodeQL Advanced',
    'Action pin policy',
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-xs">
      <div className="space-y-1">
        <h4 className="font-bold text-[#7D8590] uppercase tracking-wider text-[10px] px-2 mb-2">
          Workflows
        </h4>
        {workflows.map((wf, idx) => (
          <button
            key={wf}
            type="button"
            className={`w-full text-left px-3 py-1.5 rounded-md font-semibold ${
              idx === 0 ? 'bg-[#21262D] text-white font-bold' : 'text-[#7D8590] hover:bg-[#161B22]'
            }`}
          >
            {wf}
          </button>
        ))}
      </div>

      <div className="md:col-span-3 space-y-3">
        <div className="flex items-center justify-between bg-[#161B22] p-2.5 px-3 rounded-md border border-[#30363D]">
          <span className="font-semibold text-[#E6EDF3] text-xs">All workflow runs</span>
          <button
            type="button"
            onClick={handleTriggerWorkflow}
            className="px-3 py-1.5 rounded-md bg-[#238636] hover:bg-[#2EA043] text-white font-bold text-xs shadow-sm transition-colors flex items-center gap-1.5"
          >
            <span>▶</span> Run workflow
          </button>
        </div>

        {/* Runner Status Banner - Astra Ratified Fallback */}
        {!runnerConnected && (
          <div className="p-3.5 rounded-md border border-[#D29922]/40 bg-[#D29922]/10 text-xs flex items-start gap-2.5">
            <span className="text-[#D29922] font-bold text-sm shrink-0">⚠</span>
            <div className="space-y-1 text-[#E6EDF3]">
              <p className="font-bold">No active CI runner attached</p>
              <p className="text-[11px] text-[#7D8590]">
                QuantGit self-hosted runners listen on Fastify WebSocket at{' '}
                <code className="px-1.5 py-0.5 rounded bg-[#161B22] text-[#58A6FF] font-mono">
                  /ci/runner
                </code>
                . Connect a runner to execute automated workflow jobs.
              </p>
            </div>
          </div>
        )}

        <div className="border border-[#30363D] rounded-md bg-[#0D1117] divide-y divide-[#21262D]">
          {actions.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm font-semibold text-[#E6EDF3]">No workflow runs recorded</p>
              <p className="text-xs text-[#7D8590] max-w-md mx-auto">
                Trigger a workflow or push commits to a monitored branch to initiate runs.
              </p>
            </div>
          ) : (
            actions.map((act) => {
              const isPassing = act.status === 'success';
              return (
                <div
                  key={act.id}
                  className="p-3.5 hover:bg-[#161B22] transition-colors cursor-pointer flex items-center justify-between gap-4"
                  onClick={() => {
                    setSelectedActionRun(act);
                    setModalState('action-detail');
                  }}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-bold text-white">
                      <span
                        className={
                          isPassing
                            ? 'text-[#3FB950]'
                            : act.status === 'failed'
                              ? 'text-rose-400'
                              : 'text-amber-400'
                        }
                      >
                        {isPassing ? '✓' : act.status === 'failed' ? '✕' : '●'}
                      </span>
                      <span>{act.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-[#7D8590]">
                      <span className="font-semibold text-[#E6EDF3]">{act.workflow}</span>
                      <span>{act.branch}</span>
                      <span className="font-mono text-[#58A6FF]">{act.commitSha}</span>
                      <span>{act.timeAgo}</span>
                    </div>
                  </div>
                  <div className="text-right text-[#7D8590] font-mono text-[11px] shrink-0">
                    {act.duration}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
