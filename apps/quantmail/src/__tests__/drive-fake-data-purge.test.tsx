import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DriveVaultSubView } from '../app/drive/components/DriveVaultSubView';
import { DriveSharedSubView } from '../app/drive/components/DriveSharedSubView';
import { DriveStarredSubView } from '../app/drive/components/DriveStarredSubView';
import { DriveCleanerSubView } from '../app/drive/components/DriveCleanerSubView';

// QM-UIUX-020 — Drive fake-data purge: vault, shared, starred, cleaner.
// Regression: with empty data (the state every fresh account is in), the
// subviews must render honest empty states and never invent files, people,
// hashes, or "reclaimed" byte counts. These strings are the exact invented
// values cited in the ledger finding; if any of them ever appears in live
// render output, this suite fails loudly.

const INVENTED_STRINGS = [
  'Elena Rostova',
  'Marcus Vance',
  'rostova',
  'mvance',
  'Unlocked via WebCrypto',
  'SubtleCrypto L3',
  'duplicate storage reclaimed',
  '4.8 GB',
  '948e3612',
];

function assertNoFabrications(html: string) {
  for (const s of INVENTED_STRINGS) {
    expect(html, `invented string must never render: "${s}"`).not.toContain(s);
  }
}

describe('QM-UIUX-020: Drive fake-data purge (vault / shared / starred / cleaner)', () => {
  describe('DriveVaultSubView', () => {
    it('renders an honest empty state when the parent passes no items', () => {
      const html = renderToStaticMarkup(<DriveVaultSubView />);
      expect(html).toContain('No vault items yet');
      expect(html).toContain('Vault Items (0)');
      // The view must not imply encryption it does not perform.
      expect(html).toContain('Client-side encryption is not available yet');
      assertNoFabrications(html);
    });

    it('never invents vault items from an empty array', () => {
      const html = renderToStaticMarkup(<DriveVaultSubView items={[]} />);
      expect(html).toContain('No vault items yet');
      expect(html).not.toContain('SHA-256:');
      assertNoFabrications(html);
    });

    it('renders real items verbatim when provided (no invention needed)', () => {
      const html = renderToStaticMarkup(
        <DriveVaultSubView
          items={[
            {
              id: 'vault-1',
              name: 'tax-2025.pdf',
              cipherSize: 1048576,
              cipherAlgorithm: 'AES-256-GCM',
              sha256Checksum: 'abc123def456',
              encryptedAt: '2026-10-01T00:00:00Z',
            },
          ]}
        />,
      );
      expect(html).toContain('Vault Items (1)');
      expect(html).toContain('tax-2025.pdf');
      expect(html).toContain('AES-256-GCM');
      assertNoFabrications(html);
    });
  });

  describe('DriveSharedSubView', () => {
    it('renders an honest empty state when no shares exist', () => {
      const html = renderToStaticMarkup(<DriveSharedSubView />);
      expect(html).toContain('No shared files yet');
      expect(html).toContain('0 Active');
      assertNoFabrications(html);
    });

    it('does not fall back to demo shares when shares is an empty array', () => {
      const html = renderToStaticMarkup(<DriveSharedSubView shares={[]} />);
      expect(html).toContain('No shared files yet');
      // No collaborator avatars may render without real people.
      expect(html).not.toContain('Shared by');
      assertNoFabrications(html);
    });
  });

  describe('DriveStarredSubView', () => {
    it('renders an honest empty state when nothing is starred', () => {
      const html = renderToStaticMarkup(<DriveStarredSubView items={[]} />);
      expect(html).toContain('No starred files yet');
      assertNoFabrications(html);
    });
  });

  describe('DriveCleanerSubView', () => {
    it('renders an honest empty state when no duplicate clusters exist', () => {
      const html = renderToStaticMarkup(<DriveCleanerSubView />);
      expect(html).toContain('No duplicates found');
      expect(html).toContain('Duplicate Files (0)');
      assertNoFabrications(html);
    });

    it('never claims reclaimed storage without real removedCount/savedBytes', () => {
      const html = renderToStaticMarkup(<DriveCleanerSubView clusters={[]} />);
      expect(html).not.toMatch(/reclaimed/i);
      expect(html).not.toMatch(/\d+(\.\d+)?\s*(GB|MB) (reclaimed|saved|freed)/i);
      assertNoFabrications(html);
    });
  });
});
