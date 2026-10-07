export interface AIInferenceResponse {
  id: string;
  content: string;
  model: string;
  finishReason: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
  latencyMs: number;
  cached: boolean;
}

export interface MultiModalEngineInterface {
  infer: (request: {
    prompt: string;
    model?: string;
    userId: string;
    app: string;
    feature: string;
  }) => Promise<AIInferenceResponse>;
}

export interface MultiModalInput {
  text?: string;
  imageUrl?: string;
  audioUrl?: string;
}

export class MultiModalService {
  constructor(private readonly engine: MultiModalEngineInterface) {}

  async processInput(
    input: MultiModalInput,
    userId: string,
    sessionId?: string,
  ): Promise<AIInferenceResponse> {
    let prompt: string;
    let model: string | undefined;

    if (input.imageUrl) {
      // Use vision model for image inputs
      prompt = input.text
        ? `[Image: ${input.imageUrl}]\n${input.text}`
        : `[Image: ${input.imageUrl}]\nDescribe this image in detail.`;
      model = 'gpt-4o'; // vision-capable model
    } else if (input.audioUrl) {
      // Use audio transcription model
      prompt = input.text
        ? `[Audio: ${input.audioUrl}]\n${input.text}`
        : `[Audio: ${input.audioUrl}]\nTranscribe this audio.`;
      model = 'whisper-1';
    } else {
      prompt = input.text ?? '';
      model = undefined;
    }

    return this.engine.infer({
      prompt,
      model,
      userId,
      app: 'quantai',
      feature: `multimodal-${sessionId ?? 'direct'}`,
    });
  }
}
