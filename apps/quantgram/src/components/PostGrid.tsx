// ============================================================================
// QuantNeon - PostGrid Component (Instagram-style photo grid)
// ============================================================================

import { motion } from 'framer-motion';
import type { Post } from '../types';

interface PostGridProps {
  posts: Post[];
  onPostClick?: (id: string) => void;
}

export function PostGrid({ posts, onPostClick }: PostGridProps) {
  return (
    <div className={`grid gap-0.5 grid-cols-2 sm:grid-cols-3`} role="grid" aria-label="Photo grid">
      {posts.map((post, index) => (
        <motion.button
          type="button"
          key={post.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.05, duration: 0.3 }}
          className="relative aspect-square overflow-hidden bg-gray-900 dark:bg-gray-800 group hover:scale-[1.02] transition-transform"
          onClick={() => onPostClick?.(post.id)}
          aria-label={`${post.type} post, ${post.likes} likes, ${post.commentCount} comments`}
        >
          <img
            src={post.media[0]?.url || ''}
            alt={post.caption.substring(0, 50)}
            loading="lazy"
            className="w-full h-full object-cover"
          />
          {/* Type indicators */}
          {post.type === 'carousel' && (
            <span className="absolute top-2 right-2 text-white drop-shadow-lg text-sm">📷</span>
          )}
          {post.type === 'video' && (
            <span className="absolute top-2 right-2 text-white drop-shadow-lg text-sm">▶</span>
          )}
          {/* Hover overlay with stats */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
            <span className="text-white text-sm font-bold flex items-center gap-1">
              ♥ {post.likes}
            </span>
            <span className="text-white text-sm font-bold flex items-center gap-1">
              💬 {post.commentCount}
            </span>
          </div>
        </motion.button>
      ))}
    </div>
  );
}

export default PostGrid;
