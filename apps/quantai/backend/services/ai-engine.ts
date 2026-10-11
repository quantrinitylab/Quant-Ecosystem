import { AIEngine as CoreAIEngine, SAFETY_REFUSAL_MESSAGE, buildSafetyBlockLog } from '@quant/ai';
import { createAppError } from '@quant/server-core';
import type {
  AIEngineInterface,
  AIInferenceRequest,
  AIInferenceResponse,
  StreamChunk,
} from './chat.service';
import {
  CloudflareWorkersAIClient,
  type CloudflareAIEnv,
  type CloudflareFetch,
} from './cloudflare-workers-ai';

export interface AIEngineOptions {
  env?: CloudflareAIEnv;
  fetchImpl?: CloudflareFetch;
  timeoutMs?: number;
}

/**
 * Chat entry points are only reachable from authenticated routes: every
 * inference must carry the caller's userId so per-user budget and rate-limit
 * gates apply to that caller. There is deliberately NO 'anonymous' fallback —
 * silently pooling all callers into one shared bucket would let any user
 * spend against everyone else's budget (F-107).
 */
function requireChatUserId(options: { userId?: unknown }): string {
  const userId = typeof options.userId === 'string' ? options.userId : '';
  if (!userId) {
    throw createAppError('userId is required for chat inference', 400, 'USER_ID_REQUIRED');
  }
  return userId;
}

export class AIEngine implements AIEngineInterface {
  private readonly engine: CoreAIEngine;
  private readonly modelRouter: ReturnType<CoreAIEngine['getModelRouter']>;
  private readonly workersAI: CloudflareWorkersAIClient;

  constructor(options: AIEngineOptions = {}) {
    this.engine = new CoreAIEngine();
    this.modelRouter = this.engine.getModelRouter();
    this.workersAI = new CloudflareWorkersAIClient(options);
  }

  /**
   * Enforce the injection screen on the Workers AI path too: a flagged
   * prompt is refused fail-closed (same honest refusal shape the core
   * engine returns) rather than redacted-and-continued.
   */
  private gateWorkersInput(
    request: AIInferenceRequest,
    path: 'infer' | 'stream',
  ): { safePrompt: string } | { refusal: AIInferenceResponse } {
    const safeInput = this.engine.getSafetyPipeline().processInput(request.prompt);
    if (safeInput.isSafe) return { safePrompt: safeInput.text };

    console.warn(
      JSON.stringify(
        buildSafetyBlockLog({
          path: `workers-ai-${path}`,
          userId: request.userId ?? null,
          app: 'quantai',
          feature: request.feature ?? null,
          patternIds: safeInput.matchedInjectionPatterns ?? [],
          categories: safeInput.categories
            .filter((category) => category.flagged)
            .map((category) => category.name),
          promptLength: request.prompt.length,
        }),
      ),
    );

    return {
      refusal: {
        id: `infer-${Date.now()}`,
        content: SAFETY_REFUSAL_MESSAGE,
        model: this.workersAI.getConfiguredModel() ?? request.model ?? 'workers-ai',
        finishReason: 'content_filter',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 },
        latencyMs: 0,
        cached: false,
      },
    };
  }

  private checkWorkersBudget(request: AIInferenceRequest): void {
    const costs = this.engine.getCostTracker();
    costs.checkBudget(request.userId);
    costs.checkRateLimit(request.userId);
  }

  private trackWorkersUsage(
    request: AIInferenceRequest,
    model: string,
    promptTokens: number,
    completionTokens: number,
    estimatedCost: number,
  ): void {
    this.engine
      .getCostTracker()
      .trackUsage(
        request.userId,
        model,
        promptTokens,
        completionTokens,
        estimatedCost,
      );
  }

  async infer(request: AIInferenceRequest): Promise<AIInferenceResponse> {
    if (this.workersAI.isSelected()) {
      this.checkWorkersBudget(request);
      const gate = this.gateWorkersInput(request, 'infer');
      if ('refusal' in gate) return gate.refusal;
      const response = await this.workersAI.infer({ ...request, prompt: gate.safePrompt });
      const safeOutput = this.engine.getSafetyPipeline().processOutput(response.content);
      this.trackWorkersUsage(
        request,
        response.model,
        response.usage.promptTokens,
        response.usage.completionTokens,
        response.usage.estimatedCost,
      );
      return { ...response, content: safeOutput.text };
    }

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
    if (this.workersAI.isSelected()) {
      this.checkWorkersBudget(request);
      const gate = this.gateWorkersInput(request, 'stream');
      if ('refusal' in gate) {
        yield {
          id: gate.refusal.id,
          content: gate.refusal.content,
          done: true,
          finishReason: gate.refusal.finishReason,
        };
        return;
      }
      const prepared = { ...request, prompt: gate.safePrompt };
      let completion = '';
      const model = this.workersAI.getConfiguredModel();
      for await (const chunk of this.workersAI.stream(prepared)) {
        completion += chunk.content;
        yield chunk;
      }
      const promptTokens = Math.ceil(prepared.prompt.length / 4);
      const completionTokens = Math.ceil(completion.length / 4);
      this.trackWorkersUsage(request, model, promptTokens, completionTokens, 0);
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
      userId: requireChatUserId(options),
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
      userId: requireChatUserId(options),
      app: 'quantai',
      feature: 'chat',
      stream: true,
    });
  }

  async getAvailableModels() {
    if (this.workersAI.isSelected()) {
      return [this.workersAI.getModelDescriptor()];
    }
    return this.modelRouter.getModels();
  }
}
