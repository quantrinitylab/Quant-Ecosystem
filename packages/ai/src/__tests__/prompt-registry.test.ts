import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { PromptRegistry } from '../core/prompt-registry';

describe('PromptRegistry', () => {
  let registry: PromptRegistry;

  beforeEach(() => {
    const promptsDir = join(import.meta.dirname, '../../prompts');
    registry = new PromptRegistry(promptsDir);
  });

  describe('loadPrompt', () => {
    it('loads a YAML prompt file', () => {
      const template = registry.loadPrompt('chat-reply');
      expect(template.name).toBe('chat-reply');
      expect(template.version).toBe('1.0');
      expect(template.system_prompt).toContain('helpful');
      expect(template.user_template).toContain('{{context}}');
      expect(template.user_template).toContain('{{message}}');
      expect(template.parameters.temperature).toBe(0.7);
      expect(template.parameters.max_tokens).toBe(150);
    });

    it('loads email-summary prompt', () => {
      const template = registry.loadPrompt('email-summary');
      expect(template.name).toBe('email-summary');
      expect(template.user_template).toContain('{{subject}}');
      expect(template.user_template).toContain('{{sender}}');
      expect(template.user_template).toContain('{{body}}');
    });

    it('loads code-generate prompt', () => {
      const template = registry.loadPrompt('code-generate');
      expect(template.name).toBe('code-generate');
      expect(template.user_template).toContain('{{language}}');
      expect(template.user_template).toContain('{{task}}');
    });

    it('loads content-moderate prompt', () => {
      const template = registry.loadPrompt('content-moderate');
      expect(template.name).toBe('content-moderate');
      expect(template.parameters.temperature).toBe(0.1);
    });

    it('caches loaded prompts', () => {
      const template1 = registry.loadPrompt('chat-reply');
      const template2 = registry.loadPrompt('chat-reply');
      expect(template1).toBe(template2);
    });

    it('throws for non-existent prompt', () => {
      expect(() => registry.loadPrompt('nonexistent')).toThrow('not found');
    });

    it('validates version when specified', () => {
      const template = registry.loadPrompt('chat-reply', '1.0');
      expect(template.version).toBe('1.0');
    });

    it('throws on version mismatch', () => {
      expect(() => registry.loadPrompt('chat-reply', '99.0')).toThrow('Version mismatch');
    });
  });

  describe('interpolate', () => {
    it('replaces variables in templates', () => {
      const template = 'Hello {{name}}, welcome to {{place}}!';
      const result = registry.interpolate(template, { name: 'Alice', place: 'Wonderland' });
      expect(result).toBe('Hello Alice, welcome to Wonderland!');
    });

    it('leaves unmatched variables as-is', () => {
      const template = 'Hello {{name}}, your age is {{age}}';
      const result = registry.interpolate(template, { name: 'Bob' });
      expect(result).toBe('Hello Bob, your age is {{age}}');
    });

    it('handles empty variables object', () => {
      const template = 'Hello {{name}}!';
      const result = registry.interpolate(template, {});
      expect(result).toBe('Hello {{name}}!');
    });
  });

  describe('render', () => {
    it('loads and interpolates a prompt', () => {
      const result = registry.render('chat-reply', {
        context: 'We were discussing lunch options',
        message: 'What about pizza?',
      });
      expect(result.systemPrompt).toContain('helpful');
      expect(result.userPrompt).toContain('We were discussing lunch options');
      expect(result.userPrompt).toContain('What about pizza?');
      expect(result.parameters.temperature).toBe(0.7);
    });
  });

  describe('register', () => {
    it('registers templates directly', () => {
      registry.register('custom', {
        name: 'custom',
        version: '1.0',
        system_prompt: 'Custom system prompt',
        user_template: 'Custom user template with {{var}}',
        parameters: { temperature: 0.5, max_tokens: 100 },
      });
      expect(registry.has('custom')).toBe(true);
      const template = registry.loadPrompt('custom');
      expect(template.name).toBe('custom');
    });
  });

  describe('clearCache', () => {
    it('clears the template cache', () => {
      registry.loadPrompt('chat-reply');
      expect(registry.has('chat-reply')).toBe(true);
      registry.clearCache();
      expect(registry.has('chat-reply')).toBe(false);
    });
  });
});
