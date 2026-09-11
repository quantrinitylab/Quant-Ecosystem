import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export const CATEGORIES = [
  'Documents', 'Images', 'Videos', 'Music', 'Archives', 'Receipts',
  'Code', 'Spreadsheets', 'Presentations', 'Other',
] as const;
export type DriveCategory = (typeof CATEGORIES)[number];

const CategorySchema = z.enum(CATEGORIES);
const CategorizeResponseSchema = z.object({
  category: CategorySchema,
  confidence: z.number().min(0).max(1),
});

const MIME_CATEGORY_MAP: Record<string, DriveCategory> = {
  'image/': 'Images', 'video/': 'Videos', 'audio/': 'Music',
  'application/zip': 'Archives', 'application/x-rar': 'Archives',
  'application/x-tar': 'Archives', 'application/gzip': 'Archives',
  'application/x-7z-compressed': 'Archives', 'application/pdf': 'Documents',
  'text/csv': 'Spreadsheets', 'application/vnd.ms-excel': 'Spreadsheets',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Spreadsheets',
  'application/vnd.ms-powerpoint': 'Presentations',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'Presentations',
  'text/plain': 'Documents', 'text/markdown': 'Documents',
  'application/msword': 'Documents',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Documents',
};

const EXTENSION_CATEGORY_MAP: Record<string, DriveCategory> = {
  '.ts': 'Code', '.js': 'Code', '.py': 'Code', '.java': 'Code', '.c': 'Code',
  '.cpp': 'Code', '.h': 'Code', '.go': 'Code', '.rs': 'Code', '.rb': 'Code',
  '.php': 'Code', '.swift': 'Code', '.kt': 'Code', '.cs': 'Code', '.html': 'Code',
  '.css': 'Code', '.json': 'Code', '.xml': 'Code', '.yaml': 'Code', '.yml': 'Code',
  '.sh': 'Code', '.png': 'Images', '.jpg': 'Images', '.jpeg': 'Images', '.gif': 'Images',
  '.svg': 'Images', '.webp': 'Images', '.mp4': 'Videos', '.avi': 'Videos', '.mov': 'Videos',
  '.mkv': 'Videos', '.mp3': 'Music', '.wav': 'Music', '.flac': 'Music', '.ogg': 'Music',
  '.zip': 'Archives', '.rar': 'Archives', '.tar': 'Archives', '.gz': 'Archives',
  '.7z': 'Archives', '.pdf': 'Documents', '.doc': 'Documents', '.docx': 'Documents',
  '.txt': 'Documents', '.md': 'Documents', '.xls': 'Spreadsheets', '.xlsx': 'Spreadsheets',
  '.csv': 'Spreadsheets', '.ppt': 'Presentations', '.pptx': 'Presentations',
};

export interface CategorizeResult {
  suggestedFolder: string;
  category: DriveCategory;
  confidence: number;
}

export interface AutoOrganizeResult extends CategorizeResult {
  fileId: string;
  folderId: string | null;
  applied: boolean;
}

type Db = any;

export class AIOrganizeService {
  constructor(private readonly ai: AIEngine, private readonly prisma: Db) {}

  async categorizeFile(
    filename: string,
    mimeType: string,
    contentPreview: string,
    userId: string,
  ): Promise<CategorizeResult> {
    const heuristic = this.categorizeByHeuristics(filename, mimeType);
    const lowerName = filename.toLowerCase();
    if (lowerName.includes('receipt') || lowerName.includes('invoice') || lowerName.includes('bill')) {
      return { suggestedFolder: '/Receipts', category: 'Receipts', confidence: 0.85 };
    }
    try {
      const response = await this.ai.infer({
        prompt: `Classify this file into one category: ${CATEGORIES.join(', ')}.\n\nFilename: ${filename}\nMIME Type: ${mimeType}\nContent Preview: ${contentPreview.slice(0, 500)}\n\nRespond ONLY with JSON: {"category":"CategoryName","confidence":0.0}`,
        systemPrompt:
          'You organize files. Return only an allowed category and confidence as valid JSON.',
        userId,
        app: 'quantmail',
        feature: 'drive-ai-organize',
        temperature: 0.3,
        maxTokens: 256,
      });
      const parsed = CategorizeResponseSchema.safeParse(JSON.parse(response.content));
      if (parsed.success) {
        return {
          suggestedFolder: `/${parsed.data.category}`,
          category: parsed.data.category,
          confidence: parsed.data.confidence,
        };
      }
    } catch {
      // Fail closed to the deterministic category below.
    }
    return { suggestedFolder: `/${heuristic}`, category: heuristic, confidence: 0.7 };
  }

  async autoOrganize(
    fileId: string,
    userId: string,
    contentPreview: string,
    apply = true,
  ): Promise<AutoOrganizeResult> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.isDeleted) throw createAppError('File not found', 404, 'FILE_NOT_FOUND');
    if (file.userId !== userId) {
      throw createAppError('Not authorized to access this file', 403, 'FORBIDDEN');
    }
    const result = await this.categorizeFile(file.name, file.mimeType, contentPreview, userId);
    if (!apply) return { fileId, ...result, folderId: null, applied: false };

    let folder = await this.prisma.folder.findFirst({
      where: { userId, parentId: null, name: result.category, isDeleted: false },
    });
    if (!folder) {
      folder = await this.prisma.folder.create({
        data: { userId, name: result.category, parentId: null, path: `/${result.category}` },
      });
    }
    await this.prisma.file.update({ where: { id: fileId }, data: { folderId: folder.id } });
    return { fileId, ...result, folderId: folder.id, applied: true };
  }

  private categorizeByHeuristics(filename: string, mimeType: string): DriveCategory {
    for (const [prefix, category] of Object.entries(MIME_CATEGORY_MAP)) {
      if (mimeType === prefix || mimeType.startsWith(prefix)) return category;
    }
    const dot = filename.lastIndexOf('.');
    if (dot >= 0) return EXTENSION_CATEGORY_MAP[filename.slice(dot).toLowerCase()] ?? 'Other';
    return 'Other';
  }
}
