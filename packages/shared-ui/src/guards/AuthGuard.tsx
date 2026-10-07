// ============================================================================
// Shared UI - Auth Guard Component
// ============================================================================

import React from 'react';

export interface AuthGuardProps {
  isAuthenticated: boolean;
  loginPath?: string;
  children: React.ReactNode;
}

/**
 * AuthGuard provides UI-level access control only. It conditionally renders
 * children or a fallback sign-in prompt based on the `isAuthenticated` prop.
 *
 * IMPORTANT: This component does NOT enforce security. Server-side authentication
 * and authorization checks are required to protect sensitive data and endpoints.
 * Treat this guard as a UX convenience, not a security boundary.
 */
export const AuthGuard: React.FC<AuthGuardProps> = ({
  isAuthenticated,
  loginPath = '/login',
  children,
}) => {
  if (!isAuthenticated) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-dvh p-8"
        role="alert"
        aria-label="Authentication required"
      >
        <svg
          className="w-16 h-16 mb-4 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Authentication Required</h2>
        <p className="text-sm text-gray-500 mb-4">Please sign in to access this content.</p>
        <a
          href={loginPath}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Sign in
        </a>
      </div>
    );
  }

  return <>{children}</>;
};
