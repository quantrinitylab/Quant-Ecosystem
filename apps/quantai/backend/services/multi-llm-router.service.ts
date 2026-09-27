export type SupportedEngine =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'grok'
  | 'quant-sovereign';

export interface CompletionMessage {
  role: string;
  content: string;
}

export interface CompletionRequest {
  engine: SupportedEngine;
  model?: string;
  messages: CompletionMessage[];
  stream?: boolean;
  temperature?: number;
}

export interface CompletionResponse {
  content: string;
  engineUsed: string;
  modelUsed: string;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export class MultiLLMRouterService {
  private fallbackLadder: SupportedEngine[] = [
    'quant-sovereign',
    'openai',
    'anthropic',
    'gemini',
    'deepseek',
    'grok',
  ];

  private failInjector: Record<string, boolean> = {};

  // For testing purposes to simulate engine failures/rate limits
  public setEngineFailure(engine: SupportedEngine, shouldFail: boolean): void {
    this.failInjector[engine] = shouldFail;
  }

  private getDefaultModel(engine: SupportedEngine): string {
    switch (engine) {
      case 'openai':
        return 'gpt-4o';
      case 'anthropic':
        return 'claude-3-5-sonnet';
      case 'gemini':
        return 'gemini-2.0-flash';
      case 'deepseek':
        return 'deepseek-chat';
      case 'grok':
        return 'grok-2';
      case 'quant-sovereign':
        return 'quant-1';
      default:
        return 'gpt-4o';
    }
  }

  private async executeEngineCall(
    engine: SupportedEngine,
    model: string,
    messages: CompletionMessage[],
    temperature?: number,
  ): Promise<CompletionResponse> {
    if (this.failInjector[engine]) {
      throw new Error(`Engine ${engine} failed or rate limited (simulated injection)`);
    }

    // Simulate inference latency & token calculation
    const promptText = messages.map((m) => `${m.role}: ${m.content}`).join('\n');
    const promptTokens = Math.ceil(promptText.length / 4);
    const mockContent = `[MagicAI Multi-LLM Engine: Response from ${engine} using model ${model}] processed ${messages.length} messages. Temperature: ${temperature ?? 0.7}`;
    const completionTokens = Math.ceil(mockContent.length / 4);

    return {
      content: mockContent,
      engineUsed: engine,
      modelUsed: model,
      tokensUsed: {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens,
      },
    };
  }

  public async dispatchCompletion(request: CompletionRequest): Promise<CompletionResponse> {
    const primaryEngine = request.engine || 'quant-sovereign';
    const model = request.model || this.getDefaultModel(primaryEngine);

    // Build execution order: primary engine first, followed by fallback ladder (excluding primary)
    const executionOrder: SupportedEngine[] = [
      primaryEngine,
      ...this.fallbackLadder.filter((e) => e !== primaryEngine),
    ];

    let lastError: Error | null = null;

    for (const engine of executionOrder) {
      try {
        const response = await this.executeEngineCall(
          engine,
          engine === primaryEngine ? model : this.getDefaultModel(engine),
          request.messages,
          request.temperature,
        );
        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Continue to next engine in fallback ladder
      }
    }

    throw new Error(
      `All engines in fallback ladder failed. Last error: ${lastError?.message || 'Unknown error'}`,
    );
  }
}

export const multiLLMRouterService = new MultiLLMRouterService();
