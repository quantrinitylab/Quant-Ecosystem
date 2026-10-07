// ============================================================================
// QuantAI — Artifacts library UI tests (Muse S6 parity)
// Pure helpers + static-markup component contract tests.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SORT_LABELS,
  artifactIcon,
  artifactSubtitle,
  filterByTab,
  sortArtifacts,
  type ArtifactListItem,
} from '../components/artifacts/types';
import { SortMenu } from '../components/artifacts/SortMenu';
import { ArtifactRow } from '../components/artifacts/ArtifactRow';
import { ArtifactCard } from '../components/artifacts/ArtifactCard';

function item(over: Partial<ArtifactListItem> = {}): ArtifactListItem {
  return {
    id: 'a-1',
    title: 'October 5 Ship Ledger',
    kind: 'artifact',
    type: 'markdown',
    language: null,
    systemFile: false,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-05T10:00:00.000Z',
    openedAt: null,
    ...over,
  };
}

describe('SORT_LABELS', () => {
  it('matches the Muse menu wording', () => {
    expect(SORT_LABELS.modified).toBe('Sort by last modified');
    expect(SORT_LABELS.opened).toBe('Sort by last opened');
    expect(SORT_LABELS.name).toBe('Sort by name');
  });
});

describe('artifactIcon / artifactSubtitle', () => {
  it('maps component/code/markdown/media to distinct icons', () => {
    expect(artifactIcon(item({ kind: 'media' }))).toBe('🖼️');
    expect(artifactIcon(item({ type: 'component' }))).toBe('⚛️');
    expect(artifactIcon(item({ type: 'markdown' }))).toBe('📝');
    expect(artifactIcon(item({ type: 'code' }))).toBe('💻');
    expect(artifactIcon(item({ type: null }))).toBe('💻');
  });

  it('derives the subtitle from kind/type/language', () => {
    expect(artifactSubtitle(item({ kind: 'media' }))).toBe('Media');
    expect(artifactSubtitle(item({ type: 'markdown' }))).toBe('Document');
    expect(artifactSubtitle(item({ type: 'code', language: 'typescript' }))).toBe('typescript');
    expect(artifactSubtitle(item({ type: 'code', language: null }))).toBe('Artifact');
  });
});

describe('sortArtifacts', () => {
  const rows = [
    item({ id: 'c', title: 'Charlie', updatedAt: '2026-10-03T10:00:00.000Z', openedAt: '2026-10-04T10:00:00.000Z' }),
    item({ id: 'a', title: 'alpha', updatedAt: '2026-10-05T10:00:00.000Z', openedAt: null }),
    item({ id: 'b', title: 'Bravo', updatedAt: '2026-10-01T10:00:00.000Z', openedAt: '2026-10-06T10:00:00.000Z' }),
  ];

  it('modified: newest updatedAt first', () => {
    expect(sortArtifacts(rows, 'modified').map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('opened: newest openedAt first, never-opened falls back to updatedAt', () => {
    expect(sortArtifacts(rows, 'opened').map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it('name: case-insensitive A-Z', () => {
    expect(sortArtifacts(rows, 'name').map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const input = [...rows];
    sortArtifacts(input, 'name');
    expect(input.map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('filterByTab', () => {
  it('separates artifact and media rows', () => {
    const rows = [
      item({ id: 'x', kind: 'artifact' }),
      item({ id: 'y', kind: 'media' }),
    ];
    expect(filterByTab(rows, 'artifacts').map((r) => r.id)).toEqual(['x']);
    expect(filterByTab(rows, 'media').map((r) => r.id)).toEqual(['y']);
  });
});

describe('SortMenu', () => {
  const baseProps = {
    view: 'list' as const,
    sort: 'modified' as const,
    showSystemFiles: false,
    onViewChange: vi.fn(),
    onSortChange: vi.fn(),
    onToggleSystemFiles: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(<SortMenu {...baseProps} open={false} />);
    expect(html).toBe('');
  });

  it('renders all Muse-parity options with active checkmarks', () => {
    const html = renderToStaticMarkup(<SortMenu {...baseProps} open />);
    expect(html).toContain('Show as Grid');
    expect(html).toContain('Show as List');
    expect(html).toContain('Sort by last modified');
    expect(html).toContain('Sort by last opened');
    expect(html).toContain('Sort by name');
    expect(html).toContain('System Files');
    // Active options are checkmarked via aria-checked="true".
    const checked = (html.match(/aria-checked="true"/g) || []).length;
    expect(checked).toBe(2); // list view + modified sort
  });

  it('checkmarks grid view when active', () => {
    const html = renderToStaticMarkup(<SortMenu {...baseProps} open view="grid" />);
    expect(html).toContain('Show as Grid');
    const checked = (html.match(/aria-checked="true"/g) || []).length;
    expect(checked).toBe(2); // grid view + modified sort
  });
});

describe('ArtifactRow', () => {
  it('renders icon, title, subtitle and kebab', () => {
    const html = renderToStaticMarkup(
      <ArtifactRow item={item()} onOpen={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(html).toContain('October 5 Ship Ledger');
    expect(html).toContain('Document');
    expect(html).toContain('📝');
    expect(html).toContain('aria-label="Options for October 5 Ship Ledger"');
  });

  it('is keyboard-focusable and labelled as a button', () => {
    const html = renderToStaticMarkup(
      <ArtifactRow item={item()} onOpen={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
  });
});

describe('ArtifactCard', () => {
  it('renders icon and title in grid form', () => {
    const html = renderToStaticMarkup(
      <ArtifactCard
        item={item({ title: 'The ECR Wall', type: 'component' })}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(html).toContain('The ECR Wall');
    expect(html).toContain('⚛️');
  });
});
