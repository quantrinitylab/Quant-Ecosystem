// ============================================================================
// AI Core - Routing Table
// ============================================================================

import type { TaskType, RoutingEntry } from '../types';

/**
 * Routing Table
 *
 * Maps task types to primary model and fallback chains.
 * Supports custom overrides for user-specific routing.
 */
export class RoutingTable {
  private routes: Map<TaskType, { primary: string; fallbacks: string[] }>;

  constructor(overrides?: RoutingEntry[]) {
    this.routes = new Map();
    this.registerDefaults();
    if (overrides) {
      for (const entry of overrides) {
        this.routes.set(entry.taskType, { primary: entry.primary, fallbacks: entry.fallbacks });
      }
    }
  }

  /**
   * Get the route for a given task type
   */
  getRoute(taskType: TaskType): { primary: string; fallbacks: string[] } {
    const route = this.routes.get(taskType);
    if (!route) {
      return { primary: 'gpt-4o-mini', fallbacks: ['claude-haiku-4'] };
    }
    return route;
  }

  private registerDefaults(): void {
    this.routes.set('autocomplete', {
      primary: 'llama-3.1-8b-instant',
      fallbacks: ['gpt-4o-mini', 'claude-haiku-4'],
    });
    this.routes.set('code_generation', {
      primary: 'deepseek-coder-v3',
      fallbacks: ['claude-sonnet-4', 'gpt-4o'],
    });
    this.routes.set('complex_reasoning', {
      primary: 'claude-sonnet-4',
      fallbacks: ['gpt-4o', 'deepseek-r1'],
    });
    this.routes.set('cheap_reasoning', {
      primary: 'deepseek-r1',
      fallbacks: ['o3-mini', 'gemini-2.5-flash'],
    });
    this.routes.set('summarization', {
      primary: 'gemini-2.5-flash',
      fallbacks: ['gpt-4o-mini', 'claude-haiku-4'],
    });
    this.routes.set('translation', {
      primary: 'deepseek-v3',
      fallbacks: ['gemini-2.5-flash', 'gpt-4o-mini'],
    });
    this.routes.set('voice_stt', {
      primary: 'whisper-large-v3',
      fallbacks: [],
    });
    this.routes.set('voice_tts', {
      primary: 'tts-1-hd',
      fallbacks: [],
    });
    this.routes.set('image_generation', {
      primary: 'dall-e-3',
      fallbacks: [],
    });
    this.routes.set('embedding_bulk', {
      primary: 'bge-large-en-v1.5',
      fallbacks: ['embed-multilingual-v3'],
    });
    this.routes.set('embedding_quality', {
      primary: 'embed-multilingual-v3',
      fallbacks: ['text-embedding-3-large'],
    });
    this.routes.set('reranking', {
      primary: 'rerank-v3',
      fallbacks: [],
    });
    this.routes.set('moderation', {
      primary: 'omni-moderation-latest',
      fallbacks: [],
    });
    this.routes.set('web_search', {
      primary: 'sonar-pro',
      fallbacks: [],
    });
    this.routes.set('vision_screenshot', {
      primary: 'gpt-4o',
      fallbacks: ['claude-sonnet-4'],
    });
    this.routes.set('long_context', {
      primary: 'gemini-2.5-pro',
      fallbacks: ['claude-sonnet-4'],
    });
  }
}
