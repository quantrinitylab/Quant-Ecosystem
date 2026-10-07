// ============================================================================
// Shared UI - Story Ring Component
// ============================================================================

import React from 'react';

export interface StoryRingProps {
  stories: StoryItem[];
  onStoryClick: (userId: string) => void;
  onAddStory?: () => void;
  className?: string;
}

export interface StoryItem {
  userId: string;
  name: string;
  avatarUrl?: string;
  hasUnread: boolean;
  isLive?: boolean;
}

export const StoryRing: React.FC<StoryRingProps> = ({
  stories,
  onStoryClick,
  onAddStory,
  className = '',
}) => {
  return (
    <div className={`flex gap-4 overflow-x-auto py-3 px-4 scrollbar-hide ${className}`}>
      {/* Add Story button */}
      {onAddStory && (
        <button onClick={onAddStory} className="flex flex-col items-center gap-1 flex-shrink-0">
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center hover:border-blue-500 transition-colors">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <span className="text-xs text-gray-500">Your Story</span>
        </button>
      )}

      {/* Story items */}
      {stories.map((story) => (
        <button
          key={story.userId}
          onClick={() => onStoryClick(story.userId)}
          className="flex flex-col items-center gap-1 flex-shrink-0"
        >
          <div className={`w-16 h-16 rounded-full p-[3px] ${story.hasUnread
            ? 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600'
            : 'bg-gray-300'
          } ${story.isLive ? 'ring-2 ring-red-500 ring-offset-2' : ''}`}>
            <div className="w-full h-full rounded-full bg-white p-[2px]">
              <div className="w-full h-full rounded-full bg-gray-200 overflow-hidden">
                {story.avatarUrl ? (
                  <img src={story.avatarUrl} alt={story.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-medium text-gray-500">
                    {story.name[0]}
                  </div>
                )}
              </div>
            </div>
          </div>
          <span className="text-xs text-gray-700 truncate max-w-[64px]">
            {story.isLive && <span className="text-red-500 font-bold">LIVE </span>}
            {story.name.split(' ')[0]}
          </span>
        </button>
      ))}
    </div>
  );
};
