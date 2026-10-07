import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (modelId: string) => ({ modelId, provider: 'openai' })),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => (modelId: string) => ({ modelId, provider: 'anthropic' })),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => (modelId: string) => ({ modelId, provider: 'google' })),
}));

import { generateText } from 'ai';
import { CodeGenerationService } from '../services/code-generation';
import { AIEngine } from '../core/engine';

describe('CodeGenerationService', () => {
  let service: CodeGenerationService;
  let engine: AIEngine;

  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('GOOGLE_API_KEY', '');

    engine = new AIEngine({ enableCaching: false, costBudgetPerUser: 100, costBudgetPerDay: 1000 });
    service = new CodeGenerationService(engine);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('generate', () => {
    it('generates code with explanation', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: '```typescript\nfunction add(a: number, b: number): number {\n  return a + b;\n}\n```\nThis function adds two numbers.',
        usage: { promptTokens: 30, completionTokens: 40 },
      } as never);

      const result = await service.generate('add two numbers', 'user-1', {
        language: 'typescript',
      });

      expect(result.code).toContain('function add');
      expect(result.language).toBe('typescript');
      expect(result.explanation).toContain('adds two numbers');
      expect(result.complexity).toBe('simple');
    });

    it('detects complexity based on line count', async () => {
      const longCode = Array.from({ length: 70 }, (_, i) => `  const line${i} = ${i};`).join('\n');
      vi.mocked(generateText).mockResolvedValue({
        text: '```typescript\n' + longCode + '\n```\nComplex implementation.',
        usage: { promptTokens: 30, completionTokens: 200 },
      } as never);

      const result = await service.generate('complex system', 'user-1', {
        language: 'typescript',
      });

      expect(result.complexity).toBe('complex');
    });

    it('uses framework hint when specified', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: '```typescript\nimport { useState } from "react";\n```\nReact component.',
        usage: { promptTokens: 30, completionTokens: 20 },
      } as never);

      await service.generate('counter component', 'user-1', {
        language: 'typescript',
        framework: 'React',
      });

      const call = vi.mocked(generateText).mock.calls[0]![0] as {
        messages: Array<{ content: string }>;
      };
      const userMsg = call.messages.find((m: any) => m.content?.includes('React'));
      expect(userMsg).toBeDefined();
    });
  });

  describe('explain', () => {
    it('returns code explanation', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: 'Summary: This code sorts an array\nSteps:\n1. Create copy\n2. Sort with comparator\nComplexity: simple\nLanguage: typescript',
        usage: { promptTokens: 40, completionTokens: 30 },
      } as never);

      const result = await service.explain('arr.sort((a, b) => a - b)', 'user-1', 'typescript');

      expect(result.summary).toContain('sorts an array');
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.complexity).toBe('simple');
      expect(result.language).toBe('typescript');
    });
  });

  describe('review', () => {
    it('returns code review with issues and score', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: 'Issues:\n- [warning] line 3: Missing null check | Add null guard\n- [info] line 5: Consider using const | Use const\nSuggestions:\n- Add error handling\n- Use TypeScript strict mode\nScore: 72\nSummary: Decent code with minor improvements needed.',
        usage: { promptTokens: 50, completionTokens: 60 },
      } as never);

      const result = await service.review('let x = getValue()', 'user-1', 'typescript');

      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]!.severity).toBe('warning');
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.overallScore).toBe(72);
      expect(result.summary).toContain('Decent code');
    });
  });

  describe('refactor', () => {
    it('returns refactored code', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: '```typescript\nconst add = (a: number, b: number): number => a + b;\n```\nRefactored to arrow function.',
        usage: { promptTokens: 30, completionTokens: 20 },
      } as never);

      const result = await service.refactor(
        'function add(a, b) { return a + b; }',
        'user-1',
        'use arrow functions and types',
        'typescript',
      );

      expect(result.code).toContain('=>');
      expect(result.language).toBe('typescript');
    });
  });

  describe('generateTests', () => {
    it('generates test code', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: "```typescript\nimport { describe, it, expect } from 'vitest';\ndescribe('add', () => {\n  it('adds two numbers', () => {\n    expect(add(1, 2)).toBe(3);\n  });\n});\n```",
        usage: { promptTokens: 40, completionTokens: 50 },
      } as never);

      const result = await service.generateTests(
        'function add(a: number, b: number) { return a + b; }',
        'user-1',
        'typescript',
      );

      expect(result.code).toContain('describe');
      expect(result.language).toBe('typescript');
    });

    it('uses custom test framework when specified', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: '```typescript\n// jest test code\n```',
        usage: { promptTokens: 40, completionTokens: 30 },
      } as never);

      await service.generateTests('function add() {}', 'user-1', 'typescript', 'jest');

      const call = vi.mocked(generateText).mock.calls[0]![0] as {
        messages: Array<{ content: string }>;
      };
      const userMsg = call.messages.find((m: any) => m.content?.includes('jest'));
      expect(userMsg).toBeDefined();
    });
  });
});
