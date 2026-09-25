// ============================================================================
// QuantAI — Central File Library Service & Routes Test Suite
// Task W39-A05: 'Upload once, use anytime'
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import {
  FileLibraryService,
  detectFileCategory,
  normalizeCategory,
  formatBytes,
} from '../services/file-library.service';
import fileLibraryRoutes from '../routes/file-library';

vi.mock('@quant/server-core', () => ({
  createApp: vi.fn(),
  createAppError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as Error & { statusCode: number; code: string };
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));

describe('FileLibraryService Unit & Integration Suite', () => {
  let service: FileLibraryService;
  const user1 = 'usr_trader_001';
  const user2 = 'usr_analyst_002';

  beforeEach(() => {
    service = new FileLibraryService();
  });

  describe('1. Category Detection & Utilities', () => {
    it('detects documents from extensions and mime types', () => {
      expect(detectFileCategory('whitepaper.pdf')).toBe('document');
      expect(detectFileCategory('notes.md')).toBe('document');
      expect(detectFileCategory('contract.docx')).toBe('document');
      expect(detectFileCategory('unknown_doc', 'application/pdf')).toBe('document');
      expect(detectFileCategory('plain.txt', 'text/plain')).toBe('document');
    });

    it('detects code from extensions and mime types', () => {
      expect(detectFileCategory('engine.ts')).toBe('code');
      expect(detectFileCategory('model.py')).toBe('code');
      expect(detectFileCategory('Cargo.toml')).toBe('code');
      expect(detectFileCategory('query.sql')).toBe('code');
      expect(detectFileCategory('script.sh')).toBe('code');
      expect(detectFileCategory('unknown_code', 'text/javascript')).toBe('code');
      expect(detectFileCategory('config.json', 'application/json')).toBe('code');
    });

    it('detects media/image from extensions and mime types', () => {
      expect(detectFileCategory('avatar.png')).toBe('image');
      expect(detectFileCategory('hero.webp')).toBe('image');
      expect(detectFileCategory('demo.mp4')).toBe('image');
      expect(detectFileCategory('voice.mp3')).toBe('audio');
      expect(detectFileCategory('icon.svg')).toBe('image');
      expect(detectFileCategory('blob', 'image/jpeg')).toBe('image');
    });

    it('detects data from extensions and mime types', () => {
      expect(detectFileCategory('nasdaq_ticks.csv')).toBe('data');
      expect(detectFileCategory('financial_model.xlsx')).toBe('data');
      expect(detectFileCategory('trades.parquet')).toBe('data');
      expect(detectFileCategory('snapshot.sqlite')).toBe('data');
      expect(detectFileCategory('blob', 'text/csv')).toBe('data');
    });

    it('normalizes categories accurately', () => {
      expect(normalizeCategory('document')).toBe('document');
      expect(normalizeCategory('documents')).toBe('document');
      expect(normalizeCategory('DOCUMENTS')).toBe('document');
      expect(normalizeCategory('code')).toBe('code');
      expect(normalizeCategory('media')).toBe('image');
      expect(normalizeCategory('image')).toBe('image');
      expect(normalizeCategory('data')).toBe('data');
      expect(normalizeCategory('unknown')).toBe('document');
    });

    it('formats bytes into clean human readable strings', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(3145728)).toBe('3.0 MB');
      expect(formatBytes(12_400_000)).toBe('11.8 MB');
    });
  });

  describe('2. File Indexing & Storage', () => {
    it('indexes a file with automatic categorization and storageKey generation', () => {
      const entry = service.indexFile({
        userId: user1,
        name: 'QuantAI-Architecture.pdf',
        sizeBytes: 2_450_000,
        sourceChatId: 'chat-001',
      });

      expect(entry.id).toMatch(/^file-/);
      expect(entry.userId).toBe(user1);
      expect(entry.name).toBe('QuantAI-Architecture.pdf');
      expect(entry.sizeBytes).toBe(2_450_000);
      expect(entry.category).toBe('document');
      expect(entry.sourceChatId).toBe('chat-001');
      expect(entry.attachedChatIds).toContain('chat-001');
      expect(entry.linkedChatIds).toContain('chat-001');
      expect(entry.usageCount).toBe(1);
      expect(entry.storageKey).toContain(user1);
    });

    it('validates required fields upon indexing', () => {
      expect(() =>
        service.indexFile({
          userId: '',
          name: 'test.ts',
          sizeBytes: 100,
        }),
      ).toThrow(/userId is required/i);

      expect(() =>
        service.indexFile({
          userId: user1,
          name: '',
          sizeBytes: 100,
        }),
      ).toThrow(/name is required/i);

      expect(() =>
        service.indexFile({
          userId: user1,
          name: 'test.ts',
          sizeBytes: -5,
        }),
      ).toThrow(/sizeBytes must be a non-negative number/i);
    });

    it('uploads and retrieves file content accurately', () => {
      const content = 'export const alpha = 42;\nexport const beta = 99;';
      const file = service.uploadFile({
        userId: user1,
        name: 'alpha-beta.ts',
        content,
        mimeType: 'text/typescript',
      });

      expect(file.id).toBeDefined();
      expect(file.sizeBytes).toBe(Buffer.byteLength(content, 'utf8'));

      const retrieved = service.getFileContent(user1, file.id);
      expect(retrieved.toString()).toBe(content);
    });
  });

  describe('3. Multi-User Isolation & Filtered Search', () => {
    beforeEach(() => {
      // Seed user 1 files
      service.indexFile({
        userId: user1,
        name: 'Q3-Financials.pdf',
        sizeBytes: 5_000_000,
        sourceChatId: 'chat-finance',
      });
      service.indexFile({
        userId: user1,
        name: 'trading_bot.py',
        sizeBytes: 120_000,
        sourceChatId: 'chat-dev',
      });
      service.indexFile({
        userId: user1,
        name: 'logo.png',
        sizeBytes: 800_000,
        sourceChatId: 'chat-design',
      });
      service.indexFile({
        userId: user1,
        name: 'trades-september.csv',
        sizeBytes: 3_200_000,
        sourceChatId: 'chat-dev',
      });

      // Seed user 2 files (isolated)
      service.indexFile({
        userId: user2,
        name: 'secret-patent.pdf',
        sizeBytes: 1_000_000,
        sourceChatId: 'chat-secret',
      });
    });

    it('enforces sovereign user isolation: user1 never sees user2 files', () => {
      const user1Files = service.listFiles(user1);
      const user2Files = service.listFiles(user2);

      expect(user1Files.length).toBe(4);
      expect(user2Files.length).toBe(1);
      expect(user1Files.every((f) => f.userId === user1)).toBe(true);
      expect(user1Files.some((f) => f.name === 'secret-patent.pdf')).toBe(false);
    });

    it('filters files by category accurately', () => {
      const docs = service.listFiles(user1, { category: 'document' });
      const code = service.listFiles(user1, { category: 'code' });
      const media = service.listFiles(user1, { category: 'image' });
      const data = service.listFiles(user1, { category: 'data' });

      expect(docs.length).toBe(1);
      expect(docs[0].name).toBe('Q3-Financials.pdf');

      expect(code.length).toBe(1);
      expect(code[0].name).toBe('trading_bot.py');

      expect(media.length).toBe(1);
      expect(media[0].name).toBe('logo.png');

      expect(data.length).toBe(1);
      expect(data[0].name).toBe('trades-september.csv');
    });

    it('performs full-text search across filenames and types', () => {
      const searchBot = service.searchFiles(user1, 'bot');
      expect(searchBot.length).toBe(1);
      expect(searchBot[0].name).toBe('trading_bot.py');

      const searchCsv = service.searchFiles(user1, 'csv');
      expect(searchCsv.length).toBe(1);
      expect(searchCsv[0].name).toBe('trades-september.csv');

      const emptySearch = service.searchFiles(user1, 'non-existent-file');
      expect(emptySearch.length).toBe(0);
    });

    it('filters files by source or attached chatId', () => {
      const devFiles = service.listFiles(user1, { sourceChatId: 'chat-dev' });
      expect(devFiles.length).toBe(2);
      expect(devFiles.map((f) => f.name)).toContain('trading_bot.py');
      expect(devFiles.map((f) => f.name)).toContain('trades-september.csv');
    });

    it('sorts by size, name, and usage count with pagination', () => {
      const sortedBySizeDesc = service.listFiles(user1, { sortBy: 'sizeBytes', sortOrder: 'desc' });
      expect(sortedBySizeDesc[0].name).toBe('Q3-Financials.pdf');
      expect(sortedBySizeDesc[3].name).toBe('trading_bot.py');

      const paged = service.listFiles(user1, { limit: 2, offset: 1 });
      expect(paged.length).toBe(2);
    });
  });

  describe('4. Cross-Chat Attachment & Lifecycle', () => {
    it('attaches an existing file to another chat and increments usageCount', () => {
      const file = service.indexFile({
        userId: user1,
        name: 'architecture.pdf',
        sizeBytes: 1_000_000,
        sourceChatId: 'chat-initial',
      });

      expect(file.usageCount).toBe(1);
      expect(file.attachedChatIds).toEqual(['chat-initial']);

      const updated = service.attachToChat(file.id, 'chat-target-42', user1);

      expect(updated.usageCount).toBe(2);
      expect(updated.attachedChatIds).toContain('chat-initial');
      expect(updated.attachedChatIds).toContain('chat-target-42');
      expect(updated.linkedChatIds).toContain('chat-target-42');

      // Attaching same chat again should not duplicate in attachedChatIds but increment count
      service.attachToChat(file.id, 'chat-target-42', user1);
      expect(updated.usageCount).toBe(3);
      expect(updated.attachedChatIds.filter((id) => id === 'chat-target-42').length).toBe(1);
    });

    it('unlinks file from specific or all chats', () => {
      const file = service.indexFile({
        userId: user1,
        name: 'data.csv',
        sizeBytes: 50_000,
        sourceChatId: 'chat-1',
      });
      service.attachToChat(file.id, 'chat-2', user1);

      service.unlinkFile(user1, file.id, 'chat-1');
      expect(file.attachedChatIds).toEqual(['chat-2']);

      service.unlinkFile(user1, file.id);
      expect(file.attachedChatIds).toEqual([]);
    });

    it('deletes file from library with user ownership check', () => {
      const file = service.indexFile({
        userId: user1,
        name: 'temp.txt',
        sizeBytes: 100,
      });

      // User 2 cannot delete user 1's file
      expect(service.deleteFile(user2, file.id)).toBe(false);
      expect(service.getFile(user1, file.id)).not.toBeNull();

      // User 1 can delete their own file
      expect(service.deleteFile(user1, file.id)).toBe(true);
      expect(service.getFile(user1, file.id)).toBeNull();
    });
  });

  describe('5. Aggregate Stats & Storage Quota', () => {
    it('computes accurate library stats and category breakdowns', () => {
      service.indexFile({ userId: user1, name: 'doc1.pdf', sizeBytes: 2_000_000 });
      service.indexFile({ userId: user1, name: 'doc2.md', sizeBytes: 500_000 });
      service.indexFile({ userId: user1, name: 'code.ts', sizeBytes: 100_000 });
      service.indexFile({ userId: user1, name: 'photo.jpg', sizeBytes: 3_000_000 });
      service.indexFile({ userId: user1, name: 'ticks.csv', sizeBytes: 4_400_000 });

      const stats = service.getFileStats(user1);

      expect(stats.totalFiles).toBe(5);
      expect(stats.totalSizeBytes).toBe(10_000_000);
      expect(stats.formattedTotalSize).toBe('9.5 MB');

      expect(stats.byCategory.document.count).toBe(2);
      expect(stats.byCategory.DOCUMENTS.count).toBe(2);
      expect(stats.byCategory.code.count).toBe(1);
      expect(stats.byCategory.image.count).toBe(1);
      expect(stats.byCategory.data.count).toBe(1);
    });

    it('computes storage quota percentage and usage breakdown', () => {
      service.indexFile({ userId: user1, name: 'data.parquet', sizeBytes: 25 * 1024 * 1024 });

      const usage = service.getStorageUsage(user1, 100 * 1024 * 1024); // 100 MB quota
      expect(usage.fileCount).toBe(1);
      expect(usage.percentage).toBe(25);
      expect(usage.formattedQuota).toBe('100.0 MB');
    });
  });
});

describe('Fastify Routes: /files/library', () => {
  let app: ReturnType<typeof Fastify>;
  let service: FileLibraryService;
  const testUserId = 'test-route-user';

  beforeEach(async () => {
    app = Fastify();
    service = new FileLibraryService();

    app.decorate('fileLibraryService', service);
    app.decorateRequest('auth', null);

    app.addHook('preHandler', async (request: FastifyRequest) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId: testUserId };
    });

    await app.register(fileLibraryRoutes, { prefix: '/files/library' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /files/library/index — indexes file into library', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/files/library/index',
      payload: {
        name: 'ecosystem-plan.pdf',
        sizeBytes: 1_250_000,
        mimeType: 'application/pdf',
        chatId: 'chat-w39',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('ecosystem-plan.pdf');
    expect(body.data.category).toBe('document');
  });

  it('GET /files/library — lists files with query filtering', async () => {
    service.indexFile({ userId: testUserId, name: 'test.ts', sizeBytes: 1000 });
    service.indexFile({ userId: testUserId, name: 'picture.png', sizeBytes: 2000 });

    const response = await app.inject({
      method: 'GET',
      url: '/files/library?category=code',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].name).toBe('test.ts');
  });

  it('POST /files/library/attach — attaches file to chat', async () => {
    const file = service.indexFile({
      userId: testUserId,
      name: 'backtest.csv',
      sizeBytes: 50_000,
      sourceChatId: 'chat-1',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/files/library/attach',
      payload: {
        fileId: file.id,
        targetChatId: 'chat-new-conversation',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.attachedChatIds).toContain('chat-new-conversation');
    expect(body.data.usageCount).toBe(2);
  });

  it('GET /files/library/stats — returns statistics and storage usage', async () => {
    service.indexFile({ userId: testUserId, name: 'fileA.txt', sizeBytes: 10_000 });

    const response = await app.inject({
      method: 'GET',
      url: '/files/library/stats',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.totalFiles).toBe(1);
    expect(body.usage).toBeDefined();
  });

  it('DELETE /files/library/:fileId — deletes file', async () => {
    const file = service.indexFile({
      userId: testUserId,
      name: 'to-delete.md',
      sizeBytes: 500,
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/files/library/${file.id}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(service.getFile(testUserId, file.id)).toBeNull();
  });
});
