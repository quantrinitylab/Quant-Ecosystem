import type {
  GroundingRequest,
  GroundingResult,
  LiveLLMProvider,
  LiveConversationContext,
} from '../types.js';

export class MultimodalGrounding {
  private llmProvider: LiveLLMProvider;

  constructor(llmProvider: LiveLLMProvider) {
    this.llmProvider = llmProvider;
  }

  async ground(request: GroundingRequest): Promise<GroundingResult> {
    const context = this.buildContext(request);
    const stream = this.llmProvider.streamResponse(context);
    let text = '';
    for await (const chunk of stream) {
      if (chunk.type === 'text' && chunk.text) {
        text += chunk.text;
      }
    }
    return { text, sources: [], confidence: request.frames.length > 0 ? 0.85 : 0.5 };
  }

  buildContext(request: GroundingRequest): LiveConversationContext {
    const systemPrompt = this.getSystemPrompt(request.mode);
    const imageContent = request.frames.map((f) => `[image:${f.source}:${f.timestamp}]`).join('\n');
    const userMessage =
      request.frames.length > 0 ? `${imageContent}\n\n${request.query}` : request.query;

    return {
      sessionId: request.context?.sessionId ?? 'grounding',
      transcript: [
        {
          id: 'grounding-query',
          speaker: 'user',
          text: userMessage,
          startTime: Date.now(),
          endTime: Date.now(),
          confidence: 1,
          isFinal: true,
        },
      ],
      systemPrompt,
      tools: [],
    };
  }

  private getSystemPrompt(mode: GroundingRequest['mode']): string {
    switch (mode) {
      case 'identify':
        return 'Identify what is visible in the provided image(s).';
      case 'assist':
        return 'Help the user with what is shown on their screen.';
      case 'retrieve':
        return 'Find relevant context based on the visual and textual query.';
    }
  }
}
