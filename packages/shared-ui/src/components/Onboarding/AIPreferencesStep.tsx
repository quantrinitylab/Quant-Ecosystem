// ============================================================================
// Shared UI - AI Preferences Step Component
// ============================================================================

import React from 'react';

export interface AIPreferencesStepProps {
  memoryConsent?: boolean;
  onMemoryConsentChange?: (consent: boolean) => void;
  personality?: string;
  onPersonalityChange?: (personality: string) => void;
}

const personalities = [
  { id: 'professional', label: 'Professional', description: 'Formal and concise' },
  { id: 'friendly', label: 'Friendly', description: 'Casual and helpful' },
  { id: 'creative', label: 'Creative', description: 'Imaginative and expressive' },
];

export const AIPreferencesStep: React.FC<AIPreferencesStepProps> = ({
  memoryConsent = false,
  onMemoryConsentChange,
  personality = 'professional',
  onPersonalityChange,
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">AI Preferences</h2>
        <p className="text-base text-gray-500">
          Customize how AI interacts with you across the platform.
        </p>
      </div>

      {/* Memory consent */}
      <div className="p-4 bg-white border border-gray-200 rounded-lg">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={memoryConsent}
            onChange={(e) => onMemoryConsentChange?.(e.target.checked)}
            className="w-5 h-5 mt-0.5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            aria-label="AI memory consent"
          />
          <div>
            <p className="text-sm font-medium text-gray-900">Enable AI memory</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Allow AI to remember your preferences and context across conversations for a more
              personalized experience.
            </p>
          </div>
        </label>
      </div>

      {/* Personality selection */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">AI personality</p>
        <div className="space-y-2" role="radiogroup" aria-label="AI personality">
          {personalities.map((p) => (
            <label
              key={p.id}
              className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                personality === p.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="personality"
                value={p.id}
                checked={personality === p.id}
                onChange={(e) => onPersonalityChange?.(e.target.value)}
                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-2 focus:ring-blue-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{p.label}</p>
                <p className="text-xs text-gray-500">{p.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};
