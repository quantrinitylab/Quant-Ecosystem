// ============================================================================
// Content Extractor - Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { ContentExtractor } from './content-extractor';

describe('ContentExtractor', () => {
  let extractor: ContentExtractor;

  beforeEach(() => {
    extractor = new ContentExtractor();
  });

  describe('extractPdfText', () => {
    it('should extract text from BT/ET markers with Tj operator', async () => {
      const pdfContent = 'some binary BT (Hello World) Tj ET more binary';
      const buffer = Buffer.from(pdfContent, 'latin1');
      const result = await extractor.extractPdfText(buffer);
      expect(result).toBe('Hello World');
    });

    it('should extract text from TJ array operator', async () => {
      const pdfContent = 'BT [(Hello) 10 (World)] TJ ET';
      const buffer = Buffer.from(pdfContent, 'latin1');
      const result = await extractor.extractPdfText(buffer);
      expect(result).toBe('Hello World');
    });

    it('should extract multiple text segments', async () => {
      const pdfContent = 'BT (First) Tj ET other BT (Second) Tj ET';
      const buffer = Buffer.from(pdfContent, 'latin1');
      const result = await extractor.extractPdfText(buffer);
      expect(result).toBe('First Second');
    });

    it('should return empty string for empty buffer', async () => {
      const buffer = Buffer.alloc(0);
      const result = await extractor.extractPdfText(buffer);
      expect(result).toBe('');
    });

    it('should fallback to printable text extraction when no BT/ET markers', async () => {
      const pdfContent = 'binary\x00\x01\x02This is readable text content\x00\x01more binary';
      const buffer = Buffer.from(pdfContent, 'latin1');
      const result = await extractor.extractPdfText(buffer);
      expect(result).toContain('This is readable text content');
    });

    it('should filter out font name entries in fallback', async () => {
      const pdfContent =
        '\x00\x01/BaseFont /TimesNewRomanPSMT\x00\x01\x02This is real document content\x00';
      const buffer = Buffer.from(pdfContent, 'latin1');
      const result = await extractor.extractPdfText(buffer);
      expect(result).not.toContain('BaseFont');
      expect(result).not.toContain('TimesNewRomanPSMT');
      expect(result).toContain('This is real document content');
    });

    it('should filter out encoding entries in fallback', async () => {
      const pdfContent = '\x00/Encoding /WinAnsiEncoding\x00\x01Actual readable sentence here\x00';
      const buffer = Buffer.from(pdfContent, 'latin1');
      const result = await extractor.extractPdfText(buffer);
      expect(result).not.toContain('WinAnsiEncoding');
      expect(result).not.toContain('Encoding');
      expect(result).toContain('Actual readable sentence here');
    });

    it('should filter out mostly-digit runs in fallback', async () => {
      const pdfContent = '\x00\x010000000015 00000 n\x00\x01\x02The document text is here\x00';
      const buffer = Buffer.from(pdfContent, 'latin1');
      const result = await extractor.extractPdfText(buffer);
      expect(result).not.toContain('0000000015');
      expect(result).toContain('The document text is here');
    });

    it('should reject short runs below 8 characters in fallback', async () => {
      const pdfContent = '\x00\x01abcd\x00\x01\x02Longer meaningful text here\x00';
      const buffer = Buffer.from(pdfContent, 'latin1');
      const result = await extractor.extractPdfText(buffer);
      expect(result).not.toContain('abcd');
      expect(result).toContain('Longer meaningful text here');
    });

    it('should handle errors gracefully', async () => {
      const result = await extractor.extractPdfText(null as unknown as Buffer);
      expect(result).toBe('');
    });
  });

  describe('extractImageText', () => {
    it('should return empty string for v1 (OCR placeholder)', async () => {
      const buffer = Buffer.from('fake image data');
      const result = await extractor.extractImageText(buffer);
      expect(result).toBe('');
    });

    it('should return empty string for any buffer', async () => {
      const buffer = Buffer.alloc(1024);
      const result = await extractor.extractImageText(buffer);
      expect(result).toBe('');
    });
  });

  describe('extractVideoTranscript', () => {
    it('should strip bracketed timestamps', async () => {
      const transcript = '[00:01:23] Hello world [00:01:30] How are you';
      const result = await extractor.extractVideoTranscript(transcript);
      expect(result).toBe('Hello world How are you');
    });

    it('should strip parenthesized timestamps', async () => {
      const transcript = '(00:01:23) Hello world (00:01:30) How are you';
      const result = await extractor.extractVideoTranscript(transcript);
      expect(result).toBe('Hello world How are you');
    });

    it('should strip standalone timestamps at line starts', async () => {
      const transcript = '00:01:23 Hello world\n00:01:30 How are you';
      const result = await extractor.extractVideoTranscript(transcript);
      expect(result).toBe('Hello world How are you');
    });

    it('should handle short timestamps like 1:23', async () => {
      const transcript = '[1:23] Short timestamp';
      const result = await extractor.extractVideoTranscript(transcript);
      expect(result).toBe('Short timestamp');
    });

    it('should join multiple lines into single text', async () => {
      const transcript = 'Line one\nLine two\nLine three';
      const result = await extractor.extractVideoTranscript(transcript);
      expect(result).toBe('Line one Line two Line three');
    });

    it('should return empty string for empty input', async () => {
      const result = await extractor.extractVideoTranscript('');
      expect(result).toBe('');
    });

    it('should return empty string for whitespace-only input', async () => {
      const result = await extractor.extractVideoTranscript('   ');
      expect(result).toBe('');
    });

    it('should handle errors gracefully', async () => {
      const result = await extractor.extractVideoTranscript(null as unknown as string);
      expect(result).toBe('');
    });
  });
});
