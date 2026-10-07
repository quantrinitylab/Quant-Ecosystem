// ============================================================================
// QuantAI — Central File Library Fastify Routes Tests
// Task W39-A05: Vitest Integration Test Suite for /files/library
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import fileLibraryRoutes from '../routes/file-library';
import { FileLibraryService } from '../services/file-library.service';

vi.mock('@quant/server-core', () => ({
  createApp: vi.fn(),
  createAppError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as Error & { statusCode: number; code: string };
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));

describe('Fastify Routes: /files/library', () => {
  let app: ReturnType<typeof Fastify>;
  let fileLibraryService: FileLibraryService;
  let testUserId: string | null = 'user-library-tester';

  beforeEach(async () => {
    app = Fastify();
    fileLibraryService = new FileLibraryService();
    fileLibraryService.clear();

    app.decorate('fileLibraryService', fileLibraryService);
    app.decorateRequest('auth', null);

    app.addHook('preHandler', async (request: FastifyRequest) => {
      if (testUserId) {
        (request as unknown as { auth: { userId: string } }).auth = { userId: testUserId };
      }
    });

    await app.register(fileLibraryRoutes, { prefix: '/files/library' });
    await app.ready();
  });

  afterEach(async () => {
    testUserId = 'user-library-tester';
    await app.close();
  });

  it('GET /files/library — rejects unauthenticated requests with 401', async () => {
    testUserId = null;

    const response = await app.inject({
      method: 'GET',
      url: '/files/library',
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.message).toContain('Authentication required');
  });

  it('POST /files/library/index — indexes file and automatically categorizes it', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/files/library/index',
      payload: {
        name: 'annual_report_2026.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 3145728,
        tags: ['annual', 'finance'],
        projectId: 'project-q3',
        chatId: 'chat-room-01',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toMatch(/^file-/);
    expect(body.data.category).toBe('document');
    expect(body.data.formattedSize).toBe('3.0 MB');
    expect(body.data.linkedChatIds).toContain('chat-room-01');
  });

  it('POST /files/library/index — rejects invalid payloads', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/files/library/index',
      payload: {
        name: '', // Empty name invalid
        mimeType: 'application/pdf',
        sizeBytes: -10, // Negative size invalid
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('GET /files/library — lists and filters files by category and query', async () => {
    // Seed files
    fileLibraryService.indexFile({
      userId: 'user-library-tester',
      name: 'banner.png',
      mimeType: 'image/png',
      sizeBytes: 50000,
      tags: ['marketing'],
      projectId: 'proj-1',
    });

    fileLibraryService.indexFile({
      userId: 'user-library-tester',
      name: 'dataset.csv',
      mimeType: 'text/csv',
      sizeBytes: 150000,
      tags: ['analytics'],
      projectId: 'proj-2',
    });

    // 1. List all
    const allRes = await app.inject({
      method: 'GET',
      url: '/files/library',
    });
    expect(allRes.statusCode).toBe(200);
    const allBody = JSON.parse(allRes.body);
    expect(allBody.total).toBe(2);
    expect(allBody.stats.totalFiles).toBe(2);

    // 2. Filter by category=data
    const catRes = await app.inject({
      method: 'GET',
      url: '/files/library?category=data',
    });
    expect(catRes.statusCode).toBe(200);
    const catBody = JSON.parse(catRes.body);
    expect(catBody.total).toBe(1);
    expect(catBody.data[0].name).toBe('dataset.csv');

    // 3. Search query
    const searchRes = await app.inject({
      method: 'GET',
      url: '/files/library?search=banner',
    });
    expect(searchRes.statusCode).toBe(200);
    const searchBody = JSON.parse(searchRes.body);
    expect(searchBody.total).toBe(1);
    expect(searchBody.data[0].name).toBe('banner.png');
  });

  it('GET /files/library/stats — returns aggregated library stats', async () => {
    fileLibraryService.indexFile({
      userId: 'user-library-tester',
      name: 'code.py',
      mimeType: 'text/x-python',
      sizeBytes: 2048,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/files/library/stats',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.totalFiles).toBe(1);
    expect(body.data.byCategory.code.count).toBe(1);
  });

  it('GET /files/library/:fileId — retrieves single file', async () => {
    const file = fileLibraryService.indexFile({
      userId: 'user-library-tester',
      name: 'spec.md',
      mimeType: 'text/markdown',
      sizeBytes: 1024,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/files/library/${file.id}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.name).toBe('spec.md');

    // 404 for unknown file
    const notFound = await app.inject({
      method: 'GET',
      url: '/files/library/file-does-not-exist',
    });
    expect(notFound.statusCode).toBe(404);
  });

  it('POST /files/library/:fileId/attach — attaches existing file to another chat', async () => {
    const file = fileLibraryService.indexFile({
      userId: 'user-library-tester',
      name: 'reference.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10240,
      chatId: 'initial-chat',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/files/library/${file.id}/attach`,
      payload: {
        chatId: 'new-active-chat-77',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.linkedChatIds).toContain('initial-chat');
    expect(body.data.linkedChatIds).toContain('new-active-chat-77');

    // 404 on invalid file
    const invalidRes = await app.inject({
      method: 'POST',
      url: '/files/library/file-missing/attach',
      payload: { chatId: 'chat-1' },
    });
    expect(invalidRes.statusCode).toBe(404);
  });

  it('POST /files/library/:fileId/detach — unlinks file from a specific chat', async () => {
    const file = fileLibraryService.indexFile({
      userId: 'user-library-tester',
      name: 'notes.txt',
      mimeType: 'text/plain',
      sizeBytes: 256,
      chatId: 'chat-remove-me',
    });

    fileLibraryService.linkFileToChat('user-library-tester', file.id, 'chat-keep-me');

    const response = await app.inject({
      method: 'POST',
      url: `/files/library/${file.id}/detach`,
      payload: {
        chatId: 'chat-remove-me',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.linkedChatIds).toEqual(['chat-keep-me']);
  });

  it('DELETE /files/library/:fileId — deletes file from library', async () => {
    const file = fileLibraryService.indexFile({
      userId: 'user-library-tester',
      name: 'trash.log',
      mimeType: 'text/plain',
      sizeBytes: 50,
    });

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/files/library/${file.id}`,
    });

    expect(delRes.statusCode).toBe(200);
    const body = JSON.parse(delRes.body);
    expect(body.success).toBe(true);
    expect(body.message).toContain('deleted');

    // Subsequent get returns 404
    const getRes = await app.inject({
      method: 'GET',
      url: `/files/library/${file.id}`,
    });
    expect(getRes.statusCode).toBe(404);
  });
});
