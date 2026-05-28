import { DocumentIngestor } from '../ingestion/document-ingestor.js';
import type { Source } from '../types.js';

describe('DocumentIngestor', () => {
  const ingestor = new DocumentIngestor({ chunkSize: 10, overlap: 2 });

  const source: Source = { id: 'src-1', type: 'pdf', uri: '/test.pdf', title: 'Test PDF' };

  it('chunks text with correct token count', async () => {
    const customIngestor = new DocumentIngestor({
      chunkSize: 10,
      overlap: 2,
      extractors: { pdf: { extract: async () => Array(25).fill('word').join(' ') } },
    });
    const chunks = await customIngestor.ingest(source);
    // 25 tokens, chunk size 10, overlap 2 => step 8 => ceil(25/8) = 4 starts (0,8,16,24)
    expect(chunks.length).toBe(4);
  });

  it('assigns sequential index to chunks', async () => {
    const customIngestor = new DocumentIngestor({
      chunkSize: 10,
      overlap: 2,
      extractors: { pdf: { extract: async () => Array(30).fill('word').join(' ') } },
    });
    const chunks = await customIngestor.ingest(source);
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
    });
  });

  it('sets position metadata based on source type', async () => {
    const pdfChunks = await ingestor.ingest(source);
    expect(pdfChunks[0]!.position.page).toBe(1);

    const audioSource: Source = { id: 'src-2', type: 'audio', uri: '/a.mp3', title: 'Audio' };
    const audioChunks = await ingestor.ingest(audioSource);
    expect(audioChunks[0]!.position.timestamp).toBe(0);
  });

  it('includes overlap between consecutive chunks', async () => {
    const customIngestor = new DocumentIngestor({
      chunkSize: 10,
      overlap: 3,
      extractors: {
        text: {
          extract: async () =>
            Array(20)
              .fill('w')
              .map((_, i) => `w${i}`)
              .join(' '),
        },
      },
    });
    const textSource: Source = { id: 's', type: 'text', uri: '/t.txt', title: 'T' };
    const chunks = await customIngestor.ingest(textSource);
    // Chunk 0: tokens 0-9, Chunk 1: tokens 7-16 (step = 10-3 = 7)
    const c0Words = chunks[0]!.text.split(/\s+/);
    const c1Words = chunks[1]!.text.split(/\s+/);
    const overlap = c0Words.filter((w) => c1Words.includes(w));
    expect(overlap.length).toBeGreaterThanOrEqual(3);
  });
});
