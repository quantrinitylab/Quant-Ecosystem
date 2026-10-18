import { describe, it, expect } from 'vitest';
import { mapTreeItemToFileNode } from '../lib/map-tree-item';
import { fileRowCommitLabels } from '../components/CodeTab';

// File-recency fabrication fix: the tree endpoint attaches REAL per-file
// last-commit data (git log -1). When it legitimately cannot (unborn branch,
// enrichment failure), the mapping must NOT invent "Update file" / "recently"
// — unknown recency stays undefined and the row renders an em-dash.

describe('mapTreeItemToFileNode (tree recency honesty)', () => {
  it('passes real backend lastCommit/lastCommitDate through untouched', () => {
    const node = mapTreeItemToFileNode({
      name: 'README.md',
      path: 'README.md',
      type: 'blob',
      size: 2048,
      lastCommit: 'docs: add sovereign deploy runbook',
      lastCommitDate: '2026-10-18T15:00:00+05:30',
    });
    expect(node.lastCommit).toBe('docs: add sovereign deploy runbook');
    expect(node.lastCommitDate).toBe('2026-10-18T15:00:00+05:30');
  });

  it('never fabricates "Update file" / "recently" for missing recency data', () => {
    const node = mapTreeItemToFileNode({ name: 'notes.txt', path: 'notes.txt', type: 'blob' });
    expect(node.lastCommit).toBeUndefined();
    expect(node.lastCommitDate).toBeUndefined();
    expect(node.lastCommit).not.toBe('Update file');
    expect(node.lastCommitDate).not.toBe('recently');
  });

  it('treats empty-string recency as unknown, not as a fabricatable fallback', () => {
    const node = mapTreeItemToFileNode({
      name: 'notes.txt',
      path: 'notes.txt',
      type: 'blob',
      lastCommit: '',
      lastCommitDate: '',
    });
    expect(node.lastCommit).toBeUndefined();
    expect(node.lastCommitDate).toBeUndefined();
  });

  it('keeps the rest of the mapping intact', () => {
    const dir = mapTreeItemToFileNode({ name: 'docs', path: 'docs', type: 'tree' });
    expect(dir.type).toBe('dir');
    expect(dir.size).toBeUndefined();

    const file = mapTreeItemToFileNode({ name: 'a.bin', path: 'a.bin', type: 'blob', size: 3072 });
    expect(file.type).toBe('file');
    expect(file.size).toBe('3 KB');
  });
});

describe('fileRowCommitLabels (row render honesty)', () => {
  it('renders real commit data when present', () => {
    const labels = fileRowCommitLabels({
      lastCommit: 'fix: purge fabricated recency fallbacks',
      lastCommitDate: '2026-10-18T21:00:00+05:30',
    });
    expect(labels.commitLabel).toBe('fix: purge fabricated recency fallbacks');
    expect(labels.dateLabel).toBe('2026-10-18T21:00:00+05:30');
    expect(labels.commitTitle).toBe('fix: purge fabricated recency fallbacks');
  });

  it('renders an honest em-dash — never "Update file" / "recently" — when unknown', () => {
    const labels = fileRowCommitLabels({});
    expect(labels.commitLabel).toBe('—');
    expect(labels.dateLabel).toBe('—');
    expect(labels.commitTitle).toBeUndefined();
    expect(labels.commitLabel).not.toContain('Update file');
    expect(labels.dateLabel).not.toContain('recently');
  });
});
