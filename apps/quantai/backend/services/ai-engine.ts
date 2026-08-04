import { AIEngine as CoreAIEngine } from '@quant/ai';
import type {
  AIEngineInterface,
  AIInferenceRequest,
  AIInferenceResponse,
  StreamChunk,
} from './chat.service';

type EnvLike = Record<string, string | undefined>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface AIEngineOptions {
  env?: EnvLike;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

interface WorkersAIEnvelope {
  success?: boolean;
  result?: {
    response?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };
  errors?: Array<{ message?: string }>;
}

export class AIEngine implements AIEngineInterface {
  private engine: CoreAIEngine;
  private modelRouter: ReturnType<CoreAIEngine['getModelRouter']>;
  private readonly env: EnvLike;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: AIEngineOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike);
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.engine = new CoreAIEngine();
    this.modelRouter = this.engine.getModelRouter();
  }

  private useWorkersAI(): boolean {
    return this.env['AI_PROVIDER'] === 'cloudflare';
  }

  private workersAIConfig() {
    const accountId = this.env['CLOUDFLARE_ACCOUNT_ID']?.trim();
    const apiToken = this.env['CLOUDFLARE_API_TOKEN']?.trim();
    const model = (
      this.env['CLOUDFLARE_AI_MODEL'] ??
      this.env['AI_DEFAULT_MODEL'] ??
      '@cf/meta/llama-3.2-1b-instruct'
    ).trim();
    const baseUrl = (
      this.env['CLOUDFLARE_AI_BASE_URL'] ??
      'https://api.cloudflare.com/client/v4/accounts'
    ).replace(/\/+$/, '');

    if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId)) {
      throw new Error('Cloudflare Workers AI is missing a valid CLOUDFLARE_ACCOUNT_ID.');
    }
    if (!apiToken) {
      throw new Error('Cloudflare Workers AI is missing CLOUDFLARE_API_TOKEN.');
    }
    if (!/^@cf\/[A-Za-z0-9._-]+\/[A-Za-z0-9._:-]+$/.test(model)) {
      throw new Error('CLOUDFLARE_AI_MODEL must be a valid @cf/provider/model identifier.');
    }
    if (!baseUrl.startsWith('https://')) {
      throw new Error('CLOUDFLARE_AI_BASE_URL must use HTTPS.');
    }

    return { accountId, apiToken, model, baseUrl };
  }

  private async workersAIInfer(request: AIInferenceRequest): Promise<AIInferenceResponse> {
    const { accountId, apiToken, model, baseUrl } = this.workersAIConfig();
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
    for (const item of request.context ?? []) {
      if (item.role === 'system' || item.role === 'user' || item.role === 'assistant') {
        messages.push({ role: item.role, content: item.content });
      }
    }
    messages.push({ role: 'user', content: request.prompt });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await this.fetchImpl(`${baseUrl}/${accountId}/ai/run/${model}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const payload = (await response.json()) as WorkersAIEnvelope;
    if (!response.ok || payload.success === false) {
      const detail = payload.errors?.map((error) => error.message).filter(Boolean).join('; ');
      throw new Error(`Cloudflare Workers AI request failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }

    const content =
      payload.result?.response ?? payload.result?.choices?.[0]?.message?.content ?? '';
    if (!content) throw new Error('Cloudflare Workers AI returned an empty response.');

    const promptTokens =
      payload.result?.usage?.prompt_tokens ??
      Math.ceil(messages.map((message) => message.content).join('\n').length / 4);
    const completionTokens =
      payload.result?.usage?.completion_tokens ?? Math.ceil(content.length / 4);

    return {
      id: `cf-${Date.now().toString(36)}`,
      content,
      model,
      finishReason: 'stop',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: payload.result?.usage?.total_tokens ?? promptTokens + completionTokens,
        estimatedCost: 0,
      },
      latencyMs: Date.now() - startedAt,
      cached: false,
    };
  }

  async infer(request: AIInferenceRequest): Promise<AIInferenceResponse> {
    if (this.useWorkersAI()) return this.workersAIInfer(request);

    const response = await this.engine.infer({
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      context: request.context as never,
      model: request.model,
      userId: request.userId,
      app: request.app as never,
      feature: request.feature,
    });

    const usage = response.usage ?? {};
    return {
      id: response.id ?? `infer-${Date.now()}`,
      content: response.content ?? '',
      model: response.model ?? request.model ?? 'unknown',
      finishReason: response.finishReason ?? 'stop',
      usage: {
        promptTokens: usage.promptTokens ?? 0,
        completionTokens: usage.completionTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
        estimatedCost: usage.estimatedCost ?? 0,
      },
      latencyMs: response.latencyMs ?? 0,
      cached: response.cached ?? false,
    };
  }

  async *stream(request: AIInferenceRequest): AsyncGenerator<StreamChunk> {
    if (this.useWorkersAI()) {
      const response = await this.workersAIInfer(request);
      yield { id: response.id, content: response.content, done: false };
      yield { id: response.id, content: '', done: true, finishReason: response.finishReason };
      return;
    }

    const source = this.engine.stream({
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      context: request.context as never,
      model: request.model,
      userId: request.userId,
      app: request.app as never,
      feature: request.feature,
      stream: true,
    });

    for await (const chunk of source as AsyncIterable<Partial<StreamChunk>>) {
      yield {
        id: chunk.id ?? `chunk-${Date.now()}`,
        content: chunk.content ?? '',
        done: chunk.done ?? false,
        finishReason: chunk.finishReason,
      };
    }
  }

  async chat(messages: any[], options: any = {}) {
    const userMessage = [...messages].reverse().find((message) => message.role === 'user');
    const systemMessage = messages.find((message) => message.role === 'system');
    const response = await this.infer({
      prompt: userMessage?.content || '',
      systemPrompt: systemMessage?.content || options.systemPrompt,
      context: messages.filter((message) => message !== userMessage && message !== systemMessage),
      model: options.model,
      userId: options.userId || 'anonymous',
      app: 'quantai',
      feature: 'chat',
    });
    return { content: response.content, model: response.model, usage: response.usage };
  }

  async streamChat(messages: any[], options: any = {}) {
    const userMessage = [...messages].reverse().find((message) => message.role === 'user');
    const systemMessage = messages.find((message) => message.role === 'system');
    return this.stream({
      prompt: userMessage?.content || '',
      systemPrompt: systemMessage?.content || options.systemPrompt,
      context: messages.filter((message) => message !== userMessage && message !== systemMessage),
      model: options.model,
      userId: options.userId || 'anonymous',
      app: 'quantai',
      feature: 'chat',
      stream: true,
    });
  }

  async getAvailableModels() {
    if (this.useWorkersAI()) {
      const { model } = this.workersAIConfig();
      return [{ id: model, name: model, provider: 'cloudflare' }];
    }
    return this.modelRouter.getModels();
  }
}
