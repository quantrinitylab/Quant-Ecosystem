'use client';

import React from 'react';
import type { DiscussionItem } from '../types';

export interface DiscussionsTabProps {
  discussions: DiscussionItem[];
  discussionCategory: string;
  setDiscussionCategory: (cat: string) => void;
  handleUpvoteDiscussion: (id: number) => void;
  showToast: (message: string) => void;
}

export function DiscussionsTab({
  discussions,
  discussionCategory,
  setDiscussionCategory,
  handleUpvoteDiscussion,
}: DiscussionsTabProps) {
  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {['all', 'Announcements', 'Ideas', 'Q&A'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setDiscussionCategory(cat)}
              className={`px-3 py-1 rounded-md border text-xs font-semibold ${
                discussionCategory === cat
                  ? 'bg-black border-[var(--app-accent)] text-white'
                  : 'bg-[var(--quant-surface-elevated)] border-[var(--quant-border)] text-[#7D8590]'
              }`}
            >
              {cat === 'all' ? 'All Categories' : cat}
            </button>
          ))}
        </div>
        {/* QM-SCREEN-013 P2: the button used to toast "New discussion dialog"
            but opened nothing — no discussions backend exists. Honestly
            disabled until one does. */}
        <button
          type="button"
          disabled
          title="Starting new discussions is not available yet"
          className="px-3.5 py-1.5 rounded-md bg-[#238636] text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          New discussion
        </button>
      </div>

 <div className="border border-[var(--quant-border)] rounded-md bg-black">
        {discussions.map((d) => (
          <div
            key={d.id}
            className="p-4 hover:bg-[var(--quant-surface-elevated)] transition-colors flex items-start justify-between gap-4"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-px rounded-full text-[10px] font-bold bg-black text-[#8B5CF6]">
                  {d.category}
                </span>
                <h4 className="font-bold text-white hover:text-[#8B5CF6] cursor-pointer">
                  {d.title}
                </h4>
              </div>
              <p className="text-[11px] text-[#7D8590] line-clamp-1">{d.body}</p>
              <p className="text-[10px] text-[#7D8590]">
                Started {d.createdAt} by {d.author}
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleUpvoteDiscussion(d.id)}
              className="flex flex-col items-center px-3 py-1.5 rounded-md bg-black border border-[var(--quant-border)] text-[#E6EDF3] hover:border-[#8B5CF6] transition-colors"
            >
              <span className="text-[10px]">▲</span>
              <span className="font-bold text-xs">{d.upvotes}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
