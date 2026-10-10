import { describe, it, expect } from 'vitest';
import { htmlToPlainText } from '../htmlToPlainText';

describe('htmlToPlainText — untrusted email HTML to plain text', () => {
  it('passes plain text through unchanged', () => {
    expect(htmlToPlainText('Hello world')).toBe('Hello world');
    expect(htmlToPlainText('')).toBe('');
    expect(htmlToPlainText(null)).toBe('');
    expect(htmlToPlainText(undefined)).toBe('');
  });

  it('strips tags and separates block content with spaces', () => {
    expect(htmlToPlainText('<p>Hello</p><p>World</p>')).toBe('Hello World');
    expect(htmlToPlainText('<div>a</div><div>b</div>')).toBe('a b');
    expect(htmlToPlainText('a<br>b')).toBe('a b');
  });

  it('removes script content entirely (CodeQL: script end-tag variants)', () => {
    expect(htmlToPlainText('<script>alert(1)</script>ok')).toBe('ok');
    // End tag with whitespace — the regex /<script[\s\S]*?<\/script>/ missed this
    expect(htmlToPlainText('<script>alert(1)</script >ok')).toBe('ok');
    expect(htmlToPlainText('<SCRIPT>alert(1)</SCRIPT>ok')).toBe('ok');
    expect(htmlToPlainText('<script type="text/javascript">evil()</script>ok')).toBe('ok');
    // Unterminated script swallows the rest (fail-closed)
    expect(htmlToPlainText('a<script>evil(')).toBe('a');
  });

  it('removes style content entirely', () => {
    expect(htmlToPlainText('<style>.x{color:red}</style>ok')).toBe('ok');
    expect(htmlToPlainText('<STYLE>p{}</STYLE >ok')).toBe('ok');
  });

  it('removes comments and declarations', () => {
    expect(htmlToPlainText('<!-- secret -->visible')).toBe('visible');
    expect(htmlToPlainText('<!DOCTYPE html><p>hi</p>')).toBe('hi');
  });

  it('does not end a tag early on > inside quoted attributes', () => {
    expect(htmlToPlainText('<a title="a>b">x</a>')).toBe('x');
    expect(htmlToPlainText("<a title='a>b'>x</a>")).toBe('x');
  });

  it('decodes entities exactly once (CodeQL: no double-unescaping)', () => {
    expect(htmlToPlainText('&lt;div&gt;')).toBe('<div>');
    expect(htmlToPlainText('a &amp; b')).toBe('a & b');
    // &amp;lt; must decode to literal "&lt;" text — NOT to "<"
    expect(htmlToPlainText('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
    expect(htmlToPlainText('&quot;hi&quot;')).toBe('"hi"');
    expect(htmlToPlainText('it&#39;s')).toBe("it's");
    expect(htmlToPlainText('it&#x27;s')).toBe("it's");
    expect(htmlToPlainText('a&nbsp;b')).toBe('a b');
  });

  it('leaves unknown or malformed entities as literal text', () => {
    expect(htmlToPlainText('&foo;')).toBe('&foo;');
    expect(htmlToPlainText('a & b')).toBe('a & b');
    expect(htmlToPlainText('&;')).toBe('&;');
  });

  it('treats an unterminated < as literal text', () => {
    expect(htmlToPlainText('a < b')).toBe('a < b');
    expect(htmlToPlainText('if x < 3 && y > 4')).toBe('if x < 3 && y > 4');
  });

  it('collapses whitespace', () => {
    expect(htmlToPlainText('<p>  hello\n\n  world </p>')).toBe('hello world');
  });

  it('decodes entity-encoded markup to inert literal text', () => {
    // Decoded once: the output is text, never markup, and safe for
    // text-only rendering.
    expect(htmlToPlainText('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe(
      '<script>alert(1)</script>',
    );
  });
});
