'use client';

// ============================================================================
// QuantChat - Stories Page
//
// The shell (TopBar + BottomNav) always renders so loading, empty and error
// states never strand the user without navigation. A failed fetch shows an
// inline error card with retry; a successful-but-empty feed shows an empty
// state with a create-story CTA. Story creation opens the StoryCreator
// overlay; text stories post end-to-end (type 'text' + text body persisted).
// Photo/video post for http(s) media URLs; anything else shows an honest
// "coming soon" notice because media upload has no real backend yet.
// ============================================================================
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { AppShell, TopBar, BottomNav } from '@quant/shared-ui';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useStories } from '../../hooks/useStories';
import { StoryViewer } from '../../components/StoryViewer';
import { StoryCreator } from '../../components/StoryCreator';
import { navItems, routes } from '../../lib/navigation';
import { circleVariants, staggerContainer } from '../../lib/motion-variants';

interface CreatorStory {
  type: 'photo' | 'video' | 'text';
  mediaUrl?: string;
  text?: string;
}

export default function StoriesPage() {
  const router = useRouter();
  const {
    storyGroups,
    currentStory,
    loading,
    error,
    fetchStories,
    createStory,
    nextStory,
    prevStory,
    setCurrentStoryGroup,
  } = useStories();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [creatorNotice, setCreatorNotice] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const activeGroup = storyGroups[activeGroupIndex];
  const activeStoryIndex = activeGroup?.stories.findIndex((s) => s.id === currentStory?.id) ?? 0;

  const openGroup = (idx: number, userId: string) => {
    setActiveGroupIndex(idx);
    setCurrentStoryGroup(userId);
    setViewerOpen(true);
  };

  const handlePostStory = async (story: CreatorStory) => {
    setCreatorNotice(null);
    const url = story.mediaUrl;
    // Text stories post as real TEXT rows (text body persisted by the backend);
    // no media upload involved. Photo/video still need a real upload backend,
    // so only already-hosted http(s) media can be posted today — anything else
    // gets an honest "coming soon" notice instead of a silent failure.
    const text = story.text?.trim();
    if (story.type === 'text') {
      if (!text) {
        setCreatorNotice('Type something first — a text story needs words.');
        return;
      }
      setPosting(true);
      try {
        await createStory({ type: 'text', text, duration: 5 });
        setCreatorOpen(false);
      } finally {
        setPosting(false);
      }
    } else if (url && /^https?:\/\//i.test(url)) {
      setPosting(true);
      try {
        await createStory({ type: story.type, mediaUrl: url, duration: 5 });
        setCreatorOpen(false);
      } finally {
        setPosting(false);
      }
    } else {
      setCreatorNotice(
        'Story uploads are coming soon — photo and video posting will be enabled shortly.',
      );
    }
  };

  return (
    <AppShell
      topBar={
        <TopBar
          title="Stories"
          rightActions={[
            <button
              key="create-story"
              onClick={() => {
                setCreatorNotice(null);
                setCreatorOpen(true);
              }}
              aria-label="Create story"
              className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-[var(--quant-muted)] transition-colors min-w-touch min-h-touch"
            >
              <svg
                className="w-6 h-6 text-[var(--quant-foreground)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>,
          ]}
        />
      }
    >
      <div className="flex flex-col h-full pb-16">
        {loading ? (
          <LoadingState variant="skeleton" text="Loading stories..." />
        ) : error ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <ErrorState message={error} onRetry={() => fetchStories()} />
          </div>
        ) : storyGroups.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <EmptyState
              title="No stories yet"
              description="Share a moment with friends — it disappears after 24 hours"
              actionLabel="Create story"
              onAction={() => {
                setCreatorNotice(null);
                setCreatorOpen(true);
              }}
            />
          </div>
        ) : (
          <div className="p-4">
            {/* Story circles - horizontal scroll */}
            <motion.div
              className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {storyGroups.map((group, idx) => (
                <motion.button
                  key={group.userId}
                  variants={circleVariants}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => openGroup(idx, group.userId)}
                  className="flex flex-col items-center gap-1 flex-shrink-0 min-w-touch min-h-touch"
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
                </motion.button>
              ))}
            </motion.div>

            {/* Recent stories list */}
            <motion.div
              className="mt-6 space-y-3"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              <h3 className="text-sm font-medium text-[var(--quant-muted-foreground)]">
                Recent Updates
              </h3>
              {storyGroups.map((group, idx) => (
                <motion.button
                  key={group.userId}
                  variants={circleVariants}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => openGroup(idx, group.userId)}
                  className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-[var(--quant-muted)] transition-colors min-h-touch"
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
                </motion.button>
              ))}
            </motion.div>
          </div>
        )}
      </div>

      <BottomNav
        items={navItems}
        activeId="stories"
        onChange={(id: string) => {
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

      {/* Story Creator Overlay */}
      {creatorOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Create story"
        >
          <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--quant-background)]">
            <button
              onClick={() => setCreatorOpen(false)}
              aria-label="Close story creator"
              className="absolute top-2 right-2 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-black/40 text-white hover:bg-black/60 min-w-touch min-h-touch"
            >
              ✕
            </button>
            {creatorNotice && (
              <div
                role="status"
                className="m-4 mb-0 p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-sm text-amber-200"
              >
                {creatorNotice}
              </div>
            )}
            {posting && (
              <div className="m-4 mb-0 p-3 rounded-xl text-sm text-[var(--quant-muted-foreground)]">
                Posting your story…
              </div>
            )}
            <StoryCreator onPost={handlePostStory} onClose={() => setCreatorOpen(false)} />
          </div>
        </div>
      )}
    </AppShell>
  );
}
