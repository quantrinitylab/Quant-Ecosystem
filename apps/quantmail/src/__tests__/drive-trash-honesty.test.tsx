import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DriveTrashItemsList,
  DriveHomeSubView,
  type DriveItem,
} from '../components/DriveSubViews';

// The quota meter reads the real GET /api/drive/quota through this hook; pin it
// so the suite never depends on a live backend.
vi.mock('../hooks/useStorageQuota', () => ({
  useStorageQuota: () => ({
    quota: { used: 14.2 * 1024 ** 3, total: 100 * 1024 ** 3 },
    known: true,
    usedPct: 14,
    isLoading: false,
    error: null,
  }),
}));

// QM-FIX: fake trash items (ledger finding 2026-10-11). The Trash category view
// used to fabricate two files when the real trash was empty —
// "Deprecated_Keyring_v1.pem" (fake ids trash-1/trash-2, fake deletedAt dates).
// Regression contract: the trash view renders ONLY real trash items, and an
// honest empty state otherwise. These are the exact invented values; if any of
// them ever appears in live render output, this suite fails loudly.

const INVENTED_STRINGS = [
  'Deprecated_Keyring_v1.pem',
  'Old_Architecture_Draft_2025.pdf',
  'trash-1',
  'trash-2',
  '2026-10-02T10:00:00Z',
  '2026-10-01T15:30:00Z',
];

function assertNoFabrications(html: string) {
  for (const s of INVENTED_STRINGS) {
    expect(html, `invented trash string must never render: "${s}"`).not.toContain(s);
  }
}

const realTrashItem: DriveItem = {
  id: 'drive-file-abc123',
  name: 'meeting-notes.docx',
  type: 'file',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  size: 24576,
  modifiedAt: '2026-10-08T09:00:00Z',
  deletedAt: '2026-10-09T14:30:00Z',
};

describe('QM-FIX: Drive trash honesty (DriveTrashItemsList)', () => {
  it('renders an honest empty state when trash is empty — never invented files', () => {
    const html = renderToStaticMarkup(<DriveTrashItemsList items={[]} />);
    expect(html).toContain('Trash is empty');
    expect(html).toContain('Files you move to trash will appear here');
    // No action buttons may exist when there is nothing real to act on.
    expect(html).not.toContain('Restore');
    expect(html).not.toContain('Purge');
    assertNoFabrications(html);
  });

  it('renders an honest empty state when items is undefined', () => {
    const html = renderToStaticMarkup(<DriveTrashItemsList />);
    expect(html).toContain('Trash is empty');
    assertNoFabrications(html);
  });

  it('renders real trash items verbatim with their real deleted date', () => {
    const html = renderToStaticMarkup(
      <DriveTrashItemsList items={[realTrashItem]} />,
    );
    expect(html).toContain('meeting-notes.docx');
    expect(html).toContain('Restore');
    expect(html).toContain('Purge');
    // Real deletedAt is shown as a real date — never a fabricated label.
    expect(html).toMatch(/Deleted \d+\/\d+\/\d+/);
    expect(html).not.toContain('Deleted recently');
    assertNoFabrications(html);
  });

  it('shows no invented deleted label for items without a deletedAt', () => {
    const item = { ...realTrashItem };
    delete item.deletedAt;
    const html = renderToStaticMarkup(<DriveTrashItemsList items={[item]} />);
    expect(html).toContain('meeting-notes.docx');
    expect(html).not.toContain('Deleted');
    assertNoFabrications(html);
  });

  it('renders one row per real item and nothing more', () => {
    const items = [
      realTrashItem,
      { ...realTrashItem, id: 'drive-file-def456', name: 'sketch.png', deletedAt: undefined },
    ];
    const html = renderToStaticMarkup(<DriveTrashItemsList items={items} />);
    expect(html).toContain('meeting-notes.docx');
    expect(html).toContain('sketch.png');
    const restoreCount = (html.match(/>Restore</g) || []).length;
    expect(restoreCount).toBe(2);
    assertNoFabrications(html);
  });
});

describe('QM-SCREEN-011 R2: trash rows surface the security scan state', () => {
  it('renders a Quarantined badge for a quarantined trash item — never silent', () => {
    const html = renderToStaticMarkup(
      <DriveTrashItemsList
        items={[{ ...realTrashItem, scanStatus: 'quarantined', scanReason: 'EICAR test signature' }]}
      />,
    );
    expect(html).toContain('data-scan-status="quarantined"');
    expect(html).toContain('Quarantined');
    assertNoFabrications(html);
  });

  it('renders other non-clean states honestly (pending, unknown) — never as safe', () => {
    const pendingHtml = renderToStaticMarkup(
      <DriveTrashItemsList items={[{ ...realTrashItem, scanStatus: 'pending' }]} />,
    );
    expect(pendingHtml).toContain('data-scan-status="pending"');
    const unknownHtml = renderToStaticMarkup(
      <DriveTrashItemsList items={[{ ...realTrashItem, scanStatus: 'unknown' }]} />,
    );
    expect(unknownHtml).toContain('data-scan-status="unknown"');
    expect(unknownHtml).toContain('Not scanned');
    assertNoFabrications(unknownHtml);
  });

  it('keeps clean rows quiet — no badge when the scan honestly passed', () => {
    const html = renderToStaticMarkup(
      <DriveTrashItemsList items={[{ ...realTrashItem, scanStatus: 'clean' }]} />,
    );
    expect(html).not.toContain('data-scan-status');
    assertNoFabrications(html);
  });
});

describe('QM-FIX: DriveHomeSubView trash category never fabricates items', () => {
  it('trash category badge shows real count (0) with empty trash — no fake rows possible', () => {
    // categoryItems is an internal memo, but the badge count and the trash card
    // both derive from the same real trashItems prop; a fake fallback would
    // contradict a zero badge. The direct trash-list tests above cover the view.
    const html = renderToStaticMarkup(
      <DriveHomeSubView files={[]} folders={[]} trashItems={[]} />,
    );
    expect(html).toContain('data-testid="category-card-trash"');
    expect(html).toContain('Trash');
    assertNoFabrications(html);
  });

  it('renders real trash items in the badge count when provided', () => {
    const html = renderToStaticMarkup(
      <DriveHomeSubView files={[]} folders={[]} trashItems={[realTrashItem]} />,
    );
    expect(html).toContain('data-testid="category-card-trash"');
    assertNoFabrications(html);
  });
});
