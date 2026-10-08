// ============================================================================
// Quanty Drive Tools — agentic Drive file operations for the Quanty file
// workspace (QM-M39-011, M39 screen 31).
// ============================================================================
//
// REAL tools backed by the real Drive AI services — never stubs. Every
// handler:
//   - is scoped to the calling userId (cross-user rows rejected with 403)
//   - executes a real backend op and returns the real result
//   - returns honest errors instead of invented content
//
// Tool safety flags:
//   - destructive: true  -> the agent layer pauses for user confirmation
//                          before calling (drive.organizeFile moves files)
//   - destructive: false -> read-only, runs without a prompt
// ============================================================================

import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';
import { AISearchContentService } from '../../ai-search-content.service';
import type { SearchPrismaClient } from '../../ai-search-content.service';
import { AIOrganizeService } from '../../ai-organize.service';
import type { OrganizePrismaClient } from '../../ai-organize.service';
import { AISummarizeFileService } from '../../ai-summarize-file.service';
import { checkedPlaintext } from '../../drive-storage.service';
import type {
  QuantyTool,
  QuantyToolContext,
  QuantyToolResult,
} from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriveFileRow {
  id: string;
  userId: string;
  name: string;
  mimeType: string;
  isDeleted: boolean;
  folderId: string | null;
  encryptedContent: string;
  encryptionIV: string;
  encryptionAuthTag: string;
  encryptionKey: string;
  contentHash?: string;
}

/**
 * Minimal Prisma surface the drive tools touch directly (injectable for
 * tests). The AI services receive the same client narrowed to their own
 * structural interfaces — same pattern as GitToolsPrisma.
 */
export interface DriveToolsPrisma {
  file: {
    findUnique: (args: unknown) => Promise<DriveFileRow | null>;
    findMany: (args: unknown) => Promise<DriveFileRow[]>;
  };
}

export interface DriveToolsDeps {
  prisma: DriveToolsPrisma;
  aiEngine: AIEngine;
}

/** File identifier: exactly one of fileId / fileName. */
const FILE_REF_SCHEMA = z
  .object({
    fileId: z.string().min(1).optional(),
    fileName: z.string().min(1).optional(),
  })
  .refine((v) => v.fileId || v.fileName, {
    message: 'Provide fileId or fileName',
  });

/** Mirrors drive.ts requireAiTextFile: AI extraction needs a text-based file. */
const AI_TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'application/xml',
  'application/x-yaml',
  'application/yaml',
  'application/javascript',
  'application/sql',
]);

function isTextFile(mimeType: string): boolean {
  const base = mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return base.startsWith('text/') || AI_TEXT_MIME_TYPES.has(base);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a file reference to a user-owned, non-deleted file row.
 * Honest errors: not found, cross-user (403), or ambiguous name (lists the
 * matches instead of guessing).
 */
export async function resolveDriveFile(
  prisma: DriveToolsPrisma,
  userId: string,
  ref: { fileId?: string; fileName?: string },
): Promise<DriveFileRow> {
  if (ref.fileId) {
    const file = await prisma.file.findUnique({ where: { id: ref.fileId } });
    if (!file || file.isDeleted) {
      throw createAppError('File not found', 404, 'FILE_NOT_FOUND');
    }
    if (file.userId !== userId) {
      throw createAppError('Not authorized to access this file', 403, 'FORBIDDEN');
    }
    return file;
  }
  const matches = await prisma.file.findMany({
    where: { userId, isDeleted: false, name: { contains: ref.fileName } },
    take: 10,
  });
  if (matches.length === 0) {
    throw createAppError(
      `No file named like "${ref.fileName}" found in your Drive`,
      404,
      'FILE_NOT_FOUND',
    );
  }
  if (matches.length > 1) {
    const names = matches
      .slice(0, 5)
      .map((m) => m.name)
      .join(', ');
    throw createAppError(
      `Multiple files match "${ref.fileName}" (${names}). Please be more specific.`,
      409,
      'AMBIGUOUS_FILE',
    );
  }
  return matches[0]!;
}

/** Read a file's plaintext for AI operations (fails closed on storage errors). */
async function readFileContent(file: DriveFileRow): Promise<string> {
  return (await checkedPlaintext(file)).toString('utf8');
}

function strArg(args: Record<string, unknown>, name: string): string | undefined {
  const v = args[name];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function failResult(message: string): QuantyToolResult {
  return { ok: false, summary: message };
}

// ---------------------------------------------------------------------------
// Tool builders
// ---------------------------------------------------------------------------

function searchFilesTool(deps: DriveToolsDeps): QuantyTool {
  return {
    name: 'drive.searchFiles',
    app: 'drive',
    description:
      'Search the user\'s Drive files by keyword. Returns matching files with names and ids. Use to find files.',
    parameters: {
      query: { type: 'string', description: 'Keywords to search for in file names and content', required: true },
      limit: { type: 'number', description: 'Maximum results (default 10)', required: false, default: 10 },
    },
    destructive: false,
    reversible: false,
    handler: async (args, ctx: QuantyToolContext): Promise<QuantyToolResult> => {
      const query = strArg(args, 'query');
      if (!query) return failResult('A search query is required.');
      const limitRaw = args['limit'];
      const limit =
        typeof limitRaw === 'number' && Number.isFinite(limitRaw)
          ? Math.min(50, Math.max(1, Math.floor(limitRaw)))
          : 10;
      const searchService = new AISearchContentService(deps.prisma as unknown as SearchPrismaClient);
      const results = await searchService.searchContent(query, ctx.userId, { limit });
      const items = results.map((r) => ({
        fileId: r.fileId,
        fileName: r.fileName,
        snippet: r.snippet,
        relevanceScore: r.relevanceScore,
      }));
      if (items.length === 0) {
        return { ok: true, data: { results: [] }, summary: `No Drive files matched "${query}".` };
      }
      return {
        ok: true,
        data: { results: items },
        summary: `Found ${items.length} file${items.length === 1 ? '' : 's'} matching "${query}".`,
      };
    },
  };
}

function suggestDestinationTool(deps: DriveToolsDeps): QuantyTool {
  return {
    name: 'drive.suggestDestination',
    app: 'drive',
    description:
      'Suggest the best folder for a file (category + confidence). Read-only: nothing is moved. Use to answer "where should this file go".',
    parameters: {
      fileId: { type: 'string', description: 'Drive file id', required: false },
      fileName: { type: 'string', description: 'File name (or part of it) when the id is unknown', required: false },
    },
    destructive: false,
    reversible: false,
    handler: async (args, ctx: QuantyToolContext): Promise<QuantyToolResult> => {
      const parsed = FILE_REF_SCHEMA.safeParse(args);
      if (!parsed.success) return failResult('Provide fileId or fileName.');
      const file = await resolveDriveFile(deps.prisma, ctx.userId, parsed.data);
      const content = await readFileContent(file);
      const organizeService = new AIOrganizeService(deps.aiEngine, deps.prisma as unknown as OrganizePrismaClient);
      const suggestion = await organizeService.categorizeFile(
        file.name,
        file.mimeType,
        content,
        ctx.userId,
      );
      return {
        ok: true,
        data: {
          fileId: file.id,
          fileName: file.name,
          suggestedFolder: suggestion.suggestedFolder,
          category: suggestion.category,
          confidence: suggestion.confidence,
        },
        summary: `"${file.name}" belongs in ${suggestion.suggestedFolder} (${suggestion.category}, confidence ${Math.round(suggestion.confidence * 100)}%).`,
      };
    },
  };
}

function summarizeFileTool(deps: DriveToolsDeps): QuantyTool {
  return {
    name: 'drive.summarizeFile',
    app: 'drive',
    description:
      'Summarize a text-based Drive file: returns a concise summary plus key points. Use to answer "what is in this file".',
    parameters: {
      fileId: { type: 'string', description: 'Drive file id', required: false },
      fileName: { type: 'string', description: 'File name (or part of it) when the id is unknown', required: false },
    },
    destructive: false,
    reversible: false,
    handler: async (args, ctx: QuantyToolContext): Promise<QuantyToolResult> => {
      const parsed = FILE_REF_SCHEMA.safeParse(args);
      if (!parsed.success) return failResult('Provide fileId or fileName.');
      const file = await resolveDriveFile(deps.prisma, ctx.userId, parsed.data);
      if (!isTextFile(file.mimeType)) {
        throw createAppError(
          'AI summarization requires a text-based file',
          415,
          'UNSUPPORTED_MEDIA_TYPE',
        );
      }
      const content = await readFileContent(file);
      const summarizeService = new AISummarizeFileService(deps.aiEngine);
      const result = await summarizeService.summarizeFile(
        { fileId: file.id, content, mimeType: file.mimeType, fileName: file.name },
        ctx.userId,
      );
      return {
        ok: true,
        data: { fileId: file.id, fileName: file.name, ...result },
        summary: `Summary of "${file.name}": ${result.summary}`,
      };
    },
  };
}

function organizeFileTool(deps: DriveToolsDeps): QuantyTool {
  return {
    name: 'drive.organizeFile',
    app: 'drive',
    description:
      'Move a file into its suggested folder (creates the folder if needed). Destructive: requires user confirmation.',
    parameters: {
      fileId: { type: 'string', description: 'Drive file id', required: false },
      fileName: { type: 'string', description: 'File name (or part of it) when the id is unknown', required: false },
    },
    destructive: true,
    reversible: true,
    handler: async (args, ctx: QuantyToolContext): Promise<QuantyToolResult> => {
      const parsed = FILE_REF_SCHEMA.safeParse(args);
      if (!parsed.success) return failResult('Provide fileId or fileName.');
      const file = await resolveDriveFile(deps.prisma, ctx.userId, parsed.data);
      const previousFolderId = file.folderId;
      const content = await readFileContent(file);
      const organizeService = new AIOrganizeService(deps.aiEngine, deps.prisma as unknown as OrganizePrismaClient);
      const result = await organizeService.autoOrganize(file.id, ctx.userId, content, true);
      return {
        ok: true,
        data: {
          fileId: result.fileId,
          fileName: file.name,
          folderId: result.folderId,
          category: result.category,
          confidence: result.confidence,
        },
        summary: `Moved "${file.name}" to ${result.suggestedFolder} (${result.category}).`,
        reversible: true,
        undoToken: { fileId: result.fileId, previousFolderId },
      };
    },
  };
}

/**
 * Build the real Drive tools for the Quanty registry.
 * Requires an AIEngine — without it the drive tools cannot be constructed
 * (callers skip them instead of registering broken tools).
 */
export function buildDriveTools(deps: DriveToolsDeps): QuantyTool[] {
  return [
    searchFilesTool(deps),
    suggestDestinationTool(deps),
    summarizeFileTool(deps),
    organizeFileTool(deps),
  ];
}
