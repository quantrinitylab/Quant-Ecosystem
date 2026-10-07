// ============================================================================
// QuantNeon - Stories Viewer
// ============================================================================

import React, { useState, useCallback } from 'react';
import { LoadingState, ErrorState, EmptyState, PageTransition } from '@quant/shared-ui';
import { useStories } from '../hooks/useStories';

const StoriesPage: React.FC = () => {
  const { data, isLoading, error, refetch } = useStories();
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);

  if (isLoading) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-black dark:bg-[#0F0F14] flex items-center justify-center">
          <LoadingState variant="spinner" text="Loading stories..." />
        </div>
      </PageTransition>
    );
  }
  if (error) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-black dark:bg-[#0F0F14] flex items-center justify-center">
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        </div>
      </PageTransition>
    );
  }

  const stories: {
    id: string;
    username?: string;
    avatar?: string;
    mediaUrl?: string;
    createdAt?: string;
  }[] = (data ?? []) as any[];

  if (stories.length === 0) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-black dark:bg-[#0F0F14] flex items-center justify-center">
          <EmptyState
            title="No stories"
            description="Stories from people you follow will appear here"
          />
        </div>
      </PageTransition>
    );
  }

  const currentStory = stories[currentStoryIndex];

  const handleNext = useCallback(() => {
    setCurrentStoryIndex((prev) => Math.min(prev + 1, stories.length - 1));
  }, [stories.length]);

  const handlePrevious = useCallback(() => {
    setCurrentStoryIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  return (
    <PageTransition>
      <div
        className="h-[100dvh] bg-black dark:bg-[#0F0F14] text-white relative"
        onClick={handleNext}
      >
        {/* Progress Bar */}
        <div className="absolute top-2 left-2 right-2 z-10 flex gap-1">
          {stories.map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-0.5 rounded-full ${i < currentStoryIndex ? 'bg-white' : i === currentStoryIndex ? 'bg-white/80' : 'bg-white/30'}`}
            />
          ))}
        </div>
        {/* Header */}
        <div className="absolute top-6 left-4 z-10 flex items-center gap-2">
          <img
            className="w-8 h-8 rounded-full object-cover"
            src={currentStory?.avatar}
            alt={currentStory?.username}
          />
          <span className="text-sm font-semibold">{currentStory?.username}</span>
        </div>
        {/* Content */}
        <div className="absolute inset-0 flex items-center justify-center">
          {currentStory?.mediaUrl && (
            <img className="w-full h-full object-cover" src={currentStory.mediaUrl} alt="Story" />
          )}
        </div>
        {/* Navigation zones */}
        <div className="absolute inset-0 flex">
          <div
            className="w-1/3 h-full"
            onClick={(e) => {
              e.stopPropagation();
              handlePrevious();
            }}
          />
          <div className="w-2/3 h-full" />
        </div>
      </div>
    </PageTransition>
  );
};

export default StoriesPage;
