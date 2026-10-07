import { AIEngine as CoreAIEngine } from '@quant/ai';
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

export class AIEngine implements AIEngineInterface {
  private readonly engine: CoreAIEngine;
  private readonly modelRouter: ReturnType<CoreAIEngine['getModelRouter']>;
  private readonly workersAI: CloudflareWorkersAIClient;

  constructor(options: AIEngineOptions = {}) {
    this.engine = new CoreAIEngine();
    this.modelRouter = this.engine.getModelRouter();
    this.workersAI = new CloudflareWorkersAIClient(options);
  }

  private prepareWorkersRequest(request: AIInferenceRequest): AIInferenceRequest {
    const safeInput = this.engine.getSafetyPipeline().processInput(request.prompt);
    return { ...request, prompt: safeInput.text };
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
      const response = await this.workersAI.infer(this.prepareWorkersRequest(request));
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
      const prepared = this.prepareWorkersRequest(request);
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
    if (this.workersAI.isSelected()) {
      return [this.workersAI.getModelDescriptor()];
    }
    return this.modelRouter.getModels();
  }
}
