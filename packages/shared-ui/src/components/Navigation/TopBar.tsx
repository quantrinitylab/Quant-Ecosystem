// ============================================================================
// Shared UI - Top Bar / App Header Component
// ============================================================================

import React from 'react';

export interface TopBarProps {
  title?: string;
  subtitle?: string;
  leftAction?: React.ReactNode;
  rightActions?: React.ReactNode[];
  centerContent?: React.ReactNode;
  transparent?: boolean;
  elevated?: boolean;
  className?: string;
  onBack?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  title,
  subtitle,
  leftAction,
  rightActions,
  centerContent,
  transparent = false,
  elevated = true,
  className = '',
  onBack,
}) => {
  const bgStyles = transparent ? 'bg-transparent' : 'bg-white';
  const shadowStyles = elevated && !transparent ? 'shadow-sm' : '';

  return (
    <header className={`sticky top-0 z-40 ${bgStyles} ${shadowStyles} safe-area-top ${className}`}>
      <div className="flex items-center justify-between h-14 px-4">
        {/* Left section */}
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button onClick={onBack} className="p-1 -ml-1 text-gray-700 hover:text-gray-900 rounded-full hover:bg-gray-100" aria-label="Go back">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {leftAction && leftAction}
          {!centerContent && title && (
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">{title}</h1>
              {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
            </div>
          )}
        </div>

        {/* Center section */}
        {centerContent && (
          <div className="flex-1 flex items-center justify-center mx-4">
            {centerContent}
          </div>
        )}

        {/* Right section */}
        <div className="flex items-center gap-1">
          {rightActions?.map((action, i) => (
            <React.Fragment key={i}>{action}</React.Fragment>
          ))}
        </div>
      </div>
    </header>
  );
};
