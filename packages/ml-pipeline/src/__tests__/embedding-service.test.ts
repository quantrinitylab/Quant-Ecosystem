import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EmbeddingService,
  OpenAIEmbeddingBackend,
  TritonEmbeddingBackend,
  type EmbeddingBackend,
  type HttpClient,
} from '../embedding-service';

function createMockOpenAIBackend(): EmbeddingBackend & {
  embed: ReturnType<typeof vi.fn<EmbeddingBackend['embed']>>;
} {
  return {
    embed: vi.fn<EmbeddingBackend['embed']>().mockResolvedValue([new Array(1536).fill(0.1)]),
  };
}

function createMockTritonBackend(): EmbeddingBackend & {
  embed: ReturnType<typeof vi.fn<EmbeddingBackend['embed']>>;
} {
  return {
    embed: vi.fn<EmbeddingBackend['embed']>().mockResolvedValue([new Array(768).fill(0.2)]),
  };
}

function createMockHttpClient(): HttpClient & {
  post: ReturnType<
    typeof vi.fn<(url: string, body: unknown, headers?: Record<string, string>) => Promise<any>>
  >;
} {
  return {
    post: vi.fn<(url: string, body: unknown, headers?: Record<string, string>) => Promise<any>>(),
  };
}

describe('EmbeddingService', () => {
  let openaiBackend: ReturnType<typeof createMockOpenAIBackend>;
  let tritonBackend: ReturnType<typeof createMockTritonBackend>;
  let service: EmbeddingService;

  beforeEach(() => {
    openaiBackend = createMockOpenAIBackend();
    tritonBackend = createMockTritonBackend();
    service = new EmbeddingService(openaiBackend, tritonBackend);
  });

  describe('language routing', () => {
    it('routes English text to OpenAI backend', async () => {
      await service.embed(['Hello world'], 'en');

      expect(openaiBackend.embed).toHaveBeenCalledWith(['Hello world']);
      expect(tritonBackend.embed).not.toHaveBeenCalled();
    });

    it('routes Hindi text to Triton backend', async () => {
      await service.embed(['नमस्ते दुनिया'], 'hi');

      expect(tritonBackend.embed).toHaveBeenCalledWith(['नमस्ते दुनिया']);
      expect(openaiBackend.embed).not.toHaveBeenCalled();
    });

    it('routes Bengali to Triton backend', async () => {
      await service.embed(['হ্যালো'], 'bn');

      expect(tritonBackend.embed).toHaveBeenCalled();
      expect(openaiBackend.embed).not.toHaveBeenCalled();
    });

    it('routes Tamil to Triton backend', async () => {
      await service.embed(['வணக்கம்'], 'ta');

      expect(tritonBackend.embed).toHaveBeenCalled();
      expect(openaiBackend.embed).not.toHaveBeenCalled();
    });

    it('auto-detects Devanagari script and routes to Triton', async () => {
      await service.embed(['यह हिंदी में है']);

      expect(tritonBackend.embed).toHaveBeenCalled();
      expect(openaiBackend.embed).not.toHaveBeenCalled();
    });

    it('auto-detects English and routes to OpenAI', async () => {
      await service.embed(['This is an English sentence']);

      expect(openaiBackend.embed).toHaveBeenCalled();
      expect(tritonBackend.embed).not.toHaveBeenCalled();
    });
  });

  describe('embedBatch', () => {
    it('groups items by language and calls appropriate backends', async () => {
      openaiBackend.embed.mockResolvedValue([new Array(1536).fill(0.1), new Array(1536).fill(0.3)]);
      tritonBackend.embed.mockResolvedValue([new Array(768).fill(0.2)]);

      const results = await service.embedBatch([
        { text: 'Hello', language: 'en' },
        { text: 'नमस्ते', language: 'hi' },
        { text: 'World', language: 'en' },
      ]);

      expect(openaiBackend.embed).toHaveBeenCalledWith(['Hello', 'World']);
      expect(tritonBackend.embed).toHaveBeenCalledWith(['नमस्ते']);
      expect(results).toHaveLength(3);
      // Verify order is preserved
      expect(results[0]![0]).toBe(0.1); // English -> OpenAI first result
      expect(results[1]![0]).toBe(0.2); // Hindi -> Triton
      expect(results[2]![0]).toBe(0.3); // English -> OpenAI second result
    });

    it('handles all-English batch', async () => {
      openaiBackend.embed.mockResolvedValue([new Array(1536).fill(0.1), new Array(1536).fill(0.2)]);

      const results = await service.embedBatch([
        { text: 'Hello', language: 'en' },
        { text: 'World', language: 'en' },
      ]);

      expect(openaiBackend.embed).toHaveBeenCalledTimes(1);
      expect(tritonBackend.embed).not.toHaveBeenCalled();
      expect(results).toHaveLength(2);
    });

    it('handles all-Indic batch', async () => {
      tritonBackend.embed.mockResolvedValue([new Array(768).fill(0.1), new Array(768).fill(0.2)]);

      const results = await service.embedBatch([
        { text: 'नमस्ते', language: 'hi' },
        { text: 'হ্যালো', language: 'bn' },
      ]);

      expect(tritonBackend.embed).toHaveBeenCalledTimes(1);
      expect(openaiBackend.embed).not.toHaveBeenCalled();
      expect(results).toHaveLength(2);
    });
  });

  describe('detectLanguage', () => {
    it('detects Devanagari as Hindi', () => {
      expect(service.detectLanguage('नमस्ते दुनिया')).toBe('hi');
    });

    it('detects Bengali script as Hindi/Indic', () => {
      expect(service.detectLanguage('বাংলা')).toBe('hi');
    });

    it('detects pure ASCII as English', () => {
      expect(service.detectLanguage('Hello world')).toBe('en');
    });

    it('detects mixed text with Indic as Hindi', () => {
      expect(service.detectLanguage('Hello नमस्ते')).toBe('hi');
    });
  });
});

describe('OpenAIEmbeddingBackend', () => {
  it('calls OpenAI API with correct parameters', async () => {
    const httpClient = createMockHttpClient();
    httpClient.post.mockResolvedValue({
      data: [{ embedding: new Array(1536).fill(0.5), index: 0 }],
    });

    const backend = new OpenAIEmbeddingBackend(httpClient, {
      apiKey: 'test-key',
      model: 'text-embedding-3-small',
    });

    const result = await backend.embed(['test text']);

    expect(httpClient.post).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      { input: ['test text'], model: 'text-embedding-3-small' },
      expect.objectContaining({
        Authorization: 'Bearer test-key',
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1536);
  });

  it('sorts results by index', async () => {
    const httpClient = createMockHttpClient();
    httpClient.post.mockResolvedValue({
      data: [
        { embedding: [2], index: 1 },
        { embedding: [1], index: 0 },
      ],
    });

    const backend = new OpenAIEmbeddingBackend(httpClient, { apiKey: 'key' });
    const result = await backend.embed(['a', 'b']);

    expect(result[0]).toEqual([1]);
    expect(result[1]).toEqual([2]);
  });
});

describe('TritonEmbeddingBackend', () => {
  it('calls Triton inference endpoint with correct format', async () => {
    const httpClient = createMockHttpClient();
    const embeddings = new Array(768).fill(0.3);
    httpClient.post.mockResolvedValue({
      outputs: [{ name: 'embeddings', shape: [1, 768], data: embeddings }],
    });

    const backend = new TritonEmbeddingBackend(httpClient, {
      baseUrl: 'http://triton:8000',
    });

    const result = await backend.embed(['test']);

    expect(httpClient.post).toHaveBeenCalledWith(
      'http://triton:8000/v2/models/multilingual-e5/infer',
      expect.objectContaining({
        inputs: expect.arrayContaining([
          expect.objectContaining({ name: 'text', datatype: 'BYTES' }),
        ]),
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(768);
  });

  it('handles batch of multiple texts', async () => {
    const httpClient = createMockHttpClient();
    const flatData = [...new Array(768).fill(0.1), ...new Array(768).fill(0.2)];
    httpClient.post.mockResolvedValue({
      outputs: [{ name: 'embeddings', shape: [2, 768], data: flatData }],
    });

    const backend = new TritonEmbeddingBackend(httpClient, {
      baseUrl: 'http://triton:8000',
    });

    const result = await backend.embed(['text1', 'text2']);

    expect(result).toHaveLength(2);
    expect(result[0]![0]).toBe(0.1);
    expect(result[1]![0]).toBe(0.2);
  });
});
