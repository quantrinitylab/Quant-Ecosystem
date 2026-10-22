'use client';

// ============================================================================
// QuantChat - Single story page (QC-F-556)
// ============================================================================
//
// The gated target of story share cards and shareable links. The story is
// fetched through GET /stories/:storyId, which re-runs the story's
// audience gate for THIS viewer: a story that is missing, expired, or
// not shared with the viewer answers 404 and this page shows one honest
// "isn't available" state for all three (which one it was is not leaked
// to us either). Holding a link or a card grants nothing by itself.
//
// When the story does resolve, opening it marks the view through the
// real /view flow — the gated GET itself is side-effect free and never
// counts a view.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStories } from '../../../hooks/useStories';
import { StoryViewer } from '../../../components/StoryViewer';
import { StoryShareSheet } from '../../../components/StoryShareSheet';

type HookStory = NonNullable<
  Awaited<ReturnType<ReturnType<typeof useStories>['fetchStoryById']>>
>;

export default function StoryByIdPage() {
  const params = useParams();
  const router = useRouter();
  const storyId = typeof params?.storyId === 'string' ? params.storyId : '';
  const { fetchStoryById, viewStory, shareStory } = useStories();
  const [story, setStory] = useState<HookStory | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const viewMarkedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!storyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetchStoryById(storyId).then((fetched) => {
      if (cancelled) return;
      setStory(fetched);
      setLoading(false);
      if (fetched && !fetched.isViewed && viewMarkedRef.current !== fetched.id) {
        viewMarkedRef.current = fetched.id;
        void viewStory(fetched.id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storyId, fetchStoryById, viewStory]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <p className="text-white/70 text-sm">Loading story…</p>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-white text-lg font-medium">This story isn't available</p>
          <p className="mt-2 text-white/60 text-sm">
            It may have expired, or it isn't shared with you. Opening a link or a card
            never grants access by itself — stories stay visible only to their audience.
          </p>
          <button
            type="button"
            onClick={() => router.push('/stories')}
            className="mt-6 px-5 py-2.5 rounded-full bg-emerald-500 text-white text-sm font-semibold min-h-touch"
          >
            Back to stories
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <StoryViewer
        stories={[story]}
        currentIndex={0}
        isOpen={true}
        onClose={() => router.push('/stories')}
        onNext={() => router.push('/stories')}
        onPrev={() => router.push('/stories')}
        autoAdvance={false}
        onShare={() => setShareOpen(true)}
      />
      <StoryShareSheet
        storyId={story.id}
        authorName={story.authorName}
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        onShare={(conversationId) => shareStory(story.id, conversationId)}
      />
    </>
  );
}
