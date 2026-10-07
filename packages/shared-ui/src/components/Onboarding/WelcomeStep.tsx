// ============================================================================
// Shared UI - Welcome Step Component
// ============================================================================

import React from 'react';

export interface WelcomeStepProps {
  name?: string;
  onNameChange?: (name: string) => void;
}

export const WelcomeStep: React.FC<WelcomeStepProps> = ({ name = '', onNameChange }) => {
  return (
    <div className="space-y-6 text-center">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome to Quant</h2>
        <p className="text-base text-gray-500">
          Your unified platform for everything. Let us know what to call you.
        </p>
      </div>
      <div className="max-w-sm mx-auto">
        <label
          htmlFor="welcome-name"
          className="block text-sm font-medium text-gray-700 text-left mb-1"
        >
          Your name
        </label>
        <input
          id="welcome-name"
          type="text"
          value={name}
          onChange={(e) => onNameChange?.(e.target.value)}
          placeholder="Enter your name"
          className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          aria-label="Your name"
        />
      </div>
    </div>
  );
};
