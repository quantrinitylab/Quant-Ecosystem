'use client';

interface SidebarCollapseToggleProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

/**
 * Hamburger-style sidebar collapse toggle button.
 * Shows at the top of the sidebar. Collapses to icon-only mode.
 */
export function SidebarCollapseToggle({ isCollapsed, onToggle }: SidebarCollapseToggleProps) {
  return (
    <button
      type="button"
      className="sidebar-collapse-btn"
      onClick={onToggle}
      aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      title={`${isCollapsed ? 'Expand' : 'Collapse'} sidebar ([)`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="sidebar-collapse-icon"
        aria-hidden="true"
      >
        {isCollapsed ? (
          <>
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </>
        ) : (
          <>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <polyline points="14 9 11 12 14 15" />
          </>
        )}
      </svg>
    </button>
  );
}
