// ============================================================================
// Shared UI - PageContainer Component
// ============================================================================

import React from 'react';

export interface Breadcrumb {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface PageContainerProps {
  children: React.ReactNode;
  title?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
  'aria-label'?: string;
}

export const PageContainer: React.FC<PageContainerProps> = ({
  children,
  title,
  breadcrumbs,
  actions,
  maxWidth = 'lg',
  className = '',
  'aria-label': ariaLabel,
}) => {
  const maxWidthStyles: Record<string, string> = {
    sm: 'max-w-2xl',
    md: 'max-w-4xl',
    lg: 'max-w-6xl',
    xl: 'max-w-7xl',
    full: 'max-w-full',
  };

  return (
    <div
      className={`mx-auto px-4 py-6 sm:px-6 lg:px-8 ${maxWidthStyles[maxWidth]} ${className}`}
      aria-label={ariaLabel || title || 'Page content'}
    >
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-4" aria-label="Breadcrumb">
          <ol className="flex items-center space-x-2 text-sm text-gray-500">
            {breadcrumbs.map((crumb, index) => (
              <li key={crumb.label} className="flex items-center">
                {index > 0 && <span className="mx-2 text-gray-400">/</span>}
                {crumb.onClick || crumb.href ? (
                  <button
                    onClick={crumb.onClick}
                    className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    aria-label={crumb.label}
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      {(title || actions) && (
        <div className="flex items-center justify-between mb-6">
          {title && (
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
          )}
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </div>
      )}

      {children}
    </div>
  );
};
