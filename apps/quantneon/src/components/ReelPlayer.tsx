// ============================================================================
// QuantNeon - ReelPlayer Component (Full-screen vertical video)
// ============================================================================

import React, { useState } from 'react';
import type { Reel } from '../types';
import { ReelsCommentsSheet } from './ReelsCommentsSheet';
import { AboutReelSheet } from './AboutReelSheet';

interface ReelPlayerProps {
  reel: Reel;
  isActive: boolean;
  isMuted: boolean;
}

export function ReelPlayer({ reel, isActive, isMuted }: ReelPlayerProps) {
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  return (
    <div className="relative w-full h-full bg-black" aria-label={`Reel by ${reel.username}`}>
      {/* Video */}
      <video
        src={reel.videoUrl}
        poster={reel.thumbnailUrl}
        loop
        muted={isMuted}
        autoPlay={isActive}
        className="absolute inset-0 w-full h-full object-cover"
        aria-label={reel.caption}
      />

      {/* Sidebar Actions */}
      <div className="absolute right-3 bottom-32 flex flex-col items-center gap-5">
        <button
          className={`flex flex-col items-center gap-1 ${reel.isLiked ? 'text-red-500' : 'text-white'}`}
          aria-label={`Like, ${reel.likes} likes`}
        >
          <span className="text-2xl">{reel.isLiked ? '♥' : '♡'}</span>
          <span className="text-xs font-medium">{reel.likes}</span>
        </button>
        <button
          type="button"
          onClick={() => setIsCommentsOpen(true)}
          className="flex flex-col items-center gap-1 text-white hover:opacity-80 transition-opacity"
          aria-label={`Comments, ${reel.comments} comments`}
        >
          <span className="text-2xl">💬</span>
          <span className="text-xs font-medium">{reel.comments}</span>
        </button>
        <button
          type="button"
          className="flex flex-col items-center gap-1 text-white"
          aria-label={`Share, ${reel.shares} shares`}
        >
          <span className="text-2xl">↗</span>
          <span className="text-xs font-medium">{reel.shares}</span>
        </button>
        <button
          type="button"
          onClick={() => setIsAboutOpen(true)}
          className="flex flex-col items-center gap-1 text-white hover:opacity-80 transition-opacity"
          aria-label="About this reel"
        >
          <span className="text-xl">⋯</span>
          <span className="text-[10px] font-medium">About</span>
        </button>
        <div
          className="w-8 h-8 rounded-full border-2 border-white overflow-hidden animate-spin-slow"
          aria-label="Audio disc"
        >
          <img src={reel.userAvatar} alt="" className="w-full h-full object-cover" />
        </div>
      </div>

      {/* Footer Info */}
      <div className="absolute bottom-4 left-3 right-16 text-white">
        <p className="font-bold text-sm mb-1">@{reel.username}</p>
        <p className="text-sm leading-snug line-clamp-2">{reel.caption}</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs">♪</span>
          <span className="text-xs truncate">{reel.audioName}</span>
        </div>
      </div>

      {/* Drag-to-Dismiss Comments Sheet */}
      <ReelsCommentsSheet
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
        reelId={reel.id}
        initialCommentsCount={reel.comments}
      />

      {/* About this reel AI Context & Ad Transparency Sheet */}
      <AboutReelSheet isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} reel={reel} />
    </div>
  );
}

export default ReelPlayer;
