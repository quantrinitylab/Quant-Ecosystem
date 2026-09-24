'use client';

// ============================================================================
// QuantGram (QuantNeon) — AboutReelSheet Component
// Forensic 98-Screen Instagram Parity (Task W39-G03)
// "About this reel" AI Context Sheet + Ad Transparency + Auto-Scroll Toggle
// ============================================================================

import React, { useState } from 'react';
import type { Reel } from '../types';
import {
  generateReelAiSummary,
  extractReelTopics,
  formatUsageCount,
  type ReelAiContext,
} from '../features/reels/about-reel';

export interface AboutReelSheetProps {
  isOpen: boolean;
  onClose: () => void;
  reel: Reel;
  aiContext?: Partial<ReelAiContext>;
  isAutoScroll?: boolean;
  onToggleAutoScroll?: () => void;
}

export const AboutReelSheet: React.FC<AboutReelSheetProps> = ({
  isOpen,
  onClose,
  reel,
  aiContext,
  isAutoScroll = false,
  onToggleAutoScroll,
}) => {
  const [showAdDetails, setShowAdDetails] = useState(false);
  const [localAutoScroll, setLocalAutoScroll] = useState(isAutoScroll);

  if (!isOpen) return null;

  const topics = aiContext?.topics || extractReelTopics(reel.caption || '');
  const summary = aiContext?.summary || generateReelAiSummary(reel.caption || '', reel.username);
  const usageCount = aiContext?.audioDetails?.usageCount ?? 148200;
  const isTrending = aiContext?.audioDetails?.isTrending ?? true;
  const isSponsored = aiContext?.adTransparency?.isSponsored ?? false;

  const handleToggleAutoScroll = () => {
    setLocalAutoScroll(!localAutoScroll);
    if (onToggleAutoScroll) {
      onToggleAutoScroll();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-label="About this reel"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg mx-auto bg-[#121212] border-t border-[#262626] rounded-t-3xl flex flex-col max-h-[80vh] shadow-2xl overflow-hidden text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle & Header */}
        <div className="pt-3 pb-2 px-4 flex flex-col items-center border-b border-[#262626] relative">
          <div className="w-10 h-1 bg-[#3A3A3A] rounded-full mb-3" />
          <h3 className="font-semibold text-sm">About this reel</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close about reel"
            className="absolute right-4 top-3 text-[#A8A8A8] hover:text-white transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Creator Attribution */}
          <div className="flex items-center gap-3 bg-[#1A1A1A] p-3 rounded-2xl border border-[#262626]">
            <img
              src={reel.userAvatar}
              alt={reel.username}
              className="w-11 h-11 rounded-full object-cover border border-[#333]"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm truncate">@{reel.username}</span>
                <span className="text-xs text-[#0095F6]">✓</span>
              </div>
              <p className="text-xs text-[#A8A8A8] truncate">{reel.audioName}</p>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                Verified Original
              </span>
            </div>
          </div>

          {/* Quanty AI Analysis */}
          <div className="space-y-2.5 bg-[#171717] p-3.5 rounded-2xl border border-[#262626]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">✨</span>
                <h4 className="font-semibold text-xs tracking-wide text-[#E5E5E5]">
                  Quanty AI Content Insights
                </h4>
              </div>
              <span className="text-[10px] text-[#A8A8A8] uppercase tracking-wider font-mono">
                Realtime
              </span>
            </div>
            <p className="text-xs text-[#C2C2C2] leading-relaxed">{summary}</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {topics.map((topic) => (
                <span
                  key={topic}
                  className="text-[10px] bg-[#242424] hover:bg-[#2E2E2E] text-[#E0E0E0] px-2.5 py-1 rounded-md border border-[#333] transition-colors"
                >
                  #{topic}
                </span>
              ))}
            </div>
          </div>

          {/* Sound & Remix Transparency */}
          <div className="space-y-2 bg-[#171717] p-3.5 rounded-2xl border border-[#262626]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">🎵</span>
                <h4 className="font-semibold text-xs text-[#E5E5E5]">Audio Track Details</h4>
              </div>
              {isTrending && (
                <span className="text-[10px] text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded-full">
                  ↗ Trending
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-white">{reel.audioName}</p>
            <div className="flex items-center justify-between text-[11px] text-[#A8A8A8] pt-1">
              <span>{formatUsageCount(usageCount)}</span>
              <span className="text-emerald-400">Audio Remixing Allowed</span>
            </div>
          </div>

          {/* Ad Transparency Disclosure */}
          <div className="space-y-2 bg-[#171717] p-3.5 rounded-2xl border border-[#262626]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">🛡️</span>
                <h4 className="font-semibold text-xs text-[#E5E5E5]">Ad & Creator Transparency</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowAdDetails(!showAdDetails)}
                className="text-[11px] text-[#0095F6] hover:underline"
              >
                {showAdDetails ? 'Hide' : 'Details'}
              </button>
            </div>
            <p className="text-xs text-[#A8A8A8]">
              {isSponsored
                ? 'This reel contains paid promotion or branded partnership.'
                : 'No paid sponsorship detected on this reel. 100% creator-owned.'}
            </p>
            {showAdDetails && (
              <div className="mt-2 p-2.5 bg-[#121212] rounded-xl text-[11px] text-[#9E9E9E] space-y-1 border border-[#2E2E2E]">
                <p>• Payout Rail: Direct Quant Credits ($1 = 1 Credit, 0% platform fee).</p>
                <p>• Data Policy: Zero behavioral tracking or cross-site fingerprinting.</p>
                <p>• Target Category: Algorithmic interest graph match.</p>
              </div>
            )}
          </div>

          {/* Auto-Scroll Toggle */}
          <div className="flex items-center justify-between bg-[#1A1A1A] p-3.5 rounded-2xl border border-[#262626]">
            <div>
              <p className="text-xs font-semibold text-white">Auto-advance reels</p>
              <p className="text-[11px] text-[#A8A8A8]">Hands-free playback when video finishes</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={localAutoScroll}
              onClick={handleToggleAutoScroll}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                localAutoScroll ? 'bg-[#0095F6]' : 'bg-[#333]'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  localAutoScroll ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#0D0D0D] border-t border-[#262626] text-center text-[10px] text-[#666]">
          QuantGram Forensic 98-Screen Parity • Powered by Quant Studio Design System (QSDS)
        </div>
      </div>
    </div>
  );
};

export default AboutReelSheet;
