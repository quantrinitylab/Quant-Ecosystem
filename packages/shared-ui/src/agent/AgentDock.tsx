// ============================================================================
// Shared UI - AgentDock Component
// ============================================================================

import React from 'react';
import { AgentCard } from './AgentCard';
import type { AgentStatus } from './AgentCard';

export interface AgentDockProps {
  agents: AgentStatus[];
  onAgentSelect: (agentId: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const AgentDock: React.FC<AgentDockProps> = ({ agents, onAgentSelect, isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 md:relative md:inset-auto"
      role="region"
      aria-label="Agent Dock"
    >
      {/* Mobile overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel container - bottom sheet on mobile, side panel on desktop */}
      <div className="absolute bottom-0 left-0 right-0 max-h-[70vh] md:static md:max-h-full md:w-80 md:h-full bg-white rounded-t-2xl md:rounded-none shadow-xl md:shadow-md overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Running Agents</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
            aria-label="Close agent dock"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {agents.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">No agents running</p>
          )}
          {agents.map((agent) => (
            <div
              key={agent.id}
              onClick={() => onAgentSelect(agent.id)}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`Select agent ${agent.name}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onAgentSelect(agent.id);
                }
              }}
            >
              <AgentCard agent={agent} onPause={() => {}} onStop={() => {}} onResume={() => {}} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
