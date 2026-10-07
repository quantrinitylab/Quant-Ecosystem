// ============================================================================
// Shared UI - Starred Items List Component
// ============================================================================

import React from 'react';
import { RecentItem } from './RecentItems';

export interface StarredItemsProps {
  items: RecentItem[];
  onSelect?: (item: RecentItem) => void;
  onUnstar?: (item: RecentItem) => void;
}

export const StarredItems: React.FC<StarredItemsProps> = ({ items, onSelect, onUnstar }) => {
  return (
    <div className="w-full" role="list" aria-label="Starred items">
      {items.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500">No starred items</div>
      ) : (
        items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
            role="listitem"
          >
            <button
              onClick={() => onSelect?.(item)}
              className="flex items-center gap-3 flex-1 min-w-0 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              aria-label={`Open ${item.title}`}
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-yellow-50 text-yellow-500 text-sm flex-shrink-0">
                &#9733;
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                <p className="text-xs text-gray-500">
                  {item.app} &middot; {item.type}
                </p>
              </div>
            </button>
            <button
              onClick={() => onUnstar?.(item)}
              className="p-1 text-yellow-400 hover:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              aria-label={`Unstar ${item.title}`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </button>
          </div>
        ))
      )}
    </div>
  );
};
