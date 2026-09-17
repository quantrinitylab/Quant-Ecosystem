'use client';

import React from 'react';
import { BubbleAvatar } from '@quant/shared-ui';
import type { DeployedAgent } from '../types';

export interface AgentsTabProps {
  agents: DeployedAgent[];
  setModalState: (modal: any) => void;
}

export function AgentsTab({ agents, setModalState }: AgentsTabProps) {
  return (
    <div className="space-y-6 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg bg-[#161B22] border border-[#30363D]">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <BubbleAvatar state="coding" size={20} />
            Autonomous Swarm Fleet & GitHub Copilot Workspace
          </h3>
          <p className="text-[#7D8590]">
            6 specialized developer agents autonomously reviewing PRs, managing migrations, and
            testing code.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalState('deploy-agent')}
          className="px-3.5 py-1.5 rounded-md bg-[#FF8C42] hover:bg-[#ff9b5a] text-black font-bold transition-colors"
        >
          + Deploy Agent
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((ag) => (
          <div
            key={ag.id}
            className="p-4 rounded-md bg-[#161B22] border border-[#30363D] space-y-3"
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
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#3FB950]/20 text-[#3FB950]">
                {ag.status}
              </span>
            </div>
            <p className="text-[11px] text-[#FF8C42] font-semibold">{ag.role}</p>
            <p className="text-[11px] text-[#7D8590] leading-relaxed">{ag.currentTask}</p>
            <div className="bg-[#0D1117] p-2.5 rounded border border-[#21262D] space-y-1 text-[10px]">
              <p className="font-bold text-white">Thought Chain:</p>
              <p className="text-[#7D8590] italic">{ag.thoughts}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
