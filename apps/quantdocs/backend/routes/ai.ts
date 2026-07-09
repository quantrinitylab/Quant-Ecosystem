import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { AIEngine } from '@quant/ai';
import { AIWriteService } from '../services/ai-write.service';
import { createMemoryService, createInMemoryMemoryDb, UserStyleMemory } from '@quant/ai';
import { AIGrammarService } from '../services/ai-grammar.service';
import { AITranslateService } from '../services/ai-translate.service';
import { AIDiagramService } from '../services/ai-diagram.service';

const writeFromOutlineSchema = z.object({
  outline: z.array(z.string().min(1)).min(1),
  tone: z.enum(['formal', 'casual', 'academic', 'technical']).optional(),
  length: z.enum(['short', 'medium', 'long']).optional(),
});

const expandSectionSchema = z.object({
  section: z.string().min(1),
  context: z.string().optional(),
  targetLength: z.enum(['short', 'medium', 'long']).optional(),
});

const simplifySchema = z.object({
  text: z.string().min(1),
  targetAudience: z.enum(['general', 'technical', 'children', 'executive']).optional(),
});

const translateSchema = z.object({
  text: z.string().min(1),
  targetLanguage: z.string().min(1),
  sourceLanguage: z.string().optional(),
  preserveFormatting: z.boolean().optional(),
});

const grammarCheckSchema = z.object({
  text: z.string().min(1),
});

const tableFromTextSchema = z.object({
  text: z.string().min(1),
  format: z.enum(['markdown', 'html']).optional(),
});

const diagramFromTextSchema = z.object({
  text: z.string().min(1),
  diagramType: z.enum(['flowchart', 'sequence', 'class', 'entity-relationship']).optional(),
});

export default async function aiRoutes(fastify: FastifyInstance) {
  const ai = (fastify as unknown as { ai: AIEngine }).ai;
  const memoryDb = process.env['DATABASE_URL']
    ? ((fastify as unknown as { prisma?: unknown }).prisma ?? createInMemoryMemoryDb())
    : createInMemoryMemoryDb();
  const memoryBackend = createMemoryService({ prisma: memoryDb as never });
  const writeService = new AIWriteService(ai, new UserStyleMemory(memoryBackend));
  const grammarService = new AIGrammarService(ai);
  const translateService = new AITranslateService(ai);
  const diagramService = new AIDiagramService(ai);

  // POST /ai/write-from-outline
  fastify.post('/write-from-outline', async (request, reply) => {
    const parseResult = writeFromOutlineSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { outline, tone } = parseResult.data;
    const data = await writeService.writeFromOutline(outline, { tone }, userId);

    return reply.send({ success: true, data });
  });

  // POST /ai/expand-section
  fastify.post('/expand-section', async (request, reply) => {
    const parseResult = expandSectionSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { section, context } = parseResult.data;
    const data = await writeService.expandSection(section, context ?? '', userId);

    return reply.send({ success: true, data });
  });

  // POST /ai/simplify
  fastify.post('/simplify', async (request, reply) => {
    const parseResult = simplifySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { text, targetAudience } = parseResult.data;
    const audienceMap = {
      general: 'general',
      technical: 'technical',
      children: 'child',
      executive: 'general',
    } as const;
    const data = await writeService.simplify(
      text,
      audienceMap[targetAudience ?? 'general'],
      userId,
    );

    return reply.send({ success: true, data });
  });

  // POST /ai/translate
  fastify.post('/translate', async (request, reply) => {
    const parseResult = translateSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { text, targetLanguage, preserveFormatting } = parseResult.data;
    const data = await translateService.translate(
      text,
      targetLanguage,
      preserveFormatting ?? false,
      userId,
    );

    return reply.send({ success: true, data });
  });

  // POST /ai/grammar-check
  fastify.post('/grammar-check', async (request, reply) => {
    const parseResult = grammarCheckSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { text } = parseResult.data;
    const data = await grammarService.checkGrammar(text, userId);

    return reply.send({ success: true, data });
  });

  // POST /ai/table-from-text
  fastify.post('/table-from-text', async (request, reply) => {
    const parseResult = tableFromTextSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { text } = parseResult.data;
    const data = await diagramService.textToTable(text, userId);

    return reply.send({ success: true, data });
  });

  // POST /ai/diagram-from-text
  fastify.post('/diagram-from-text', async (request, reply) => {
    const parseResult = diagramFromTextSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { text, diagramType } = parseResult.data;
    const diagramTypeMap = {
      flowchart: 'flowchart',
      sequence: 'sequence',
      class: 'class',
      'entity-relationship': 'state',
    } as const;
    const data = await diagramService.textToDiagram(
      text,
      diagramTypeMap[diagramType ?? 'flowchart'],
      userId,
    );

    return reply.send({ success: true, data });
  });
}
