// QM-M39-009 — Drive security/scanning state surface (M39 screen 29).
//
// Honesty contract under test:
// - 'unknown' renders as "Not scanned" — never as "clean" or "safe".
// - Every state has a visible indicator on file rows (grid + list) and in
//   the details context.
// - Quarantined files disable their row Download button.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DriveFilesSubView,
  DriveStarredSubView,
  type DriveItem,
} from '../app/drive/components';
import {
  FileScanBadge,
  FileScanDetail,
  normalizeScanStatus,
} from '../app/drive/components/FileScanBadge';

// The quota meter reads the real GET /api/drive/quota through this hook; the
// suite pins it to a known value instead of letting the meter fetch.
vi.mock('../hooks/useStorageQuota', () => ({
  useStorageQuota: () => ({
    quota: { used: 14.2 * 1024 ** 3, total: 100 * 1024 ** 3 },
    known: true,
    usedPct: 14,
    isLoading: false,
    error: null,
  }),
}));

const filesByStatus: DriveItem[] = [
  { id: 'f-unknown', name: 'unscanned.bin', type: 'file', mimeType: 'application/octet-stream', size: 10, modifiedAt: '2026-10-08T00:00:00Z' },
  { id: 'f-pending', name: 'queued.bin', type: 'file', mimeType: 'application/octet-stream', size: 10, modifiedAt: '2026-10-08T00:00:00Z', scanStatus: 'pending' },
  { id: 'f-scanning', name: 'scanning.bin', type: 'file', mimeType: 'application/octet-stream', size: 10, modifiedAt: '2026-10-08T00:00:00Z', scanStatus: 'scanning' },
  { id: 'f-clean', name: 'clean.bin', type: 'file', mimeType: 'application/octet-stream', size: 10, modifiedAt: '2026-10-08T00:00:00Z', scanStatus: 'clean' },
  { id: 'f-quarantined', name: 'evil.bin', type: 'file', mimeType: 'application/octet-stream', size: 10, modifiedAt: '2026-10-08T00:00:00Z', scanStatus: 'quarantined', scanReason: 'EICAR test signature' },
];

describe('QM-M39-009 scan-state honesty contract', () => {
  describe('normalizeScanStatus', () => {
    it('maps anything unexpected to unknown — never to clean', () => {
      expect(normalizeScanStatus(null)).toBe('unknown');
      expect(normalizeScanStatus(undefined)).toBe('unknown');
      expect(normalizeScanStatus('')).toBe('unknown');
      expect(normalizeScanStatus('CLEAN')).toBe('unknown');
      expect(normalizeScanStatus('safe')).toBe('unknown');
      expect(normalizeScanStatus('clean')).toBe('clean');
      expect(normalizeScanStatus('quarantined')).toBe('quarantined');
    });
  });

  describe('FileScanBadge', () => {
    it('renders unknown as "Not scanned", never as safe', () => {
      const html = renderToStaticMarkup(<FileScanBadge status={null} />);
      expect(html).toContain('Not scanned');
      expect(html).toContain('data-scan-status="unknown"');
      expect(html).not.toMatch(/clean/i);
      expect(html).not.toMatch(/safe/i);
    });

    it('renders each real state with its honest label', () => {
      expect(renderToStaticMarkup(<FileScanBadge status="pending" />)).toContain('Scan queued');
      expect(renderToStaticMarkup(<FileScanBadge status="scanning" />)).toContain('Scanning');
      expect(renderToStaticMarkup(<FileScanBadge status="clean" />)).toContain('Scanned · clean');
      expect(renderToStaticMarkup(<FileScanBadge status="quarantined" />)).toContain('Quarantined');
    });

    it('exposes the state on data-scan-status for tests and tooling', () => {
      const html = renderToStaticMarkup(<FileScanBadge status="quarantined" reason="EICAR" />);
      expect(html).toContain('data-scan-status="quarantined"');
      expect(html).toContain('EICAR');
    });
  });

  describe('FileScanDetail (details context)', () => {
    it('shows the badge plus the honest explanation', () => {
      const html = renderToStaticMarkup(<FileScanDetail status="unknown" />);
      expect(html).toContain('Not scanned');
      expect(html).toContain('has not been security-scanned');
      expect(html).not.toMatch(/clean/i);
    });

    it('shows the quarantine reason in the details context', () => {
      const html = renderToStaticMarkup(
        <FileScanDetail status="quarantined" reason="EICAR test signature" />,
      );
      expect(html).toContain('Quarantined');
      expect(html).toContain('EICAR test signature');
      expect(html).toContain('Preview and download are disabled');
    });
  });

  describe('DriveFilesSubView rows', () => {
    it('renders a scan badge per file in grid view', () => {
      const html = renderToStaticMarkup(
        <DriveFilesSubView files={filesByStatus} folders={[]} viewMode="grid" />,
      );
      expect(html).toContain('Not scanned');
      expect(html).toContain('Scan queued');
      expect(html).toContain('Scanning');
      expect(html).toContain('Scanned · clean');
      expect(html).toContain('Quarantined');
    });

    it('renders a scan badge per file in list view', () => {
      const html = renderToStaticMarkup(
        <DriveFilesSubView files={filesByStatus} folders={[]} viewMode="list" />,
      );
      expect(html).toContain('Not scanned');
      expect(html).toContain('Quarantined');
    });

    it('never renders unknown as safe on any row', () => {
      const html = renderToStaticMarkup(
        <DriveFilesSubView files={[filesByStatus[0]]} folders={[]} viewMode="list" />,
      );
      expect(html).toContain('Not scanned');
      // No "Scanned · clean" badge may appear for an unknown file.
      expect(html).not.toContain('Scanned · clean');
    });

    it('disables the Download button for quarantined files', () => {
      const html = renderToStaticMarkup(
        <DriveFilesSubView files={[filesByStatus[4]]} folders={[]} viewMode="list" />,
      );
      expect(html).toContain('disabled');
      expect(html).toContain('Quarantined — download disabled');
    });
  });

  describe('DriveStarredSubView rows', () => {
    it('renders scan badges and disables download for quarantined files', () => {
      const html = renderToStaticMarkup(
        <DriveStarredSubView
          items={filesByStatus.map((f) => ({ ...f, isStarred: true }))}
        />,
      );
      expect(html).toContain('Not scanned');
      expect(html).toContain('Quarantined');
      expect(html).toContain('disabled');
    });
  });
});
