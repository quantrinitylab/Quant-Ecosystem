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
  showToast,
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
                  ? 'bg-[#21262D] border-[#FF8C42] text-white'
                  : 'bg-[#161B22] border-[#30363D] text-[#7D8590]'
              }`}
            >
              {cat === 'all' ? 'All Categories' : cat}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => showToast('New discussion dialog')}
          className="px-3.5 py-1.5 rounded-md bg-[#238636] hover:bg-[#2EA043] text-white font-bold transition-colors"
        >
          New discussion
        </button>
      </div>

      <div className="border border-[#30363D] rounded-md bg-[#0D1117] divide-y divide-[#21262D]">
        {discussions.map((d) => (
          <div
            key={d.id}
            className="p-4 hover:bg-[#161B22] transition-colors flex items-start justify-between gap-4"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-[#1F242C] text-[#58A6FF]">
                  {d.category}
                </span>
                <h4 className="font-bold text-white hover:text-[#58A6FF] cursor-pointer">
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
              className="flex flex-col items-center px-3 py-1.5 rounded-md bg-[#21262D] border border-[#30363D] text-[#E6EDF3] hover:border-[#58A6FF] transition-colors"
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
