// ============================================================================
// Shared UI - Connect Apps Step Component
// ============================================================================

import React from 'react';

export interface AppToggleItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface ConnectAppsStepProps {
  apps?: AppToggleItem[];
  onToggle?: (id: string, enabled: boolean) => void;
}

const defaultApps: AppToggleItem[] = [
  { id: 'mail', name: 'QuantMail', description: 'Email and communication', enabled: true },
  { id: 'chat', name: 'QuantChat', description: 'Team messaging', enabled: true },
  { id: 'drive', name: 'QuantDrive', description: 'File storage', enabled: true },
  { id: 'docs', name: 'QuantDocs', description: 'Document editing', enabled: false },
  { id: 'calendar', name: 'QuantCalendar', description: 'Scheduling', enabled: false },
  { id: 'meet', name: 'QuantMeet', description: 'Video conferencing', enabled: false },
];

export const ConnectAppsStep: React.FC<ConnectAppsStepProps> = ({
  apps = defaultApps,
  onToggle,
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Connect your apps</h2>
        <p className="text-base text-gray-500">Choose which apps to enable for your workspace.</p>
      </div>
      <div className="space-y-2" role="group" aria-label="Available apps">
        {apps.map((app) => (
          <label
            key={app.id}
            className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">{app.name}</p>
              <p className="text-xs text-gray-500">{app.description}</p>
            </div>
            <input
              type="checkbox"
              checked={app.enabled}
              onChange={(e) => onToggle?.(app.id, e.target.checked)}
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              aria-label={`Enable ${app.name}`}
            />
          </label>
        ))}
      </div>
    </div>
  );
};
