import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownRenderer, sanitizeMarkdownHref } from '../components/MarkdownRenderer';

describe('sanitizeMarkdownHref (XSS defense)', () => {
  it('allows http and https URLs', () => {
    expect(sanitizeMarkdownHref('https://example.com')).toBe('https://example.com');
    expect(sanitizeMarkdownHref('http://example.com/path?q=1')).toBe('http://example.com/path?q=1');
    expect(sanitizeMarkdownHref('HTTPS://EXAMPLE.COM')).toBe('HTTPS://EXAMPLE.COM');
  });

  it('allows mailto links', () => {
    expect(sanitizeMarkdownHref('mailto:user@example.com')).toBe('mailto:user@example.com');
  });

  it('allows relative URLs and fragments', () => {
    expect(sanitizeMarkdownHref('/docs/guide')).toBe('/docs/guide');
    expect(sanitizeMarkdownHref('#section')).toBe('#section');
  });

  it('rejects javascript: URLs (case-insensitive)', () => {
    expect(sanitizeMarkdownHref('javascript:alert(1)')).toBeNull();
    expect(sanitizeMarkdownHref('JaVaScRiPt:alert(document.cookie)')).toBeNull();
    expect(sanitizeMarkdownHref('  javascript:void(0)  ')).toBeNull();
  });

  it('rejects data: URLs', () => {
    expect(sanitizeMarkdownHref('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejects vbscript: URLs', () => {
    expect(sanitizeMarkdownHref('vbscript:msgbox(1)')).toBeNull();
  });

  it('rejects other exotic schemes', () => {
    expect(sanitizeMarkdownHref('file:///etc/passwd')).toBeNull();
    expect(sanitizeMarkdownHref('ftp://example.com')).toBeNull();
  });

  it('rejects empty input', () => {
    expect(sanitizeMarkdownHref('')).toBeNull();
    expect(sanitizeMarkdownHref('   ')).toBeNull();
  });
});

describe('MarkdownRenderer link XSS', () => {
  it('renders safe links as anchors', () => {
    const html = renderToStaticMarkup(
      React.createElement(MarkdownRenderer, {
        content: '[click me](https://example.com)',
      }),
    );
    expect(html).toContain('<a');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('click me');
  });

  it('never renders javascript: URLs as anchors', () => {
    const html = renderToStaticMarkup(
      React.createElement(MarkdownRenderer, {
        content: '[pwned](javascript:alert(document.cookie))',
      }),
    );
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a');
    // Link text still visible, but not clickable
    expect(html).toContain('pwned');
  });

  it('never renders data: URLs as anchors', () => {
    const html = renderToStaticMarkup(
      React.createElement(MarkdownRenderer, {
        content: '[x](data:text/html;base64,PHNjcmlwdD4=)',
      }),
    );
    expect(html).not.toContain('data:text/html');
    expect(html).not.toContain('<a');
  });

  it('handles mixed safe and unsafe links in one paragraph', () => {
    const html = renderToStaticMarkup(
      React.createElement(MarkdownRenderer, {
        content: '[good](https://a.com) and [bad](javascript:alert(1))',
      }),
    );
    expect(html).toContain('href="https://a.com"');
    expect(html).not.toContain('javascript:');
    // Exactly one anchor
    expect((html.match(/<a /g) ?? []).length).toBe(1);
  });
});
