// ============================================================================
// Remote-image consent — QM-UIUX-042
// ============================================================================
// Remote <img> tags in received mail are silent read receipts (sender's server
// learns IP + open timestamp). They must be blocked by default; these tests pin
// the blocking transform, the sender-domain extraction, and the allowlist.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isRemoteImageSrc,
  getSenderDomain,
  getTrustedImageSenders,
  addTrustedImageSender,
  blockRemoteImages,
} from '../lib/email-image-consent';

// Minimal in-memory localStorage for the node test environment.
function stubLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  });
  return store;
}

describe('isRemoteImageSrc', () => {
  it('flags http/https and protocol-relative URLs as remote', () => {
    expect(isRemoteImageSrc('http://evil.test/pixel.gif')).toBe(true);
    expect(isRemoteImageSrc('https://cdn.example.com/img.png')).toBe(true);
    expect(isRemoteImageSrc('//cdn.example.com/img.png')).toBe(true);
    expect(isRemoteImageSrc('  HTTPS://EXAMPLE.COM/X.JPG  ')).toBe(true);
  });

  it('does not flag inline or attached images', () => {
    expect(isRemoteImageSrc('data:image/png;base64,iVBOR')).toBe(false);
    expect(isRemoteImageSrc('cid:logo@company')).toBe(false);
    expect(isRemoteImageSrc('/relative/path.png')).toBe(false);
    expect(isRemoteImageSrc('')).toBe(false);
  });
});

describe('getSenderDomain', () => {
  it('extracts the domain from plain and display-name addresses', () => {
    expect(getSenderDomain('news@shop.example.com')).toBe('shop.example.com');
    expect(getSenderDomain('Shop <NEWS@Shop.Example.COM>')).toBe(
      'shop.example.com',
    );
  });

  it('returns empty for missing or malformed input', () => {
    expect(getSenderDomain('')).toBe('');
    expect(getSenderDomain(undefined)).toBe('');
    expect(getSenderDomain('not-an-address')).toBe('');
  });
});

describe('blockRemoteImages', () => {
  it('replaces remote images with inert placeholders and counts them', () => {
    const html =
      '<p>Hello</p>' +
      '<img src="https://tracker.test/pixel.gif" alt="x">' +
      '<img src="http://cdn.test/a.png">';
    const { html: out, blockedCount } = blockRemoteImages(html);
    expect(blockedCount).toBe(2);
    expect(out).not.toContain('tracker.test');
    expect(out).not.toContain('cdn.test');
    expect(out).toContain('<p>Hello</p>');
    expect(out.match(/qm-blocked-remote-image/g)).toHaveLength(2);
    // Placeholder carries no sender-controlled content and no network target.
    expect(out).not.toContain('src=');
  });

  it('leaves inline data: and cid: images untouched', () => {
    const html =
      '<img src="data:image/png;base64,AAA">' +
      '<img src="cid:logo@co">';
    const { html: out, blockedCount } = blockRemoteImages(html);
    expect(blockedCount).toBe(0);
    expect(out).toBe(html);
  });

  it('handles images without src and uppercase tags', () => {
    const { blockedCount: c1 } = blockRemoteImages('<img alt="no src">');
    expect(c1).toBe(0);
    const { html: out, blockedCount: c2 } = blockRemoteImages(
      '<IMG SRC="https://t.test/p">',
    );
    expect(c2).toBe(1);
    expect(out).toContain('qm-blocked-remote-image');
  });

  it('tolerates > inside quoted attribute values', () => {
    const html = '<img alt="a>b" src="https://t.test/p.png"><p>after</p>';
    const { html: out, blockedCount } = blockRemoteImages(html);
    expect(blockedCount).toBe(1);
    expect(out).toContain('<p>after</p>');
  });

  it('is a no-op on HTML without images', () => {
    const html = '<p>plain <a href="https://x.test">link</a></p>';
    const { html: out, blockedCount } = blockRemoteImages(html);
    expect(blockedCount).toBe(0);
    expect(out).toBe(html);
  });
});

describe('trusted sender allowlist', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    stubLocalStorage();
  });

  it('starts empty and round-trips added domains', () => {
    expect(getTrustedImageSenders()).toEqual([]);
    addTrustedImageSender('Shop.Example.COM');
    expect(getTrustedImageSenders()).toEqual(['shop.example.com']);
  });

  it('dedupes domains', () => {
    addTrustedImageSender('a.test');
    addTrustedImageSender('a.test');
    expect(getTrustedImageSenders()).toEqual(['a.test']);
  });

  it('ignores empty domains and survives corrupt storage', () => {
    addTrustedImageSender('  ');
    expect(getTrustedImageSenders()).toEqual([]);
    stubLocalStorage({ 'qm-trusted-image-senders': 'not-json{{{' });
    expect(getTrustedImageSenders()).toEqual([]);
  });

  it('fails closed when localStorage is unavailable', () => {
    vi.unstubAllGlobals(); // node env: no localStorage at all
    expect(getTrustedImageSenders()).toEqual([]);
    expect(() => addTrustedImageSender('a.test')).not.toThrow();
  });
});
