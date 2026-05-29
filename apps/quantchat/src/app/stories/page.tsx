'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, TopBar, BottomNav } from '@quant/shared-ui';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useStories } from '../../hooks/useStories';
import { StoryViewer } from '../../components/StoryViewer';
import { navItems, routes } from '../../lib/navigation';

export default function StoriesPage() {
  const router = useRouter();
  const { storyGroups, currentStory, loading, error, nextStory, prevStory, setCurrentStoryGroup } =
    useStories();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);

  if (loading) return <LoadingState variant="skeleton" text="Loading stories..." />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  const activeGroup = storyGroups[activeGroupIndex];
  const activeStoryIndex = activeGroup?.stories.findIndex((s) => s.id === currentStory?.id) ?? 0;

  return (
    <AppShell topBar={<TopBar title="Stories" />}>
      <div className="flex flex-col h-full pb-16">
        {storyGroups.length === 0 ? (
          <EmptyState title="No stories" description="Stories from friends will appear here" />
        ) : (
          <div className="p-4">
            {/* Story circles - horizontal scroll */}
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
              {storyGroups.map((group, idx) => (
                <button
                  key={group.userId}
                  onClick={() => {
                    setActiveGroupIndex(idx);
                    setCurrentStoryGroup(group.userId);
                    setViewerOpen(true);
                  }}
                  className="flex flex-col items-center gap-1 flex-shrink-0"
                >
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center ${
                      group.hasUnviewed
                        ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-[var(--quant-background)]'
                        : 'ring-2 ring-gray-300 dark:ring-gray-600 ring-offset-2 ring-offset-[var(--quant-background)]'
                    }`}
                  >
                    {group.userAvatar ? (
                      <img
                        src={group.userAvatar}
                        alt={group.userName}
                        className="w-14 h-14 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center text-white font-bold">
                        {group.userName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-[var(--quant-foreground)] truncate max-w-[64px]">
                    {group.userName}
                  </span>
                </button>
              ))}
            </div>

            {/* Recent stories list */}
            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-medium text-[var(--quant-muted-foreground)]">
                Recent Updates
              </h3>
              {storyGroups.map((group, idx) => (
                <button
                  key={group.userId}
                  onClick={() => {
                    setActiveGroupIndex(idx);
                    setCurrentStoryGroup(group.userId);
                    setViewerOpen(true);
                  }}
                  className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-[var(--quant-muted)] transition-colors"
                >
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      group.hasUnviewed
                        ? 'ring-2 ring-emerald-500'
                        : 'ring-2 ring-gray-300 dark:ring-gray-600'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center text-white text-sm font-bold">
                      {group.userName.charAt(0).toUpperCase()}
                    </div>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-[var(--quant-foreground)]">
                      {group.userName}
                    </p>
                    <p className="text-xs text-[var(--quant-muted-foreground)]">
                      {group.stories.length} {group.stories.length === 1 ? 'story' : 'stories'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <BottomNav
        items={navItems}
        activeId="stories"
        onChange={(id) => {
          const route = routes[id];
          if (route) router.push(route);
        }}
      />

      {/* Story Viewer Overlay */}
      {activeGroup && (
        <StoryViewer
          stories={activeGroup.stories}
          currentIndex={activeStoryIndex >= 0 ? activeStoryIndex : 0}
          isOpen={viewerOpen}
          onClose={() => setViewerOpen(false)}
          onNext={nextStory}
          onPrev={prevStory}
        />
      )}
    </AppShell>
  );
}
