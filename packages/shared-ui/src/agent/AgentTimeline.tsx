// ============================================================================
// Shared UI - AgentTimeline Component
// ============================================================================

import React from 'react';

export interface TimelineEntry {
  id: string;
  agentName: string;
  action: string;
  timestamp: string;
  reversible: boolean;
  result: 'success' | 'failure' | 'pending';
}

export interface AgentTimelineProps {
  entries: TimelineEntry[];
  onUndo: (entryId: string) => void;
}

export const AgentTimeline: React.FC<AgentTimelineProps> = ({ entries, onUndo }) => {
  const resultColors: Record<string, string> = {
    success: 'bg-green-400',
    failure: 'bg-red-400',
    pending: 'bg-yellow-400',
  };

  return (
    <div className="space-y-0" role="list" aria-label="Agent Timeline">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex gap-3 py-3 border-b border-gray-100 last:border-b-0"
          role="listitem"
        >
          <div className="flex flex-col items-center">
            <div className={`w-3 h-3 rounded-full ${resultColors[entry.result]}`} />
            <div className="w-px flex-1 bg-gray-200" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{entry.agentName}</span>
              <span className="text-xs text-gray-400">{entry.timestamp}</span>
            </div>
            <p className="text-sm text-gray-600 mt-0.5">{entry.action}</p>
          </div>

          {entry.reversible && (
            <button
              onClick={() => onUndo(entry.id)}
              className="self-center px-3 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              aria-label={`Undo ${entry.action}`}
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
