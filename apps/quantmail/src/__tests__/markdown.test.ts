// ============================================================================
// Reader Markdown rendering — Tests
// ============================================================================
//
// `renderMarkdownBlocks` is the pure, DOM-free half of the reader's Markdown
// pipeline (Markdown → HTML), so it runs under the default node environment.
// The DOMPurify half (`renderMarkdownToSafeHtml`) needs a browser DOM, which
// this workspace's vitest config does not provide — its only node-observable
// behavior is the SSR fail-closed contract, asserted here.

import { describe, it, expect } from 'vitest';
import {
  extractTextFromHtml,
  isPlainWrapperHtml,
  looksLikeMarkdown,
  renderMarkdownBlocks,
  renderMarkdownToSafeHtml,
} from '../lib/markdown';

describe('looksLikeMarkdown', () => {
  it('detects bold markers', () => {
    expect(looksLikeMarkdown('Please review the **attached report** today.')).toBe(true);
    expect(looksLikeMarkdown('Please review the __attached report__ today.')).toBe(true);
  });

  it('detects headings, links, fences and lists', () => {
    expect(looksLikeMarkdown('# Sprint review\nNotes here')).toBe(true);
    expect(looksLikeMarkdown('See [the docs](https://example.com) for more')).toBe(true);
    expect(looksLikeMarkdown('```js\nconst x = 1;\n```')).toBe(true);
    expect(looksLikeMarkdown('- first\n- second')).toBe(true);
    expect(looksLikeMarkdown('1. first\n2. second')).toBe(true);
  });

  it('does not fire on plain prose with stray asterisks or underscores', () => {
    expect(looksLikeMarkdown('Compute 2 * 3 = 6 and ship it.')).toBe(false);
    expect(looksLikeMarkdown('Rename call_mom_later to call_mom_now.')).toBe(false);
    expect(looksLikeMarkdown('Just a normal sentence, nothing fancy.')).toBe(false);
    expect(looksLikeMarkdown('')).toBe(false);
  });
});

describe('renderMarkdownBlocks', () => {
  it('renders bold and italic without leaving marker characters', () => {
    const html = renderMarkdownBlocks('This is **bold** and *italic* text.');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).not.toContain('**');
  });

  it('renders headings and rules', () => {
    const html = renderMarkdownBlocks('# Title\n\n---\n\nBody');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<hr>');
  });

  it('renders lists', () => {
    const html = renderMarkdownBlocks('- alpha\n- beta\n\n1. one\n2. two');
    expect(html).toContain('<ul><li>alpha</li><li>beta</li></ul>');
    expect(html).toContain('<ol><li>one</li><li>two</li></ol>');
  });

  it('renders fenced code blocks without interpreting their contents', () => {
    const html = renderMarkdownBlocks('```\nconst a = **not bold**;\n```');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('**not bold**');
    expect(html).not.toContain('<strong>');
  });

  it('renders inline code spans', () => {
    const html = renderMarkdownBlocks('Run `npm test` now.');
    expect(html).toContain('<code>npm test</code>');
  });

  it('renders markdown links and autolinks', () => {
    const html = renderMarkdownBlocks('See [docs](https://example.com) or <https://a.io>.');
    expect(html).toContain('<a href="https://example.com">docs</a>');
    expect(html).toContain('<a href="https://a.io">https://a.io</a>');
  });

  it('drops javascript: link targets instead of emitting them', () => {
    const html = renderMarkdownBlocks('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a ');
    expect(html).toContain('click');
  });

  it('escapes raw HTML in the source before any transform runs', () => {
    const html = renderMarkdownBlocks('<script>alert(1)</script>\n\n**hi**');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>hi</strong>');
  });

  it('keeps single newlines as line breaks inside a paragraph', () => {
    const html = renderMarkdownBlocks('line one\nline two');
    expect(html).toContain('line one<br>line two');
  });
});

describe('renderMarkdownToSafeHtml', () => {
  it('fails closed without a DOM (SSR contract)', () => {
    // Under the node test environment there is no window, so the sanitizer
    // cannot run and the reader must fall back to pre-wrap plain text.
    expect(renderMarkdownToSafeHtml('**hi**')).toBe('');
    expect(renderMarkdownToSafeHtml('')).toBe('');
    expect(renderMarkdownToSafeHtml('   ')).toBe('');
  });
});

describe('extractTextFromHtml', () => {
  it('fails closed without a DOM (SSR contract)', () => {
    // Under the node test environment there is no document, so text
    // extraction cannot run — the reader falls back to the plain-text body.
    expect(extractTextFromHtml('<p>**bold** and normal</p>')).toBe('');
    expect(extractTextFromHtml('')).toBe('');
    expect(extractTextFromHtml(undefined)).toBe('');
  });
});

describe('isPlainWrapperHtml', () => {
  it('accepts composer-style plain wrappers', () => {
    expect(isPlainWrapperHtml('<p>**bold**</p>')).toBe(true);
    expect(isPlainWrapperHtml('<p>a</p><p>b<br />c</p>')).toBe(true);
    expect(isPlainWrapperHtml('<div><p>hi</p></div>')).toBe(true);
    expect(isPlainWrapperHtml('')).toBe(true);
    expect(isPlainWrapperHtml(undefined)).toBe(true);
  });

  it('rejects genuinely formatted HTML', () => {
    expect(isPlainWrapperHtml('<p><strong>bold</strong></p>')).toBe(false);
    expect(isPlainWrapperHtml('<p>see <a href="https://x.com">this</a></p>')).toBe(false);
    expect(isPlainWrapperHtml('<ul><li>a</li></ul>')).toBe(false);
    expect(isPlainWrapperHtml('<h1>Title</h1>')).toBe(false);
  });
});
