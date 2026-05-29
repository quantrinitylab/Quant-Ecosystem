// ============================================================================
// Shared UI - ResponsiveShell Component
// ============================================================================

import React from 'react';
import { AppShell } from '../Layout/AppShell';
import type { AppShellProps } from '../Layout/AppShell';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useOrientation } from '../../hooks/useOrientation';

export interface ResponsiveShellProps extends AppShellProps {
  bottomNav?: React.ReactNode;
  collapseBreakpoint?: 'sm' | 'md' | 'lg';
  safeArea?: boolean;
}

const breakpointIndex: Record<string, number> = {
  xs: 0,
  sm: 1,
  md: 2,
  lg: 3,
  xl: 4,
  '2xl': 5,
};

export const ResponsiveShell: React.FC<ResponsiveShellProps> = ({
  children,
  sidebar,
  bottomNav,
  collapseBreakpoint = 'md',
  safeArea = true,
  ...appShellProps
}) => {
  const breakpoint = useBreakpoint();
  const orientation = useOrientation();

  const currentIndex = breakpointIndex[breakpoint] ?? 0;
  const collapseIndex = breakpointIndex[collapseBreakpoint] ?? 2;
  const isBelowBreakpoint = currentIndex < collapseIndex;
  const showSidebar = !isBelowBreakpoint && sidebar;
  const showBottomNav = isBelowBreakpoint && bottomNav;

  const safeAreaStyle: React.CSSProperties = safeArea
    ? {
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }
    : {};

  return (
    <div style={safeAreaStyle} data-orientation={orientation} className="h-full w-full">
      <AppShell {...appShellProps} sidebar={showSidebar ? sidebar : undefined}>
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto">{children}</div>
          {showBottomNav && (
            <nav
              className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700"
              aria-label="Bottom navigation"
            >
              {bottomNav}
            </nav>
          )}
        </div>
      </AppShell>
    </div>
  );
};
