'use client';

// ============================================================================
// QuantGit — Repository Metrics & Metadata Sidebar (GitHub Screens 15–17, 116–125)
// ============================================================================

import React, { useEffect, useState } from 'react';
import { apiFetchRaw } from '@quant/api-client';

/** Anchor id of the README preview pane rendered by the Code tab. */
export const README_PANE_ANCHOR_ID = 'quantgit-readme-pane';

/**
 * Scrolls the Code tab's README preview pane into view (GitHub parity: the
 * sidebar "Readme" row jumps to the README section below the file tree).
 * Returns false when the pane is not on the page (or there is no DOM), so
 * callers degrade honestly instead of pretending to navigate.
 */
export function scrollToReadmePane(): boolean {
  if (typeof document === 'undefined') return false;
  const pane = document.getElementById(README_PANE_ANCHOR_ID);
  if (!pane) return false;
  pane.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

export interface LanguageStat {
  name: string;
  percentage: number;
  color: string;
}

export interface RepoSidebarMetadataProps {
  /**
   * QuantGit repository id (the `:id` in `/api/repos/:id/star`). When present
   * the star button persists through the real backend endpoints. When absent
   * the button stays disabled rather than fabricating a count locally —
   * unless `onToggleStar` is provided, in which case the owner handles
   * persistence itself.
   */
  repoId?: string;
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
  /**
   * Navigates to the Security tab (where the SECURITY.md policy viewer/editor
   * lives). When omitted, the "Security policy" row renders as plain,
   * non-clickable text rather than a dead pseudo-link.
   */
  onOpenSecurityPolicy?: () => void;
}

/**
 * Persist a star toggle through the real QuantGit backend.
 *
 * POST /api/repos/:id/star stars, DELETE /api/repos/:id/star unstars
 * (Fastify backend/routes/repos.ts — idempotent, starCount recomputed in the
 * same transaction). Resolves with the server's authoritative
 * `{ stars, starred }`; throws an honest Error on transport failure, HTTP
 * errors, or an unexpected envelope shape.
 */
export async function toggleRepoStar(
  repoId: string,
  currentlyStarred: boolean,
): Promise<{ stars: number; starred: boolean }> {
  const res = await apiFetchRaw(`/api/repos/${encodeURIComponent(repoId)}/star`, {
    method: currentlyStarred ? 'DELETE' : 'POST',
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const envelope = body as { error?: unknown; message?: unknown } | null;
    const detail =
      typeof envelope?.error === 'string'
        ? envelope.error
        : typeof envelope?.error === 'object' && envelope?.error !== null
          ? String((envelope.error as { message?: unknown }).message ?? '')
          : typeof envelope?.message === 'string'
            ? envelope.message
            : '';
    throw new Error(
      `Could not ${currentlyStarred ? 'unstar' : 'star'} this repository (HTTP ${res.status})${detail ? `: ${detail}` : ''}.`,
    );
  }
  const data = (body as { data?: unknown } | null)?.data as
    | { stars?: unknown; starred?: unknown }
    | undefined;
  if (typeof data?.stars !== 'number' || typeof data?.starred !== 'boolean') {
    throw new Error(
      'The star endpoint returned an unexpected response — your star was not updated.',
    );
  }
  return { stars: data.stars, starred: data.starred };
}

export const RepoSidebarMetadata: React.FC<RepoSidebarMetadataProps> = ({
  repoId,
  repoOwner,
  repoName,
  description = '',
  websiteUrl = '',
  topics = [],
  starsCount = 0,
  forksCount = 0,
  watchersCount = 0,
  isStarred = false,
  onToggleStar,
  releasesCount = 0,
  latestReleaseTag = '',
  latestReleaseTime = '',
  usedByCount = '',
  contributorsCount = 0,
  languages = [],
  onOpenSecurityPolicy,
}) => {
  const [starred, setStarred] = useState(isStarred);
  const [currentStars, setCurrentStars] = useState(starsCount);
  const [starPending, setStarPending] = useState(false);
  const [starError, setStarError] = useState<string | null>(null);

  // The star state belongs to one repo: when the selected repo (or its
  // server-provided counts) changes, resync instead of showing stale state.
  useEffect(() => {
    setStarred(isStarred);
    setCurrentStars(starsCount);
    setStarError(null);
  }, [repoId, isStarred, starsCount]);

  // Without a repoId there is nothing to persist a star against, so the
  // button stays disabled rather than fabricating a count locally.
  const starWired = Boolean(repoId) || Boolean(onToggleStar);

  const handleStarClick = async () => {
    if (starPending) return;
    if (!repoId) {
      // Legacy path: an external owner handles persistence itself.
      onToggleStar?.();
      return;
    }
    const nextStarred = !starred;
    const prevStarred = starred;
    const prevStars = currentStars;
    // Optimistic update — rolled back below if the server call fails.
    setStarred(nextStarred);
    setCurrentStars((c) => c + (nextStarred ? 1 : -1));
    setStarError(null);
    setStarPending(true);
    try {
      const result = await toggleRepoStar(repoId, prevStarred);
      // The server is the source of truth after a successful toggle.
      setStarred(result.starred);
      setCurrentStars(result.stars);
      onToggleStar?.();
    } catch (err) {
      setStarred(prevStarred);
      setCurrentStars(prevStars);
      setStarError(
        err instanceof Error ? err.message : 'Could not update the star. Please try again.',
      );
    } finally {
      setStarPending(false);
    }
  };

  return (
    <div className="w-full space-y-6 text-xs text-[#E6EDF3]">
      {/* About Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[#E6EDF3]">About</h3>
        {description ? <p className="text-[#8D96A0] leading-relaxed">{description}</p> : null}

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

        {/* Topics Pills — plain labels: QuantGit has no topic-search
            destination, so pills must not pose as clickable links. */}
        {topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {topics.map((t) => (
              <span
                key={t}
                className="px-2.5 py-0.5 rounded-full bg-[#1F2937]/60 text-[#58A6FF] text-[11px] font-medium border border-[#30363D]"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Resources links — real navigation targets only. The Readme row scrolls
            to the README preview pane in the Code tab (GitHub parity); the
            Security policy row opens the Security tab where SECURITY.md lives.
            Without a security-policy handler it renders as plain text, never a
            dead pseudo-link. */}
        <div className="pt-2 space-y-2 text-[#8D96A0]">
          <button
            type="button"
            onClick={scrollToReadmePane}
            aria-label="Scroll to the Readme preview"
            className="flex w-full items-center gap-2 text-left hover:text-[#58A6FF] cursor-pointer"
          >
            <span aria-hidden="true">📖</span>
            <span>Readme</span>
          </button>
          {onOpenSecurityPolicy ? (
            <button
              type="button"
              onClick={onOpenSecurityPolicy}
              aria-label="Open the Security tab (security policy)"
              className="flex w-full items-center gap-2 text-left hover:text-[#58A6FF] cursor-pointer"
            >
              <span aria-hidden="true">🛡️</span>
              <span>Security policy</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span aria-hidden="true">🛡️</span>
              <span>Security policy</span>
            </div>
          )}
        </div>
      </div>

      {/* Primary Action Buttons: Star */}
      {/* Watch removed (QM-SCREEN-013 P1): the dropdown only set local state,
          implying a persisted notification setting with no subscription
          endpoint behind it. Watch returns when a real subscription endpoint
          exists. */}
 <div className="flex items-center gap-2 pt-2">
        <button
          onClick={handleStarClick}
          disabled={!starWired || starPending}
          aria-pressed={starred}
          aria-label={starred ? 'Unstar this repository' : 'Star this repository'}
          title={!starWired ? 'Starring is not available for this repository' : undefined}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md font-semibold text-xs border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
            starred
              ? 'bg-[#21262D] border-[#8B949E] text-[#E3B341]'
              : 'bg-[#21262D] hover:bg-[#30363D] border-[#30363D] text-[#E6EDF3]'
          }`}
        >
          <span>{starred ? '★ Starred' : '☆ Star'}</span>
          <span className="px-1.5 py-px rounded-full bg-[#30363D] text-[10px] text-[#8D96A0]">
            {currentStars >= 1000 ? `${(currentStars / 1000).toFixed(1)}k` : currentStars}
          </span>
        </button>
      </div>
      {starError && (
        <p role="alert" className="text-[11px] text-red-400 pt-1">
          {starError}
        </p>
      )}

      {/* Releases Widget — only when real release data exists */}
      {(releasesCount > 0 || latestReleaseTag) && (
 <div className="pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-xs text-[#E6EDF3] flex items-center gap-1.5">
              <span>Releases</span>
              <span className="px-1.5 py-px rounded-full bg-[#21262D] text-[10px] text-[#8D96A0]">
                {releasesCount.toLocaleString()}
              </span>
            </h4>
          </div>
          {latestReleaseTag && (
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-mono text-[11px] font-semibold">
                {latestReleaseTag}
              </span>
              <span className="px-1.5 py-px rounded border border-emerald-500/40 text-emerald-400 text-[10px]">
                Latest
              </span>
              {latestReleaseTime && (
                <span className="text-[10px] text-[#8D96A0]">{latestReleaseTime}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Used by Widget — only when real data exists */}
      {usedByCount && (
 <div className="pt-4 space-y-2">
          <h4 className="font-semibold text-xs text-[#E6EDF3]">Used by {usedByCount}</h4>
        </div>
      )}

      {/* Contributors Widget — only when real data exists */}
      {contributorsCount > 0 && (
 <div className="pt-4 space-y-2">
          <h4 className="font-semibold text-xs text-[#E6EDF3] flex items-center gap-1.5">
            <span>Contributors</span>
            <span className="px-1.5 py-px rounded-full bg-[#21262D] text-[10px] text-[#8D96A0]">
              {contributorsCount}
            </span>
          </h4>
        </div>
      )}

      {/* Languages Distribution Bar — only when real data exists */}
      {languages.length > 0 && (
 <div className="pt-4 space-y-2.5">
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
      )}
    </div>
  );
};
