// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { createAppError, errorHandlerPlugin } from '@quant/server-core';

const { inferMock, checkedPlaintextMock } = vi.hoisted(() => ({
  inferMock: vi.fn(), checkedPlaintextMock: vi.fn(),
}));

vi.mock('@quant/ai', () => ({ AIEngine: class { infer = inferMock; } }));
vi.mock('../services/drive-storage.service', () => ({
  DRIVE_MAX_BODY_BYTES: 1024, DRIVE_MAX_FILE_BYTES: 1024,
  checkedPlaintext: checkedPlaintextMock,
  deleteDriveObject: vi.fn(), driveObjectKey: vi.fn(() => 'key'),
  driveStorageReady: vi.fn(() => true), driveStorageUnavailableReason: vi.fn(() => ''),
  encryptForDrive: vi.fn(), hashFromVersionKey: vi.fn(() => null), putDriveObject: vi.fn(),
  safeFileName: vi.fn((name: string) => name),
}));

const USER_ID = 'user-1';
const SUMMARY = { summary: 'A concise project update.', keyPoints: ['Milestone complete', 'No blockers'], fileType: 'text document', wordCount: 3 };

function file(overrides: Record<string, unknown> = {}) {
  return { id: 'file-1', userId: USER_ID, name: 'update.txt', mimeType: 'text/plain', isDeleted: false,
    encryptedContent: 'key', encryptionIV: 'iv', encryptionAuthTag: 'tag', encryptionKey: 'wrapped', contentHash: 'hash', ...overrides };
}
function fakePrisma(row = file()) {
  return {
    file: { findUnique: vi.fn().mockResolvedValue(row), aggregate: vi.fn().mockResolvedValue({ _sum: { size: 0 } }) },
    share: { findFirst: vi.fn().mockResolvedValue(null) },
    userSubscription: { findUnique: vi.fn().mockResolvedValue(null) },
  };
}
async function buildApp(prisma = fakePrisma()) {
  const { default: driveRoutes } = await import('../routes/drive');
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId: USER_ID };
  });
  await app.register(driveRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  inferMock.mockReset(); checkedPlaintextMock.mockReset();
  checkedPlaintextMock.mockResolvedValue(Buffer.from('one two three'));
});

describe('POST /drive/ai/summarize', () => {
  it('returns a validated summary for an owned text file', async () => {
    inferMock.mockResolvedValue({ content: JSON.stringify(SUMMARY) });
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/drive/ai/summarize', payload: { fileId: 'file-1' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(SUMMARY);
    expect(inferMock).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID, app: 'quantmail', feature: 'drive-ai-summarize' }));
    await app.close();
  });

  it('rejects a non-owner with 403 before inference', async () => {
    const app = await buildApp(fakePrisma(file({ userId: 'user-2' })));
    const response = await app.inject({ method: 'POST', url: '/drive/ai/summarize', payload: { fileId: 'file-1' } });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
    expect(inferMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects non-text MIME types with 415 before storage or inference', async () => {
    const app = await buildApp(fakePrisma(file({ mimeType: 'application/pdf' })));
    const response = await app.inject({ method: 'POST', url: '/drive/ai/summarize', payload: { fileId: 'file-1' } });
    expect(response.statusCode).toBe(415);
    expect(response.json().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(checkedPlaintextMock).not.toHaveBeenCalled();
    expect(inferMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 409 when stored plaintext fails SHA-256 integrity validation', async () => {
    checkedPlaintextMock.mockRejectedValue(createAppError('integrity failed', 409, 'INTEGRITY_ERROR'));
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/drive/ai/summarize', payload: { fileId: 'file-1' } });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('INTEGRITY_ERROR');
    expect(inferMock).not.toHaveBeenCalled();
    await app.close();
  });
});
