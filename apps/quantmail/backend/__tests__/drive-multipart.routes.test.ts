// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';

const mockCreateMultipartUpload = vi.fn();
const mockGetUploadPartPresignedUrl = vi.fn();
const mockCompleteMultipartUpload = vi.fn();
const mockAbortMultipartUpload = vi.fn();

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

describe('Task DR-1 to DR-5: Drive 5GB S3 Multipart Upload Routes', () => {
  let createdFiles: any[] = [];
  let createdVersions: any[] = [];

  function fakePrisma() {
    return {
      file: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { size: 1000 } }),
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const row = {
            id: `file-${Date.now()}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          createdFiles.push(row);
          return row;
        }),
      },
      fileVersion: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const row = { id: `v-${Date.now()}`, ...data };
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
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'user-1', email: 'test@quantmail.com', name: 'Test User' }),
      },
    };
  }

  async function buildApp() {
    const app = Fastify({ logger: false });
    const prisma = fakePrisma();
    app.decorate('prisma', prisma as never);
    app.addHook('onRequest', async (req) => {
      (req as any).auth = { userId: 'user-1' };
    });
    await app.register(driveRoutes);
    await app.ready();
    return app;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    createdFiles = [];
    createdVersions = [];
  });

  it('DR-1: initiates an S3 multipart upload and reserves quota', async () => {
    mockCreateMultipartUpload.mockResolvedValueOnce({
      uploadId: 'upload-mp-123',
      key: 'drive/user-1/multipart/test-large.zip',
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/drive/upload/multipart/initiate',
      payload: {
        name: 'test-large.zip',
        totalSize: 500 * 1024 * 1024, // 500MB
        mimeType: 'application/zip',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.uploadId).toBe('upload-mp-123');
    expect(body.totalParts).toBe(100); // 500MB / 5MB partSize = 100 parts
    expect(body.partSize).toBe(5 * 1024 * 1024);
    expect(mockCreateMultipartUpload).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('DR-2: generates presigned URL for upload part', async () => {
    mockGetUploadPartPresignedUrl.mockResolvedValueOnce(
      'https://s3.amazonaws.com/test-bucket/part1?signature=xyz',
    );

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/drive/upload/multipart/upload-mp-123/part-url',
      payload: {
        key: 'drive/user-1/multipart/test-large.zip',
        partNumber: 1,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.url).toBe('https://s3.amazonaws.com/test-bucket/part1?signature=xyz');
    expect(body.partNumber).toBe(1);
    expect(body.uploadId).toBe('upload-mp-123');
    expect(mockGetUploadPartPresignedUrl).toHaveBeenCalledWith({
      key: 'drive/user-1/multipart/test-large.zip',
      uploadId: 'upload-mp-123',
      partNumber: 1,
    });
    await app.close();
  });

  it('DR-3: completes multipart upload and persists File and FileVersion rows', async () => {
    mockCompleteMultipartUpload.mockResolvedValueOnce({
      key: 'drive/user-1/multipart/test-large.zip',
      location: 'https://s3.amazonaws.com/test-bucket/large.zip',
      etag: '"final-etag-789"',
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/drive/upload/multipart/upload-mp-123/complete',
      payload: {
        key: 'drive/user-1/multipart/test-large.zip',
        name: 'test-large.zip',
        totalSize: 500 * 1024 * 1024,
        mimeType: 'application/zip',
        parts: [
          { partNumber: 1, etag: '"etag-1"' },
          { partNumber: 2, etag: '"etag-2"' },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.file).toBeDefined();
    expect(body.file.name).toBe('test-large.zip');
    expect(body.file.size).toBe(500 * 1024 * 1024);
    expect(createdFiles).toHaveLength(1);
    expect(createdVersions).toHaveLength(1);
    expect(mockCompleteMultipartUpload).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('DR-4: aborts multipart upload and releases reservation', async () => {
    mockAbortMultipartUpload.mockResolvedValueOnce(undefined);

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/drive/upload/multipart/upload-mp-123/abort',
      payload: {
        key: 'drive/user-1/multipart/test-large.zip',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(mockAbortMultipartUpload).toHaveBeenCalledWith({
      key: 'drive/user-1/multipart/test-large.zip',
      uploadId: 'upload-mp-123',
    });
    await app.close();
  });
});
