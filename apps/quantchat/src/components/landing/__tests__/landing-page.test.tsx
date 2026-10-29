// ============================================================================
// QuantChat — Phase 0 landing page tests
//
// Uses react-dom/server (no @testing-library dependency in this app) to
// render the landing to static HTML and assert the Phase 0 contract:
// correct CTAs, honest privacy copy (E2EE explicitly NOT live, and no
// affirmative E2EE-live claim anywhere), legal links, no <img> tags
// (CSS-only illustrations), and a TBD download section with no invented
// store URLs.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingPage, REGISTER_URL } from '../LandingPage';

function html(): string {
  return renderToStaticMarkup(<LandingPage />);
}

describe('LandingPage (Phase 0 public homepage)', () => {
  it('renders the hero headline', () => {
    expect(html()).toContain('Say it with the camera.');
  });

  it('explains what QuantChat is and the one-Quant-ID story', () => {
    const h = html();
    expect(h).toContain('camera-first messaging');
    expect(h).toContain('QuantMail');
  });

  it('Sign in points at /login', () => {
    expect(html()).toContain('href="/login"');
  });

  it('Create account points at the QuantMail register URL (same as LoginPage)', () => {
    expect(REGISTER_URL).toBe('https://quantmail.in/register');
    expect(html()).toContain(`href="${REGISTER_URL}"`);
  });

  it('states the privacy status honestly: server-stored today, E2EE not enabled', () => {
    const h = html();
    expect(h).toContain('Messages are stored on QuantChat servers in readable form');
    expect(h).toContain('End-to-end encryption is not enabled');
  });

  it('never claims E2EE is live — not in copy, not in comments rendered to HTML', () => {
    const h = html();
    const forbidden = [
      /fully end-to-end encrypted/i,
      /messages are end-to-end encrypted/i,
      /E2EE is (live|enabled)/i,
      /end-to-end encrypted by default/i,
      /we can'?t read your messages/i,
      /only you (and|&) .* can read/i,
    ];
    for (const pattern of forbidden) {
      expect(h, `forbidden claim matching ${pattern}`).not.toMatch(pattern);
    }
  });

  it('links Terms, Privacy and Support', () => {
    const h = html();
    expect(h).toContain('href="/terms"');
    expect(h).toContain('href="/privacy"');
    expect(h).toContain('href="/support"');
  });

  it('covers the safety surface: reporting, blocking, data download, account delete', () => {
    const h = html();
    expect(h).toContain('Report');
    expect(h).toContain('Block');
    expect(h).toContain('Download a copy');
    expect(h).toContain('Delete your account');
  });

  it('uses no <img> tags — illustrations are CSS-only', () => {
    expect(html()).not.toContain('<img');
  });

  it('marks downloads TBD and invents no store URLs', () => {
    const h = html();
    expect(h).toContain('TBD');
    expect(h).toContain('Verified store links will appear here');
    expect(h).not.toContain('apps.apple.com');
    expect(h).not.toContain('play.google.com');
  });

  it('includes the anti-phishing note in the download section', () => {
    expect(html()).toContain('never ask you to install the app from a link sent by a stranger');
  });

  it('repeats the honest privacy status in the footer', () => {
    const h = html();
    expect(h).toContain('End-to-end encryption is not enabled yet');
  });
});
