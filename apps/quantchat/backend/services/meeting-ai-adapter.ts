import { AIEngine } from '@quant/ai';
import type { AIInference } from './summary.service';

export class MeetingAIAdapter implements AIInference {
  constructor(private readonly engine: AIEngine = new AIEngine()) {}

  async generateText(prompt: string): Promise<string> {
    const response = await this.engine.infer({
      prompt,
      systemPrompt:
        'You are a meeting assistant that produces clear, structured summaries and action items.',
      userId: 'system',
      app: 'quantchat',
      feature: 'meeting-summary',
      temperature: 0.3,
    });
    return response.content;
  }
}
