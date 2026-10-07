// ============================================================================
// Shared UI - App Switcher Component
// ============================================================================

import React from 'react';

export interface AppSwitcherApp {
  id: string;
  name: string;
  icon: string;
  href: string;
  active?: boolean;
}

export interface AppSwitcherProps {
  apps: AppSwitcherApp[];
  onSelect?: (app: AppSwitcherApp) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const AppSwitcher: React.FC<AppSwitcherProps> = ({ apps, onSelect, isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="App switcher">
      <div className="fixed inset-0 bg-black/20" onClick={onClose} aria-hidden="true" />
      <div className="fixed top-16 right-4 w-80 bg-white rounded-xl shadow-xl border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Apps</h2>
        <div className="grid grid-cols-3 gap-2" role="list">
          {apps.map((app) => (
            <button
              key={app.id}
              onClick={() => onSelect?.(app)}
              className={`flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors ${
                app.active ? 'bg-blue-50 ring-1 ring-blue-200' : ''
              }`}
              role="listitem"
              aria-current={app.active ? 'true' : undefined}
            >
              <span className="text-2xl" aria-hidden="true">
                {app.icon}
              </span>
              <span className="text-xs text-gray-700 text-center truncate w-full">{app.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
