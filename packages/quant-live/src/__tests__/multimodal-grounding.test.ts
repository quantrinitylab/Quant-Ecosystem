import { describe, it, expect, vi } from 'vitest';
import { MultimodalGrounding } from '../grounding/multimodal-grounding.js';
import type { CaptureFrame, LiveLLMProvider, GroundingRequest } from '../types.js';

function createMockLLMProvider(responseText = 'This is a laptop'): LiveLLMProvider {
  return {
    streamResponse: vi.fn().mockReturnValue(
      (async function* () {
        yield { type: 'text' as const, text: responseText };
        yield { type: 'done' as const };
      })(),
    ),
    abort: vi.fn(),
  };
}

function createFrame(source: 'camera' | 'screen' = 'camera'): CaptureFrame {
  return { data: 'data:image/jpeg;base64,abc', timestamp: 1000, source };
}

describe('MultimodalGrounding', () => {
  it('formats frames as image content in the request', () => {
    const provider = createMockLLMProvider();
    const grounding = new MultimodalGrounding(provider);
    const request: GroundingRequest = {
      frames: [createFrame('camera'), createFrame('screen')],
      query: 'What is this?',
      mode: 'identify',
    };
    const context = grounding.buildContext(request);
    const text = context.transcript[0]!.text;
    expect(text).toContain('[image:camera:');
    expect(text).toContain('[image:screen:');
    expect(text).toContain('What is this?');
  });

  it('streams response from LLM provider', async () => {
    const provider = createMockLLMProvider('A code editor');
    const grounding = new MultimodalGrounding(provider);
    const result = await grounding.ground({
      frames: [createFrame()],
      query: 'What is on screen?',
      mode: 'assist',
    });
    expect(result.text).toBe('A code editor');
    expect(result.confidence).toBe(0.85);
  });

  it('falls back to text-only when no frames', async () => {
    const provider = createMockLLMProvider('Text response');
    const grounding = new MultimodalGrounding(provider);
    const result = await grounding.ground({ frames: [], query: 'Help me', mode: 'retrieve' });
    expect(result.text).toBe('Text response');
    expect(result.confidence).toBe(0.5);
    const context = grounding.buildContext({ frames: [], query: 'Help me', mode: 'retrieve' });
    expect(context.transcript[0]!.text).toBe('Help me');
  });

  it('uses correct system prompt per mode', () => {
    const provider = createMockLLMProvider();
    const grounding = new MultimodalGrounding(provider);
    expect(
      grounding.buildContext({ frames: [createFrame()], query: 'q', mode: 'identify' })
        .systemPrompt,
    ).toContain('Identify');
    expect(
      grounding.buildContext({ frames: [createFrame()], query: 'q', mode: 'assist' }).systemPrompt,
    ).toContain('Help');
    expect(
      grounding.buildContext({ frames: [createFrame()], query: 'q', mode: 'retrieve' })
        .systemPrompt,
    ).toContain('context');
  });
});
