import { AIProviderUnavailableError } from '@quant/ai';
import type {
  AIInferenceRequest,
  AIInferenceResponse,
  StreamChunk,
  TokenUsage,
} from './chat.service';

export const DEFAULT_CLOUDFLARE_AI_BASE_URL =
  'https://api.cloudflare.com/client/v4/accounts';
export const DEFAULT_CLOUDFLARE_AI_MODEL = '@cf/meta/llama-3.2-1b-instruct';

export type CloudflareAIEnv = Record<string, string | undefined>;
export type CloudflareFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface CloudflareWorkersAIOptions {
  env?: CloudflareAIEnv;
  fetchImpl?: CloudflareFetch;
  timeoutMs?: number;
}

export interface CloudflareWorkersAIConfig {
  accountId: string;
  apiToken: string;
  model: string;
  baseUrl: string;
}

interface WorkersAIEnvelope {
  success?: boolean;
  result?: {
    response?: unknown;
    choices?: Array<{
      message?: { content?: unknown };
      delta?: { content?: unknown };
    }>;
    usage?: {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
      total_tokens?: unknown;
    };
  };
  response?: unknown;
  errors?: Array<{ message?: unknown }>;
}

export class CloudflareWorkersAIError extends AIProviderUnavailableError {
  override readonly code = 'CLOUDFLARE_WORKERS_AI_UNAVAILABLE';

  constructor(message: string) {
    super(message);
    this.name = 'CloudflareWorkersAIError';
    Object.setPrototypeOf(this, CloudflareWorkersAIError.prototype);
  }
}

export class CloudflareWorkersAIClient {
  private readonly env: CloudflareAIEnv;
  private readonly fetchImpl: CloudflareFetch | undefined;
  private readonly timeoutMs: number;

  constructor(options: CloudflareWorkersAIOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  isSelected(): boolean {
    return this.env['AI_PROVIDER']?.trim().toLowerCase() === 'cloudflare';
  }

  isAvailable(): boolean {
    if (!this.isSelected()) return false;
    try {
      this.requireConfig();
      return true;
    } catch {
      return false;
    }
  }

  getConfiguredModel(): string {
    return this.requireConfig().model;
  }

  getModelDescriptor() {
    const model = this.getConfiguredModel();
    return {
      id: model,
      name: `${model} (Cloudflare Workers AI)`,
      provider: 'cloudflare',
      capabilities: [
        'text_generation',
        'text_summarization',
        'code_generation',
        'translation',
      ],
      maxContextLength: 8192,
      maxOutputTokens: 2048,
      costPerInputToken: 0,
      costPerOutputToken: 0,
      latencyMs: 250,
      qualityScore: 0.78,
    };
  }

  async infer(request: AIInferenceRequest): Promise<AIInferenceResponse> {
    const config = this.requireConfig();
    const messages = this.buildMessages(request);
    const startedAt = Date.now();
    const response = await this.fetchWithTimeout(config, {
      messages,
      temperature: 0.7,
      max_tokens: 2048,
    });
    const raw = await response.text();
    const envelope = this.parseEnvelope(raw);
    this.assertSuccessfulResponse(response, envelope, raw, config.apiToken);

    const content = this.extractContent(envelope);
    if (!content) {
      throw new CloudflareWorkersAIError(
        'Cloudflare Workers AI returned an empty response.',
      );
    }

    const usage = this.resolveUsage(envelope, messages, content);
    return {
      id: this.requestId(),
      content,
      model: config.model,
      finishReason: 'stop',
      usage,
      latencyMs: Date.now() - startedAt,
      cached: false,
    };
  }

  async *stream(request: AIInferenceRequest): AsyncGenerator<StreamChunk> {
    const config = this.requireConfig();
    const messages = this.buildMessages(request);
    const fetchImpl = this.resolveFetch();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const id = this.requestId();
    let accumulated = '';

    try {
      let response: Response;
      try {
        response = await fetchImpl(this.endpoint(config), {
          method: 'POST',
          headers: this.headers(config.apiToken),
          body: JSON.stringify({
            messages,
            temperature: 0.7,
            max_tokens: 2048,
            stream: true,
          }),
          signal: controller.signal,
        });
      } catch (error) {
        throw this.requestFailure(error, config.apiToken);
      }

      if (!response.ok) {
        const raw = await this.safeReadText(response);
        const envelope = this.tryParseEnvelope(raw);
        this.assertSuccessfulResponse(response, envelope, raw, config.apiToken);
      }

      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (!response.body || contentType.includes('application/json')) {
        const raw = await response.text();
        const envelope = this.parseEnvelope(raw);
        this.assertSuccessfulResponse(response, envelope, raw, config.apiToken);
        const content = this.extractContent(envelope);
        if (!content) {
          throw new CloudflareWorkersAIError(
            'Cloudflare Workers AI returned an empty stream response.',
          );
        }
        accumulated = content;
        yield { id, content, done: false };
      } else {
        for await (const value of this.readSse(response.body)) {
          const delta = value.startsWith(accumulated)
            ? value.slice(accumulated.length)
            : value;
          if (!delta) continue;
          accumulated += delta;
          yield { id, content: delta, done: false };
        }
      }

      if (!accumulated) {
        throw new CloudflareWorkersAIError(
          'Cloudflare Workers AI completed without response content.',
        );
      }

      yield { id, content: '', done: true, finishReason: 'stop' };
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  private requireConfig(): CloudflareWorkersAIConfig {
    if (!this.isSelected()) {
      throw new CloudflareWorkersAIError(
        'Cloudflare Workers AI is not selected. Set AI_PROVIDER=cloudflare.',
      );
    }

    const accountId = this.env['CLOUDFLARE_ACCOUNT_ID']?.trim() ?? '';
    const apiToken = this.env['CLOUDFLARE_API_TOKEN']?.trim() ?? '';
    const model = (
      this.env['CLOUDFLARE_AI_MODEL'] ??
      this.env['AI_DEFAULT_MODEL'] ??
      DEFAULT_CLOUDFLARE_AI_MODEL
    ).trim();
    const baseUrl = this.validateBaseUrl(
      this.env['CLOUDFLARE_AI_BASE_URL'] ?? DEFAULT_CLOUDFLARE_AI_BASE_URL,
    );
    const failClosed = this.env['QUANT_AI_FAIL_CLOSED']?.trim().toLowerCase() ?? '';

    if (
      this.env['NODE_ENV']?.trim().toLowerCase() === 'production' &&
      failClosed !== 'true'
    ) {
      throw new CloudflareWorkersAIError(
        'Production Cloudflare Workers AI requires QUANT_AI_FAIL_CLOSED=true.',
      );
    }
    if (!/^[a-f0-9]{32}$/i.test(accountId)) {
      throw new CloudflareWorkersAIError(
        'Cloudflare Workers AI requires a valid 32-character CLOUDFLARE_ACCOUNT_ID.',
      );
    }
    if (!apiToken) {
      throw new CloudflareWorkersAIError(
        'Cloudflare Workers AI requires CLOUDFLARE_API_TOKEN.',
      );
    }
    if (!/^@cf\/[A-Za-z0-9._-]+\/[A-Za-z0-9._:/-]+$/.test(model)) {
      throw new CloudflareWorkersAIError(
        'CLOUDFLARE_AI_MODEL must be a valid @cf/provider/model identifier.',
      );
    }

    return { accountId, apiToken, model, baseUrl };
  }

  private validateBaseUrl(raw: string): string {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new CloudflareWorkersAIError('CLOUDFLARE_AI_BASE_URL must be a valid URL.');
    }

    const path = parsed.pathname.replace(/\/+$/, '');
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'api.cloudflare.com' ||
      parsed.port !== '' ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.search !== '' ||
      parsed.hash !== '' ||
      path !== '/client/v4/accounts'
    ) {
      throw new CloudflareWorkersAIError(
        'CLOUDFLARE_AI_BASE_URL must be the official Cloudflare HTTPS accounts endpoint.',
      );
    }

    return `${parsed.origin}${path}`;
  }

  private buildMessages(
    request: AIInferenceRequest,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    if (request.systemPrompt?.trim()) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    for (const item of request.context ?? []) {
      if (
        (item.role === 'system' || item.role === 'user' || item.role === 'assistant') &&
        item.content.trim()
      ) {
        messages.push({ role: item.role, content: item.content });
      }
    }

    const last = messages[messages.length - 1];
    if (last?.role !== 'user' || last.content !== request.prompt) {
      messages.push({ role: 'user', content: request.prompt });
    }
    return messages;
  }

  private async fetchWithTimeout(
    config: CloudflareWorkersAIConfig,
    body: Record<string, unknown>,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.resolveFetch()(this.endpoint(config), {
        method: 'POST',
        headers: this.headers(config.apiToken),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      throw this.requestFailure(error, config.apiToken);
    } finally {
      clearTimeout(timer);
    }
  }

  private endpoint(config: CloudflareWorkersAIConfig): string {
    return `${config.baseUrl}/${config.accountId}/ai/run/${config.model}`;
  }

  private headers(apiToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  private resolveFetch(): CloudflareFetch {
    const fetchImpl = this.fetchImpl ?? (globalThis.fetch as CloudflareFetch | undefined);
    if (typeof fetchImpl !== 'function') {
      throw new CloudflareWorkersAIError(
        'No fetch implementation is available for Cloudflare Workers AI.',
      );
    }
    return fetchImpl;
  }

  private parseEnvelope(raw: string): WorkersAIEnvelope {
    const envelope = this.tryParseEnvelope(raw);
    if (!envelope) {
      throw new CloudflareWorkersAIError(
        'Cloudflare Workers AI returned a non-JSON response.',
      );
    }
    return envelope;
  }

  private tryParseEnvelope(raw: string): WorkersAIEnvelope | null {
    try {
      const value = JSON.parse(raw) as unknown;
      return value && typeof value === 'object' ? (value as WorkersAIEnvelope) : null;
    } catch {
      return null;
    }
  }

  private assertSuccessfulResponse(
    response: Response,
    envelope: WorkersAIEnvelope | null,
    raw: string,
    apiToken: string,
  ): void {
    if (response.ok && envelope?.success !== false) return;
    const rawDetail =
      envelope?.errors
        ?.map((error) => (typeof error.message === 'string' ? error.message : ''))
        .filter(Boolean)
        .join('; ') || raw;
    const detail = this.sanitizeDetail(rawDetail, apiToken);
    throw new CloudflareWorkersAIError(
      `Cloudflare Workers AI request failed (${response.status})${detail ? `: ${detail}` : ''}`,
    );
  }

  private extractContent(envelope: WorkersAIEnvelope): string {
    const candidates = [
      envelope.result?.response,
      envelope.result?.choices?.[0]?.message?.content,
      envelope.response,
    ];
    return candidates.find((value): value is string => typeof value === 'string')?.trim() ?? '';
  }

  private resolveUsage(
    envelope: WorkersAIEnvelope,
    messages: Array<{ content: string }>,
    content: string,
  ): TokenUsage {
    const promptTokens = this.numberOrEstimate(
      envelope.result?.usage?.prompt_tokens,
      messages.map((message) => message.content).join('\n'),
    );
    const completionTokens = this.numberOrEstimate(
      envelope.result?.usage?.completion_tokens,
      content,
    );
    const total = envelope.result?.usage?.total_tokens;
    return {
      promptTokens,
      completionTokens,
      totalTokens:
        typeof total === 'number' && Number.isFinite(total)
          ? total
          : promptTokens + completionTokens,
      estimatedCost: 0,
    };
  }

  private numberOrEstimate(value: unknown, text: string): number {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : Math.ceil(text.length / 4);
  }

  private async *readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newline = buffer.indexOf('\n');
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          const parsed = this.parseSseLine(line);
          if (parsed.done) return;
          if (parsed.text) yield parsed.text;
          newline = buffer.indexOf('\n');
        }
      }

      const parsed = this.parseSseLine(buffer.trim());
      if (parsed.text) yield parsed.text;
    } finally {
      reader.releaseLock();
    }
  }

  private parseSseLine(line: string): { done: boolean; text?: string } {
    if (!line || !line.startsWith('data:')) return { done: false };
    const data = line.slice('data:'.length).trim();
    if (data === '[DONE]') return { done: true };

    const envelope = this.tryParseEnvelope(data);
    if (!envelope) return { done: false };
    const candidates = [
      envelope.response,
      envelope.result?.response,
      envelope.result?.choices?.[0]?.delta?.content,
      envelope.result?.choices?.[0]?.message?.content,
    ];
    const text = candidates.find((value): value is string => typeof value === 'string');
    return text ? { done: false, text } : { done: false };
  }

  private async safeReadText(response: Response): Promise<string> {
    try {
      return (await response.text()).slice(0, 500);
    } catch {
      return '';
    }
  }

  private requestFailure(error: unknown, apiToken: string): CloudflareWorkersAIError {
    const rawDetail = error instanceof Error ? error.message : String(error);
    const detail = this.sanitizeDetail(rawDetail, apiToken);
    return new CloudflareWorkersAIError(
      `Cloudflare Workers AI request failed${detail ? `: ${detail}` : ''}`,
    );
  }

  private sanitizeDetail(detail: string, apiToken: string): string {
    const redacted = apiToken ? detail.split(apiToken).join('[REDACTED]') : detail;
    return redacted.slice(0, 300);
  }

  private requestId(): string {
    return `cf_ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
