import { describe, it, expect } from 'vitest';
import { RoutingTable } from '../core/routing-table';
import type { TaskType } from '../types';

describe('RoutingTable', () => {
  describe('default routes', () => {
    const table = new RoutingTable();

    it('returns correct route for autocomplete', () => {
      const route = table.getRoute('autocomplete');
      expect(route.primary).toBe('llama-3.1-8b-instant');
      expect(route.fallbacks).toEqual(['gpt-4o-mini', 'claude-haiku-4']);
    });

    it('returns correct route for code_generation', () => {
      const route = table.getRoute('code_generation');
      expect(route.primary).toBe('deepseek-coder-v3');
      expect(route.fallbacks).toEqual(['claude-sonnet-4', 'gpt-4o']);
    });

    it('returns correct route for complex_reasoning', () => {
      const route = table.getRoute('complex_reasoning');
      expect(route.primary).toBe('claude-sonnet-4');
      expect(route.fallbacks).toEqual(['gpt-4o', 'deepseek-r1']);
    });

    it('returns correct route for cheap_reasoning', () => {
      const route = table.getRoute('cheap_reasoning');
      expect(route.primary).toBe('deepseek-r1');
      expect(route.fallbacks).toEqual(['o3-mini', 'gemini-2.5-flash']);
    });

    it('returns correct route for summarization', () => {
      const route = table.getRoute('summarization');
      expect(route.primary).toBe('gemini-2.5-flash');
      expect(route.fallbacks).toEqual(['gpt-4o-mini', 'claude-haiku-4']);
    });

    it('returns correct route for translation', () => {
      const route = table.getRoute('translation');
      expect(route.primary).toBe('deepseek-v3');
      expect(route.fallbacks).toEqual(['gemini-2.5-flash', 'gpt-4o-mini']);
    });

    it('returns correct route for voice_stt', () => {
      const route = table.getRoute('voice_stt');
      expect(route.primary).toBe('whisper-large-v3');
      expect(route.fallbacks).toEqual([]);
    });

    it('returns correct route for voice_tts', () => {
      const route = table.getRoute('voice_tts');
      expect(route.primary).toBe('tts-1-hd');
      expect(route.fallbacks).toEqual([]);
    });

    it('returns correct route for image_generation', () => {
      const route = table.getRoute('image_generation');
      expect(route.primary).toBe('dall-e-3');
      expect(route.fallbacks).toEqual([]);
    });

    it('returns correct route for embedding_bulk', () => {
      const route = table.getRoute('embedding_bulk');
      expect(route.primary).toBe('bge-large-en-v1.5');
      expect(route.fallbacks).toEqual(['embed-multilingual-v3']);
    });

    it('returns correct route for embedding_quality', () => {
      const route = table.getRoute('embedding_quality');
      expect(route.primary).toBe('embed-multilingual-v3');
      expect(route.fallbacks).toEqual(['text-embedding-3-large']);
    });

    it('returns correct route for reranking', () => {
      const route = table.getRoute('reranking');
      expect(route.primary).toBe('rerank-v3');
      expect(route.fallbacks).toEqual([]);
    });

    it('returns correct route for moderation', () => {
      const route = table.getRoute('moderation');
      expect(route.primary).toBe('omni-moderation-latest');
      expect(route.fallbacks).toEqual([]);
    });

    it('returns correct route for web_search', () => {
      const route = table.getRoute('web_search');
      expect(route.primary).toBe('sonar-pro');
      expect(route.fallbacks).toEqual([]);
    });

    it('returns correct route for vision_screenshot', () => {
      const route = table.getRoute('vision_screenshot');
      expect(route.primary).toBe('gpt-4o');
      expect(route.fallbacks).toEqual(['claude-sonnet-4']);
    });

    it('returns correct route for long_context', () => {
      const route = table.getRoute('long_context');
      expect(route.primary).toBe('gemini-2.5-pro');
      expect(route.fallbacks).toEqual(['claude-sonnet-4']);
    });
  });

  describe('custom overrides', () => {
    it('overrides default routes with custom entries', () => {
      const table = new RoutingTable([
        { taskType: 'autocomplete', primary: 'gpt-4o-mini', fallbacks: ['gpt-4o'] },
      ]);
      const route = table.getRoute('autocomplete');
      expect(route.primary).toBe('gpt-4o-mini');
      expect(route.fallbacks).toEqual(['gpt-4o']);
    });

    it('preserves non-overridden routes', () => {
      const table = new RoutingTable([
        { taskType: 'autocomplete', primary: 'gpt-4o-mini', fallbacks: [] },
      ]);
      const route = table.getRoute('code_generation');
      expect(route.primary).toBe('deepseek-coder-v3');
    });
  });

  describe('unknown task type', () => {
    it('returns default fallback for unknown task type', () => {
      const table = new RoutingTable();
      const route = table.getRoute('unknown_task' as TaskType);
      expect(route.primary).toBe('gpt-4o-mini');
      expect(route.fallbacks).toEqual(['claude-haiku-4']);
    });
  });
});
