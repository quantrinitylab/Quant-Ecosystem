// ============================================================================
// QuantChat - Comment Bottom Sheet (Task 3.7)
// Framer Motion slide-up sheet for comments on a reel
// ============================================================================
'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CommentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  reelId: string;
  commentCount: number;
  onAddComment: (reelId: string, text: string) => void;
}

const BRAND_SPRINGS = {
  snappy: { type: 'spring' as const, stiffness: 400, damping: 30 },
};

export function CommentSheet({
  isOpen,
  onClose,
  reelId,
  commentCount,
  onAddComment,
}: CommentSheetProps) {
  const [commentText, setCommentText] = useState('');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (commentText.trim()) {
        onAddComment(reelId, commentText.trim());
        setCommentText('');
      }
    },
    [commentText, reelId, onAddComment],
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[70vh] flex-col rounded-t-2xl bg-gray-900"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={BRAND_SPRINGS.snappy}
          >
            {/* Handle */}
            <div className="flex justify-center py-3">
              <div className="h-1 w-10 rounded-full bg-gray-600" />
            </div>

            {/* Header */}
            <div className="border-b border-gray-700 px-4 pb-3">
              <h3 className="text-center text-sm font-semibold text-white">
                {commentCount} Comments
              </h3>
            </div>

            {/* Comments list (placeholder for loaded comments) */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="flex flex-col gap-4">
                {/* Placeholder comments */}
                {Array.from({ length: Math.min(commentCount, 5) }, (_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-8 w-8 rounded-full bg-gray-700" />
                    <div className="flex flex-1 flex-col gap-1">
                      <span className="text-xs font-semibold text-gray-300">user_{i + 1}</span>
                      <p className="text-sm text-gray-400">This is amazing! Great content</p>
                      <span className="text-xs text-gray-500">2h ago</span>
                    </div>
                  </div>
                ))}
                {commentCount === 0 && (
                  <p className="text-center text-sm text-gray-500">
                    No comments yet. Be the first!
                  </p>
                )}
              </div>
            </div>

            {/* Comment input */}
            <form onSubmit={handleSubmit} className="border-t border-gray-700 p-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500" />
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 rounded-full bg-gray-800 px-4 py-2 text-sm text-white placeholder-gray-500 outline-none focus:ring-1 focus:ring-purple-500"
                />
                <button
                  type="submit"
                  disabled={!commentText.trim()}
                  className="text-sm font-semibold text-purple-400 disabled:text-gray-600"
                >
                  Post
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default CommentSheet;
