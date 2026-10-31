// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';

const mockCreateMultipartUpload = vi.fn();
const mockGetUploadPartPresignedUrl = vi.fn();
const mockCompleteMultipartUpload = vi.fn();
const mockAbortMultipartUpload = vi.fn();
const mockDownload = vi.fn();
const mockGetObjectSize = vi.fn();
const mockDelete = vi.fn();

vi.mock('@quant/storage', () => ({
  resolveStorageConfigFromEnv: vi.fn(() => ({
    provider: 's3',
    endpoint: 'http://localhost:9000',
    region: 'us-east-1',
    bucket: 'test-bucket',
    accessKeyId: 'test',
    secretAccessKey: 'test',
  })),
  StorageClient: class {
    createMultipartUpload = mockCreateMultipartUpload;
    getUploadPartPresignedUrl = mockGetUploadPartPresignedUrl;
    completeMultipartUpload = mockCompleteMultipartUpload;
    abortMultipartUpload = mockAbortMultipartUpload;
    download = mockDownload;
    getObjectSize = mockGetObjectSize;
    delete = mockDelete;
  },
}));

vi.mock('../services/drive-storage.service', () => ({
  DRIVE_MAX_BODY_BYTES: 1024 * 1024,
  DRIVE_MAX_FILE_BYTES: 5 * 1024 * 1024 * 1024,
  DRIVE_QUOTA_BYTES: 15 * 1024 * 1024 * 1024,
  decryptFromDrive: vi.fn(),
  deleteDriveObject: vi.fn(),
  driveObjectKey: vi.fn((userId: string, key: string) => `drive/${userId}/${key}`),
  driveStorageReady: vi.fn(() => true),
  driveStorageUnavailableReason: vi.fn(() => null),
  encryptForDrive: vi.fn(),
  getDriveObject: vi.fn(),
  putDriveObject: vi.fn(),
  safeFileName: vi.fn((n: string) => n),
  checkedPlaintext: vi.fn(),
  hashFromVersionKey: vi.fn(() => 'h'),
}));

import driveRoutes from '../routes/drive';
import { StorageQuotaService } from '../services/storage-quota.service';

describe('Task DR-1 to DR-5 + CODEX PR #1558 corrective: durable multipart sessions', () => {
  let createdFiles: any[] = [];
  let createdVersions: any[] = [];
  let sessions: any[] = [];
  let usedBytes = 1000;

  function matchWhere(row: any, where: any): boolean {
    for (const [key, value] of Object.entries(where)) {
      if (value !== null && typeof value === 'object' && 'in' in (value as any)) {
        if (!(value as any).in.includes(row[key])) return false;
      } else if (row[key] !== value) {
        return false;
      }
    }
    return true;
  }

  function fakePrisma() {
    return {
      file: {
        aggregate: vi.fn().mockImplementation(async () => ({ _sum: { size: usedBytes } })),
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const row = {
            id: `file-${createdFiles.length + 1}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          createdFiles.push(row);
          return row;
        }),
        findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
          return createdFiles.find((f) => f.id === where.id) ?? null;
        }),
        update: vi.fn().mockImplementation(async ({ where, data }: any) => {
          const row = createdFiles.find((f) => f.id === where.id);
          if (row) Object.assign(row, data);
          return row ?? null;
        }),
      },
      fileVersion: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const row = { id: `v-${createdVersions.length + 1}`, ...data };
          createdVersions.push(row);
          return row;
        }),
      },
      folder: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      userSubscription: {
        findUnique: vi.fn().mockResolvedValue({ tier: 'FREE' }),
      },
      user: {
        findUnique: vi.fn().mockImplementation(async ({ where }: any) => ({
          id: where.id,
          email: `${where.id}@quantmail.com`,
          displayName: 'Test User',
        })),
      },
      multipartUploadSession: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const row = {
            id: `session-${sessions.length + 1}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          sessions.push(row);
          return row;
        }),
        findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
          return sessions.find((s) => s.uploadId === where.uploadId) ?? null;
        }),
        findMany: vi.fn().mockImplementation(async ({ where }: any) => {
          return sessions.filter((s) => matchWhere(s, where));
        }),
        update: vi.fn().mockImplementation(async ({ where, data }: any) => {
          const row = sessions.find((s) => s.id === where.id);
          if (row) Object.assign(row, data);
          return row;
        }),
        updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
          let count = 0;
          for (const row of sessions) {
            if (matchWhere(row, where)) {
              Object.assign(row, data);
              count += 1;
            }
          }
          return { count };
        }),
      },
    };
  }

  async function buildApp(userId = 'user-1') {
    const app = Fastify({ logger: false });
    const prisma = fakePrisma();
    app.decorate('prisma', prisma as never);
    app.addHook('onRequest', async (req) => {
      (req as any).auth = { userId };
    });
    await app.register(driveRoutes);
    await app.ready();
    return app;
  }

  async function initiate(app: any, totalSize = 500 * 1024 * 1024, name = 'test-large.zip') {
    mockCreateMultipartUpload.mockResolvedValueOnce({
      uploadId: 'upload-mp-123',
      key: 'drive/user-1/multipart/test-large.zip',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/drive/upload/multipart/initiate',
      payload: { name, totalSize, mimeType: 'application/zip' },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  function completePayload(init: any, overrides: any = {}) {
    return {
      key: init.key,
      name: 'test-large.zip',
      totalSize: 500 * 1024 * 1024,
      mimeType: 'application/zip',
      parts: [{ partNumber: 1, etag: '"etag-1"' }],
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    createdFiles = [];
    createdVersions = [];
    sessions = [];
    usedBytes = 1000;
    StorageQuotaService.clearReservations();
    mockGetObjectSize.mockResolvedValue(500 * 1024 * 1024);
  });

  it('DR-1: initiates an S3 multipart upload, reserves quota, and writes a durable session', async () => {
    const app = await buildApp();
    const body = await initiate(app);

    expect(body.uploadId).toBe('upload-mp-123');
    expect(body.totalParts).toBe(100); // 500MB / 5MB partSize = 100 parts
    expect(body.partSize).toBe(5 * 1024 * 1024);
    expect(mockCreateMultipartUpload).toHaveBeenCalledTimes(1);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].userId).toBe('user-1');
    expect(sessions[0].storageKey).toBe(body.key);
    expect(sessions[0].totalSize).toBe(500 * 1024 * 1024);
    expect(sessions[0].status).toBe('pending');
    expect(sessions[0].hashStatus).toBe('pending');
    await app.close();
  });

  it('DR-2: generates presigned URL for upload part after the session gate', async () => {
    mockGetUploadPartPresignedUrl.mockResolvedValueOnce(
      'https://s3.amazonaws.com/test-bucket/part1?signature=xyz',
    );
    const app = await buildApp();
    const init = await initiate(app);
    const res = await app.inject({
      method: 'POST',
      url: `/drive/upload/multipart/${init.uploadId}/part-url`,
      payload: { key: init.key, partNumber: 1 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.url).toBe('https://s3.amazonaws.com/test-bucket/part1?signature=xyz');
    expect(mockGetUploadPartPresignedUrl).toHaveBeenCalledWith({
      key: init.key,
      uploadId: init.uploadId,
      partNumber: 1,
    });
    await app.close();
  });

  it('CODEX: part-url for another user’s session is denied (403) and mints nothing', async () => {
    const appOwner = await buildApp('user-1');
    const init = await initiate(appOwner);
    await appOwner.close();

    const appOther = await buildApp('user-2');
    const res = await appOther.inject({
      method: 'POST',
      url: `/drive/upload/multipart/${init.uploadId}/part-url`,
      payload: { key: init.key, partNumber: 1 },
    });
    expect(res.statusCode).toBe(403);
    expect(mockGetUploadPartPresignedUrl).not.toHaveBeenCalled();
    await appOther.close();
  });

  it('CODEX: part-url with a key that does not match the session is denied (403)', async () => {
    const app = await buildApp();
    const init = await initiate(app);
    const res = await app.inject({
      method: 'POST',
      url: `/drive/upload/multipart/${init.uploadId}/part-url`,
      payload: { key: 'drive/user-1/multipart/attacker-chosen.zip', partNumber: 1 },
    });
    expect(res.statusCode).toBe(403);
    expect(mockGetUploadPartPresignedUrl).not.toHaveBeenCalled();
    await app.close();
  });

  it('DR-3: completes multipart upload from SESSION values; client totalSize/name are ignored', async () => {
    mockCompleteMultipartUpload.mockResolvedValueOnce({
      key: 'drive/user-1/multipart/test-large.zip',
      etag: '"final-etag-789"',
    });
    const app = await buildApp();
    const init = await initiate(app);
    const res = await app.inject({
      method: 'POST',
      url: `/drive/upload/multipart/${init.uploadId}/complete`,
      // Client lies about size and name: the file record must use the
      // initiated session values, never these.
      payload: completePayload(init, { totalSize: 999, name: 'forged-name.zip' }),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.file.name).toBe('test-large.zip');
    expect(body.file.size).toBe(500 * 1024 * 1024);
    expect(createdFiles).toHaveLength(1);
    expect(createdVersions).toHaveLength(1);
    expect(mockCompleteMultipartUpload).toHaveBeenCalledWith({
      key: init.key,
      uploadId: init.uploadId,
      parts: [{ partNumber: 1, etag: '"etag-1"' }],
    });
    await app.close();
  });

  it('CODEX: complete without an initiated session is 404 and never touches S3', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/drive/upload/multipart/upload-mp-unknown/complete',
      payload: completePayload({ key: 'drive/user-1/multipart/x.zip' }),
    });
    expect(res.statusCode).toBe(404);
    expect(mockCompleteMultipartUpload).not.toHaveBeenCalled();
    expect(createdFiles).toHaveLength(0);
    await app.close();
  });

  it('CODEX: complete by another user is denied (403) and never touches S3', async () => {
    const appOwner = await buildApp('user-1');
    const init = await initiate(appOwner);
    await appOwner.close();

    const appOther = await buildApp('user-2');
    const res = await appOther.inject({
      method: 'POST',
      url: `/drive/upload/multipart/${init.uploadId}/complete`,
      payload: completePayload(init),
    });
    expect(res.statusCode).toBe(403);
    expect(mockCompleteMultipartUpload).not.toHaveBeenCalled();
    expect(createdFiles).toHaveLength(0);
    await appOther.close();
  });

  it('CODEX: complete on an expired session is 410', async () => {
    const app = await buildApp();
    const init = await initiate(app);
    sessions[0].expiresAt = new Date(Date.now() - 1000);
    const res = await app.inject({
      method: 'POST',
      url: `/drive/upload/multipart/${init.uploadId}/complete`,
      payload: completePayload(init),
    });
    expect(res.statusCode).toBe(410);
    expect(mockCompleteMultipartUpload).not.toHaveBeenCalled();
    expect(sessions[0].status).toBe('expired');
    await app.close();
  });

  it('CODEX: length mismatch between stored object and initiated size is 422, no file, object deleted', async () => {
    mockCompleteMultipartUpload.mockResolvedValueOnce({ key: 'drive/user-1/x', etag: '"e"' });
    mockGetObjectSize.mockResolvedValueOnce(123); // stored bytes != initiated 500MB
    const app = await buildApp();
    const init = await initiate(app);
    const res = await app.inject({
      method: 'POST',
      url: `/drive/upload/multipart/${init.uploadId}/complete`,
      payload: completePayload(init),
    });
    expect(res.statusCode).toBe(422);
    expect(createdFiles).toHaveLength(0);
    expect(mockDelete).toHaveBeenCalledWith(init.key);
    expect(sessions[0].status).toBe('failed');
    await app.close();
  });

  it('CODEX: replayed completion is idempotent — one file, same id, replayed flag', async () => {
    mockCompleteMultipartUpload.mockResolvedValueOnce({ key: 'drive/user-1/x', etag: '"e"' });
    const app = await buildApp();
    const init = await initiate(app);
    const first = await app.inject({
      method: 'POST',
      url: `/drive/upload/multipart/${init.uploadId}/complete`,
      payload: completePayload(init),
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: 'POST',
      url: `/drive/upload/multipart/${init.uploadId}/complete`,
      payload: completePayload(init),
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().replayed).toBe(true);
    expect(second.json().file.id).toBe(first.json().file.id);
    expect(createdFiles).toHaveLength(1);
    expect(mockCompleteMultipartUpload).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('CODEX: completion survives a restart (process-local reservations wiped) via the durable session', async () => {
    mockCompleteMultipartUpload.mockResolvedValueOnce({ key: 'drive/user-1/x', etag: '"e"' });
    const app = await buildApp();
    const init = await initiate(app);
    // Simulate a restart: the process-local reservation map is gone, but
    // the session row (the authority) survives.
    StorageQuotaService.clearReservations();
    const res = await app.inject({
      method: 'POST',
      url: `/drive/upload/multipart/${init.uploadId}/complete`,
      payload: completePayload(init),
    });
    expect(res.statusCode).toBe(201);
    expect(createdFiles).toHaveLength(1);
    await app.close();
  });

  it('CODEX: completion re-enforces quota from durable state — over-quota completes are 507', async () => {
    // NOTE: no complete mock is registered here on purpose — completion
    // must fail at the quota gate before S3 is touched, and a leftover
    // mockResolvedValueOnce would leak into the next test's mock queue.
    const app = await buildApp();
    const init = await initiate(app);
    // Fill the quota after initiate: used bytes now leave no room.
    usedBytes = 15 * 1024 * 1024 * 1024 - 1000;
    const res = await app.inject({
      method: 'POST',
      url: `/drive/upload/multipart/${init.uploadId}/complete`,
      payload: completePayload(init),
    });
    expect(res.statusCode).toBe(507);
    expect(mockCompleteMultipartUpload).not.toHaveBeenCalled();
    expect(createdFiles).toHaveLength(0);
    await app.close();
  });

  it('CODEX: S3 complete failure releases the claim so a retry succeeds (one file)', async () => {
    mockCompleteMultipartUpload.mockRejectedValueOnce(new Error('s3 flaky'));
    mockGetObjectSize.mockResolvedValueOnce(null); // recovery check: object did not land
    mockCompleteMultipartUpload.mockResolvedValueOnce({ key: 'drive/user-1/x', etag: '"e"' });
    const app = await buildApp();
    const init = await initiate(app);
    const failed = await app.inject({
      method: 'POST',
      url: `/drive/upload/multipart/${init.uploadId}/complete`,
      payload: completePayload(init),
    });
    expect(failed.statusCode).toBe(500);
    expect(sessions[0].status).toBe('pending');
    const retried = await app.inject({
      method: 'POST',
      url: `/drive/upload/multipart/${init.uploadId}/complete`,
      payload: completePayload(init),
    });
    expect(retried.statusCode).toBe(201);
    expect(createdFiles).toHaveLength(1);
    await app.close();
  });

  it('CODEX: complete returns 201 with a PENDING digest without waiting for the object download', async () => {
    mockCompleteMultipartUpload.mockResolvedValueOnce({ key: 'drive/user-1/x', etag: '"e"' });
    // The background digest's download never resolves: if completion waited
    // on it, this inject would hang. It must still return 201 promptly.
    mockDownload.mockImplementationOnce(() => new Promise(() => undefined));
    const app = await buildApp();
    const init = await initiate(app);
    const res = await app.inject({
      method: 'POST',
      url: `/drive/upload/multipart/${init.uploadId}/complete`,
      payload: completePayload(init),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().contentHashStatus).toBe('pending');
    expect(createdFiles).toHaveLength(1);
    // The file row is created with an empty hash (skipped by duplicate
    // detection) until the background digest fills in the real SHA-256.
    expect(createdFiles[0].contentHash).toBe('');
    await app.close();
  });

  it('DR-4: aborts multipart upload and releases reservation (owner-gated)', async () => {
    mockAbortMultipartUpload.mockResolvedValueOnce(undefined);
    const app = await buildApp();
    const init = await initiate(app);
    const res = await app.inject({
      method: 'POST',
      url: `/drive/upload/multipart/${init.uploadId}/abort`,
      payload: { key: init.key },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(mockAbortMultipartUpload).toHaveBeenCalledWith({
      key: init.key,
      uploadId: init.uploadId,
    });
    expect(sessions[0].status).toBe('aborted');
    await app.close();
  });

  it('CODEX: abort by another user is denied (403) and aborts nothing', async () => {
    const appOwner = await buildApp('user-1');
    const init = await initiate(appOwner);
    await appOwner.close();

    const appOther = await buildApp('user-2');
    const res = await appOther.inject({
      method: 'POST',
      url: `/drive/upload/multipart/${init.uploadId}/abort`,
      payload: { key: init.key },
    });
    expect(res.statusCode).toBe(403);
    expect(mockAbortMultipartUpload).not.toHaveBeenCalled();
    await appOther.close();
  });
});
