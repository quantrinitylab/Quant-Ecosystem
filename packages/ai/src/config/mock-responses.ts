// ============================================================================
// AI Config - Mock Responses for Demo/Development Mode
// ============================================================================

import type { AIInferenceResponse, StreamChunk, ModerationResult } from '../types';

/**
 * Generate a mock text response that references the user's prompt
 */
export function generateMockTextResponse(prompt: string): AIInferenceResponse {
  const truncatedPrompt = prompt.length > 80 ? prompt.slice(0, 80) + '...' : prompt;
  const content = `Based on your question about "${truncatedPrompt}", here is a helpful response. This is a mock response generated because no AI provider API keys are configured. To get real AI responses, set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY in your environment.`;

  return {
    id: `mock_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
    content,
    model: 'mock-model',
    finishReason: 'stop',
    usage: {
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens: Math.ceil(content.length / 4),
      totalTokens: Math.ceil(prompt.length / 4) + Math.ceil(content.length / 4),
      estimatedCost: 0,
    },
    latencyMs: 50,
    cached: false,
  };
}

/**
 * Generate mock stream chunks that simulate a streaming response
 */
export function generateMockStreamChunks(prompt: string): StreamChunk[] {
  const truncatedPrompt = prompt.length > 60 ? prompt.slice(0, 60) + '...' : prompt;
  const words =
    `Based on your question about "${truncatedPrompt}", this is a mock streaming response.`.split(
      ' ',
    );
  const requestId = `mock_stream_${Date.now().toString(36)}`;

  const chunks: StreamChunk[] = words.map((word, index) => ({
    id: requestId,
    content: index === 0 ? word : ` ${word}`,
    done: false,
  }));

  chunks.push({
    id: requestId,
    content: '',
    done: true,
    finishReason: 'stop',
  });

  return chunks;
}

/**
 * Generate a mock embedding vector of the specified dimension
 */
export function generateMockEmbedding(dimensions: number = 1536): number[] {
  const embedding: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    // Small random values that approximate a normalized embedding
    embedding.push((Math.random() - 0.5) * 0.1);
  }
  return embedding;
}

/**
 * Generate a mock moderation result (always safe)
 */
export function generateMockModerationResult(_text: string): ModerationResult {
  return {
    safe: true,
    categories: [
      { name: 'harassment', score: 0.01, flagged: false },
      { name: 'hate_speech', score: 0.01, flagged: false },
      { name: 'explicit_content', score: 0.01, flagged: false },
      { name: 'violence', score: 0.02, flagged: false },
      { name: 'self_harm', score: 0.01, flagged: false },
      { name: 'spam', score: 0.03, flagged: false },
    ],
    overallScore: 0.02,
    action: 'allow',
  };
}
