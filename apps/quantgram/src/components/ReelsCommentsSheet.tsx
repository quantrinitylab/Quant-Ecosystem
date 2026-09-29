'use client';

// ============================================================================
// QuantGram (QuantNeon) — ReelsCommentsSheet Component
// Forensic 98-Screen Instagram Parity (Task W39-G02)
// Drag-to-Dismiss Comments Sheet, Nested Reply Threads & 8-Emoji Reaction Dock
// ============================================================================

import React, { useState } from 'react';

export interface CommentItem {
  id: string;
  username: string;
  avatar: string;
  text: string;
  timestamp: string;
  likes: number;
  isLiked?: boolean;
  isVerified?: boolean;
  replies?: CommentItem[];
}

export interface ReelsCommentsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  reelId: string;
  initialCommentsCount?: number;
  comments?: CommentItem[];
  onAddComment?: (text: string, parentId?: string) => void;
  onLikeComment?: (commentId: string) => void;
}

export const QUICK_EMOJIS = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'];

const MOCK_COMMENTS: CommentItem[] = [
  {
    id: 'c-1',
    username: 'alex_dev',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop',
    text: 'The 60FPS fluid swipe transition feels smoother than Instagram itself! 🚀',
    timestamp: '2h',
    likes: 84,
    isLiked: true,
    isVerified: true,
    replies: [
      {
        id: 'c-1-1',
        username: 'quant_creator',
        avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&h=100&fit=crop',
        text: 'Thanks! Built on top of pure WebGL hardware acceleration.',
        timestamp: '1h',
        likes: 19,
        isLiked: false,
      },
    ],
  },
  {
    id: 'c-2',
    username: 'sarah_travels',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop',
    text: 'Zero creator platform fee on tips? Switching my whole community here immediately! 🙌',
    timestamp: '4h',
    likes: 56,
    isLiked: false,
  },
  {
    id: 'c-3',
    username: 'rohit_ai',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop',
    text: 'Audio stem separation directly in the remix drawer is insane 🔥',
    timestamp: '6h',
    likes: 31,
    isLiked: false,
  },
];

export const ReelsCommentsSheet: React.FC<ReelsCommentsSheetProps> = ({
  isOpen,
  onClose,
  reelId,
  initialCommentsCount = 3,
  comments = MOCK_COMMENTS,
  onAddComment,
  onLikeComment,
}) => {
  const [commentList, setCommentList] = useState<CommentItem[]>(comments);
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const handleToggleLike = (commentId: string) => {
    if (onLikeComment) {
      onLikeComment(commentId);
      return;
    }
    setCommentList((prev) =>
      prev.map((c) => {
        if (c.id === commentId) {
          const isLiked = !c.isLiked;
          return { ...c, isLiked, likes: isLiked ? c.likes + 1 : c.likes - 1 };
        }
        if (c.replies) {
          return {
            ...c,
            replies: c.replies.map((r) => {
              if (r.id === commentId) {
                const isLiked = !r.isLiked;
                return { ...r, isLiked, likes: isLiked ? r.likes + 1 : r.likes - 1 };
              }
              return r;
            }),
          };
        }
        return c;
      }),
    );
  };

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newComment: CommentItem = {
      id: `c-${Date.now()}`,
      username: 'you',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop',
      text: inputText.trim(),
      timestamp: 'just now',
      likes: 0,
      isLiked: false,
    };

    if (onAddComment) {
      onAddComment(inputText.trim(), replyingTo?.id);
    } else {
      if (replyingTo) {
        setCommentList((prev) =>
          prev.map((c) =>
            c.id === replyingTo.id ? { ...c, replies: [...(c.replies || []), newComment] } : c,
          ),
        );
        setExpandedReplies((prev) => ({ ...prev, [replyingTo.id]: true }));
      } else {
        setCommentList((prev) => [newComment, ...prev]);
      }
    }

    setInputText('');
    setReplyingTo(null);
  };

  const handleQuickEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
  };

  const totalCount = commentList.reduce((acc, curr) => acc + 1 + (curr.replies?.length || 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-label="Comments"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg mx-auto bg-[#121212] border-t border-[#262626] rounded-t-3xl flex flex-col max-h-[75vh] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle & Header */}
        <div className="pt-3 pb-2 px-4 flex flex-col items-center border-b border-[#262626] relative">
          <div className="w-10 h-1 bg-[#3A3A3A] rounded-full mb-3" />
          <h3 className="font-semibold text-sm text-white">Comments ({totalCount})</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comments"
            className="absolute right-4 top-3 text-[#A8A8A8] hover:text-white transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* Floating 8-Emoji Reaction Dock */}
        <div className="flex items-center justify-around py-2.5 px-3 bg-[#1A1A1A] border-b border-[#262626] overflow-x-auto scrollbar-none">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleQuickEmoji(emoji)}
              className="text-xl p-1.5 hover:scale-125 active:scale-95 transition-transform"
              aria-label={`Add emoji ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Comments Scrollable Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {commentList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-[#737373]">
              <span className="text-4xl mb-2">💬</span>
              <p className="font-semibold text-sm text-white">No comments yet</p>
              <p className="text-xs">Start the conversation.</p>
            </div>
          ) : (
            commentList.map((c) => {
              const isRepliesOpen = expandedReplies[c.id];
              return (
                <div key={c.id} className="space-y-3">
                  {/* Primary Comment */}
                  <div className="flex items-start justify-between gap-3 text-xs">
                    <div className="flex items-start gap-3 flex-1">
                      <img
                        src={c.avatar}
                        alt={c.username}
                        className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5 border border-[#262626]"
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-white">{c.username}</span>
                          {c.isVerified && <span className="text-[10px] text-[#0095F6]">✓</span>}
                          <span className="text-[10px] text-[#737373]">{c.timestamp}</span>
                        </div>
                        <p className="text-[#F5F5F5] leading-relaxed break-words">{c.text}</p>
                        <div className="flex items-center gap-3 pt-1 text-[11px] text-[#737373]">
                          <button
                            type="button"
                            onClick={() => setReplyingTo({ id: c.id, username: c.username })}
                            className="font-semibold hover:text-white transition-colors"
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Like comment button */}
                    <button
                      type="button"
                      onClick={() => handleToggleLike(c.id)}
                      className="flex flex-col items-center gap-0.5 text-[#737373] hover:text-red-500 pt-1 transition-colors"
                      aria-label={`Like comment by ${c.username}`}
                    >
                      <span className={`text-sm ${c.isLiked ? 'text-red-500' : ''}`}>
                        {c.isLiked ? '♥' : '♡'}
                      </span>
                      {c.likes > 0 && <span className="text-[10px] font-medium">{c.likes}</span>}
                    </button>
                  </div>

                  {/* Nested Replies */}
                  {c.replies && c.replies.length > 0 && (
                    <div className="pl-11 space-y-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedReplies((prev) => ({
                            ...prev,
                            [c.id]: !isRepliesOpen,
                          }))
                        }
                        className="flex items-center gap-2 text-[11px] font-semibold text-[#737373] hover:text-white transition-colors"
                      >
                        <div className="w-6 h-px bg-[#3A3A3A]" />
                        <span>
                          {isRepliesOpen
                            ? 'Hide replies'
                            : `View ${c.replies.length} ${c.replies.length === 1 ? 'reply' : 'replies'}`}
                        </span>
                      </button>

                      {isRepliesOpen &&
                        c.replies.map((reply) => (
                          <div
                            key={reply.id}
                            className="flex items-start justify-between gap-3 text-xs pt-1.5"
                          >
                            <div className="flex items-start gap-2.5 flex-1">
                              <img
                                src={reply.avatar}
                                alt={reply.username}
                                className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5 border border-[#262626]"
                              />
                              <div className="flex-1 space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-white">{reply.username}</span>
                                  <span className="text-[10px] text-[#737373]">
                                    {reply.timestamp}
                                  </span>
                                </div>
                                <p className="text-[#F5F5F5] leading-relaxed break-words">
                                  {reply.text}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleLike(reply.id)}
                              className="text-[#737373] hover:text-red-500 pt-0.5 transition-colors"
                              aria-label={`Like reply by ${reply.username}`}
                            >
                              <span className={`text-xs ${reply.isLiked ? 'text-red-500' : ''}`}>
                                {reply.isLiked ? '♥' : '♡'}
                              </span>
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Replying Banner */}
        {replyingTo && (
          <div className="px-4 py-1.5 bg-[#1F1F1F] border-t border-[#262626] flex items-center justify-between text-xs text-[#A8A8A8]">
            <span>
              Replying to <strong className="text-white">@{replyingTo.username}</strong>
            </span>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="text-[#737373] hover:text-white text-sm"
            >
              ✕
            </button>
          </div>
        )}

        {/* Input Bar */}
        <form
          onSubmit={handlePost}
          className="p-3 bg-[#121212] border-t border-[#262626] flex items-center gap-3"
        >
          <img
            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop"
            alt="Your avatar"
            className="w-8 h-8 rounded-full object-cover shrink-0 border border-[#262626]"
          />
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={replyingTo ? `Reply to @${replyingTo.username}...` : 'Add a comment...'}
            className="flex-1 bg-transparent text-xs text-white placeholder-[#737373] outline-none"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="text-xs font-bold text-[#0095F6] disabled:opacity-40 hover:text-[#1877F2] transition-colors"
          >
            Post
          </button>
        </form>
      </div>
    </div>
  );
};

export default ReelsCommentsSheet;
