import { describe, it, expect } from 'vitest';

import {
  attachmentKind,
  describeAttachmentChip,
} from '../lib/compose-attachment-chip';

/**
 * Compose slice Phase 1.5 (prep) — attachment-chip labelling.
 *
 * Pure helper tests only: no component mount, no send, no backend. The
 * kind label is what lets a sender spot a wrong file before sending, so
 * these pins are the contract: extension first, MIME as fallback, and a
 * full screen-reader readout (name + kind + size) on every chip.
 */
describe('attachmentKind', () => {
  it('resolves PDF by extension', () => {
    expect(attachmentKind('report.pdf')).toBe('pdf');
  });

  it('is case-insensitive on the extension', () => {
    expect(attachmentKind('PHOTO.JPG')).toBe('image');
    expect(attachmentKind('Deck.PPTX')).toBe('presentation');
  });

  it('covers the spreadsheet / archive / document families', () => {
    expect(attachmentKind('budget.xlsx')).toBe('spreadsheet');
    expect(attachmentKind('notes.docx')).toBe('document');
    expect(attachmentKind('backup.zip')).toBe('archive');
  });

  it('covers audio, video and code', () => {
    expect(attachmentKind('song.mp3')).toBe('audio');
    expect(attachmentKind('clip.mp4')).toBe('video');
    expect(attachmentKind('patch.ts')).toBe('code');
  });

  it('falls back to MIME when there is no usable extension', () => {
    expect(attachmentKind('photo', 'image/png')).toBe('image');
    expect(attachmentKind('file', 'application/pdf')).toBe('pdf');
    expect(attachmentKind('.gitignore')).toBe('other');
    expect(attachmentKind('report.')).toBe('other');
  });

  it('prefers the extension over a conflicting MIME type', () => {
    // A Drive-backed file can arrive with a generic MIME type; the name
    // is what the sender recognises, so it wins.
    expect(attachmentKind('report.pdf', 'image/png')).toBe('pdf');
  });

  it('returns other for unknown extensions and missing names', () => {
    expect(attachmentKind('data.xyz')).toBe('other');
    expect(attachmentKind(null)).toBe('other');
    expect(attachmentKind(undefined)).toBe('other');
  });
});

describe('describeAttachmentChip', () => {
  it('labels name, kind and size in one readout', () => {
    const chip = describeAttachmentChip({
      name: 'report.pdf',
      size: 1536,
      mimeType: 'application/pdf',
    });
    expect(chip.label).toBe('report.pdf');
    expect(chip.kind).toBe('pdf');
    expect(chip.kindLabel).toBe('PDF');
    expect(chip.sizeLabel).toBe('1.5 KB');
    expect(chip.ariaLabel).toBe('Attachment report.pdf, PDF, 1.5 KB');
  });

  it('prefers filename over name and falls back to Unnamed file', () => {
    expect(
      describeAttachmentChip({ name: 'old.txt', filename: 'new.txt', size: 0 }).label,
    ).toBe('new.txt');
    expect(describeAttachmentChip({ size: 0 }).label).toBe('Unnamed file');
    expect(describeAttachmentChip({ size: 0 }).sizeLabel).toBe('0 B');
  });

  it('uses the type field when mimeType is absent', () => {
    expect(
      describeAttachmentChip({ name: 'song', type: 'audio/mpeg', size: 100 }).kind,
    ).toBe('audio');
  });
});
