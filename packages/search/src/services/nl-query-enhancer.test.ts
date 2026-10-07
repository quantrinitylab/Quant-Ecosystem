// ============================================================================
// NL Query Enhancer - Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { NLQueryEnhancer } from './nl-query-enhancer';

describe('NLQueryEnhancer', () => {
  let enhancer: NLQueryEnhancer;

  beforeEach(() => {
    enhancer = new NLQueryEnhancer();
  });

  describe('intent detection', () => {
    it('should detect informational intent for simple queries', () => {
      const result = enhancer.enhance('project timeline');
      expect(result.intent).toBe('informational');
    });

    it('should detect navigational intent for "show me" queries', () => {
      const result = enhancer.enhance('show me everything about Project Alpha');
      expect(result.intent).toBe('navigational');
    });

    it('should detect navigational intent for "find" queries', () => {
      const result = enhancer.enhance('find documents from last week');
      expect(result.intent).toBe('navigational');
    });

    it('should detect action intent for "what changed" queries', () => {
      const result = enhancer.enhance('what changed since yesterday');
      expect(result.intent).toBe('action');
    });

    it('should detect action intent for imperative actions', () => {
      const result = enhancer.enhance('create a new document about testing');
      expect(result.intent).toBe('action');
    });

    it('should detect action intent for "since yesterday" pattern', () => {
      const result = enhancer.enhance('emails since yesterday');
      expect(result.intent).toBe('action');
    });

    it('should detect navigational intent for "go to" queries', () => {
      const result = enhancer.enhance('go to my inbox');
      expect(result.intent).toBe('navigational');
    });
  });

  describe('entity extraction', () => {
    it('should extract project names from "about Project X" pattern', () => {
      const result = enhancer.enhance('show me everything about Project Alpha');
      const projectEntities = result.entities.filter((e) => e.type === 'project');
      expect(projectEntities.length).toBeGreaterThan(0);
      expect(projectEntities[0]!.value).toContain('Alpha');
    });

    it('should extract person names from "from Person" pattern', () => {
      const result = enhancer.enhance('emails from John Smith');
      const personEntities = result.entities.filter((e) => e.type === 'person');
      expect(personEntities.length).toBeGreaterThan(0);
      expect(personEntities[0]!.value).toContain('John');
    });

    it('should extract person names from "by Person" pattern', () => {
      const result = enhancer.enhance('documents by Alice');
      const personEntities = result.entities.filter((e) => e.type === 'person');
      expect(personEntities.length).toBeGreaterThan(0);
      expect(personEntities[0]!.value).toContain('Alice');
    });

    it('should extract topics from "about topic" pattern', () => {
      const result = enhancer.enhance('show me documents about machine learning');
      const topicEntities = result.entities.filter((e) => e.type === 'topic');
      expect(topicEntities.length).toBeGreaterThan(0);
    });

    it('should not duplicate entities', () => {
      const result = enhancer.enhance('project Alpha about Alpha');
      const values = result.entities.map((e) => e.value.toLowerCase());
      const unique = new Set(values);
      expect(values.length).toBe(unique.size);
    });
  });

  describe('parsed query', () => {
    it('should preserve parsed query fields', () => {
      const result = enhancer.enhance('emails from yesterday');
      expect(result.originalQuery).toBe('emails from yesterday');
      expect(result.keywords).toBeDefined();
    });

    it('should include dateRange for time-based queries', () => {
      const result = enhancer.enhance('what changed since yesterday');
      // The query parser should detect "yesterday" date
      expect(result.dateRange).toBeDefined();
    });

    it('should include type detection from underlying parser', () => {
      const result = enhancer.enhance('show me all emails about budget');
      expect(result.type).toBe('email');
    });
  });

  describe('complex queries', () => {
    it('should handle "show me everything about Project Alpha"', () => {
      const result = enhancer.enhance('show me everything about Project Alpha');
      expect(result.intent).toBe('navigational');
      expect(result.entities.length).toBeGreaterThan(0);
    });

    it('should handle "what changed since yesterday"', () => {
      const result = enhancer.enhance('what changed since yesterday');
      expect(result.intent).toBe('action');
      expect(result.dateRange).toBeDefined();
    });

    it('should handle simple keyword queries', () => {
      const result = enhancer.enhance('budget report Q4');
      expect(result.intent).toBe('informational');
      expect(result.keywords.length).toBeGreaterThan(0);
    });
  });
});
