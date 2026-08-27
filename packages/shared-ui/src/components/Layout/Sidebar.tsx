'use client';

// ============================================================================
// Shared UI - Sidebar Component
// ============================================================================

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { spring } from '@quant/brand';

export interface SidebarItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  href?: string;
  active?: boolean;
  onClick?: () => void;
}

export interface SidebarProps {
  items: SidebarItem[];
  collapsed?: boolean;
  onToggle?: () => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  animated?: boolean;
  'aria-label'?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  items,
  collapsed = false,
  onToggle,
  header,
  footer,
  className = '',
  animated = true,
  'aria-label': ariaLabel = 'Navigation sidebar',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && !prefersReducedMotion;

  const widthClass = collapsed ? 'w-16' : 'w-64';

  if (shouldAnimate) {
    return (
      <motion.nav
        className={`flex flex-col h-full bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-hidden ${className}`}
        animate={{ width: collapsed ? '4rem' : '16rem' }}
        transition={{ type: 'spring', ...spring.stiff }}
        aria-label={ariaLabel}
      >
        {header && (
          <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700">
            {header}
          </div>
        )}

        {onToggle && (
          <button
            onClick={onToggle}
            className="p-2 m-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="text-sm">{collapsed ? '\u25B6' : '\u25C0'}</span>
          </button>
        )}

        <ul className="flex-1 overflow-y-auto p-2 space-y-1" role="list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                onClick={item.onClick}
                className={`flex items-center w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  item.active
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                    : 'text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
                aria-current={item.active ? 'page' : undefined}
                aria-label={item.label}
              >
                {item.icon && <span className="flex-shrink-0 mr-3">{item.icon}</span>}
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            </li>
          ))}
        </ul>

        {footer && (
          <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700">
            {footer}
          </div>
        )}
      </motion.nav>
    );
  }

  return (
    <nav
      className={`flex flex-col h-full ${widthClass} bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-200 ${className}`}
      aria-label={ariaLabel}
    >
      {header && (
        <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700">
          {header}
        </div>
      )}

      {onToggle && (
        <button
          onClick={onToggle}
          className="p-2 m-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="text-sm">{collapsed ? '\u25B6' : '\u25C0'}</span>
        </button>
      )}

      <ul className="flex-1 overflow-y-auto p-2 space-y-1" role="list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              onClick={item.onClick}
              className={`flex items-center w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                item.active
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                  : 'text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
              aria-current={item.active ? 'page' : undefined}
              aria-label={item.label}
            >
              {item.icon && <span className="flex-shrink-0 mr-3">{item.icon}</span>}
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          </li>
        ))}
      </ul>

      {footer && (
        <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700">
          {footer}
        </div>
      )}
    </nav>
  );
};
