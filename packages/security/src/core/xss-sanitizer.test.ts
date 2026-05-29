import { describe, it, expect, beforeEach } from 'vitest';
import { XSSSanitizer } from './xss-sanitizer';

describe('XSSSanitizer', () => {
  let sanitizer: XSSSanitizer;

  beforeEach(() => {
    sanitizer = new XSSSanitizer();
  });

  describe('sanitize', () => {
    it('returns an empty clean result for non-string / empty input', () => {
      const result = sanitizer.sanitize('');
      expect(result.clean).toBe('');
      expect(result.modified).toBe(false);
      expect(result.threats).toEqual([]);
      expect(result.score).toBe(0);
    });

    it('strips <script> tags and their contents', () => {
      const result = sanitizer.sanitize('<p>hi</p><script>alert("x")</script>');
      expect(result.clean).not.toContain('<script');
      expect(result.clean).not.toContain('alert');
      expect(result.modified).toBe(true);
    });

    it('detects a critical threat and assigns a non-zero score', () => {
      const result = sanitizer.sanitize('<script>evil()</script>');
      expect(result.threats.some((t) => t.type === 'script_tag')).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(10);
    });

    it('removes inline event handlers', () => {
      const result = sanitizer.sanitize('<div onclick="steal()">x</div>');
      expect(result.clean).not.toMatch(/onclick/i);
    });

    it('removes iframe tags', () => {
      const result = sanitizer.sanitize('<iframe src="http://evil"></iframe>safe');
      expect(result.clean).not.toContain('<iframe');
      expect(result.clean).toContain('safe');
    });

    it('truncates input beyond maxInputLength', () => {
      const small = new XSSSanitizer({ maxInputLength: 10 });
      const result = small.sanitize('a'.repeat(50));
      expect(result.clean.length).toBeLessThanOrEqual(10);
    });

    it('strips HTML comments when stripComments is enabled', () => {
      const result = sanitizer.sanitize('<!-- secret -->visible');
      expect(result.clean).not.toContain('secret');
      expect(result.clean).toContain('visible');
    });
  });

  describe('sanitizeUrl', () => {
    it('allows http/https/mailto protocols', () => {
      expect(sanitizer.sanitizeUrl('https://example.com')).toBe('https://example.com');
      expect(sanitizer.sanitizeUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
    });

    it('blocks javascript: URLs (including obfuscated)', () => {
      expect(sanitizer.sanitizeUrl('javascript:alert(1)')).toBe('');
      expect(sanitizer.sanitizeUrl('j a v a s c r i p t:alert(1)')).toBe('');
    });

    it('blocks vbscript: and disallowed protocols', () => {
      expect(sanitizer.sanitizeUrl('vbscript:msgbox(1)')).toBe('');
      expect(sanitizer.sanitizeUrl('ftp://host/file')).toBe('');
    });

    it('blocks data: URLs when blockDataUrls is set', () => {
      expect(sanitizer.sanitizeUrl('data:text/html,<script>')).toBe('');
    });

    it('returns empty string for non-string input', () => {
      expect(sanitizer.sanitizeUrl('')).toBe('');
    });
  });

  describe('encodeHTML / decodeHTML', () => {
    it('encodes dangerous characters', () => {
      expect(sanitizer.encodeHTML('<b>&"')).toBe('&lt;b&gt;&amp;&quot;');
    });

    it('round-trips named and numeric entities', () => {
      const encoded = sanitizer.encodeHTML('<a>');
      expect(sanitizer.decodeHTML(encoded)).toBe('<a>');
      expect(sanitizer.decodeHTML('&#65;&#x42;')).toBe('AB');
    });

    it('returns empty string for empty input', () => {
      expect(sanitizer.encodeHTML('')).toBe('');
      expect(sanitizer.decodeHTML('')).toBe('');
    });
  });

  describe('detectThreats / isClean', () => {
    it('reports clean for benign input', () => {
      expect(sanitizer.isClean('hello world')).toBe(true);
      expect(sanitizer.detectThreats('hello world')).toEqual([]);
    });

    it('flags multiple threat patterns', () => {
      const threats = sanitizer.detectThreats('<script> javascript: <iframe>');
      const types = threats.map((t) => t.type);
      expect(types).toContain('script_tag');
      expect(types).toContain('javascript_protocol');
      expect(sanitizer.isClean('<script>')).toBe(false);
    });
  });

  describe('threat log + stats', () => {
    it('accumulates threats in the log and reports stats by severity', () => {
      sanitizer.sanitize('<script>a()</script>');
      sanitizer.sanitize('<iframe></iframe>');
      const log = sanitizer.getThreatLog();
      expect(log.length).toBeGreaterThanOrEqual(2);

      const stats = sanitizer.getStats();
      expect(stats.totalThreats).toBe(log.length);
      expect(stats.bySeverity.critical).toBeGreaterThanOrEqual(1);
    });

    it('clears the threat log', () => {
      sanitizer.sanitize('<script>a()</script>');
      sanitizer.clearThreatLog();
      expect(sanitizer.getThreatLog()).toEqual([]);
      expect(sanitizer.getStats().totalThreats).toBe(0);
    });
  });
});
