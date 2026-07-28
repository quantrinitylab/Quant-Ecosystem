// ============================================================================
// Shared UI - AppShell Component
// ============================================================================

import React from 'react';
import { PageTransition } from '../Motion';

export interface AppShellProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  topBar?: React.ReactNode;
  theme?: 'light' | 'dark' | 'neon';
  className?: string;
  animated?: boolean;
  'aria-label'?: string;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  sidebar,
  topBar,
  theme = 'light',
  className = '',
  animated = true,
  'aria-label': ariaLabel = 'Application shell',
}) => {
  const themeStyles: Record<string, string> = {
    light: 'bg-white text-gray-900',
    dark: 'bg-gray-900 text-gray-100',
    neon: 'bg-gray-950 text-green-400',
  };

  return (
    <div
      className={`flex h-screen w-full overflow-hidden ${themeStyles[theme]} ${className}`}
      aria-label={ariaLabel}
      role="application"
    >
      {sidebar && (
        <aside className="flex-shrink-0" aria-label="Sidebar">
          {sidebar}
        </aside>
      )}
      <div className="flex flex-col flex-1 min-w-0">
        {topBar && (
          <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
            {topBar}
          </header>
        )}
        <main className="flex-1 overflow-y-auto">
          {animated ? <PageTransition>{children}</PageTransition> : children}
        </main>
      </div>
    </div>
  );
};
