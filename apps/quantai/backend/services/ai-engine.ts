import { AIEngine as CoreAIEngine } from '@quant/ai';

export class AIEngine {
  private engine: CoreAIEngine;
  private modelRouter: ReturnType<CoreAIEngine['getModelRouter']>;

  constructor() {
    this.engine = new CoreAIEngine();
    this.modelRouter = this.engine.getModelRouter();
  }

  async chat(messages: any[], options: any = {}) {
    const userMessage = [...messages].reverse().find((m) => m.role === 'user');
    const systemMessage = messages.find((m) => m.role === 'system');
    const prompt = userMessage?.content || '';

    const response = await this.engine.infer({
      prompt,
      systemPrompt: systemMessage?.content || options.systemPrompt,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      userId: options.userId || 'anonymous',
      app: 'quantai',
      feature: 'chat',
    });

    return {
      content: response.content,
      model: response.model,
      usage: response.usage,
    };
  }

  async streamChat(messages: any[], options: any = {}) {
    const userMessage = [...messages].reverse().find((m) => m.role === 'user');
    const systemMessage = messages.find((m) => m.role === 'system');
    const prompt = userMessage?.content || '';

    return this.engine.stream({
      prompt,
      systemPrompt: systemMessage?.content || options.systemPrompt,
      model: options.model,
      temperature: options.temperature,
      userId: options.userId || 'anonymous',
      app: 'quantai',
      feature: 'chat',
      stream: true,
    });
  }

  async getAvailableModels() {
    return this.modelRouter.getModels();
  }
}
