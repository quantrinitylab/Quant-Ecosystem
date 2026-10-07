// ============================================================================
// Shared UI - App Launcher Grid Component
// ============================================================================

import React from 'react';
import { AppSwitcherApp } from './AppSwitcher';

export interface AppLauncherProps {
  apps: AppSwitcherApp[];
  onSelect?: (app: AppSwitcherApp) => void;
}

export const AppLauncher: React.FC<AppLauncherProps> = ({ apps, onSelect }) => {
  return (
    <div className="w-full" role="navigation" aria-label="App launcher">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 p-4">
        {apps.map((app) => (
          <button
            key={app.id}
            onClick={() => onSelect?.(app)}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors ${
              app.active ? 'bg-blue-50 ring-1 ring-blue-200' : ''
            }`}
            aria-label={app.name}
            aria-current={app.active ? 'true' : undefined}
          >
            <span className="text-3xl" aria-hidden="true">
              {app.icon}
            </span>
            <span className="text-sm text-gray-700 font-medium text-center">{app.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
