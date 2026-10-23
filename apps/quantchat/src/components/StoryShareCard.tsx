'use client';

// ============================================================================
// QuantChat - StoryShareCard (QC-F-556)
// ============================================================================
//
// Renders a story-share reference card inside a conversation. The card
// shows ONLY what the server snapshot carries — author identity, story
// type and the remaining lifetime — never story content: the content
// stays behind the audience gate and is fetched (gated) only when the
// card is opened. An expired card is honest about it and does not
// navigate; a live card navigates to the gated /stories/[storyId] page,
// which itself answers "isn't available" when the opener may not view
// the story — holding this card grants nothing.
// ============================================================================

import { useRouter } from 'next/navigation';
import { isStoryShareExpired, type StoryShareSnapshot } from '../lib/story-share';

const TYPE_LABEL: Record<StoryShareSnapshot['storyType'], string> = {
  photo: 'Photo story',
  video: 'Video story',
  text: 'Text story',
};

export function StoryShareCard({ share }: { share: StoryShareSnapshot }) {
  const router = useRouter();
  const expired = isStoryShareExpired(share);

  return (
    <button
      type="button"
      disabled={expired}
      onClick={() => router.push(`/stories/${share.storyId}`)}
      className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] text-left transition-all enabled:active:scale-95 disabled:opacity-60 max-w-[260px]"
      aria-label={
        expired
          ? `Story by ${share.authorName} (expired)`
          : `Open story by ${share.authorName}`
      }
      data-testid="story-share-card"
    >
      {share.authorAvatar ? (
        <img
          src={share.authorAvatar}
          alt=""
          className="w-10 h-10 rounded-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
          {share.authorName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-semibold text-[var(--quant-foreground)] truncate">
          {share.authorName}
        </span>
        <span className="text-[11px] text-[var(--quant-muted-foreground)]">
          {TYPE_LABEL[share.storyType]}
          {share.audience === 'CLOSE_FRIENDS' ? ' · Close friends' : ''}
        </span>
        <span className="text-[11px] text-[var(--quant-muted-foreground)]">
          {expired
            ? 'This story has expired'
            : `Expires ${new Date(share.expiresAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}`}
        </span>
      </div>
    </button>
  );
}

export default StoryShareCard;
