'use client';

export interface FeedPost {
  id: string;
  title: string;
  excerpt: string;
  sourceUrl: string | null;
  sourceName: string | null;
  imageUrl: string | null;
  emoji: string | null;
  provenance: string;
  createdAt: string;
  likeCount: number;
  dislikeCount: number;
  myReaction: 'like' | 'dislike' | null;
}

interface FeedPostCardProps {
  post: FeedPost;
  onReact: (postId: string, kind: 'like' | 'dislike') => void;
  onDiscuss: (postId: string) => void;
  reacting: boolean;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Single feed post card — Muse S5/S9 parity.
 * Provenance is always shown honestly: "Quanty brief" for AI-generated posts,
 * the real outlet name for external posts (which always carry a real URL).
 */
export default function FeedPostCard({ post, onReact, onDiscuss, reacting }: FeedPostCardProps) {
  const isBrief = post.provenance === 'agent_brief';

  return (
    <article className="border-b border-zinc-800/60 px-2 py-5">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-2xl">
          {post.emoji || '📰'}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-semibold leading-snug text-white">{post.title}</h3>

          {/* Provenance label — never hidden, never faked. */}
          <p className="mt-1 text-xs text-white/40">
            {isBrief ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 font-medium text-purple-300">
                ✦ Quanty brief · AI-generated
              </span>
            ) : (
              <span>
                {post.sourceUrl ? (
                  <a
                    href={post.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-400 underline"
                  >
                    {post.sourceName || 'External source'}
                  </a>
                ) : (
                  <span className="font-medium text-white/60">{post.sourceName || 'External source'}</span>
                )}
              </span>
            )}
            <span className="ml-2">{timeAgo(post.createdAt)}</span>
          </p>

          <p className="mt-2 text-[15px] leading-relaxed text-white/70">{post.excerpt}</p>

          {post.imageUrl && (
            <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.imageUrl} alt="" className="max-h-64 w-full object-cover" loading="lazy" />
            </div>
          )}

          <div className="mt-3 flex items-center gap-1">
            <button
              onClick={() => onReact(post.id, 'like')}
              disabled={reacting}
              aria-label="Like"
              aria-pressed={post.myReaction === 'like'}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
                post.myReaction === 'like'
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-white/50 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <span>👍</span>
              {post.likeCount > 0 && <span className="text-xs">{post.likeCount}</span>}
            </button>
            <button
              onClick={() => onReact(post.id, 'dislike')}
              disabled={reacting}
              aria-label="Dislike"
              aria-pressed={post.myReaction === 'dislike'}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
                post.myReaction === 'dislike'
                  ? 'bg-red-600/20 text-red-400'
                  : 'text-white/50 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <span>👎</span>
              {post.dislikeCount > 0 && <span className="text-xs">{post.dislikeCount}</span>}
            </button>
            <button
              onClick={() => onDiscuss(post.id)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-white/50 transition hover:bg-zinc-800 hover:text-white"
            >
              <span>💬</span>
              <span>Discuss</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
