// ============================================================================
// QuantGram (QuantNeon) — Explore 3-Column Asymmetric Masonry Grid Engine
// Forensic 98-Screen Instagram Parity (Task W39-G05)
// ============================================================================

export interface ExploreGridItem {
  id: string;
  thumbnailUrl: string;
  type: 'post' | 'reel' | 'product';
  likes?: number;
  views?: number;
  durationSeconds?: number;
  caption?: string;
  tags?: string[];
}

export function formatExploreViews(views: number): string {
  if (views >= 1_000_000) {
    return `${(views / 1_000_000).toFixed(1)}M`;
  }
  if (views >= 1_000) {
    return `${(views / 1_000).toFixed(0)}K`;
  }
  return String(views);
}

export function formatVideoDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function isAsymmetricLargeItem(index: number): boolean {
  // Instagram pattern: item 0 and item 5 of each 9-item block are large 2x2 spans
  return index % 9 === 0 || index % 9 === 4;
}

export function filterExploreBySearchQuery(
  items: ExploreGridItem[],
  query: string,
): ExploreGridItem[] {
  if (!query || query.trim() === '') return items;
  const q = query.toLowerCase().trim();
  return items.filter(
    (item) =>
      item.caption?.toLowerCase().includes(q) ||
      item.tags?.some((t) => t.toLowerCase().includes(q)),
  );
}
