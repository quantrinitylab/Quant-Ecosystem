'use client';

// ============================================================================
// Shared UI - OAuth Consent Screen Component
// ============================================================================

import React, { useState } from 'react';

export interface Permission {
  id: string;
  name: string;
  description: string;
}

export interface ConsentScreenProps {
  appName: string;
  appIcon?: string;
  permissions: Permission[];
  onAllow: (remember: boolean) => void;
  onDeny: () => void;
  userEmail?: string;
}

export const ConsentScreen: React.FC<ConsentScreenProps> = ({
  appName,
  appIcon,
  permissions,
  onAllow,
  onDeny,
  userEmail,
}) => {
  const [remember, setRemember] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50 dark:bg-gray-950">
      <div
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-[var(--quant-border,#e5e7eb)] p-8"
        role="dialog"
        aria-label="OAuth consent"
        aria-modal="true"
      >
        {/* App header */}
        <div className="text-center mb-6">
          {appIcon && (
            <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-3xl">
              <span aria-hidden="true">{appIcon}</span>
            </div>
          )}
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {appName} wants access
          </h1>
          {userEmail && (
            <p className="text-sm text-[var(--quant-text-secondary,#6b7280)] mt-1">
              to your Quant account ({userEmail})
            </p>
          )}
        </div>

        {/* Permissions */}
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            This will allow {appName} to:
          </p>
          <ul className="space-y-3" role="list" aria-label="Requested permissions">
            {permissions.map((perm) => (
              <li
                key={perm.id}
                className="flex items-start gap-3 p-3 bg-[var(--quant-surface-hover,#f9fafb)] dark:bg-gray-800 rounded-lg"
              >
                <svg
                  className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {perm.name}
                  </p>
                  <p className="text-xs text-[var(--quant-text-secondary,#6b7280)]">
                    {perm.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Remember checkbox */}
        <label className="flex items-center gap-2 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            aria-label="Remember this app"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Remember this app (do not ask again)
          </span>
        </label>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onDeny}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-[var(--quant-border,#e5e7eb)] rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            aria-label="Deny access"
          >
            Deny
          </button>
          <button
            onClick={() => onAllow(remember)}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label="Allow access"
          >
            Allow
          </button>
        </div>

        {/* Trust indicator */}
        <p className="mt-4 text-center text-xs text-[var(--quant-text-secondary,#6b7280)]">
          You can revoke access at any time from Settings.
        </p>
      </div>
    </div>
  );
};
