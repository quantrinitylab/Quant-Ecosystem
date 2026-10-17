import type { FileNode } from '../types';

/**
 * Maps one backend tree entry to the UI FileNode.
 *
 * Honesty rule (fabrication fix): the tree endpoint may legitimately omit
 * `lastCommit`/`lastCommitDate` (unborn branch, enrichment failure) — this
 * mapping must NOT fabricate "Update file" / "recently" in their place.
 * Unknown recency stays undefined; the row renderer shows an em-dash.
 */
export function mapTreeItemToFileNode(item: {
  name?: string;
  path?: string;
  type?: string;
  size?: number;
  lastCommit?: string;
  lastCommitDate?: string;
}): FileNode {
  return {
    name: item.name || item.path?.split('/').pop() || 'file',
    path: item.path || item.name || '',
    type: item.type === 'tree' || item.type === 'dir' ? 'dir' : 'file',
    size: item.size ? `${Math.round(item.size / 1024)} KB` : undefined,
    lastCommit: item.lastCommit || undefined,
    lastCommitDate: item.lastCommitDate || undefined,
  };
}
