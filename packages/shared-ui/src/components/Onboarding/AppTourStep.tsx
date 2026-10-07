// ============================================================================
// Shared UI - App Tour Step Component
// ============================================================================

import React from 'react';

export interface AppTourFeature {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface AppTourStepProps {
  features?: AppTourFeature[];
}

const defaultFeatures: AppTourFeature[] = [
  {
    id: 'mail',
    title: 'QuantMail',
    description: 'Smart email with AI-powered sorting and quick replies.',
    icon: '\u2709\uFE0F',
  },
  {
    id: 'drive',
    title: 'QuantDrive',
    description: 'Cloud storage with real-time collaboration and sharing.',
    icon: '\uD83D\uDCC1',
  },
  {
    id: 'chat',
    title: 'QuantChat',
    description: 'Messaging with channels, threads, and video calls.',
    icon: '\uD83D\uDCAC',
  },
  {
    id: 'calendar',
    title: 'QuantCalendar',
    description: 'Scheduling with smart conflict detection and availability.',
    icon: '\uD83D\uDCC5',
  },
];

export const AppTourStep: React.FC<AppTourStepProps> = ({ features = defaultFeatures }) => {
  return (
    <div className="space-y-6 text-center">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Explore Your Apps</h2>
        <p className="text-base text-gray-500">
          Everything you need, unified in one platform. Here is what you can do.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
        {features.map((feature) => (
          <div
            key={feature.id}
            className="p-4 rounded-lg border border-[var(--quant-border,#e5e7eb)] bg-[var(--quant-surface-hover,#f9fafb)] text-left"
            role="listitem"
          >
            <span className="text-2xl" aria-hidden="true">
              {feature.icon}
            </span>
            <h3 className="text-sm font-semibold text-gray-900 mt-2">{feature.title}</h3>
            <p className="text-xs text-[var(--quant-text-secondary,#6b7280)] mt-1">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
