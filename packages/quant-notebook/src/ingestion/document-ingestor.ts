import type { Source, SourceType, DocumentChunk } from '../types.js';

export interface Extractor {
  extract(uri: string): Promise<string>;
}

const mockExtractors: Record<SourceType, Extractor> = {
  pdf: {
    extract: async (uri) => `PDF content extracted from ${uri}. ` + 'Lorem ipsum '.repeat(300),
  },
  docx: { extract: async (uri) => `DOCX content from ${uri}. ` + 'Document text '.repeat(300) },
  audio: { extract: async (uri) => `Transcript from ${uri}. ` + 'Spoken words '.repeat(300) },
  video: {
    extract: async (uri) => `Video transcript from ${uri}. ` + 'Video content '.repeat(300),
  },
  url: { extract: async (uri) => `Web content from ${uri}. ` + 'Page text '.repeat(300) },
  epub: { extract: async (uri) => `Book content from ${uri}. ` + 'Chapter text '.repeat(300) },
  text: { extract: async (uri) => `Plain text from ${uri}. ` + 'Raw content '.repeat(300) },
};

export class DocumentIngestor {
  private extractors: Record<SourceType, Extractor>;
  /**
   * Number of whitespace-split words per chunk. Note: these are whitespace-delimited words,
   * not BPE/subword tokens. For English text, actual LLM token counts will be roughly 1.3x
   * higher than the word count.
   */
  private chunkSize: number;
  /** Number of overlapping words between consecutive chunks. */
  private overlap: number;

  constructor(options?: {
    extractors?: Partial<Record<SourceType, Extractor>>;
    chunkSize?: number;
    overlap?: number;
  }) {
    this.extractors = { ...mockExtractors, ...options?.extractors };
    this.chunkSize = options?.chunkSize ?? 512;
    this.overlap = options?.overlap ?? 64;
  }

  async ingest(source: Source): Promise<DocumentChunk[]> {
    const text = await this.extractors[source.type].extract(source.uri);
    const tokens = text.split(/\s+/).filter((t) => t.length > 0);
    const chunks: DocumentChunk[] = [];
    let start = 0;
    let index = 0;

    while (start < tokens.length) {
      const end = Math.min(start + this.chunkSize, tokens.length);
      const chunkText = tokens.slice(start, end).join(' ');
      chunks.push({
        id: `${source.id}-chunk-${index}`,
        sourceId: source.id,
        text: chunkText,
        index,
        position: this.buildPosition(source.type, index),
      });
      index++;
      start += this.chunkSize - this.overlap;
    }
    return chunks;
  }

  private buildPosition(type: SourceType, index: number) {
    if (type === 'pdf' || type === 'epub') return { page: index + 1 };
    if (type === 'audio' || type === 'video') return { timestamp: index * 30 };
    return { paragraph: index + 1 };
  }
}
