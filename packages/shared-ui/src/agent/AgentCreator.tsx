'use client';

// ============================================================================
// Shared UI - AgentCreator Component
// ============================================================================

import React, { useState } from 'react';

export type AgentPermissionLevel = 'OBSERVE' | 'SUGGEST' | 'ACT_LOW' | 'ACT_HIGH' | 'FULL_AUTO';

export interface AgentCreatorConfig {
  description: string;
  permissionLevel: AgentPermissionLevel;
}

export interface AgentCreatorProps {
  onSubmit: (config: AgentCreatorConfig) => void;
  existingAgents: string[];
}

export const AgentCreator: React.FC<AgentCreatorProps> = ({ onSubmit, existingAgents }) => {
  const [description, setDescription] = useState('');
  const [permissionLevel, setPermissionLevel] = useState<AgentPermissionLevel>('SUGGEST');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim()) {
      onSubmit({ description: description.trim(), permissionLevel });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="agent-description" className="block text-sm font-medium text-gray-700 mb-1">
          Describe your agent
        </label>
        <textarea
          id="agent-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what you want this agent to do..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          rows={4}
        />
      </div>

      <div>
        <label htmlFor="permission-level" className="block text-sm font-medium text-gray-700 mb-1">
          Permission Level
        </label>
        <select
          id="permission-level"
          value={permissionLevel}
          onChange={(e) => setPermissionLevel(e.target.value as AgentPermissionLevel)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="OBSERVE">Observe</option>
          <option value="SUGGEST">Suggest</option>
          <option value="ACT_LOW">Act Low</option>
          <option value="ACT_HIGH">Act High</option>
          <option value="FULL_AUTO">Full Auto</option>
        </select>
      </div>

      {existingAgents.length > 0 && (
        <div>
          <span className="block text-sm font-medium text-gray-700 mb-1">Existing Agents</span>
          <div className="flex flex-wrap gap-1">
            {existingAgents.map((name) => (
              <span
                key={name}
                className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {description.trim() && (
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
          <span className="block text-xs font-medium text-gray-500 mb-1">Preview</span>
          <p className="text-sm text-gray-900">{description.trim()}</p>
          <p className="text-xs text-gray-500 mt-1">Permission: {permissionLevel}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={!description.trim()}
        className="w-full px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Create Agent
      </button>
    </form>
  );
};
