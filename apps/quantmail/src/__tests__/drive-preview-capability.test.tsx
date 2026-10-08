// QM-M39-004 — Drive capability-aware preview system (M39 screens 9–14).
//
// Honesty contract under test:
// - Each file type resolves to exactly one explicit preview capability
//   (image / video / pdf / audio / document / text / unsupported) —
//   never a generic loading state.
// - Scan state is its own indicator, wired to the real backend scanStatus.
//   Quarantine gates preview AND download (consistent with #663's 403
//   gating). Scan-pending never blocks preview — it renders alongside it.
// - Unsupported files get an honest state naming what the user can still
//   do (screen 14), not a dead end.
// - A spinner appears only while a real fetch is in flight — no fake
//   loading masks that pretend content is coming when it isn't.

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DriveFilePreview,
  resolvePreviewKind,
  type PreviewFile,
} from '../components/DriveFilePreview';

const baseFile = (overrides: Partial<PreviewFile> = {}): PreviewFile => ({
  id: 'file-1',
  name: 'report.pdf',
  mimeType: 'application/pdf',
  size: 1024,
  modifiedAt: '2026-10-08T00:00:00Z',
  scanStatus: 'clean',
  scanReason: null,
  ...overrides,
});

const render = (file: PreviewFile, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <DriveFilePreview
      file={file}
      previewUrl="/api/drive/files/file-1/download"
      onClose={() => {}}
      onDownload={async () => ({ ok: true })}
      canDownload
      {...extra}
    />,
  );

describe('QM-M39-004 capability-aware preview', () => {
  describe('resolvePreviewKind', () => {
    it('maps image/video/pdf/audio to their explicit kinds', () => {
      expect(resolvePreviewKind('image/jpeg', 'photo.jpg')).toBe('image');
      expect(resolvePreviewKind('image/svg+xml', 'logo.svg')).toBe('image');
      expect(resolvePreviewKind('video/mp4', 'clip.mp4')).toBe('video');
      expect(resolvePreviewKind('application/pdf', 'report.pdf')).toBe('pdf');
      expect(resolvePreviewKind('audio/mpeg', 'song.mp3')).toBe('audio');
    });

    it('maps office formats to document (honest no-in-browser-preview state)', () => {
      expect(
        resolvePreviewKind(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'doc.docx',
        ),
      ).toBe('document');
      expect(resolvePreviewKind('application/rtf', 'notes.rtf')).toBe('document');
      expect(
        resolvePreviewKind(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'data.xlsx',
        ),
      ).toBe('document');
    });

    it('maps text and code to text', () => {
      expect(resolvePreviewKind('text/plain', 'notes.txt')).toBe('text');
      expect(resolvePreviewKind('application/json', 'data.json')).toBe('text');
      expect(resolvePreviewKind('application/octet-stream', 'script.py')).toBe('text');
      expect(resolvePreviewKind('text/x-python', 'script.py')).toBe('text');
    });

    it('maps everything else to unsupported — never to a fake viewer', () => {
      expect(resolvePreviewKind('application/octet-stream', 'blob.bin')).toBe('unsupported');
      expect(resolvePreviewKind('application/zip', 'archive.zip')).toBe('unsupported');
      expect(resolvePreviewKind(null, 'mystery')).toBe('unsupported');
      expect(resolvePreviewKind(undefined, undefined)).toBe('unsupported');
    });
  });

  describe('per-type preview states (screens 10–13)', () => {
    it('image: renders the image viewer, never a generic state', () => {
      const html = render(baseFile({ name: 'photo.jpg', mimeType: 'image/jpeg' }));
      expect(html).toContain('data-preview-kind="image"');
      expect(html).toContain('<img');
      expect(html).toContain('/api/drive/files/file-1/download');
    });

    it('video: renders the video viewer', () => {
      const html = render(baseFile({ name: 'clip.mp4', mimeType: 'video/mp4' }));
      expect(html).toContain('data-preview-kind="video"');
      expect(html).toContain('<video');
    });

    it('audio: renders the audio viewer', () => {
      const html = render(baseFile({ name: 'song.mp3', mimeType: 'audio/mpeg' }));
      expect(html).toContain('data-preview-kind="audio"');
      expect(html).toContain('<audio');
    });

    it('pdf: renders the document frame with an honest fallback note', () => {
      const html = render(baseFile());
      expect(html).toContain('data-preview-kind="pdf"');
      expect(html).toContain('<iframe');
      expect(html).toContain('If the document does not display above');
    });

    it('document: honest "no preview for this format" state with real options', () => {
      const html = render(
        baseFile({
          name: 'doc.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      );
      expect(html).toContain('data-preview-kind="document"');
      expect(html).toContain('preview isn’t available for this format');
      expect(html).toContain('What you can still do:');
    });

    it('text: loading state is honest — a real fetch starts on mount', () => {
      const html = render(baseFile({ name: 'notes.txt', mimeType: 'text/plain' }));
      expect(html).toContain('data-preview-kind="text"');
      expect(html).toContain('Loading text preview');
    });
  });

  describe('unsupported-file honest state (screen 14)', () => {
    it('names what the user can still do, including download when available', () => {
      const html = render(
        baseFile({ name: 'archive.zip', mimeType: 'application/zip', scanStatus: 'clean' }),
      );
      expect(html).toContain('data-preview-kind="unsupported"');
      expect(html).toContain('No preview available for this file type');
      expect(html).toContain('What you can still do:');
      expect(html).toContain('Download the file');
      // A missing preview is not a missing file.
      expect(html).toContain('a missing preview does not mean a missing file');
    });

    it('never shows a fake loading mask for unsupported files', () => {
      const html = render(baseFile({ name: 'archive.zip', mimeType: 'application/zip' }));
      expect(html).not.toContain('Loading');
      expect(html).not.toContain('animate-spin');
    });

    it('says download is disabled when the parent reports it unavailable', () => {
      const html = render(
        baseFile({ name: 'archive.zip', mimeType: 'application/zip' }),
        { canDownload: false },
      );
      expect(html).toContain('Download is disabled for this file');
    });
  });

  describe('scan-state indicators (screen 9) — separate from preview/download', () => {
    it('quarantined: gates preview AND download with an instruction', () => {
      const html = render(
        baseFile({ scanStatus: 'quarantined', scanReason: 'EICAR test signature' }),
      );
      expect(html).toContain('data-scan-status="quarantined"');
      expect(html).toContain('This file is quarantined');
      expect(html).toContain('Preview and download are disabled');
      expect(html).toContain('EICAR test signature');
      // No viewer and no download button leak through the gate.
      expect(html).not.toContain('<img');
      expect(html).not.toContain('<iframe');
      expect(html).not.toContain('<video');
      expect(html).not.toContain('Download</button>');
    });

    it('scan-pending: indicator renders alongside the viewer, never blocks it', () => {
      for (const status of ['pending', 'scanning'] as const) {
        const html = render(
          baseFile({ name: 'photo.jpg', mimeType: 'image/jpeg', scanStatus: status }),
        );
        expect(html).toContain(`data-scan-status="${status}"`);
        expect(html).toContain('data-scan-pending-note');
        expect(html).toContain('shown as-is');
        // Progressive: the preview capability is still offered.
        expect(html).toContain('data-preview-kind="image"');
        expect(html).toContain('<img');
      }
    });

    it('unknown: honest "Not scanned", never safe', () => {
      const html = render(baseFile({ scanStatus: null }));
      expect(html).toContain('data-scan-status="unknown"');
      expect(html).toContain('Not scanned');
      expect(html).not.toMatch(/Scanned · clean/);
    });

    it('clean: viewer renders with no alarming copy', () => {
      const html = render(baseFile({ scanStatus: 'clean' }));
      expect(html).toContain('data-preview-kind="pdf"');
      expect(html).not.toContain('quarantined');
      expect(html).not.toContain('Not scanned');
    });
  });

  describe('download capability is independent', () => {
    it('offers a real Download button outside quarantine', () => {
      const html = render(baseFile({ scanStatus: 'clean' }));
      expect(html).toContain('data-download-state="idle"');
      expect(html).toContain('>Download</button>');
    });

    it('disables download when the parent reports it unavailable', () => {
      const html = render(baseFile(), { canDownload: false });
      expect(html).toContain('disabled');
      expect(html).toContain('Download is disabled for this file');
    });
  });
});
