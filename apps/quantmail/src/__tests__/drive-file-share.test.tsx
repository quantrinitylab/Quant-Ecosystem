/**
 * Regression tests for the Drive file-list Share fix.
 *
 * Previously, clicking Share on a file in the Drive feed lightbox showed a
 * lying "Share link created for X" success toast with NO API call, NO link
 * generated, and NO dialog opened.
 *
 * Now `onShareItem` opens the real FileShareModal, which calls the real
 * share APIs and only toasts on real outcomes.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock the shared-ui Modal to render children inline (the real one portals
// to document.body, which renderToStaticMarkup cannot do).
vi.mock('@quant/shared-ui', () => ({
  Modal: ({ isOpen, title, children }: { isOpen: boolean; title: string; children: React.ReactNode }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

import { FileShareModal } from '../app/drive/components/FileShareModal';

describe('FileShareModal (real share, no lying toasts)', () => {
  const fileId = 'file-123';
  const fileName = 'report.pdf';

  function renderModal() {
    return renderToStaticMarkup(
      <FileShareModal isOpen={true} onClose={() => {}} fileId={fileId} fileName={fileName} />,
    );
  }

  it('renders share-with-people and public-link sections', () => {
    const html = renderModal();
    expect(html).toContain('Share with people');
    expect(html).toContain('Public Link');
    expect(html).toContain('teammate@example.com');
  });

  it('shows the file name in the dialog title', () => {
    const html = renderModal();
    expect(html).toContain('report.pdf');
  });

  it('renders email input, permission select, and Share button', () => {
    const html = renderModal();
    expect(html).toContain('type="email"');
    expect(html).toContain('Can view');
    expect(html).toContain('Can edit');
    expect(html).toContain('Share');
  });

  it('renders public-link role and expiration controls', () => {
    const html = renderModal();
    expect(html).toContain('Expires in 7 days');
    expect(html).toContain('Never expires');
    expect(html).toContain('+ Create Link');
  });

  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      <FileShareModal isOpen={false} onClose={() => {}} fileId={fileId} fileName={fileName} />,
    );
    expect(html).not.toContain('Share with people');
  });

  it('does not contain any hardcoded success toast text', () => {
    // The old code toasted `Share link created for "X"` without any API call.
    // The modal must never contain that lying string.
    const html = renderModal();
    expect(html).not.toContain('Share link created for');
  });
});

describe('drive page wiring (lying toast removed)', () => {
  it('page.tsx no longer contains the lying share toast', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const pageSource = fs.readFileSync(path.join(__dirname, '../app/drive/page.tsx'), 'utf-8');
    expect(pageSource).not.toContain('Share link created for');
    // onShareItem now opens the real modal via shareTarget state
    expect(pageSource).toContain('setShareTarget');
    expect(pageSource).toContain('<FileShareModal');
  });
});
