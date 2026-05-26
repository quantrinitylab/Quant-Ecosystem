import { describe, it, expect } from 'vitest';
import { ExportService } from '../services/export.service';

describe('ExportService', () => {
  const service = new ExportService();
  const sampleDoc = {
    title: 'Test Doc',
    content: '<h1>Title</h1><p>Content</p>',
  };

  describe('exportToMarkdown', () => {
    it('produces markdown with # heading', () => {
      const result = service.exportToMarkdown(sampleDoc);

      expect(result).toContain('# Test Doc');
      expect(result).toContain('Content');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('converts HTML tags to markdown', () => {
      const doc = {
        title: 'My Doc',
        content: '<h2>Section</h2><p>A paragraph with <strong>bold</strong> text.</p>',
      };

      const result = service.exportToMarkdown(doc);

      expect(result).toContain('## Section');
      expect(result).toContain('**bold**');
    });
  });

  describe('exportToHtml', () => {
    it('wraps in a complete HTML document', () => {
      const result = service.exportToHtml(sampleDoc);

      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<html');
      expect(result).toContain('</html>');
      expect(result).toContain('<title>Test Doc</title>');
      expect(result).toContain('<h1>Title</h1><p>Content</p>');
    });

    it('escapes title in HTML', () => {
      const doc = { title: 'Doc <script>', content: '<p>Safe</p>' };
      const result = service.exportToHtml(doc);

      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });
  });

  describe('exportToPdf', () => {
    it('returns a Buffer', () => {
      const result = service.exportToPdf(sampleDoc);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('contains PDF header', () => {
      const result = service.exportToPdf(sampleDoc);
      const content = result.toString('utf-8');

      expect(content).toContain('%PDF');
    });
  });

  describe('exportToDocx', () => {
    it('returns a Buffer', () => {
      const result = service.exportToDocx(sampleDoc);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('contains XML document structure', () => {
      const result = service.exportToDocx(sampleDoc);
      const content = result.toString('utf-8');

      expect(content).toContain('<?xml');
      expect(content).toContain('w:document');
      expect(content).toContain('Test Doc');
    });
  });

  describe('exportToLatex', () => {
    it('has documentclass', () => {
      const result = service.exportToLatex(sampleDoc);

      expect(result).toContain('\\documentclass');
      expect(result).toContain('\\begin{document}');
      expect(result).toContain('\\end{document}');
      expect(result).toContain('Test Doc');
    });

    it('includes maketitle command', () => {
      const result = service.exportToLatex(sampleDoc);

      expect(result).toContain('\\maketitle');
    });
  });
});
