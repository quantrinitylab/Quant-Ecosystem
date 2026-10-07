// ============================================================================
// Sanitize Utility - Tests
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { sanitizeHtmlContent, sanitizeEmailHtml, sanitizeCodeHighlight } from '../utils/sanitize';

describe('sanitizeHtmlContent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('strips <script> tags and their contents', () => {
    const input = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    const result = sanitizeHtmlContent(input);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
    expect(result).toContain('<p>Hello</p>');
    expect(result).toContain('<p>World</p>');
  });

  it('strips event handler attributes', () => {
    const input = '<img src="x.png" onerror="alert(1)" />';
    const result = sanitizeHtmlContent(input);
    expect(result).not.toContain('onerror');
    expect(result).toContain('src="x.png"');

    const input2 = '<div onload="steal()" onclick="hack()">text</div>';
    const result2 = sanitizeHtmlContent(input2);
    expect(result2).not.toContain('onload');
    expect(result2).not.toContain('onclick');
    expect(result2).toContain('text');
  });

  it('strips javascript: URLs from href attributes', () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeHtmlContent(input);
    expect(result).not.toContain('javascript:');
    expect(result).toContain('click');
  });

  it('allows safe HTML through', () => {
    const input =
      '<p>Text</p><div><span>inline</span></div><a href="https://example.com">link</a><img src="img.png"><strong>bold</strong><em>italic</em><ul><li>item</li></ul><h1>Title</h1><h2>Sub</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6>';
    const result = sanitizeHtmlContent(input);
    expect(result).toContain('<p>Text</p>');
    expect(result).toContain('<div>');
    expect(result).toContain('<span>inline</span>');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<em>italic</em>');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>item</li>');
    expect(result).toContain('<h1>Title</h1>');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeHtmlContent('')).toBe('');
  });

  it('returns empty string when window is undefined (SSR, fail-closed)', () => {
    vi.stubGlobal('window', undefined);
    const input = '<script>alert("xss")</script><p>Safe</p>';
    const result = sanitizeHtmlContent(input);
    expect(result).toBe('');
  });
});

describe('sanitizeEmailHtml', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('strips the img/onerror payload that reaches the mounted thread renderer', () => {
    const result = sanitizeEmailHtml('<img src=x onerror="alert(document.cookie)">');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert');
  });

  it('drops SVG and MathML entirely, not just their handlers', () => {
    const result = sanitizeEmailHtml(
      '<svg onload="alert(1)"><circle r="9"/></svg><math><mi>x</mi></math>',
    );
    expect(result).not.toContain('<svg');
    expect(result).not.toContain('<circle');
    expect(result).not.toContain('<math');
    expect(result).not.toContain('onload');
  });

  it('drops script, iframe, object, embed and style', () => {
    const result = sanitizeEmailHtml(
      '<script>evil()</script><iframe src="https://evil.example"></iframe>' +
        '<object data="x.swf"></object><embed src="y.swf"><style>body{display:none}</style>',
    );
    for (const tag of ['<script', '<iframe', '<object', '<embed', '<style']) {
      expect(result).not.toContain(tag);
    }
    expect(result).not.toContain('evil()');
  });

  it('drops phishing forms and their controls', () => {
    const result = sanitizeEmailHtml(
      '<form action="https://evil.example/steal"><input name="password"><button>Sign in</button></form>',
    );
    expect(result).not.toContain('<form');
    expect(result).not.toContain('<input');
    expect(result).not.toContain('<button');
    expect(result).not.toContain('evil.example');
  });

  it('drops <base>, which would rewrite every relative link in the app shell', () => {
    const result = sanitizeEmailHtml(
      '<base href="https://evil.example/"><a href="/settings">go</a>',
    );
    expect(result).not.toContain('<base');
    expect(result).not.toContain('evil.example');
  });

  it('strips javascript: hrefs', () => {
    const result = sanitizeEmailHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
    expect(result).toContain('click');
  });

  it('hardens surviving links against opener access and referrer leaks', () => {
    const result = sanitizeEmailHtml('<a href="https://example.com/offer">Offer</a>');
    expect(result).toContain('href="https://example.com/offer"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer nofollow"');
  });

  it('makes remote images lazy and referrer-free so a pixel cannot identify the mailbox', () => {
    const result = sanitizeEmailHtml(
      '<img src="https://tracker.example/p.gif" srcset="p2.gif 2x">',
    );
    expect(result).toContain('loading="lazy"');
    expect(result).toContain('decoding="async"');
    expect(result).toContain('referrerpolicy="no-referrer"');
    expect(result).not.toContain('srcset');
  });

  it('keeps the formatting a real message depends on', () => {
    const result = sanitizeEmailHtml(
      '<p>Hi <strong>team</strong>,</p><blockquote>quoted</blockquote>' +
        '<ul><li>one</li></ul><table><tr><td>cell</td></tr></table><br>',
    );
    expect(result).toContain('<strong>team</strong>');
    expect(result).toContain('<blockquote>');
    expect(result).toContain('<li>one</li>');
    expect(result).toContain('<td>cell</td>');
  });

  it('strips data-* attributes', () => {
    const result = sanitizeEmailHtml('<p data-tracking-id="abc123">Hello</p>');
    expect(result).not.toContain('data-tracking-id');
    expect(result).toContain('Hello');
  });

  it('returns empty string when window is undefined (SSR, fail-closed)', () => {
    vi.stubGlobal('window', undefined);
    expect(sanitizeEmailHtml('<script>alert(1)</script><p>Safe</p>')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeEmailHtml('')).toBe('');
  });
});

describe('sanitizeCodeHighlight', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('allows <span> with class attribute', () => {
    const input = '<span class="token keyword">const</span>';
    const result = sanitizeCodeHighlight(input);
    expect(result).toBe('<span class="token keyword">const</span>');
  });

  it('allows <br> tags', () => {
    const input = 'line1<br>line2';
    const result = sanitizeCodeHighlight(input);
    expect(result).toContain('<br>');
    expect(result).toContain('line1');
    expect(result).toContain('line2');
  });

  it('strips all other tags (div, script, a, img)', () => {
    const input = '<div>text</div><script>alert(1)</script><a href="x">link</a><img src="y">';
    const result = sanitizeCodeHighlight(input);
    expect(result).not.toContain('<div');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('<a');
    expect(result).not.toContain('<img');
    expect(result).toContain('text');
    expect(result).toContain('link');
  });

  it('strips non-class attributes from span', () => {
    const input = '<span class="hl" style="color:red" onclick="x()" id="s1">code</span>';
    const result = sanitizeCodeHighlight(input);
    expect(result).toContain('class="hl"');
    expect(result).not.toContain('style=');
    expect(result).not.toContain('onclick=');
    expect(result).not.toContain('id=');
    expect(result).toContain('code');
  });

  it('returns empty string when window is undefined (SSR, fail-closed)', () => {
    vi.stubGlobal('window', undefined);
    const input = '<script>evil</script><span class="x">safe</span>';
    const result = sanitizeCodeHighlight(input);
    expect(result).toBe('');
  });
});
