'use client';

// ============================================================================
// Shared UI - Cross-App Relations Panel Component
// ============================================================================

import React, { useState } from 'react';

export interface RelatedItem {
  id: string;
  title: string;
  description?: string;
  app: string;
  type: string;
  url?: string;
  timestamp?: number;
}

export interface CrossAppRelationsProps {
  contextTitle: string;
  contextType: string;
  relatedItems: RelatedItem[];
  isOpen: boolean;
  onClose: () => void;
  onItemClick?: (item: RelatedItem) => void;
  loading?: boolean;
}

const appIcons: Record<string, string> = {
  mail: '\u2709\uFE0F',
  calendar: '\uD83D\uDCC5',
  drive: '\uD83D\uDCC1',
  chat: '\uD83D\uDCAC',
  contacts: '\uD83D\uDC64',
  docs: '\uD83D\uDCDD',
};

export const CrossAppRelations: React.FC<CrossAppRelationsProps> = ({
  contextTitle,
  contextType,
  relatedItems,
  isOpen,
  onClose,
  onItemClick,
  loading = false,
}) => {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  // Group items by app
  const grouped = relatedItems.reduce<Record<string, RelatedItem[]>>((acc, item) => {
    if (!acc[item.app]) {
      acc[item.app] = [];
    }
    acc[item.app]!.push(item);
    return acc;
  }, {});

  const toggleSection = (app: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(app)) {
        next.delete(app);
      } else {
        next.add(app);
      }
      return next;
    });
  };

  const formatTimestamp = (ts?: number): string => {
    if (!ts) return '';
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div
      className="fixed top-0 right-0 bottom-0 w-80 sm:w-96 bg-white dark:bg-gray-900 border-l border-[var(--quant-border,#e5e7eb)] shadow-xl z-40 flex flex-col"
      role="complementary"
      aria-label="Related items panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--quant-border,#e5e7eb)]">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            Related Items
          </h2>
          <p className="text-xs text-[var(--quant-text-secondary,#6b7280)] truncate">
            {contextType}: {contextTitle}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Close related items panel"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center">
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mx-auto" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mx-auto" />
            </div>
            <p className="text-sm text-[var(--quant-text-secondary,#6b7280)] mt-3">
              Finding related items...
            </p>
          </div>
        ) : relatedItems.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-[var(--quant-text-secondary,#6b7280)]">
              No related items found.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--quant-border,#e5e7eb)]">
            {Object.entries(grouped).map(([app, items]) => (
              <div key={app}>
                <button
                  onClick={() => toggleSection(app)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--quant-surface-hover,#f9fafb)] dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                  aria-expanded={!collapsedSections.has(app)}
                  aria-label={`${app} section, ${items.length} items`}
                >
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true">{appIcons[app.toLowerCase()] || '\uD83D\uDCE6'}</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">
                      {app}
                    </span>
                    <span className="text-xs text-[var(--quant-text-secondary,#6b7280)] bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                      {items.length}
                    </span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${collapsedSections.has(app) ? '' : 'rotate-180'}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {!collapsedSections.has(app) && (
                  <div role="list" aria-label={`${app} related items`}>
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="px-4 py-2 pl-10 hover:bg-[var(--quant-surface-hover,#f9fafb)] dark:hover:bg-gray-800 cursor-pointer"
                        role="listitem"
                        onClick={() => onItemClick?.(item)}
                      >
                        <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-[var(--quant-text-secondary,#6b7280)]">
                            {item.type}
                          </span>
                          {item.timestamp && (
                            <span className="text-xs text-[var(--quant-text-secondary,#6b7280)]">
                              {formatTimestamp(item.timestamp)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
