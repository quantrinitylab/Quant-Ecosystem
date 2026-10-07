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
const RECEIPT = { vendor: 'Quant Shop', date: '2026-09-11', total: 12.5, currency: 'USD', items: [{ description: 'Notebook', amount: 12.5 }], taxAmount: 0 };
const INVOICE = { invoiceNumber: 'INV-1', vendor: 'Quant Labs', dueDate: '2026-10-01', lineItems: [{ description: 'Service', quantity: 1, unitPrice: 50, total: 50 }], subtotal: 50, tax: 0, total: 50, currency: 'USD' };

function file(overrides: Record<string, unknown> = {}) {
  return { id: 'file-1', userId: USER_ID, name: 'document.txt', mimeType: 'text/plain', isDeleted: false,
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
  checkedPlaintextMock.mockResolvedValue(Buffer.from('stored document text'));
});

describe('Drive AI extraction routes', () => {
  it.each([
    ['/drive/ai/extract-receipt', RECEIPT],
    ['/drive/ai/extract-invoice', INVOICE],
  ])('returns structured data from %s', async (url, result) => {
    inferMock.mockResolvedValue({ content: JSON.stringify(result) });
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url, payload: { fileId: 'file-1' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(result);
    expect(inferMock).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID, app: 'quantmail', feature: 'drive-ai-extract' }));
    await app.close();
  });

  it('rejects a non-owner with 403 before inference', async () => {
    const app = await buildApp(fakePrisma(file({ userId: 'user-2' })));
    const response = await app.inject({ method: 'POST', url: '/drive/ai/extract-receipt', payload: { fileId: 'file-1' } });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
    expect(inferMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects non-text MIME types with 415 before storage or inference', async () => {
    const app = await buildApp(fakePrisma(file({ mimeType: 'image/png' })));
    const response = await app.inject({ method: 'POST', url: '/drive/ai/extract-invoice', payload: { fileId: 'file-1' } });
    expect(response.statusCode).toBe(415);
    expect(response.json().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(checkedPlaintextMock).not.toHaveBeenCalled();
    expect(inferMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 409 when stored plaintext fails SHA-256 integrity validation', async () => {
    checkedPlaintextMock.mockRejectedValue(createAppError('integrity failed', 409, 'INTEGRITY_ERROR'));
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/drive/ai/extract-receipt', payload: { fileId: 'file-1' } });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('INTEGRITY_ERROR');
    expect(inferMock).not.toHaveBeenCalled();
    await app.close();
  });
});
