'use client';

// ============================================================================
// QuantAI — Artifacts library shared types + pure helpers (Muse S6 parity)
// ============================================================================

export type ArtifactKind = 'artifact' | 'media';
export type ArtifactView = 'grid' | 'list';
export type ArtifactSortKey = 'modified' | 'opened' | 'name';
export type ArtifactTab = 'artifacts' | 'media';

export interface ArtifactListItem {
  id: string;
  title: string;
  kind: ArtifactKind;
  type: string | null;
  language: string | null;
  systemFile: boolean;
  createdAt: string;
  updatedAt: string;
  openedAt: string | null;
}

export interface ArtifactDetail extends ArtifactListItem {
  code: string | null;
  markdown: string | null;
  previewHtml: string | null;
  contentRef: string | null;
}

export const SORT_LABELS: Record<ArtifactSortKey, string> = {
  modified: 'Sort by last modified',
  opened: 'Sort by last opened',
  name: 'Sort by name',
};

/** Icon for a list row, derived from the artifact subtype — no emoji drift. */
export function artifactIcon(item: Pick<ArtifactListItem, 'kind' | 'type' | 'language'>): string {
  if (item.kind === 'media') return '🖼️';
  switch (item.type) {
    case 'component':
      return '⚛️';
    case 'markdown':
      return '📝';
    case 'code':
    default:
      return '💻';
  }
}

/** Subtitle label under the title, mirroring Muse's "Artifact" caption. */
export function artifactSubtitle(item: Pick<ArtifactListItem, 'kind' | 'type' | 'language'>): string {
  if (item.kind === 'media') return 'Media';
  if (item.type === 'markdown') return 'Document';
  if (item.language) return item.language;
  return 'Artifact';
}

/** Pure client-side fallback sort for already-fetched rows (used by tests). */
export function sortArtifacts<T extends ArtifactListItem>(
  items: T[],
  sort: ArtifactSortKey,
): T[] {
  const copy = [...items];
  switch (sort) {
    case 'name':
      return copy.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
      );
    case 'opened':
      return copy.sort(
        (a, b) =>
          new Date(b.openedAt ?? b.updatedAt).getTime() -
          new Date(a.openedAt ?? a.updatedAt).getTime(),
      );
    case 'modified':
    default:
      return copy.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }
}

export function filterByTab<T extends ArtifactListItem>(items: T[], tab: ArtifactTab): T[] {
  const kind: ArtifactKind = tab === 'media' ? 'media' : 'artifact';
  return items.filter((i) => i.kind === kind);
}
