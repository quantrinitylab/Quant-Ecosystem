'use client';

import React from 'react';
import { BubbleAvatar } from '@quant/shared-ui';
import type { DeployedAgent } from '../types';
import { QuantGitEmptyState } from './QuantGitSkeletons';

export interface AgentsTabProps {
  agents: DeployedAgent[];
  setModalState: (modal: any) => void;
}

export function AgentsTab({ agents, setModalState }: AgentsTabProps) {
  return (
    <div className="space-y-6 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg bg-[var(--quant-surface-elevated)] border border-[var(--quant-border)]">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <BubbleAvatar state="coding" size={20} />
            Agent Workspace
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--quant-surface-hover)] text-[#8D96A0] border border-[var(--quant-border)]">
              Local only — no backend connected
            </span>
          </h3>
          <p className="text-[#7D8590]">
            Workspace agents you configure here are local to this session. Connect a real agent
            backend to enable autonomous reviews and migrations.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalState('deploy-agent')}
          className="px-3.5 py-1.5 rounded-md bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-black font-bold transition-colors"
        >
          + Add Agent
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-lg bg-[var(--quant-surface-elevated)] border border-[var(--quant-border)]">
          <QuantGitEmptyState
            icon="agent"
            title="No agents added"
            hint="Add a local agent placeholder. A connected agent backend is required before agents can review PRs, run migrations, or test code."
            actionLabel="+ Add Agent"
            onAction={() => setModalState('deploy-agent')}
            testId="agents-empty"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((ag) => (
          <div
            key={ag.id}
            className="p-4 rounded-md bg-[var(--quant-surface-elevated)] border border-[var(--quant-border)] space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-7 h-7 rounded-full font-bold flex items-center justify-center text-xs text-black"
                  style={{ backgroundColor: ag.color }}
                >
                  {ag.initial}
                </span>
                <div>
                  <h4 className="font-bold text-white">{ag.name}</h4>
                  <span className="text-[10px] font-mono text-[#7D8590]">{ag.pod}</span>
                </div>
              </div>
              {/* Neutral pill only — no agent here is connected to a backend, so no
                  'active'/running claim is ever rendered. */}
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--quant-surface-hover)] text-[#8D96A0] border border-[var(--quant-border)]">
                {ag.status === 'local-only' ? 'Local only' : ag.status}
              </span>
            </div>
            <p className="text-[11px] text-[var(--app-accent)] font-semibold">{ag.role}</p>
            <p className="text-[11px] text-[#7D8590] leading-relaxed">{ag.currentTask}</p>
          </div>
          ))}
        </div>
      )}
    </div>
  );
}
