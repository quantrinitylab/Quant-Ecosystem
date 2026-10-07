'use client';

// ============================================================================
// QuantGram (QuantNeon) — ExploreGrid Component
// Forensic 98-Screen Instagram Parity (Task W39-G05)
// 3-Column Asymmetric Masonry Grid + Duration Badges + View Count Pills + Quanty AI Search
// ============================================================================

import React, { useState, useMemo } from 'react';
import {
  formatExploreViews,
  formatVideoDuration,
  isAsymmetricLargeItem,
  filterExploreBySearchQuery,
  type ExploreGridItem,
} from '../features/explore/explore-matrix';

export interface ExploreGridProps {
  items: ExploreGridItem[];
  onItemClick?: (id: string) => void;
  onSearch?: (query: string) => void;
}

export const ExploreGrid: React.FC<ExploreGridProps> = ({ items, onItemClick, onSearch }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredItems = useMemo(() => {
    return filterExploreBySearchQuery(items, searchQuery);
  }, [items, searchQuery]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (onSearch) onSearch(q);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    if (onSearch) onSearch('');
  };

  return (
    <div
      className="w-full flex flex-col space-y-3"
      role="region"
      aria-label="Explore Discover Feed"
    >
      {/* "Search with Meta AI" / Quanty AI Search Bar */}
      <div className="px-3 pt-2">
        <div className="relative flex items-center bg-[#1E1E1E] hover:bg-[#252525] focus-within:bg-[#222222] border border-[#333333] rounded-2xl px-3.5 py-2.5 transition-colors shadow-inner">
          {/* Magnifying Glass Icon */}
          <svg
            className="w-4 h-4 text-[#8E8E8E] mr-2.5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>

          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Ask Quanty anything or search reels..."
            className="flex-1 bg-transparent text-xs text-white placeholder-[#8E8E8E] outline-none"
            aria-label="Ask Quanty anything or search reels..."
          />

          {searchQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="text-xs text-[#8E8E8E] hover:text-white px-1.5"
              aria-label="Clear search input"
            >
              ✕
            </button>
          )}

          {/* Quanty Sparkle Icon & Pill */}
          <div className="flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-purple-500/20 border border-amber-500/30 text-amber-300 text-[11px] font-medium flex-shrink-0 select-none">
            <svg
              className="w-3 h-3 text-amber-400"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 2L14.4 7.6L20 10L14.4 12.4L12 18L9.6 12.4L4 10L9.6 7.6L12 2Z" />
            </svg>
            <span>Quanty AI</span>
          </div>
        </div>
      </div>

      {/* 3-Column Asymmetric Masonry Grid */}
      {filteredItems.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center px-4">
          <div className="w-14 h-14 rounded-full bg-[#1A1A1E] border border-[#2D2D35] flex items-center justify-center mb-4 text-[#8E8E8E]">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <p className="font-semibold text-sm text-white mb-1">No explore results</p>
          <p className="text-xs text-[#8E8E8E] max-w-xs">
            Try searching for other topics, creator handles, hashtags, or ask Quanty AI.
          </p>
        </div>
      ) : (
        <div
          className="grid grid-cols-3 gap-1 md:gap-2 auto-rows-[120px] sm:auto-rows-[160px] md:auto-rows-[220px]"
          role="grid"
          aria-label="Explore content"
        >
          {filteredItems.map((item, i) => {
            const isLarge = isAsymmetricLargeItem(i);
            const viewCountLabel =
              item.views != null || item.type === 'reel'
                ? formatExploreViews(item.views || 0)
                : null;
            const durationLabel =
              item.type === 'reel' ? formatVideoDuration(item.durationSeconds || 0) : null;

            return (
              <button
                type="button"
                key={item.id}
                className={`relative overflow-hidden bg-gray-900 group rounded-sm text-left ${
                  isLarge ? 'col-span-2 row-span-2' : ''
                }`}
                onClick={() => onItemClick?.(item.id)}
                aria-label={`${item.type} item${item.caption ? `: ${item.caption}` : ''}${
                  viewCountLabel ? `, ${viewCountLabel} views` : ''
                }`}
              >
                <img
                  src={item.thumbnailUrl}
                  alt={item.caption || ''}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />

                {/* Overlays & Badges: Top-Right */}
                {durationLabel && (
                  <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1 font-mono pointer-events-none">
                    <svg
                      className="w-2.5 h-2.5 fill-current"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span>{durationLabel}</span>
                  </div>
                )}

                {item.type === 'product' && (
                  <div
                    className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white text-xs px-1.5 py-0.5 rounded flex items-center justify-center pointer-events-none"
                    aria-label="Product"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                      />
                    </svg>
                  </div>
                )}

                {/* Overlays & Badges: Bottom-Left View Count Pill */}
                {viewCountLabel && (
                  <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1 pointer-events-none font-medium">
                    <svg
                      className="w-2.5 h-2.5 fill-current"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span>{viewCountLabel}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ExploreGrid;
