'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { Avatar, Button, Input } from '@quant/shared-ui';

interface Comment {
  id: string;
  author: string;
  avatarUrl?: string;
  text: string;
  timestamp: string;
  replies?: Comment[];
}

interface CommentsPanelProps {
  comments?: Comment[];
  onAddComment?: (text: string) => void;
  onReply?: (commentId: string, text: string) => void;
}

export function CommentsPanel({ comments = [], onAddComment, onReply }: CommentsPanelProps) {
  const [newComment, setNewComment] = useState('');

  const handleSubmit = () => {
    if (newComment.trim() && onAddComment) {
      onAddComment(newComment.trim());
      setNewComment('');
    }
  };

  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: 'spring', ...spring.gentle }}
      className="w-72 lg:w-80 border-l border-[var(--quant-border)] flex flex-col h-full bg-[var(--quant-background)]"
      aria-label="Comments panel"
    >
      <div className="p-3 border-b border-[var(--quant-border)]">
        <h2 className="text-sm font-semibold">Comments</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm text-[var(--quant-muted-foreground)] text-center py-8">
            No comments yet
          </p>
        ) : (
          <AnimatePresence>
            {comments.map((comment, index) => (
              <motion.div
                key={comment.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', ...spring.gentle, delay: index * 0.04 }}
              >
                <CommentItem comment={comment} onReply={onReply} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <div className="p-3 border-t border-[var(--quant-border)]">
        <div className="flex gap-2">
          <Input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            aria-label="Add a comment"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!newComment.trim()}
            className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
          >
            Post
          </Button>
        </div>
      </div>
    </motion.aside>
  );
}

function CommentItem({
  comment,
  onReply,
}: {
  comment: Comment;
  onReply?: (commentId: string, text: string) => void;
}) {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState('');

  const handleReply = () => {
    if (replyText.trim() && onReply) {
      onReply(comment.id, replyText.trim());
      setReplyText('');
      setShowReplyInput(false);
    }
  };

  return (
    <article className="space-y-2">
      <div className="flex items-start gap-2">
        <Avatar src={comment.avatarUrl} name={comment.author} size="xs" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium truncate">{comment.author}</span>
            <time className="text-xs text-[var(--quant-muted-foreground)]">
              {new Date(comment.timestamp).toLocaleDateString()}
            </time>
          </div>
          <p className="text-sm mt-0.5">{comment.text}</p>
          <button
            onClick={() => setShowReplyInput(!showReplyInput)}
            className="min-h-[44px] text-xs text-[var(--brand-app-color)] hover:underline mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] rounded"
            aria-label={`Reply to ${comment.author}`}
          >
            Reply
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showReplyInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', ...spring.snappy }}
            className="ml-8 flex gap-2 overflow-hidden"
          >
            <Input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply..."
              aria-label="Write a reply"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReply}
              disabled={!replyText.trim()}
              className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
            >
              Send
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-8 space-y-2">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} onReply={onReply} />
          ))}
        </div>
      )}
    </article>
  );
}
