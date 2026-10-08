// QM-M39-007 — file details panel (M39 screen 24).
//
// FILE IDENTITY RULE under test:
// - The pure FileDetailsView renders every identity field from a backend
//   payload; nothing is invented.
// - 'unknown' scan state renders as "Not scanned", never as safe.
// - Absent data renders honest empties ("Never opened", "Only you have
//   access"), never fabricated values.

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FileDetailsPanel,
  FileDetailsView,
  humanType,
  type FileDetailsResponse,
} from '../app/drive/components/FileDetailsPanel';

function baseDetails(overrides: Partial<FileDetailsResponse> = {}): FileDetailsResponse {
  return {
    id: 'file-1',
    name: 'report.pdf',
    type: 'file',
    mimeType: 'application/pdf',
    size: 2048,
    owner: { name: 'Owner Name', email: 'owner@example.com' },
    isOwner: true,
    modifiedAt: '2026-10-07T12:00:00Z',
    createdAt: '2026-10-01T00:00:00Z',
    lastOpenedAt: '2026-10-08T09:00:00Z',
    location: [
      { id: 'folder-root', name: 'Projects' },
      { id: 'folder-child', name: 'Q3' },
    ],
    sharing: {
      people: [{ email: 'reader@example.com', permission: 'view' }],
      peopleCount: 1,
      linkCount: 1,
      links: [{ role: 'viewer', expiresAt: null, createdAt: '2026-10-05T00:00:00Z' }],
    },
    scan: { status: 'clean', reason: null, scannedAt: '2026-10-07T12:30:00Z' },
    versions: {
      count: 2,
      latest: { version: 2, size: 2048, date: '2026-10-07T12:00:00Z' },
    },
    ...overrides,
  };
}

describe('QM-M39-007 FileDetailsPanel', () => {
  describe('humanType', () => {
    it('derives honest labels from the real mimeType', () => {
      expect(humanType('application/pdf', 'file')).toBe('PDF document');
      expect(humanType('image/png', 'file')).toBe('Image');
      expect(humanType('video/mp4', 'file')).toBe('Video');
      expect(humanType('application/zip', 'file')).toBe('Archive');
      expect(humanType('application/vnd.quant.folder', 'folder')).toBe('Folder');
      expect(humanType('application/octet-stream', 'file')).toBe('application/octet-stream');
    });
  });

  describe('FileDetailsView', () => {
    it('renders the full identity from backend data', () => {
      const html = renderToStaticMarkup(
        <FileDetailsView details={baseDetails()} onOpenVersionHistory={() => {}} />,
      );
      expect(html).toContain('PDF document');
      expect(html).toContain('Owner Name');
      expect(html).toContain('owner@example.com');
      expect(html).toContain('2.0 KB');
      // Location breadcrumb carries the real folder names.
      expect(html).toContain('My Drive');
      expect(html).toContain('Projects');
      expect(html).toContain('Q3');
      // Sharing summary.
      expect(html).toContain('Shared with 1 person');
      expect(html).toContain('reader@example.com');
      expect(html).toContain('view');
      expect(html).toContain('1 active share link');
      expect(html).toContain('Anyone with the link can view');
      expect(html).toContain('never expires');
      // Version context.
      expect(html).toContain('2 versions');
      expect(html).toContain('View history');
    });

    it('says "Never opened" instead of inventing an open date', () => {
      const html = renderToStaticMarkup(
        <FileDetailsView details={baseDetails({ lastOpenedAt: null })} />,
      );
      expect(html).toContain('Never opened');
    });

    it('says "Only you have access" when nothing is shared — never fakes shares', () => {
      const html = renderToStaticMarkup(
        <FileDetailsView
          details={baseDetails({
            sharing: { people: [], peopleCount: 0, linkCount: 0, links: [] },
          })}
        />,
      );
      expect(html).toContain('Only you have access to this item.');
      expect(html).not.toContain('Shared with');
      expect(html).not.toContain('share link');
    });

    it('tells non-owners the recipient list is owner-visible instead of faking it', () => {
      const html = renderToStaticMarkup(
        <FileDetailsView
          details={baseDetails({
            isOwner: false,
            sharing: { people: null, peopleCount: 2, linkCount: 0, links: null },
          })}
        />,
      );
      expect(html).toContain('Shared with 2 people');
      expect(html).toContain('Recipient list is visible to the owner.');
    });

    it('wires the QM-M39-009 scan model: unknown renders as "Not scanned", never safe', () => {
      const html = renderToStaticMarkup(
        <FileDetailsView
          details={baseDetails({ scan: { status: 'unknown', reason: null, scannedAt: null } })}
        />,
      );
      expect(html).toContain('Not scanned');
      expect(html).toContain('data-scan-status="unknown"');
      expect(html).toContain('has not been security-scanned');
      expect(html).not.toMatch(/Scanned · clean/);
      expect(html).not.toMatch(/safe/i);
    });

    it('shows quarantined files with their real reason', () => {
      const html = renderToStaticMarkup(
        <FileDetailsView
          details={baseDetails({
            scan: { status: 'quarantined', reason: 'EICAR test signature', scannedAt: '2026-10-07T12:30:00Z' },
          })}
        />,
      );
      expect(html).toContain('Quarantined');
      expect(html).toContain('EICAR test signature');
      expect(html).toContain('Preview and download are disabled');
    });

    it('renders folders without scan, versions, or size rows', () => {
      const html = renderToStaticMarkup(
        <FileDetailsView
          details={baseDetails({
            id: 'folder-child',
            name: 'Q3',
            type: 'folder',
            mimeType: 'application/vnd.quant.folder',
            scan: null,
            versions: null,
            location: [{ id: 'folder-root', name: 'Projects' }],
          })}
        />,
      );
      expect(html).toContain('Folder');
      expect(html).not.toContain('Security');
      expect(html).not.toContain('Versions');
      expect(html).toContain('Projects');
    });

    it('says "No versions recorded" for files with zero versions', () => {
      const html = renderToStaticMarkup(
        <FileDetailsView
          details={baseDetails({ versions: { count: 0, latest: null } })}
        />,
      );
      expect(html).toContain('No versions recorded for this file.');
      expect(html).not.toContain('View history');
    });
  });

  describe('FileDetailsPanel shell', () => {
    it('renders nothing when no item is selected', () => {
      const html = renderToStaticMarkup(<FileDetailsPanel item={null} onClose={() => {}} />);
      expect(html).toBe('');
    });

    it('renders the dialog chrome with the item name while loading', () => {
      const html = renderToStaticMarkup(
        <FileDetailsPanel item={{ id: 'file-1', name: 'report.pdf' }} onClose={() => {}} />,
      );
      expect(html).toContain('role="dialog"');
      expect(html).toContain('report.pdf');
      expect(html).toContain('Loading file details');
      expect(html).toContain('Close details panel');
      // Nothing fabricated before the backend answers.
      expect(html).not.toContain('versions');
      expect(html).not.toContain('KB');
    });
  });
});
