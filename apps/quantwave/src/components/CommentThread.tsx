'use client';

// ============================================================================
// QuantSync - CommentThread Component
// Nested comment tree with collapse/expand, vote buttons, reply, mod actions
// ============================================================================

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  isVerified: boolean;
  content: string;
  likes: number;
  dislikes: number;
  replyCount: number;
  isLiked: boolean;
  isDisliked: boolean;
  createdAt: string;
  children: Comment[];
  depth: number;
  isOP: boolean;
  isMod: boolean;
}

interface CommentThreadProps {
  comments: Comment[];
  maxDepth?: number;
  onLike?: (commentId: string) => void;
  onDislike?: (commentId: string) => void;
  onReply?: (commentId: string, content: string) => void;
  onReport?: (commentId: string) => void;
  onRemove?: (commentId: string) => void;
  isModerator?: boolean;
  postAuthorId?: string;
}

interface CommentNodeProps {
  comment: Comment;
  maxDepth: number;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  onReply: (id: string, content: string) => void;
  onReport: (id: string) => void;
  onRemove: (id: string) => void;
  isModerator: boolean;
  index: number;
}

const CommentNode: React.FC<CommentNodeProps> = ({
  comment,
  maxDepth,
  onLike,
  onDislike,
  onReply,
  onReport,
  onRemove,
  isModerator,
  index,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [showReply, setShowReply] = useState<boolean>(false);
  const [replyContent, setReplyContent] = useState<string>('');
  const [localLiked, setLocalLiked] = useState<boolean>(comment.isLiked);
  const [localDisliked, setLocalDisliked] = useState<boolean>(comment.isDisliked);
  const [localLikes, setLocalLikes] = useState<number>(comment.likes);
  const [localDislikes, setLocalDislikes] = useState<number>(comment.dislikes);
  const [showMore, setShowMore] = useState<boolean>(false);
  const [replying, setReplying] = useState<boolean>(false);

  const handleLike = useCallback(() => {
    if (localLiked) {
      setLocalLiked(false);
      setLocalLikes(localLikes - 1);
    } else {
      setLocalLiked(true);
      setLocalLikes(localLikes + 1);
      if (localDisliked) {
        setLocalDisliked(false);
        setLocalDislikes(localDislikes - 1);
      }
    }
    onLike(comment.id);
  }, [localLiked, localDisliked, localLikes, localDislikes, comment.id, onLike]);

  const handleDislike = useCallback(() => {
    if (localDisliked) {
      setLocalDisliked(false);
      setLocalDislikes(localDislikes - 1);
    } else {
      setLocalDisliked(true);
      setLocalDislikes(localDislikes + 1);
      if (localLiked) {
        setLocalLiked(false);
        setLocalLikes(localLikes - 1);
      }
    }
    onDislike(comment.id);
  }, [localLiked, localDisliked, localLikes, localDislikes, comment.id, onDislike]);

  const handleSubmitReply = useCallback(async () => {
    if (!replyContent.trim()) return;
    setReplying(true);
    await onReply(comment.id, replyContent);
    setReplyContent('');
    setShowReply(false);
    setReplying(false);
  }, [replyContent, comment.id, onReply]);

  const formatTime = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  const score = localLikes - localDislikes;
  const indentClass =
    comment.depth > 0
      ? 'ml-4 sm:ml-6 border-l-2 border-gray-100 dark:border-gray-700 pl-3 sm:pl-4'
      : '';
  const depthExceeded = comment.depth >= maxDepth;

  return (
    <motion.div
      className={indentClass}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
    >
      <div className="py-2">
        {isCollapsed ? (
          <button
            onClick={() => setIsCollapsed(false)}
            className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 py-1 min-h-[44px]"
          >
            <span className="text-xs">[+]</span>
            <img src={comment.authorAvatar} alt="" className="w-5 h-5 rounded-full opacity-50" />
            <span className="text-xs">
              {comment.authorName} &middot; {formatTime(comment.createdAt)} &middot;{' '}
              {comment.children.length} replies
            </span>
          </button>
        ) : (
          <>
            <div className="flex gap-2">
              <div className="flex flex-col items-center gap-0.5">
                <button
                  onClick={handleLike}
                  className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-xs ${localLiked ? 'text-orange-500' : 'text-gray-400 dark:text-gray-500'}`}
                >
                  &#9650;
                </button>
                <span
                  className={`text-xs font-medium ${score > 0 ? 'text-orange-500' : score < 0 ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'}`}
                >
                  {score}
                </span>
                <button
                  onClick={handleDislike}
                  className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-xs ${localDisliked ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`}
                >
                  &#9660;
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <img src={comment.authorAvatar} alt="" className="w-5 h-5 rounded-full" />
                  <span className="font-medium text-xs text-gray-900 dark:text-gray-100">
                    {comment.authorName}
                  </span>
                  {comment.isVerified && <span className="text-blue-500 text-xs">&#x2713;</span>}
                  {comment.isOP && (
                    <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs px-1 rounded">
                      OP
                    </span>
                  )}
                  {comment.isMod && (
                    <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs px-1 rounded">
                      MOD
                    </span>
                  )}
                  <span className="text-gray-400 dark:text-gray-500 text-xs">
                    &middot; {formatTime(comment.createdAt)}
                  </span>
                  {comment.children.length > 0 && (
                    <button
                      onClick={() => setIsCollapsed(true)}
                      className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs ml-1"
                    >
                      [-]
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-900 dark:text-gray-100 mt-1 whitespace-pre-wrap">
                  {comment.content}
                </p>
                <div className="flex items-center gap-3 mt-1.5">
                  <button
                    onClick={() => setShowReply(!showReply)}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-500 font-medium min-h-[44px] flex items-center"
                  >
                    Reply
                  </button>
                  <button
                    onClick={() => setShowMore(!showMore)}
                    className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 min-h-[44px] flex items-center"
                  >
                    &#x22EF;
                  </button>
                  {showMore && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => onReport(comment.id)}
                        className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-500"
                      >
                        Report
                      </button>
                      {isModerator && (
                        <button
                          onClick={() => onRemove(comment.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {showReply && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="Write a reply..."
                      className="flex-1 border dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      onKeyDown={(e) => e.key === 'Enter' && handleSubmitReply()}
                    />
                    <button
                      onClick={handleSubmitReply}
                      disabled={replying || !replyContent.trim()}
                      className="px-3 py-1.5 min-h-[44px] bg-blue-500 text-white rounded-lg text-xs disabled:opacity-50"
                    >
                      {replying ? '...' : 'Reply'}
                    </button>
                  </div>
                )}
              </div>
            </div>
            {!depthExceeded && comment.children.length > 0 && (
              <div className="mt-1">
                {comment.children.map((child, childIdx) => (
                  <CommentNode
                    key={child.id}
                    comment={child}
                    maxDepth={maxDepth}
                    onLike={onLike}
                    onDislike={onDislike}
                    onReply={onReply}
                    onReport={onReport}
                    onRemove={onRemove}
                    isModerator={isModerator}
                    index={childIdx}
                  />
                ))}
              </div>
            )}
            {depthExceeded && comment.children.length > 0 && (
              <button className="ml-8 mt-1 text-xs text-blue-500 hover:underline min-h-[44px]">
                Continue this thread ({comment.children.length} more replies)
              </button>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
};

const CommentThread: React.FC<CommentThreadProps> = ({
  comments,
  maxDepth = 5,
  onLike,
  onDislike,
  onReply,
  onReport,
  onRemove,
  isModerator = false,
}) => {
  const handleLike = useCallback(
    (id: string) => {
      onLike?.(id);
    },
    [onLike],
  );
  const handleDislike = useCallback(
    (id: string) => {
      onDislike?.(id);
    },
    [onDislike],
  );
  const handleReply = useCallback(
    async (id: string, content: string) => {
      onReply?.(id, content);
    },
    [onReply],
  );
  const handleReport = useCallback(
    (id: string) => {
      onReport?.(id);
    },
    [onReport],
  );
  const handleRemove = useCallback(
    (id: string) => {
      onRemove?.(id);
    },
    [onRemove],
  );

  if (comments.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-3xl mb-2">&#x1F4AC;</div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No comments yet. Be the first to reply!
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      {comments.map((comment, idx) => (
        <CommentNode
          key={comment.id}
          comment={comment}
          maxDepth={maxDepth}
          onLike={handleLike}
          onDislike={handleDislike}
          onReply={handleReply}
          onReport={handleReport}
          onRemove={handleRemove}
          isModerator={isModerator}
          index={idx}
        />
      ))}
    </div>
  );
};

export default CommentThread;
