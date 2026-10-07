// ============================================================================
// Embedding Service - Multi-backend embedding with language routing
// ============================================================================

export interface EmbeddingBackend {
  embed(texts: string[]): Promise<number[][]>;
}

export interface HttpClient {
  post<T>(url: string, body: unknown, headers?: Record<string, string>): Promise<T>;
}

export interface OpenAIEmbeddingConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

interface OpenAIEmbeddingResponse {
  data: { embedding: number[]; index: number }[];
}

export class OpenAIEmbeddingBackend implements EmbeddingBackend {
  private readonly httpClient: HttpClient;
  private readonly config: Required<OpenAIEmbeddingConfig>;

  constructor(httpClient: HttpClient, config: OpenAIEmbeddingConfig) {
    this.httpClient = httpClient;
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? 'https://api.openai.com/v1',
      model: config.model ?? 'text-embedding-3-small',
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const url = `${this.config.baseUrl}/embeddings`;
    const body = {
      input: texts,
      model: this.config.model,
    };
    const headers = {
      Authorization: `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };

    const response = await this.httpClient.post<OpenAIEmbeddingResponse>(url, body, headers);

    // Sort by index to maintain order
    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    return sorted.map((d) => d.embedding);
  }

  getDimension(): number {
    return 1536;
  }
}

export interface TritonEmbeddingConfig {
  baseUrl: string;
  modelName?: string;
}

interface TritonInferResponse {
  outputs: { name: string; shape: number[]; data: number[] }[];
}

export class TritonEmbeddingBackend implements EmbeddingBackend {
  private readonly httpClient: HttpClient;
  private readonly config: Required<TritonEmbeddingConfig>;

  constructor(httpClient: HttpClient, config: TritonEmbeddingConfig) {
    this.httpClient = httpClient;
    this.config = {
      baseUrl: config.baseUrl,
      modelName: config.modelName ?? 'multilingual-e5',
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const url = `${this.config.baseUrl}/v2/models/${this.config.modelName}/infer`;

    // Encode texts as bytes for Triton
    const inputData = texts.map((t) => Array.from(new TextEncoder().encode(t)));

    const body = {
      inputs: [
        {
          name: 'text',
          shape: [texts.length, 1],
          datatype: 'BYTES',
          data: inputData,
        },
      ],
      outputs: [{ name: 'embeddings' }],
    };

    const response = await this.httpClient.post<TritonInferResponse>(url, body);

    // Reshape flat output into per-text embeddings (768-dim each)
    const dimension = 768;
    const embeddings: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      const start = i * dimension;
      embeddings.push(response.outputs[0]!.data.slice(start, start + dimension));
    }

    return embeddings;
  }

  getDimension(): number {
    return 768;
  }
}

export interface EmbeddingItem {
  text: string;
  language?: string;
}

export class EmbeddingService {
  private readonly openaiBackend: EmbeddingBackend;
  private readonly tritonBackend: EmbeddingBackend;

  constructor(openaiBackend: EmbeddingBackend, tritonBackend: EmbeddingBackend) {
    this.openaiBackend = openaiBackend;
    this.tritonBackend = tritonBackend;
  }

  async embed(texts: string[], language?: string): Promise<number[][]> {
    if (language) {
      // Explicit language provided: route all texts to a single backend
      const backend = this.routeToBackend(language);
      return backend.embed(texts);
    }

    // Detect language per-text and group by backend to handle mixed-language batches
    const openaiTexts: { text: string; originalIndex: number }[] = [];
    const tritonTexts: { text: string; originalIndex: number }[] = [];

    for (let i = 0; i < texts.length; i++) {
      const lang = this.detectLanguage(texts[i]!);
      if (this.isIndicLanguage(lang)) {
        tritonTexts.push({ text: texts[i]!, originalIndex: i });
      } else {
        openaiTexts.push({ text: texts[i]!, originalIndex: i });
      }
    }

    const results: number[][] = new Array(texts.length);

    if (openaiTexts.length > 0) {
      const embeddings = await this.openaiBackend.embed(openaiTexts.map((t) => t.text));
      for (let i = 0; i < openaiTexts.length; i++) {
        results[openaiTexts[i]!.originalIndex] = embeddings[i]!;
      }
    }

    if (tritonTexts.length > 0) {
      const embeddings = await this.tritonBackend.embed(tritonTexts.map((t) => t.text));
      for (let i = 0; i < tritonTexts.length; i++) {
        results[tritonTexts[i]!.originalIndex] = embeddings[i]!;
      }
    }

    return results;
  }

  async embedBatch(items: EmbeddingItem[]): Promise<number[][]> {
    // Group items by detected language/backend
    const openaiTexts: { text: string; originalIndex: number }[] = [];
    const tritonTexts: { text: string; originalIndex: number }[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const lang = item.language ?? this.detectLanguage(item.text);
      if (this.isIndicLanguage(lang)) {
        tritonTexts.push({ text: item.text, originalIndex: i });
      } else {
        openaiTexts.push({ text: item.text, originalIndex: i });
      }
    }

    const results: number[][] = new Array(items.length);

    // Process each group
    if (openaiTexts.length > 0) {
      const embeddings = await this.openaiBackend.embed(openaiTexts.map((t) => t.text));
      for (let i = 0; i < openaiTexts.length; i++) {
        results[openaiTexts[i]!.originalIndex] = embeddings[i]!;
      }
    }

    if (tritonTexts.length > 0) {
      const embeddings = await this.tritonBackend.embed(tritonTexts.map((t) => t.text));
      for (let i = 0; i < tritonTexts.length; i++) {
        results[tritonTexts[i]!.originalIndex] = embeddings[i]!;
      }
    }

    return results;
  }

  detectLanguage(text: string): string {
    // Simple heuristic: check for Devanagari/Indic unicode ranges
    if (containsIndicScript(text)) {
      return 'hi'; // Hindi/Indic
    }
    return 'en'; // Default to English
  }

  private routeToBackend(language: string): EmbeddingBackend {
    if (this.isIndicLanguage(language)) {
      return this.tritonBackend;
    }
    return this.openaiBackend;
  }

  private isIndicLanguage(language: string): boolean {
    const indicLanguages = new Set(['hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'or']);
    return indicLanguages.has(language);
  }
}

/**
 * Checks if the text contains Indic script characters:
 * - Devanagari: U+0900-U+097F
 * - Bengali: U+0980-U+09FF
 * - Tamil: U+0B80-U+0BFF
 * - Telugu: U+0C00-U+0C7F
 * - Kannada: U+0C80-U+0CFF
 * - Malayalam: U+0D00-U+0D7F
 * - Gujarati: U+0A80-U+0AFF
 * - Gurmukhi: U+0A00-U+0A7F
 * - Oriya: U+0B00-U+0B7F
 */
function containsIndicScript(text: string): boolean {
  const indicPattern =
    /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/;
  return indicPattern.test(text);
}
