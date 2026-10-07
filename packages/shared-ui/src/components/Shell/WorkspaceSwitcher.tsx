// ============================================================================
// Shared UI - Workspace Switcher Component
// ============================================================================

import React from 'react';

export interface Workspace {
  id: string;
  name: string;
  avatar?: string;
}

export interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  activeId: string;
  onSwitch: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({
  workspaces,
  activeId,
  onSwitch,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Workspace switcher"
    >
      <div className="fixed inset-0 bg-black/20" onClick={onClose} aria-hidden="true" />
      <div className="fixed top-16 left-4 w-72 bg-white rounded-xl shadow-xl border border-gray-200 p-2">
        <h2 className="px-3 py-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Workspaces
        </h2>
        <div role="listbox" aria-label="Available workspaces">
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              onClick={() => {
                onSwitch(workspace.id);
                onClose();
              }}
              className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                workspace.id === activeId ? 'bg-blue-50' : ''
              }`}
              role="option"
              aria-selected={workspace.id === activeId}
            >
              {workspace.avatar ? (
                <img src={workspace.avatar} alt="" className="w-8 h-8 rounded-lg object-cover" />
              ) : (
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-200 text-gray-600 text-sm font-medium">
                  {workspace.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-sm font-medium text-gray-900 truncate">{workspace.name}</span>
              {workspace.id === activeId && (
                <svg
                  className="ml-auto w-4 h-4 text-blue-500"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
