// ============================================================================
// Shared UI - Feed Card Component
// ============================================================================

import React, { useState } from 'react';

export interface FeedCardProps {
  id: string;
  author: { name: string; username: string; avatarUrl?: string; isVerified?: boolean };
  content: string;
  mediaUrls?: string[];
  timestamp: string;
  likes: number;
  comments: number;
  shares: number;
  isLiked?: boolean;
  isBookmarked?: boolean;
  className?: string;
  onLike?: (id: string) => void;
  onComment?: (id: string) => void;
  onShare?: (id: string) => void;
  onBookmark?: (id: string) => void;
  onAuthorClick?: (username: string) => void;
}

export const FeedCard: React.FC<FeedCardProps> = ({
  id,
  author,
  content,
  mediaUrls,
  timestamp,
  likes,
  comments,
  shares,
  isLiked = false,
  isBookmarked = false,
  className = '',
  onLike,
  onComment,
  onShare,
  onBookmark,
  onAuthorClick,
}) => {
  const [liked, setLiked] = useState(isLiked);
  const [likeCount, setLikeCount] = useState(likes);
  const [bookmarked, setBookmarked] = useState(isBookmarked);

  const handleLike = () => {
    setLiked(!liked);
    setLikeCount(liked ? likeCount - 1 : likeCount + 1);
    onLike?.(id);
  };

  const handleBookmark = () => {
    setBookmarked(!bookmarked);
    onBookmark?.(id);
  };

  const formatCount = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <article className={`bg-white border-b border-gray-100 px-4 py-3 ${className}`}>
      {/* Author header */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => onAuthorClick?.(author.username)} className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden">
            {author.avatarUrl ? (
              <img src={author.avatarUrl} alt={author.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-medium text-gray-500">
                {author.name[0]}
              </div>
            )}
          </div>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-sm text-gray-900">{author.name}</span>
            {author.isVerified && <span className="text-blue-500 text-xs">\u2713</span>}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>@{author.username}</span>
            <span>\u00B7</span>
            <span>{timestamp}</span>
          </div>
        </div>
        <button className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <p className="text-sm text-gray-900 whitespace-pre-wrap mb-3">{content}</p>

      {/* Media grid */}
      {mediaUrls && mediaUrls.length > 0 && (
        <div className={`grid gap-1 rounded-xl overflow-hidden mb-3 ${mediaUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {mediaUrls.slice(0, 4).map((url, i) => (
            <div key={i} className="relative aspect-square bg-gray-100">
              <img src={url} alt={`Media ${i + 1}`} className="w-full h-full object-cover" />
              {i === 3 && mediaUrls.length > 4 && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="text-white text-xl font-bold">+{mediaUrls.length - 4}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        <button onClick={() => onComment?.(id)} className="flex items-center gap-1.5 text-gray-500 hover:text-blue-500 transition-colors group">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-xs">{formatCount(comments)}</span>
        </button>
        <button onClick={() => onShare?.(id)} className="flex items-center gap-1.5 text-gray-500 hover:text-green-500 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <span className="text-xs">{formatCount(shares)}</span>
        </button>
        <button onClick={handleLike} className={`flex items-center gap-1.5 transition-colors ${liked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}>
          <svg className="w-5 h-5" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span className="text-xs">{formatCount(likeCount)}</span>
        </button>
        <button onClick={handleBookmark} className={`transition-colors ${bookmarked ? 'text-yellow-500' : 'text-gray-500 hover:text-yellow-500'}`}>
          <svg className="w-5 h-5" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>
      </div>
    </article>
  );
};
