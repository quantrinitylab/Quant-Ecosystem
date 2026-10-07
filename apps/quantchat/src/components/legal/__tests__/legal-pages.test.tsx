// @vitest-environment jsdom
// ============================================================================
// QuantChat - legal pages render test (P0-2)
//
// /terms, /privacy and /support must render real content (no 404, no bounce
// back to /login) for logged-out visitors.
// ============================================================================
import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import TermsPage from '../../../app/terms/page';
import PrivacyPage from '../../../app/privacy/page';
import SupportPage from '../../../app/support/page';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderPage(page: React.ReactElement): string {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(page);
  });
  return container.textContent ?? '';
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe('legal pages', () => {
  it('/terms renders the Terms of Service with a back-to-login link', () => {
    const text = renderPage(<TermsPage />);
    expect(text).toContain('Terms of Service');
    expect(text).toContain('Acceptable use');
    expect(container!.querySelector('a[href="/login"]')).not.toBeNull();
  });

  it('/privacy renders the Privacy Policy with honest message-storage disclosure', () => {
    const text = renderPage(<PrivacyPage />);
    expect(text).toContain('Privacy Policy');
    expect(text).toContain('We store your message content so we can deliver it');
    expect(text).toContain('End-to-end encryption is not enabled in QuantChat yet');
    expect(container!.querySelector('a[href="/login"]')).not.toBeNull();
  });

  it('/support renders FAQs and the support contact', () => {
    const text = renderPage(<SupportPage />);
    expect(text).toContain('Support');
    expect(text).toContain('support@quantrinity.in');
    expect(text).toContain('Frequently asked questions');
  });

  it('every legal page cross-links the other two', () => {
    for (const page of [<TermsPage key="t" />, <PrivacyPage key="p" />, <SupportPage key="s" />]) {
      renderPage(page);
      expect(container!.querySelector('a[href="/terms"]')).not.toBeNull();
      expect(container!.querySelector('a[href="/privacy"]')).not.toBeNull();
      expect(container!.querySelector('a[href="/support"]')).not.toBeNull();
      act(() => {
        root?.unmount();
      });
      container?.remove();
      root = null;
      container = null;
    }
  });
});
