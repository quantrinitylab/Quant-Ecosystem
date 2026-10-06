import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DockedComposer } from '../DockedComposer';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Mock toast
vi.mock('../InboxToast', () => ({
  showToast: vi.fn(),
}));

// Mock contacts hook
vi.mock('../../hooks/useContacts', () => ({
  useContacts: () => ({ data: [] }),
}));

// Mock API client
vi.mock('../../services/api-client', () => ({
  apiClient: {},
}));

// Mock undo-send
vi.mock('../UndoSendCountdownBar', () => ({
  useUndoSend: () => ({ queueSend: vi.fn() }),
}));

// Mock email body helpers
vi.mock('../../lib/email-body', () => ({
  composeMessageBodies: (text: string) => ({ bodyText: text, bodyHtml: text }),
}));

// Mock signature loader
vi.mock('../../lib/email-signature-preference', () => ({
  loadDefaultSignatureHtml: async () => '',
}));

describe('DockedComposer window gestures', () => {
  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      <DockedComposer isOpen={false} onClose={() => {}} />
    );
    expect(html).toBe('');
  });

  it('renders the top-edge drag-to-resize handle in docked mode', () => {
    const html = renderToStaticMarkup(
      <DockedComposer isOpen={true} onClose={() => {}} />
    );
    expect(html).toContain('role="separator"');
    expect(html).toContain('Resize composer height');
    expect(html).toContain('data-resize-handle');
    expect(html).toContain('cursor-ns-resize');
  });

  it('marks the resize handle keyboard-focusable with arrow-key semantics', () => {
    const html = renderToStaticMarkup(
      <DockedComposer isOpen={true} onClose={() => {}} />
    );
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-orientation="horizontal"');
    expect(html).toContain('aria-valuemin="300"');
  });

  it('marks the header as drag-down-to-minimize', () => {
    const html = renderToStaticMarkup(
      <DockedComposer isOpen={true} onClose={() => {}} />
    );
    expect(html).toContain('Drag down to minimize');
    expect(html).toContain('cursor-grab');
  });

  it('keeps the existing minimize / expand / close header buttons', () => {
    const html = renderToStaticMarkup(
      <DockedComposer isOpen={true} onClose={() => {}} />
    );
    expect(html).toContain('aria-label="Minimize composer"');
    expect(html).toContain('aria-label="Expand to fullscreen"');
    expect(html).toContain('aria-label="Close composer"');
  });
});
