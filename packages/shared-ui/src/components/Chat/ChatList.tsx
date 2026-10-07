// ============================================================================
// Shared UI - Chat List Component
// ============================================================================

import React from 'react';

export interface ChatListItem {
  id: string;
  name: string;
  avatarUrl?: string;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
  isOnline?: boolean;
  isMuted?: boolean;
  isPinned?: boolean;
  isTyping?: boolean;
}

export interface ChatListProps {
  items: ChatListItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onLongPress?: (id: string) => void;
  emptyMessage?: string;
  className?: string;
}

export const ChatList: React.FC<ChatListProps> = ({
  items,
  selectedId,
  onSelect,
  emptyMessage = 'No conversations yet',
  className = '',
}) => {
  if (items.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 text-gray-400 ${className}`}>
        <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  // Sort: pinned first, then by timestamp
  const sorted = [...items].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  return (
    <div className={`divide-y divide-gray-100 ${className}`} role="list">
      {sorted.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left ${selectedId === item.id ? 'bg-blue-50' : ''}`}
          role="listitem"
        >
          <div className="relative flex-shrink-0">
            <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center overflow-hidden">
              {item.avatarUrl ? (
                <img src={item.avatarUrl} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-medium text-gray-600">
                  {item.name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            {item.isOnline && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 truncate">
                {item.isPinned && <span className="mr-1">\uD83D\uDCCC</span>}
                {item.name}
              </h3>
              <span className="text-xs text-gray-400 flex-shrink-0">{item.timestamp}</span>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <p className={`text-sm truncate ${item.unreadCount > 0 ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                {item.isTyping ? (
                  <span className="text-blue-500 italic">typing...</span>
                ) : (
                  item.lastMessage
                )}
              </p>
              {item.unreadCount > 0 && (
                <span className="flex-shrink-0 ml-2 bg-blue-600 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                </span>
              )}
              {item.isMuted && item.unreadCount === 0 && (
                <span className="text-gray-400 ml-2 flex-shrink-0">\uD83D\uDD07</span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};
