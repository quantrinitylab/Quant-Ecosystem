// ============================================================================
// QuantAI — Central File Library Service ('Upload once, use anytime')
//
// Task W39-A05: Sovereign multi-chat file indexing, categorized metadata indexing,
// cross-chat attachment tracking, storage ledger, and usage statistics.
// Automatic MIME-type categorization: `image`, `document`, `code`, `data`, `audio`, `archive`.
// ============================================================================

import { randomUUID } from 'node:crypto';

export type FileCategory =
  | 'image'
  | 'document'
  | 'code'
  | 'data'
  | 'audio'
  | 'archive'
  | 'DOCUMENTS'
  | 'CODE'
  | 'MEDIA'
  | 'DATA';

export type CanonicalCategory = 'image' | 'document' | 'code' | 'data' | 'audio' | 'archive';

export interface FileEntry {
  id: string;
  userId: string;
  name: string;
  originalName?: string;
  sizeBytes: number;
  formattedSize: string;
  mimeType: string;
  category: CanonicalCategory;
  granularCategory: CanonicalCategory;
  storageKey: string;
  storageUri?: string;
  hash?: string;
  tags?: string[];
  sourceChatId?: string;
  chatId?: string;
  chatIds: string[];
  attachedChatIds: string[];
  linkedChatIds: string[];
  projectId?: string;
  createdAt: string; // ISO 8601 string
  updatedAt: string; // ISO 8601 string
  lastUsedAt: string; // ISO 8601 string
  lastAccessedAt: string; // ISO 8601 string
  usageCount: number;
  metadata?: Record<string, unknown>;
}

export type LibraryFile = FileEntry;

export interface IndexFileInput {
  id?: string;
  userId: string;
  name: string;
  originalName?: string;
  sizeBytes: number;
  mimeType?: string;
  category?: FileCategory;
  storageKey?: string;
  storageUri?: string;
  hash?: string;
  tags?: string[];
  sourceChatId?: string;
  chatId?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
}

export interface UploadFileInput {
  userId: string;
  name: string;
  content: Buffer | string;
  mimeType?: string;
  category?: FileCategory;
  sourceChatId?: string;
  chatId?: string;
  projectId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ListFilesFilter {
  category?: FileCategory | string;
  projectId?: string;
  chatId?: string;
  sourceChatId?: string;
  tag?: string;
  search?: string;
  sortBy?:
    | 'name'
    | 'sizeBytes'
    | 'usageCount'
    | 'createdAt'
    | 'updatedAt'
    | 'lastUsedAt'
    | 'lastAccessedAt';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface SearchFilesOptions {
  category?: FileCategory | string;
  projectId?: string;
  chatId?: string;
  limit?: number;
  offset?: number;
}

export interface CategoryStats {
  count: number;
  sizeBytes: number;
  formattedSize: string;
}

export interface FileLibraryStats {
  totalFiles: number;
  totalSizeBytes: number;
  formattedTotalSize: string;
  linkedChatsCount: number;
  byCategory: Record<string, CategoryStats>;
  recentFiles: FileEntry[];
  mostRecentFile?: FileEntry | null;
  mostUsedFile?: FileEntry | null;
}

export interface StorageUsage {
  totalBytes: number;
  usedBytes: number;
  quotaBytes: number;
  percentage: number;
  fileCount: number;
  formattedUsed: string;
  formattedQuota: string;
}

// ============================================================================
// Automatic MIME-Type & Extension Categorization Map
// ============================================================================

const EXTENSION_CATEGORY_MAP: Record<string, CanonicalCategory> = {
  // DOCUMENTS
  pdf: 'document',
  doc: 'document',
  docx: 'document',
  txt: 'document',
  md: 'document',
  markdown: 'document',
  rtf: 'document',
  odt: 'document',
  epub: 'document',
  tex: 'document',
  pages: 'document',
  ppt: 'document',
  pptx: 'document',
  key: 'document',

  // CODE
  ts: 'code',
  tsx: 'code',
  js: 'code',
  jsx: 'code',
  mjs: 'code',
  cjs: 'code',
  py: 'code',
  pyw: 'code',
  html: 'code',
  htm: 'code',
  css: 'code',
  scss: 'code',
  sass: 'code',
  less: 'code',
  c: 'code',
  cpp: 'code',
  cc: 'code',
  cxx: 'code',
  h: 'code',
  hpp: 'code',
  rs: 'code',
  go: 'code',
  java: 'code',
  kt: 'code',
  kts: 'code',
  rb: 'code',
  php: 'code',
  swift: 'code',
  sh: 'code',
  bash: 'code',
  zsh: 'code',
  fish: 'code',
  ps1: 'code',
  bat: 'code',
  cmd: 'code',
  yaml: 'code',
  yml: 'code',
  toml: 'code',
  sql: 'code',
  graphql: 'code',
  gql: 'code',
  proto: 'code',
  dockerfile: 'code',
  json: 'code',

  // IMAGES
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  bmp: 'image',
  ico: 'image',
  tiff: 'image',
  tif: 'image',
  avif: 'image',
  heic: 'image',
  mp4: 'image', // media
  webm: 'image',
  mov: 'image',
  avi: 'image',
  mkv: 'image',

  // AUDIO
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  flac: 'audio',
  aac: 'audio',
  m4a: 'audio',
  opus: 'audio',
  wma: 'audio',
  aiff: 'audio',

  // DATA
  csv: 'data',
  tsv: 'data',
  xlsx: 'data',
  xls: 'data',
  parquet: 'data',
  arrow: 'data',
  feather: 'data',
  sqlite: 'data',
  sqlite3: 'data',
  db: 'data',
  ndjson: 'data',
  jsonl: 'data',
  h5: 'data',
  hdf5: 'data',
  ods: 'data',

  // ARCHIVE
  zip: 'archive',
  tar: 'archive',
  gz: 'archive',
  tgz: 'archive',
  '7z': 'archive',
  rar: 'archive',
  bz2: 'archive',
  xz: 'archive',
};

const MIME_CATEGORY_PREFIXES: Array<{ prefix: string; category: CanonicalCategory }> = [
  { prefix: 'image/', category: 'image' },
  { prefix: 'video/', category: 'image' },
  { prefix: 'audio/', category: 'audio' },
  { prefix: 'text/csv', category: 'data' },
  { prefix: 'text/tab-separated-values', category: 'data' },
  { prefix: 'application/vnd.ms-excel', category: 'data' },
  { prefix: 'application/vnd.openxmlformats-officedocument.spreadsheetml', category: 'data' },
  { prefix: 'application/x-parquet', category: 'data' },
  { prefix: 'application/vnd.apache.parquet', category: 'data' },
  { prefix: 'application/x-sqlite', category: 'data' },
  { prefix: 'application/vnd.sqlite', category: 'data' },
  { prefix: 'application/vnd.arrow', category: 'data' },
  { prefix: 'application/geo+json', category: 'data' },
  { prefix: 'application/zip', category: 'archive' },
  { prefix: 'application/x-zip', category: 'archive' },
  { prefix: 'application/x-tar', category: 'archive' },
  { prefix: 'application/tar', category: 'archive' },
  { prefix: 'application/gzip', category: 'archive' },
  { prefix: 'application/x-gzip', category: 'archive' },
  { prefix: 'application/x-7z', category: 'archive' },
  { prefix: 'application/x-rar', category: 'archive' },
  { prefix: 'application/vnd.rar', category: 'archive' },
  { prefix: 'application/json', category: 'code' },
  { prefix: 'application/javascript', category: 'code' },
  { prefix: 'text/javascript', category: 'code' },
  { prefix: 'text/typescript', category: 'code' },
  { prefix: 'application/typescript', category: 'code' },
  { prefix: 'text/x-python', category: 'code' },
  { prefix: 'application/x-python', category: 'code' },
  { prefix: 'text/html', category: 'code' },
  { prefix: 'text/css', category: 'code' },
  { prefix: 'text/x-c', category: 'code' },
  { prefix: 'application/pdf', category: 'document' },
  { prefix: 'application/msword', category: 'document' },
  {
    prefix: 'application/vnd.openxmlformats-officedocument.wordprocessingml',
    category: 'document',
  },
  { prefix: 'text/markdown', category: 'document' },
  { prefix: 'text/plain', category: 'document' },
];

/**
 * Normalizes any category string (lowercase/uppercase/legacy) to CanonicalCategory ('document', 'code', etc.).
 */
export function normalizeCategory(category?: string): CanonicalCategory {
  if (!category) return 'document';
  const lower = category.toLowerCase().trim();
  if (lower === 'code') return 'code';
  if (lower === 'data') return 'data';
  if (lower === 'media' || lower === 'image') return 'image';
  if (lower === 'audio') return 'audio';
  if (lower === 'archive') return 'archive';
  if (lower === 'document' || lower === 'documents') return 'document';
  return 'document';
}

/**
 * Detect file category from filename extension and/or MIME type.
 * Returns CanonicalCategory ('document' | 'code' | 'image' | 'data' | 'audio' | 'archive').
 */
export function detectFileCategory(filename: string, mimeType?: string): CanonicalCategory {
  const extMatch = filename.toLowerCase().match(/\.([a-z0-9_-]+)$/);
  if (extMatch && extMatch[1]) {
    const ext = extMatch[1];
    if (EXTENSION_CATEGORY_MAP[ext]) {
      return EXTENSION_CATEGORY_MAP[ext];
    }
  }

  if (mimeType) {
    const lowerMime = mimeType.toLowerCase();
    for (const mapping of MIME_CATEGORY_PREFIXES) {
      if (lowerMime.startsWith(mapping.prefix)) {
        return mapping.category;
      }
    }
  }

  return 'document';
}

export function categorizeMimeType(mimeType: string, filename?: string): CanonicalCategory {
  return detectFileCategory(filename ?? '', mimeType);
}

/**
 * Formats raw byte count into human-readable size string (e.g. '1.5 KB', '3.0 MB', '11.8 MB').
 * Standard binary powers of 1024.
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const digitGroups = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, digitGroups);
  return `${size.toFixed(digitGroups === 0 ? 0 : 1)} ${units[digitGroups]}`;
}

// ============================================================================
// FileLibraryService Implementation
// ============================================================================

export class FileLibraryService {
  private files: Map<string, FileEntry> = new Map();
  private contents: Map<string, Buffer | string> = new Map();

  /**
   * Reset all indexed files (primarily for test resets).
   */
  clear(): void {
    this.files.clear();
    this.contents.clear();
  }

  clearAll(): void {
    this.clear();
  }

  clearUserFiles(userId: string): void {
    for (const [id, file] of this.files.entries()) {
      if (file.userId === userId) {
        this.files.delete(id);
        this.contents.delete(id);
      }
    }
  }

  /**
   * Index a file into the central library.
   * If a file with matching SHA-256 hash already exists for the user,
   * automatically links the new chat to the existing file ('Upload once, use anytime').
   */
  indexFile(input: IndexFileInput): FileEntry {
    if (!input.userId) {
      throw new Error('userId is required to index file');
    }
    if (!input.name || input.name.trim().length === 0) {
      throw new Error('name is required to index file');
    }
    if (typeof input.sizeBytes !== 'number' || input.sizeBytes < 0) {
      throw new Error('sizeBytes must be a non-negative number');
    }

    const cleanName = input.name.trim();
    const cleanOriginalName = (input.originalName || cleanName).trim();
    const cleanMime = (input.mimeType || 'application/octet-stream').trim();
    const initialChat = input.sourceChatId ?? input.chatId;

    // Deduplication check: if hash matches existing file for this user
    if (input.hash) {
      for (const existing of this.files.values()) {
        if (existing.userId === input.userId && existing.hash === input.hash) {
          if (initialChat) {
            if (!existing.linkedChatIds.includes(initialChat)) {
              existing.linkedChatIds.push(initialChat);
            }
            if (!existing.attachedChatIds.includes(initialChat)) {
              existing.attachedChatIds.push(initialChat);
            }
            if (!existing.chatIds.includes(initialChat)) {
              existing.chatIds.push(initialChat);
            }
            existing.usageCount += 1;
          }
          if (input.tags && input.tags.length > 0) {
            const currentTags = new Set(existing.tags ?? []);
            input.tags.forEach((t) => currentTags.add(t.toLowerCase().trim()));
            existing.tags = Array.from(currentTags);
          }
          const now = new Date().toISOString();
          existing.updatedAt = now;
          existing.lastAccessedAt = now;
          existing.lastUsedAt = now;
          return existing;
        }
      }
    }

    const id = input.id ?? `file-${randomUUID()}`;
    const category: CanonicalCategory = input.category
      ? normalizeCategory(input.category)
      : detectFileCategory(cleanName, cleanMime);

    const storageKey =
      input.storageKey ??
      input.storageUri ??
      `quantai/files/${input.userId}/${id}-${cleanName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const now = new Date().toISOString();
    const chatList: string[] = initialChat ? [initialChat] : [];

    const tags = Array.from(
      new Set((input.tags ?? []).map((t) => t.toLowerCase().trim()).filter((t) => t.length > 0)),
    );

    const entry: FileEntry = {
      id,
      userId: input.userId,
      name: cleanName,
      originalName: cleanOriginalName,
      sizeBytes: input.sizeBytes,
      formattedSize: formatBytes(input.sizeBytes),
      mimeType: cleanMime,
      category,
      granularCategory: category,
      storageKey,
      storageUri: storageKey,
      hash: input.hash,
      tags,
      sourceChatId: initialChat,
      chatId: initialChat,
      chatIds: [...chatList],
      attachedChatIds: [...chatList],
      linkedChatIds: [...chatList],
      projectId: input.projectId,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      lastAccessedAt: now,
      usageCount: initialChat ? 1 : 0,
      metadata: input.metadata,
    };

    this.files.set(id, entry);
    return entry;
  }

  /**
   * Upload and store file content and metadata.
   */
  uploadFile(input: UploadFileInput): FileEntry {
    const sizeBytes = Buffer.isBuffer(input.content)
      ? input.content.length
      : Buffer.byteLength(input.content, 'utf8');

    const entry = this.indexFile({
      userId: input.userId,
      name: input.name,
      sizeBytes,
      mimeType: input.mimeType,
      category: input.category,
      sourceChatId: input.sourceChatId ?? input.chatId,
      chatId: input.sourceChatId ?? input.chatId,
      projectId: input.projectId,
      tags: input.tags,
      metadata: input.metadata,
    });

    this.contents.set(entry.id, input.content);
    return entry;
  }

  /**
   * Retrieve file content.
   */
  getFileContent(userId: string, fileId: string): Buffer | string {
    const file = this.getFile(userId, fileId);
    if (!file) {
      throw new Error(`File ${fileId} not found`);
    }
    const content = this.contents.get(fileId);
    if (content === undefined) {
      throw new Error(`Content for file ${fileId} not stored`);
    }
    return content;
  }

  /**
   * Retrieve single file entry by userId and fileId.
   */
  getFile(userId: string, fileId: string): FileEntry | null {
    const file = this.files.get(fileId);
    if (!file || file.userId !== userId) return null;
    return file;
  }

  getFileById(fileId: string, userId?: string): FileEntry | null {
    const file = this.files.get(fileId);
    if (!file) return null;
    if (userId && file.userId !== userId) return null;
    return file;
  }

  /**
   * List files for a user with category, project, chat, and tag filters.
   */
  listFiles(userId: string, filters?: ListFilesFilter): FileEntry[] {
    if (!userId) return [];

    const results: FileEntry[] = [];

    for (const file of this.files.values()) {
      if (file.userId !== userId) continue;

      // Category filter
      if (filters?.category && filters.category.toLowerCase() !== 'all') {
        const targetCategory = normalizeCategory(filters.category);
        if (file.category !== targetCategory) {
          continue;
        }
      }

      // Project filter
      if (filters?.projectId && file.projectId !== filters.projectId) {
        continue;
      }

      // Chat filter
      const targetChat = filters?.chatId ?? filters?.sourceChatId;
      if (targetChat) {
        const inChat =
          file.linkedChatIds.includes(targetChat) ||
          file.attachedChatIds.includes(targetChat) ||
          file.chatIds.includes(targetChat) ||
          file.sourceChatId === targetChat;
        if (!inChat) {
          continue;
        }
      }

      // Tag filter
      if (
        filters?.tag &&
        (!file.tags ||
          !file.tags.some((t) => t.toLowerCase() === filters.tag?.toLowerCase().trim()))
      ) {
        continue;
      }

      // Search filter
      if (filters?.search && filters.search.trim().length > 0) {
        const q = filters.search.toLowerCase().trim();
        const matchesName = file.name.toLowerCase().includes(q);
        const matchesMime = file.mimeType.toLowerCase().includes(q);
        const matchesCategory = file.category.toLowerCase().includes(q);
        const matchesTag = file.tags?.some((t) => t.toLowerCase().includes(q)) ?? false;
        const matchesMetadata = file.metadata
          ? Object.values(file.metadata).some((v) => String(v).toLowerCase().includes(q))
          : false;

        if (!matchesName && !matchesMime && !matchesCategory && !matchesTag && !matchesMetadata) {
          continue;
        }
      }

      results.push(file);
    }

    // Sorting
    const sortBy = filters?.sortBy ?? 'lastUsedAt';
    const sortOrder = filters?.sortOrder ?? 'desc';

    results.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'sizeBytes':
          comparison = a.sizeBytes - b.sizeBytes;
          break;
        case 'usageCount':
          comparison = a.usageCount - b.usageCount;
          break;
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case 'lastAccessedAt':
        case 'lastUsedAt':
        default:
          comparison = new Date(a.lastUsedAt).getTime() - new Date(b.lastUsedAt).getTime();
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Pagination
    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  /**
   * Search files using keyword matching.
   */
  searchFiles(userId: string, query: string, options?: SearchFilesOptions): FileEntry[] {
    return this.listFiles(userId, { ...options, search: query });
  }

  /**
   * Link an existing library file to a target chat ('Upload once, use anytime').
   */
  attachToChat(fileId: string, targetChatId: string, userId?: string): FileEntry {
    if (!fileId) {
      throw new Error('fileId is required to attach file');
    }
    if (!targetChatId) {
      throw new Error('targetChatId is required to attach file');
    }

    const file = this.files.get(fileId);
    if (!file) {
      throw new Error(`File ${fileId} not found in library`);
    }

    if (userId && file.userId !== userId) {
      throw new Error(`Unauthorized access to file ${fileId}`);
    }

    file.usageCount += 1;
    const now = new Date().toISOString();
    file.lastUsedAt = now;
    file.lastAccessedAt = now;
    file.updatedAt = now;

    if (!file.attachedChatIds.includes(targetChatId)) {
      file.attachedChatIds.push(targetChatId);
    }
    if (!file.chatIds.includes(targetChatId)) {
      file.chatIds.push(targetChatId);
    }
    if (!file.linkedChatIds.includes(targetChatId)) {
      file.linkedChatIds.push(targetChatId);
    }

    return file;
  }

  linkFileToChat(userId: string, fileId: string, chatId: string): FileEntry {
    const file = this.getFile(userId, fileId);
    if (!file) {
      throw new Error(`File ${fileId} not found or access denied`);
    }
    return this.attachToChat(fileId, chatId, userId);
  }

  /**
   * Unlink a file from a specific chat or all chats.
   */
  unlinkFile(userId: string, fileId: string, chatId?: string): FileEntry {
    const file = this.getFile(userId, fileId);
    if (!file) {
      throw new Error(`File ${fileId} not found or access denied`);
    }

    if (chatId) {
      file.chatIds = file.chatIds.filter((c) => c !== chatId);
      file.attachedChatIds = file.attachedChatIds.filter((c) => c !== chatId);
      file.linkedChatIds = file.linkedChatIds.filter((c) => c !== chatId);
      if (file.sourceChatId === chatId) {
        file.sourceChatId = file.chatIds[0];
        file.chatId = file.chatIds[0];
      }
    } else {
      file.chatIds = [];
      file.attachedChatIds = [];
      file.linkedChatIds = [];
      file.sourceChatId = undefined;
      file.chatId = undefined;
    }

    file.updatedAt = new Date().toISOString();
    return file;
  }

  /**
   * Permanently delete a file from the central library.
   */
  deleteFile(userId: string, fileId: string): boolean {
    if (!userId || !fileId) return false;

    const file = this.files.get(fileId);
    if (!file || file.userId !== userId) {
      return false;
    }

    this.contents.delete(fileId);
    return this.files.delete(fileId);
  }

  /**
   * Retrieve aggregate statistics and category breakdown for a user's library.
   */
  getFileStats(userId: string): FileLibraryStats {
    const canonicalCategories: CanonicalCategory[] = [
      'document',
      'code',
      'image',
      'data',
      'audio',
      'archive',
    ];

    const byCategory: Record<string, CategoryStats> = {
      document: { count: 0, sizeBytes: 0, formattedSize: '0 B' },
      code: { count: 0, sizeBytes: 0, formattedSize: '0 B' },
      image: { count: 0, sizeBytes: 0, formattedSize: '0 B' },
      data: { count: 0, sizeBytes: 0, formattedSize: '0 B' },
      audio: { count: 0, sizeBytes: 0, formattedSize: '0 B' },
      archive: { count: 0, sizeBytes: 0, formattedSize: '0 B' },
      // Uppercase aliases
      DOCUMENTS: { count: 0, sizeBytes: 0, formattedSize: '0 B' },
      CODE: { count: 0, sizeBytes: 0, formattedSize: '0 B' },
      MEDIA: { count: 0, sizeBytes: 0, formattedSize: '0 B' },
      DATA: { count: 0, sizeBytes: 0, formattedSize: '0 B' },
    };

    let totalFiles = 0;
    let totalSizeBytes = 0;
    let mostRecentFile: FileEntry | null = null;
    let mostUsedFile: FileEntry | null = null;
    const allLinkedChats = new Set<string>();
    const userFiles: FileEntry[] = [];

    for (const file of this.files.values()) {
      if (file.userId !== userId) continue;

      totalFiles++;
      totalSizeBytes += file.sizeBytes;
      userFiles.push(file);

      const cat = file.category;
      if (byCategory[cat]) {
        byCategory[cat].count++;
        byCategory[cat].sizeBytes += file.sizeBytes;
      }

      if (cat === 'document' || cat === 'archive') {
        byCategory.DOCUMENTS.count++;
        byCategory.DOCUMENTS.sizeBytes += file.sizeBytes;
      } else if (cat === 'code') {
        byCategory.CODE.count++;
        byCategory.CODE.sizeBytes += file.sizeBytes;
      } else if (cat === 'image' || cat === 'audio') {
        byCategory.MEDIA.count++;
        byCategory.MEDIA.sizeBytes += file.sizeBytes;
      } else if (cat === 'data') {
        byCategory.DATA.count++;
        byCategory.DATA.sizeBytes += file.sizeBytes;
      }

      file.linkedChatIds.forEach((c) => allLinkedChats.add(c));

      if (!mostRecentFile || new Date(file.lastUsedAt) > new Date(mostRecentFile.lastUsedAt)) {
        mostRecentFile = file;
      }

      if (!mostUsedFile || file.usageCount > mostUsedFile.usageCount) {
        mostUsedFile = file;
      }
    }

    for (const cat of Object.keys(byCategory)) {
      byCategory[cat].formattedSize = formatBytes(byCategory[cat].sizeBytes);
    }

    userFiles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      totalFiles,
      totalSizeBytes,
      formattedTotalSize: formatBytes(totalSizeBytes),
      linkedChatsCount: allLinkedChats.size,
      byCategory,
      recentFiles: userFiles.slice(0, 5),
      mostRecentFile,
      mostUsedFile,
    };
  }

  /**
   * Retrieve user storage quota and usage breakdown.
   */
  getStorageUsage(userId: string, quotaBytes: number = 100 * 1024 * 1024): StorageUsage {
    const stats = this.getFileStats(userId);
    const usedBytes = stats.totalSizeBytes;
    const percentage =
      quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;

    return {
      totalBytes: usedBytes,
      usedBytes,
      quotaBytes,
      percentage,
      fileCount: stats.totalFiles,
      formattedUsed: stats.formattedTotalSize,
      formattedQuota: formatBytes(quotaBytes),
    };
  }
}

export const fileLibraryService = new FileLibraryService();
