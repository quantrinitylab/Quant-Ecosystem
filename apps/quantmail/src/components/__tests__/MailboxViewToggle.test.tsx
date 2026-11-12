import { describe, it, expect, vi } from 'vitest';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MailboxViewToggle } from '../MailboxViewToggle';

// next/link renders a plain anchor in this markup test.
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) =>
    createElement('a', { href, ...rest }, children),
}));

describe('MailboxViewToggle', () => {
  it('renders People and Inbox links with the correct destinations', () => {
    const html = renderToStaticMarkup(<MailboxViewToggle isInbox />);
    expect(html).toContain('aria-label="Mailbox view"');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/?view=inbox"');
    expect(html).toContain('>People<');
    expect(html).toContain('>Inbox<');
  });

  it('carries the spam lens on both pills when the spam lens is active', () => {
    // 2026-10-25 fix/qm-spam-lens-toggle: the People | Inbox toggle used to
    // hardcode People -> `/` and Inbox -> `/?view=inbox`, so tapping either
    // pill from a spam-lens People home (`/?lens=spam`) silently abandoned
    // the spam review. Both directions must keep `lens=spam` (the classic
    // inbox supports `?view=inbox&lens=spam` via normalizeLensParam).
    // renderToStaticMarkup escapes `&` as `&amp;` in the href attribute.
    const peopleHtml = renderToStaticMarkup(<MailboxViewToggle isInbox={false} lens="spam" />);
    expect(peopleHtml).toContain('href="/?lens=spam"');
    expect(peopleHtml).toContain('href="/?view=inbox&amp;lens=spam"');
    expect(peopleHtml).not.toContain('href="/"');
    expect(peopleHtml).not.toContain('href="/?view=inbox"');

    const inboxHtml = renderToStaticMarkup(<MailboxViewToggle isInbox lens="spam" />);
    expect(inboxHtml).toContain('href="/?lens=spam"');
    expect(inboxHtml).toContain('href="/?view=inbox&amp;lens=spam"');
  });

  it('does not leak a non-spam lens into the toggle hrefs', () => {
    // PeopleHome honors only `lens=spam`; any other lens would be ignored
    // there, so the toggle must not pretend to carry it.
    const html = renderToStaticMarkup(<MailboxViewToggle isInbox={false} lens="promotions" />);
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/?view=inbox"');
    expect(html).not.toContain('lens=');
  });

  it('marks the active view with aria-current', () => {
    const anchor = (html: string, href: string) => {
      const m = html.match(new RegExp(`<a[^>]*href="${href.replace(/[?/]/g, (c) => `\\${c}`)}"[^>]*>`));
      return m?.[0] ?? '';
    };
    const inboxHtml = renderToStaticMarkup(<MailboxViewToggle isInbox />);
    expect(anchor(inboxHtml, '/?view=inbox')).toContain('aria-current="page"');
    expect(anchor(inboxHtml, '/')).not.toContain('aria-current');

    const peopleHtml = renderToStaticMarkup(<MailboxViewToggle isInbox={false} />);
    expect(anchor(peopleHtml, '/')).toContain('aria-current="page"');
    expect(anchor(peopleHtml, '/?view=inbox')).not.toContain('aria-current');
  });

  it('keeps 44px minimum touch targets on both pills', () => {
    const html = renderToStaticMarkup(<MailboxViewToggle isInbox />);
    const matches = html.match(/min-h-\[44px\]/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it('is NEVER a positioned overlay — regression for the 2026-10-11 P1 ("Start a new chat" obscured)', () => {
    // The pill used to be `fixed right-3 top-3 z-[60]`: a positioned overlay
    // that sat on top of the inbox hero's "New chat" primary action and
    // intercepted its clicks/taps (automated click refused the hit test; real
    // tap-miss on touch). The fix is structural — in normal document flow an
    // element cannot cover a sibling — so the test pins the absence of every
    // positioning class, not just the old `fixed` one.
    const html = renderToStaticMarkup(<MailboxViewToggle isInbox />);
    const navClass = html.match(/<nav[^>]*class="([^"]*)"/)?.[1] ?? '';
    expect(navClass).not.toContain('fixed');
    expect(navClass).not.toContain('absolute');
    expect(navClass).not.toContain('sticky');
    expect(navClass).not.toContain('z-');
    expect(html).not.toContain('z-[60]');
    expect(html).not.toContain('top-3');
    expect(html).not.toContain('right-3');
  });
});
