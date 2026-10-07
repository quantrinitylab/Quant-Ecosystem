// ============================================================================
// Content Extractor - PDF, Image OCR, and Video Transcript extraction
// ============================================================================

/**
 * ContentExtractor - Extracts searchable text from binary content types
 *
 * Provides extraction methods for PDFs (heuristic text marker parsing),
 * images (OCR placeholder for Tesseract WASM), and video transcripts
 * (timestamp stripping and segment joining).
 *
 * All methods handle errors gracefully, returning empty strings on failure.
 */
export class ContentExtractor {
  /**
   * Extract text content from a PDF buffer using basic heuristic parsing.
   * Splits on text stream markers (BT/ET), strips binary content, and
   * extracts readable text segments.
   */
  async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      if (!buffer || buffer.length === 0) {
        return '';
      }

      const raw = buffer.toString('latin1');

      // Look for text between BT (Begin Text) and ET (End Text) markers
      const textSegments: string[] = [];
      const btEtRegex = /BT([\s\S]*?)ET/g;
      let match: RegExpExecArray | null;

      while ((match = btEtRegex.exec(raw)) !== null) {
        const segment = match[1];
        if (!segment) continue;

        // Extract text from Tj and TJ operators
        const tjRegex = /\(([^()]*)\)\s*Tj/g;
        let tjMatch: RegExpExecArray | null;
        while ((tjMatch = tjRegex.exec(segment)) !== null) {
          if (tjMatch[1]) {
            textSegments.push(tjMatch[1]);
          }
        }

        // Extract text from TJ arrays
        const tjArrayRegex = /\[([^\[\]]*)\]\s*TJ/g;
        let tjArrayMatch: RegExpExecArray | null;
        while ((tjArrayMatch = tjArrayRegex.exec(segment)) !== null) {
          const arrayContent = tjArrayMatch[1];
          if (!arrayContent) continue;
          const stringRegex = /\(([^()]*)\)/g;
          let strMatch: RegExpExecArray | null;
          while ((strMatch = stringRegex.exec(arrayContent)) !== null) {
            if (strMatch[1]) {
              textSegments.push(strMatch[1]);
            }
          }
        }
      }

      // If no BT/ET markers found, try to extract any printable text runs
      if (textSegments.length === 0) {
        const printableRegex = /[\x20-\x7E]{8,}/g;
        let printableMatch: RegExpExecArray | null;
        while ((printableMatch = printableRegex.exec(raw)) !== null) {
          const text = printableMatch[0].trim();
          if (!text || text.length < 8) continue;

          // Filter out common PDF structure tokens
          if (text.match(/^(obj|endobj|stream|endstream|xref|trailer|startxref)$/)) {
            continue;
          }

          // Filter out PDF structural patterns: font names, encoding entries
          if (
            /\/BaseFont/i.test(text) ||
            /\/Encoding/i.test(text) ||
            /\/Font/i.test(text) ||
            /\/Type\s/i.test(text) ||
            /\/Subtype\s/i.test(text) ||
            /\/Filter\s/i.test(text) ||
            /\/Length\s/i.test(text) ||
            /WinAnsiEncoding/i.test(text) ||
            /MacRomanEncoding/i.test(text) ||
            /Identity-H/i.test(text)
          ) {
            continue;
          }

          // Reject runs that are mostly digits (>70% digit characters)
          const digitCount = (text.match(/\d/g) || []).length;
          if (digitCount / text.length > 0.7) {
            continue;
          }

          // Reject common PDF cross-reference patterns (e.g. "0000000015 00000 n")
          if (/^\d{10}\s\d{5}\s[nf]$/.test(text)) {
            continue;
          }

          textSegments.push(text);
        }
      }

      return textSegments.join(' ').trim();
    } catch {
      return '';
    }
  }

  /**
   * Extract text from an image buffer via OCR.
   * v1: Returns empty string. TODO: Integrate Tesseract WASM for browser/Node OCR.
   */
  async extractImageText(_buffer: Buffer): Promise<string> {
    // TODO: Integrate Tesseract WASM for image OCR in a future version
    return '';
  }

  /**
   * Normalize a video transcript for indexing.
   * Strips timestamps (e.g., [00:01:23], 00:01:23, (00:01:23)) and joins segments.
   */
  async extractVideoTranscript(transcriptText: string): Promise<string> {
    try {
      if (!transcriptText || !transcriptText.trim()) {
        return '';
      }

      // Strip timestamp patterns: [00:01:23], (00:01:23), 00:01:23 --, etc.
      let cleaned = transcriptText;

      // Remove bracketed timestamps: [00:01:23] or [1:23]
      cleaned = cleaned.replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, '');

      // Remove parenthesized timestamps: (00:01:23)
      cleaned = cleaned.replace(/\(\d{1,2}:\d{2}(?::\d{2})?\)/g, '');

      // Remove standalone timestamps at line starts: 00:01:23 or 1:23
      cleaned = cleaned.replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*[-–]?\s*/gm, '');

      // Remove HTML comment end tags and arrow/dash separators after timestamps
      cleaned = cleaned.replace(/--!?>/g, '');

      // Normalize whitespace: collapse multiple spaces and newlines
      cleaned = cleaned.replace(/\n+/g, ' ');
      cleaned = cleaned.replace(/\s{2,}/g, ' ');

      return cleaned.trim();
    } catch {
      return '';
    }
  }
}
