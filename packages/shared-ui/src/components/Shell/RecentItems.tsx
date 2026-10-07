// ============================================================================
// Shared UI - Recent Items List Component
// ============================================================================

import React from 'react';

export interface RecentItem {
  id: string;
  title: string;
  type: string;
  app: string;
  timestamp: string;
  href: string;
}

export interface RecentItemsProps {
  items: RecentItem[];
  onSelect?: (item: RecentItem) => void;
}

export const RecentItems: React.FC<RecentItemsProps> = ({ items, onSelect }) => {
  return (
    <div className="w-full" role="list" aria-label="Recent items">
      {items.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500">No recent items</div>
      ) : (
        items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect?.(item)}
            className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset border-b border-gray-100 last:border-b-0"
            role="listitem"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-gray-500 text-xs font-medium flex-shrink-0">
              {item.type.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
              <p className="text-xs text-gray-500">
                {item.app} &middot; {item.timestamp}
              </p>
            </div>
          </button>
        ))
      )}
    </div>
  );
};
