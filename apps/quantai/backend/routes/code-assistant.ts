import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  codeAssistantService,
  type SupportedLanguage,
  type RefactoringAction,
} from '../services/code-assistant.service';

const analyzeCodeSchema = z.object({
  sourceCode: z.string().min(1, 'sourceCode is required'),
  language: z
    .enum(['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'cpp', 'sql', 'html'])
    .optional(),
});

const refactorCodeSchema = z.object({
  sourceCode: z.string().min(1, 'sourceCode is required'),
  language: z.enum([
    'typescript',
    'javascript',
    'python',
    'go',
    'rust',
    'java',
    'cpp',
    'sql',
    'html',
  ]),
  action: z.enum(['add_types', 'optimize', 'generate_tests', 'explain', 'convert_language']),
  targetLanguage: z
    .enum(['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'cpp', 'sql', 'html'])
    .optional(),
});

export default async function codeAssistantRoutes(fastify: FastifyInstance) {
  // POST /api/ai/code/analyze
  fastify.post('/code/analyze', async (request, reply) => {
    const parseResult = analyzeCodeSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError(
        parseResult.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    try {
      const result = codeAssistantService.analyzeCode(
        parseResult.data.sourceCode,
        parseResult.data.language as SupportedLanguage | undefined,
      );
      return reply.send({ success: true, data: result });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw createAppError(err.message, 500, 'ANALYSIS_ERROR');
    }
  });

  // POST /api/ai/code/refactor
  fastify.post('/code/refactor', async (request, reply) => {
    const parseResult = refactorCodeSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError(
        parseResult.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    try {
      const result = codeAssistantService.refactorCode({
        sourceCode: parseResult.data.sourceCode,
        language: parseResult.data.language as SupportedLanguage,
        action: parseResult.data.action as RefactoringAction,
        targetLanguage: parseResult.data.targetLanguage as SupportedLanguage | undefined,
      });
      return reply.send({ success: true, data: result });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw createAppError(err.message, 500, 'REFACTOR_ERROR');
    }
  });
}
