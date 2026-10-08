// QM-M39-010 — mail attachment → Drive handoff (M39 screen 30).
//
// Render contract under test:
// - an attachment the backend can actually read (attachmentId present) gets a
//   real "Save to Drive" button,
// - an inbound metadata-only attachment (no attachmentId — bytes never
//   stored) gets NO Save button: a button that could never work would be a
//   fake control.
// - no preview modal and no result text render before any save happens.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AttachmentPreview } from '../components/AttachmentPreview';

const savable = {
  id: 'att_550e8400-e29b-41d4-a716-446655440000',
  filename: 'report.pdf',
  mimeType: 'application/pdf',
  size: 1024,
  attachmentId: 'att_550e8400-e29b-41d4-a716-446655440000',
};

const inboundMetadataOnly = {
  id: 'att-0-1',
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  size: 2048,
  // No attachmentId: inbound MIME-parser metadata; the backend holds no bytes.
  attachmentId: null,
};

describe('QM-M39-010 AttachmentPreview Save-to-Drive render contract', () => {
  it('offers "Save to Drive" for attachments the backend can read', () => {
    const html = renderToStaticMarkup(<AttachmentPreview attachments={[savable]} />);
    expect(html).toContain('Save to Drive');
  });

  it('offers NO Save button for inbound metadata-only attachments', () => {
    const html = renderToStaticMarkup(<AttachmentPreview attachments={[inboundMetadataOnly]} />);
    expect(html).not.toContain('Save to Drive');
    // The attachment chip itself still renders honestly.
    expect(html).toContain('photo.jpg');
  });

  it('renders per-attachment gating independently', () => {
    const html = renderToStaticMarkup(
      <AttachmentPreview attachments={[savable, inboundMetadataOnly]} />,
    );
    const occurrences = html.split('Save to Drive').length - 1;
    expect(occurrences).toBe(1);
  });

  it('renders no save-result or preview surface before any save', () => {
    const html = renderToStaticMarkup(<AttachmentPreview attachments={[savable]} />);
    expect(html).not.toContain('Saved to Drive');
    expect(html).not.toContain('Already in Drive');
    expect(html).not.toContain('Back to email');
  });
});
