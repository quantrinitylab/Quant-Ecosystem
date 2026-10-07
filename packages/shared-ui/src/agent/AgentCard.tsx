// ============================================================================
// Shared UI - AgentCard Component
// ============================================================================

import React from 'react';

export interface AgentStatus {
  id: string;
  name: string;
  icon: string;
  status: 'running' | 'paused' | 'stopped' | 'completed' | 'error';
  progress: number;
  currentAction: string;
}

export interface AgentCardProps {
  agent: AgentStatus;
  onPause: () => void;
  onStop: () => void;
  onResume: () => void;
}

export const AgentCard: React.FC<AgentCardProps> = ({ agent, onPause, onStop, onResume }) => {
  const statusColors: Record<string, string> = {
    running: 'bg-green-100 text-green-800',
    paused: 'bg-yellow-100 text-yellow-800',
    stopped: 'bg-gray-100 text-gray-800',
    completed: 'bg-blue-100 text-blue-800',
    error: 'bg-red-100 text-red-800',
  };

  return (
    <div className="flex flex-col gap-2 p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">
          {agent.icon}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{agent.name}</h3>
          <span
            className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${statusColors[agent.status]}`}
          >
            {agent.status}
          </span>
        </div>
      </div>

      <div
        className="w-full bg-gray-200 rounded-full h-2"
        role="progressbar"
        aria-valuenow={agent.progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${agent.progress}%` }}
        />
      </div>

      <p className="text-xs text-gray-500 truncate">{agent.currentAction}</p>

      <div className="flex gap-2 mt-1">
        {agent.status === 'running' && (
          <button
            onClick={onPause}
            className="px-3 py-1 text-xs font-medium rounded bg-yellow-100 text-yellow-800 hover:bg-yellow-200 transition-colors"
            aria-label={`Pause ${agent.name}`}
          >
            Pause
          </button>
        )}
        {agent.status === 'paused' && (
          <button
            onClick={onResume}
            className="px-3 py-1 text-xs font-medium rounded bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
            aria-label={`Resume ${agent.name}`}
          >
            Resume
          </button>
        )}
        {(agent.status === 'running' || agent.status === 'paused') && (
          <button
            onClick={onStop}
            className="px-3 py-1 text-xs font-medium rounded bg-red-100 text-red-800 hover:bg-red-200 transition-colors"
            aria-label={`Stop ${agent.name}`}
          >
            Stop
          </button>
        )}
      </div>
    </div>
  );
};
