import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  documentExtractorService,
  type ExtractedDocumentResult,
} from '../services/document-extractor.service';

const documentExtractSchema = z.object({
  rawText: z.string().min(1, 'rawText is required'),
  docType: z.enum(['invoice', 'receipt', 'table', 'unstructured', 'auto']).optional(),
});

const tableExtractSchema = z.object({
  csvContent: z.string().min(1, 'csvContent is required'),
});

export default async function extractorRoutes(fastify: FastifyInstance) {
  // POST /api/ai/extract/document (and /extract/document when mounted with prefix)
  const handleExtractDocument = async (request: any, reply: any) => {
    const parseResult = documentExtractSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError(
        parseResult.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const { rawText, docType } = parseResult.data;

    try {
      const result: ExtractedDocumentResult = documentExtractorService.extractFromTextContent(
        rawText,
        docType,
      );

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw createAppError(err.message, 500, 'EXTRACTION_ERROR');
    }
  };

  // POST /api/ai/extract/table (and /extract/table when mounted with prefix)
  const handleExtractTable = async (request: any, reply: any) => {
    const parseResult = tableExtractSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError(
        parseResult.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const { csvContent } = parseResult.data;

    try {
      const result = documentExtractorService.parseCsvToTable(csvContent);

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw createAppError(err.message, 500, 'TABLE_PARSE_ERROR');
    }
  };

  fastify.post('/extract/document', handleExtractDocument);
  fastify.post('/api/ai/extract/document', handleExtractDocument);

  fastify.post('/extract/table', handleExtractTable);
  fastify.post('/api/ai/extract/table', handleExtractTable);
}
