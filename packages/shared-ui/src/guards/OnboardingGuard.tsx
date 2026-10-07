// ============================================================================
// Shared UI - Onboarding Guard Component
// ============================================================================

import React from 'react';

export interface OnboardingGuardProps {
  isOnboarded: boolean;
  onboardingPath?: string;
  children: React.ReactNode;
}

/**
 * OnboardingGuard provides UI-level access control only. It conditionally
 * renders children or a fallback onboarding prompt based on the `isOnboarded` prop.
 *
 * IMPORTANT: This component does NOT enforce security. Server-side checks are
 * required to ensure users have completed onboarding before accessing protected
 * resources. Treat this guard as a UX convenience, not a security boundary.
 */
export const OnboardingGuard: React.FC<OnboardingGuardProps> = ({
  isOnboarded,
  onboardingPath = '/onboarding',
  children,
}) => {
  if (!isOnboarded) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-dvh p-8"
        role="alert"
        aria-label="Onboarding required"
      >
        <svg
          className="w-16 h-16 mb-4 text-blue-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Welcome! Let&apos;s get you set up
        </h2>
        <p className="text-sm text-gray-500 mb-4">Complete setup to start using the platform.</p>
        <a
          href={onboardingPath}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Start setup
        </a>
      </div>
    );
  }

  return <>{children}</>;
};
