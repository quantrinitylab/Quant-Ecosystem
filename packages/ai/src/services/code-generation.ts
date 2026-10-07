// ============================================================================
// AI Services - Code Generation
// ============================================================================

import type { AIInferenceRequest } from '../types';
import { AIEngine } from '../core/engine';

export type CodeLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'cpp'
  | 'csharp'
  | 'ruby'
  | 'swift'
  | 'kotlin'
  | 'sql'
  | 'bash'
  | 'html'
  | 'css';

export interface CodeGenerationOptions {
  language: CodeLanguage;
  framework?: string;
  context?: string;
  existingCode?: string;
  style?: 'concise' | 'detailed' | 'documented';
}

export interface CodeGenerationResult {
  code: string;
  language: CodeLanguage;
  explanation: string;
  dependencies: string[];
  complexity: 'simple' | 'moderate' | 'complex';
}

export interface CodeExplanation {
  summary: string;
  steps: string[];
  complexity: 'simple' | 'moderate' | 'complex';
  language: string;
}

export interface CodeReviewResult {
  issues: CodeIssue[];
  suggestions: string[];
  overallScore: number;
  summary: string;
}

export interface CodeIssue {
  severity: 'error' | 'warning' | 'info';
  line: number | null;
  message: string;
  suggestion: string;
}

export class CodeGenerationService {
  private engine: AIEngine;

  constructor(engine: AIEngine) {
    this.engine = engine;
  }

  async generate(
    description: string,
    userId: string,
    options: CodeGenerationOptions,
  ): Promise<CodeGenerationResult> {
    const styleGuide: Record<string, string> = {
      concise: 'Write minimal, clean code with no comments unless necessary.',
      detailed: 'Include inline comments explaining key logic.',
      documented: 'Add JSDoc/docstring comments for all functions and types.',
    };

    const frameworkHint = options.framework ? ` using ${options.framework}` : '';
    const contextHint = options.context ? `\nAdditional context: ${options.context}` : '';
    const existingHint = options.existingCode
      ? `\nExisting code to extend or modify:\n\`\`\`${options.language}\n${options.existingCode}\n\`\`\``
      : '';

    const request: AIInferenceRequest = {
      prompt: `Generate ${options.language} code${frameworkHint} that: ${description}${contextHint}${existingHint}`,
      systemPrompt: `You are an expert ${options.language} developer. ${styleGuide[options.style || 'detailed']} Return only the code in a single code block with no markdown fences. After the code block, add a brief explanation.`,
      userId,
      app: 'quantai',
      feature: 'code_generation',
      temperature: 0.3,
      maxTokens: 2000,
    };

    const response = await this.engine.infer(request);
    return this.parseCodeResponse(response.content, options.language);
  }

  async explain(code: string, userId: string, language?: string): Promise<CodeExplanation> {
    const langHint = language ? ` (${language})` : '';

    const request: AIInferenceRequest = {
      prompt: `Explain this code${langHint}:\n\n\`\`\`\n${code}\n\`\`\``,
      systemPrompt:
        'Explain the code clearly. Provide a summary, step-by-step breakdown, complexity assessment, and detected language. Use this format:\nSummary: ...\nSteps:\n1. ...\nComplexity: simple|moderate|complex\nLanguage: ...',
      userId,
      app: 'quantai',
      feature: 'code_explanation',
      temperature: 0.3,
      maxTokens: 800,
    };

    const response = await this.engine.infer(request);
    return this.parseExplanation(response.content, language);
  }

  async review(code: string, userId: string, language?: string): Promise<CodeReviewResult> {
    const langHint = language ? ` (${language})` : '';

    const request: AIInferenceRequest = {
      prompt: `Review this code${langHint} for bugs, performance, and best practices:\n\n\`\`\`\n${code}\n\`\`\``,
      systemPrompt:
        'You are a senior code reviewer. Identify issues (errors, warnings, info), provide improvement suggestions, and rate overall quality 0-100. Format:\nIssues:\n- [severity] line N: message | suggestion\nSuggestions:\n- ...\nScore: N\nSummary: ...',
      userId,
      app: 'quantai',
      feature: 'code_review',
      temperature: 0.2,
      maxTokens: 1000,
    };

    const response = await this.engine.infer(request);
    return this.parseReview(response.content);
  }

  async refactor(
    code: string,
    userId: string,
    goal: string,
    language?: string,
  ): Promise<CodeGenerationResult> {
    const langHint = language || 'the same language';

    const request: AIInferenceRequest = {
      prompt: `Refactor this ${langHint} code to ${goal}:\n\n\`\`\`\n${code}\n\`\`\``,
      systemPrompt: `You are an expert developer. Refactor the code in ${langHint}. Return only the refactored code in a code block, followed by a brief explanation of changes.`,
      userId,
      app: 'quantai',
      feature: 'code_refactor',
      temperature: 0.3,
      maxTokens: 2000,
    };

    const response = await this.engine.infer(request);
    return this.parseCodeResponse(response.content, (language as CodeLanguage) || 'typescript');
  }

  async generateTests(
    code: string,
    userId: string,
    language: CodeLanguage,
    framework?: string,
  ): Promise<CodeGenerationResult> {
    const testFramework = framework || this.getDefaultTestFramework(language);

    const request: AIInferenceRequest = {
      prompt: `Generate unit tests using ${testFramework} for this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``,
      systemPrompt: `You are a testing expert. Write comprehensive unit tests covering happy paths, edge cases, and error cases using ${testFramework}. Return only the test code.`,
      userId,
      app: 'quantai',
      feature: 'code_test_generation',
      temperature: 0.2,
      maxTokens: 2000,
    };

    const response = await this.engine.infer(request);
    return this.parseCodeResponse(response.content, language);
  }

  private getDefaultTestFramework(language: CodeLanguage): string {
    const defaults: Record<string, string> = {
      typescript: 'vitest',
      javascript: 'jest',
      python: 'pytest',
      rust: 'cargo test',
      go: 'testing',
      java: 'JUnit 5',
      cpp: 'Google Test',
      csharp: 'xUnit',
      ruby: 'RSpec',
      swift: 'XCTest',
      kotlin: 'JUnit 5',
      sql: 'tSQLt',
      bash: 'Bats',
      html: 'Cypress',
      css: 'Jest + CSS modules',
    };
    return defaults[language] || 'the standard test framework';
  }

  private parseCodeResponse(content: string, language: CodeLanguage): CodeGenerationResult {
    const codeBlockMatch = content.match(/```[\w]*\n([\s\S]*?)```/);
    const code = codeBlockMatch ? codeBlockMatch[1]!.trim() : content.trim();
    const explanation = codeBlockMatch
      ? content.replace(codeBlockMatch[0], '').trim()
      : 'Generated code based on your description.';

    const dependencyMatches = content.match(
      /(?:import|require|from|use|depend)\s+['"`]?([\w@\-\/]+)/g,
    );
    const dependencies = dependencyMatches
      ? [
          ...new Set(
            dependencyMatches.map((m) =>
              m.replace(/^(?:import|require|from|use|depend)\s+['"`]?/, ''),
            ),
          ),
        ]
      : [];

    const lineCount = code.split('\n').length;
    const complexity = lineCount < 20 ? 'simple' : lineCount < 60 ? 'moderate' : 'complex';

    return {
      code,
      language,
      explanation,
      dependencies,
      complexity,
    };
  }

  private parseExplanation(content: string, language?: string): CodeExplanation {
    const summaryMatch = content.match(/Summary:\s*(.+)/i);
    const complexityMatch = content.match(/Complexity:\s*(simple|moderate|complex)/i);
    const languageMatch = content.match(/Language:\s*(.+)/i);

    const steps: string[] = [];
    const stepsMatch = content.match(/Steps:\s*([\s\S]*?)(?=Complexity:|$)/i);
    if (stepsMatch) {
      const stepLines = stepsMatch[1]!.split('\n').filter((l) => l.trim().match(/^\d/));
      for (const line of stepLines) {
        steps.push(line.replace(/^\d+[\.\)]\s*/, '').trim());
      }
    }

    return {
      summary: summaryMatch ? summaryMatch[1]!.trim() : content.slice(0, 200),
      steps:
        steps.length > 0
          ? steps
          : ['Analyze the code structure', 'Identify key operations', 'Review output behavior'],
      complexity: (complexityMatch ? complexityMatch[1]!.toLowerCase() : 'moderate') as
        | 'simple'
        | 'moderate'
        | 'complex',
      language: languageMatch ? languageMatch[1]!.trim() : language || 'unknown',
    };
  }

  private parseReview(content: string): CodeReviewResult {
    const issues: CodeIssue[] = [];
    const issueLines = content.match(
      /-\s*\[(error|warning|info)\]\s*(?:line\s*(\d+))?:\s*(.+?)(?:\|\s*(.+))?$/gim,
    );
    if (issueLines) {
      for (const line of issueLines) {
        const match = line.match(
          /-\s*\[(error|warning|info)\]\s*(?:line\s*(\d+))?:\s*(.+?)(?:\|\s*(.+))?$/i,
        );
        if (match) {
          issues.push({
            severity: match[1]!.toLowerCase() as 'error' | 'warning' | 'info',
            line: match[2] ? parseInt(match[2], 10) : null,
            message: match[3]!.trim(),
            suggestion: match[4]?.trim() || '',
          });
        }
      }
    }

    const suggestions: string[] = [];
    const suggestionSection = content.match(/Suggestions:\s*([\s\S]*?)(?=Score:|$)/i);
    if (suggestionSection) {
      const lines = suggestionSection[1]!.split('\n').filter((l) => l.trim().startsWith('-'));
      for (const line of lines) {
        suggestions.push(line.replace(/^-\s*/, '').trim());
      }
    }

    const scoreMatch = content.match(/Score:\s*(\d+)/i);
    const summaryMatch = content.match(/Summary:\s*(.+)/i);

    return {
      issues,
      suggestions,
      overallScore: scoreMatch ? parseInt(scoreMatch[1]!, 10) : 75,
      summary: summaryMatch ? summaryMatch[1]!.trim() : 'Code review completed.',
    };
  }
}
