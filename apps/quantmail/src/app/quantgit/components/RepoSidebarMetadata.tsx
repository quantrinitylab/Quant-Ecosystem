'use client';

// ============================================================================
// QuantGit — Repository Metrics & Metadata Sidebar (GitHub Screens 15–17, 116–125)
// ============================================================================

import React, { useState } from 'react';

export interface LanguageStat {
  name: string;
  percentage: number;
  color: string;
}

export interface RepoSidebarMetadataProps {
  repoOwner: string;
  repoName: string;
  description?: string;
  websiteUrl?: string;
  topics?: string[];
  starsCount: number;
  forksCount: number;
  watchersCount: number;
  isStarred?: boolean;
  onToggleStar?: () => void;
  releasesCount?: number;
  latestReleaseTag?: string;
  latestReleaseTime?: string;
  usedByCount?: string;
  contributorsCount?: number;
  languages?: LanguageStat[];
}

export const RepoSidebarMetadata: React.FC<RepoSidebarMetadataProps> = ({
  repoOwner,
  repoName,
  description = 'Build smaller, faster, and more secure applications with a web frontend.',
  websiteUrl = 'https://quant.network',
  topics = [
    'desktop-app',
    'rust',
    'webview',
    'high-performance',
    'mobile-app',
    'web-frontend',
    'native-app',
  ],
  starsCount = 111000,
  forksCount = 5200,
  watchersCount = 146,
  isStarred = false,
  onToggleStar,
  releasesCount = 28144,
  latestReleaseTag = 'v1.0.5',
  latestReleaseTime = '12 hours ago',
  usedByCount = '110K',
  contributorsCount = 995,
  languages = [
    { name: 'TypeScript', percentage: 83.9, color: '#3178c6' },
    { name: 'MDX', percentage: 15.6, color: '#fcb32c' },
    { name: 'JavaScript', percentage: 0.5, color: '#f7df1e' },
  ],
}) => {
  const [starred, setStarred] = useState(isStarred);
  const [currentStars, setCurrentStars] = useState(starsCount);
  const [watchOption, setWatchOption] = useState('Participating and @mentions');
  const [isWatchMenuOpen, setIsWatchMenuOpen] = useState(false);

  const handleStarClick = () => {
    setStarred(!starred);
    setCurrentStars((prev) => (starred ? prev - 1 : prev + 1));
    onToggleStar?.();
  };

  return (
    <div className="w-full space-y-6 text-xs text-[#E6EDF3]">
      {/* About Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[#E6EDF3]">About</h3>
        <p className="text-[#8D96A0] leading-relaxed">{description}</p>

        {websiteUrl && (
          <div className="flex items-center gap-1.5 text-[#58A6FF] hover:underline cursor-pointer">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="truncate">
              {websiteUrl.replace(/^https?:\/\//, '')}
            </a>
          </div>
        )}

        {/* Topics Pills */}
        {topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {topics.map((t) => (
              <span
                key={t}
                className="px-2.5 py-0.5 rounded-full bg-[#1F2937]/60 hover:bg-[#1F2937] text-[#58A6FF] text-[11px] font-medium border border-[#30363D] cursor-pointer transition-colors"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Resources links */}
        <div className="pt-2 border-t border-[#21262D] space-y-2 text-[#8D96A0]">
          <div className="flex items-center gap-2 hover:text-[#58A6FF] cursor-pointer">
            <span>📖</span>
            <span>Readme</span>
          </div>
          <div className="flex items-center gap-2 hover:text-[#58A6FF] cursor-pointer">
            <span>🛡️</span>
            <span>Security policy</span>
          </div>
        </div>
      </div>

      {/* Primary Action Buttons: Star & Watch */}
      <div className="flex items-center gap-2 pt-2 border-t border-[#21262D]">
        <button
          onClick={handleStarClick}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md font-semibold text-xs border transition-colors ${
            starred
              ? 'bg-[#21262D] border-[#8B949E] text-[#E3B341]'
              : 'bg-[#21262D] hover:bg-[#30363D] border-[#30363D] text-[#E6EDF3]'
          }`}
        >
          <span>{starred ? '★ Starred' : '☆ Star'}</span>
          <span className="px-1.5 py-0.2 rounded-full bg-[#30363D] text-[10px] text-[#8D96A0]">
            {currentStars >= 1000 ? `${(currentStars / 1000).toFixed(1)}k` : currentStars}
          </span>
        </button>

        <div className="relative">
          <button
            onClick={() => setIsWatchMenuOpen(!isWatchMenuOpen)}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-md font-semibold text-xs bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] text-[#E6EDF3] transition-colors"
          >
            <span>👁️ Watch</span>
            <span className="text-[10px] text-[#8D96A0]">▼</span>
          </button>

          {isWatchMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl bg-[#161B22] border border-[#30363D] shadow-2xl p-2 z-30 space-y-1 text-xs">
              {['Participating and @mentions', 'All Activity', 'Ignore'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    setWatchOption(opt);
                    setIsWatchMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left hover:bg-[#21262D] transition-colors ${
                    watchOption === opt ? 'bg-[#1F242C] text-[#58A6FF]' : 'text-[#E6EDF3]'
                  }`}
                >
                  <span>{opt}</span>
                  {watchOption === opt && <span>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Releases Widget */}
      <div className="pt-4 border-t border-[#21262D] space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-xs text-[#E6EDF3] flex items-center gap-1.5">
            <span>Releases</span>
            <span className="px-1.5 py-0.2 rounded-full bg-[#21262D] text-[10px] text-[#8D96A0]">
              {releasesCount.toLocaleString()}
            </span>
          </h4>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-emerald-400 font-mono text-[11px] font-semibold">
            {latestReleaseTag}
          </span>
          <span className="px-1.5 py-0.2 rounded border border-emerald-500/40 text-emerald-400 text-[10px]">
            Latest
          </span>
          <span className="text-[10px] text-[#8D96A0]">{latestReleaseTime}</span>
        </div>
      </div>

      {/* Used by Widget */}
      <div className="pt-4 border-t border-[#21262D] space-y-2">
        <h4 className="font-semibold text-xs text-[#E6EDF3]">Used by {usedByCount}</h4>
        <div className="flex -space-x-1.5 overflow-hidden py-1">
          {['👨‍💻', '👩‍💻', '🧑‍🔬', '🧙‍♂️', '🧑‍🚀'].map((emoji, idx) => (
            <div
              key={idx}
              className="inline-block h-6 w-6 rounded-full bg-[#21262D] border-2 border-[#0D1117] flex items-center justify-center text-xs"
            >
              {emoji}
            </div>
          ))}
          <div className="inline-block h-6 px-1.5 rounded-full bg-[#21262D] border-2 border-[#0D1117] flex items-center justify-center text-[10px] text-[#8D96A0] font-medium">
            + 105,045
          </div>
        </div>
      </div>

      {/* Contributors Widget */}
      <div className="pt-4 border-t border-[#21262D] space-y-2">
        <h4 className="font-semibold text-xs text-[#E6EDF3] flex items-center gap-1.5">
          <span>Contributors</span>
          <span className="px-1.5 py-0.2 rounded-full bg-[#21262D] text-[10px] text-[#8D96A0]">
            {contributorsCount}
          </span>
        </h4>
        <div className="flex flex-wrap gap-1">
          {['🐙', '⚡', '🚀', '🔥', '🛡️', '📦', '💎', '🤖'].map((item, idx) => (
            <div
              key={idx}
              className="w-6 h-6 rounded-full bg-[#21262D] border border-[#30363D] flex items-center justify-center text-xs cursor-pointer hover:border-[#58A6FF] transition-colors"
            >
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* Languages Distribution Bar */}
      <div className="pt-4 border-t border-[#21262D] space-y-2.5">
        <h4 className="font-semibold text-xs text-[#E6EDF3]">Languages</h4>

        {/* Multi-segmented color bar */}
        <div className="h-2 w-full rounded-full bg-[#21262D] flex overflow-hidden">
          {languages.map((l) => (
            <div
              key={l.name}
              style={{ width: `${l.percentage}%`, backgroundColor: l.color }}
              title={`${l.name}: ${l.percentage}%`}
              className="h-full"
            />
          ))}
        </div>

        {/* Languages legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11px]">
          {languages.map((l) => (
            <div key={l.name} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
              <span className="font-medium text-[#E6EDF3]">{l.name}</span>
              <span className="text-[#8D96A0]">{l.percentage}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
