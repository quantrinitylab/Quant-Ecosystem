// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { StorageQuotaService } from '../services/storage-quota.service';
import { ChunkedUploadService, DEFAULT_CHUNK_SIZE } from '../services/chunked-upload.service';

const { putDriveObjectMock } = vi.hoisted(() => ({ putDriveObjectMock: vi.fn() }));

vi.mock('../services/drive-storage.service', () => ({
  DEFAULT_CHUNK_SIZE: 5 * 1024 * 1024,
  MIN_CHUNK_SIZE: 64 * 1024,
  MAX_CHUNK_SIZE: 20 * 1024 * 1024,
  MAX_UPLOAD_FILE_BYTES: 5 * 1024 * 1024 * 1024,
  driveStorageReady: vi.fn(() => true),
  driveStorageUnavailableReason: vi.fn(() => ''),
  safeFileName: vi.fn((name: string) => name),
  driveObjectKey: vi.fn((userId: string, key: string) => `drive/${userId}/${key}`),
  encryptForDrive: vi.fn((buf: Buffer) => ({
    ciphertext: Buffer.concat([Buffer.from('enc-'), buf]),
    iv: 'iv-test',
    authTag: 'tag-test',
    wrappedKey: 'wrapped-key-test',
    contentHash: createHash('sha256').update(buf).digest('hex'),
  })),
  putDriveObject: putDriveObjectMock,
}));

describe('Task QD-02: Storage Quota Transactional Reservation Locks', () => {
  let quotaService: StorageQuotaService;
  let mockPrisma: any;

  beforeEach(() => {
    StorageQuotaService.clearReservations();
    mockPrisma = {
      file: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { size: 1000 } }),
      },
      userSubscription: {
        findUnique: vi.fn().mockResolvedValue({ tier: 'FREE' }),
      },
    };
    quotaService = new StorageQuotaService(mockPrisma);
  });

  it('atomically reserves quota for in-flight uploads', async () => {
    const reservation = await quotaService.reserveQuota('user-1', 5000);
    expect(reservation.reservationId).toBeDefined();
    expect(reservation.reservedBytes).toBe(5000);
    expect(quotaService.getReservedUsage('user-1')).toBe(5000);
  });

  it('prevents parallel uploads from bypassing quota limits', async () => {
    // FREE tier limit is 15 GiB = 16106127360 bytes
    // Set usedBytes close to limit: 16106127360 - 10000
    const nearLimit = 16106127360 - 10000;
    mockPrisma.file.aggregate.mockResolvedValue({ _sum: { size: nearLimit } });

    // First upload reserves 8000 bytes (allowed, 2000 remaining)
    const res1 = await quotaService.reserveQuota('user-1', 8000);
    expect(res1.reservationId).toBeDefined();

    // Second concurrent upload attempts to reserve 5000 bytes
    // Total needed: nearLimit + 8000 (reserved) + 5000 = nearLimit + 13000 > limit
    await expect(quotaService.reserveQuota('user-1', 5000)).rejects.toMatchObject({
      statusCode: 507,
      code: 'QUOTA_EXCEEDED',
    });

    // Release res1, then res2 should succeed
    quotaService.releaseReservation(res1.reservationId);
    expect(quotaService.getReservedUsage('user-1')).toBe(0);

    const res2 = await quotaService.reserveQuota('user-1', 5000);
    expect(res2.reservationId).toBeDefined();
  });
});

describe('Task QD-01 / Task D1: Resumable Chunked Upload Protocol', () => {
  let chunkedService: ChunkedUploadService;
  let quotaService: StorageQuotaService;
  let mockPrisma: any;

  beforeEach(() => {
    StorageQuotaService.clearReservations();
    ChunkedUploadService.clearSessions();
    putDriveObjectMock.mockReset();
    putDriveObjectMock.mockResolvedValue(undefined);

    mockPrisma = {
      file: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { size: 0 } }),
        create: vi
          .fn()
          .mockImplementation((args: any) => Promise.resolve({ id: 'file-123', ...args.data })),
        update: vi
          .fn()
          .mockImplementation((args: any) => Promise.resolve({ id: 'file-123', ...args.data })),
        delete: vi.fn().mockResolvedValue({ id: 'file-123' }),
      },
      fileVersion: {
        create: vi
          .fn()
          .mockImplementation((args: any) => Promise.resolve({ id: 'ver-1', ...args.data })),
      },
      folder: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'folder-1', userId: 'user-1', isDeleted: false }),
      },
      userSubscription: {
        findUnique: vi.fn().mockResolvedValue({ tier: 'FREE' }),
      },
      $transaction: vi.fn().mockImplementation(async (callbackOrPromises: any) => {
        if (Array.isArray(callbackOrPromises)) {
          return Promise.all(callbackOrPromises);
        }
        return callbackOrPromises(mockPrisma);
      }),
    };

    quotaService = new StorageQuotaService(mockPrisma);
    chunkedService = new ChunkedUploadService(mockPrisma, quotaService);
  });

  it('initiates a chunked upload session and computes chunk divisions', async () => {
    // 12 MB file with 5 MB chunk size -> 3 chunks (5 MB, 5 MB, 2 MB)
    const totalSize = 12 * 1024 * 1024;
    const session = await chunkedService.initiate('user-1', {
      name: 'large-video.mp4',
      totalSize,
      mimeType: 'video/mp4',
      chunkSize: 5 * 1024 * 1024,
    });

    expect(session.uploadId).toBeDefined();
    expect(session.chunkSize).toBe(5 * 1024 * 1024);
    expect(session.totalChunks).toBe(3);
    expect(quotaService.getReservedUsage('user-1')).toBe(totalSize);
  });

  it('accepts and verifies individual chunks including SHA-256 checksums', async () => {
    const totalSize = 200 * 1024; // 200 KB
    const chunkSize = 100 * 1024; // 100 KB
    const session = await chunkedService.initiate('user-1', {
      name: 'archive.tar.gz',
      totalSize,
      chunkSize,
    });

    const chunk0 = Buffer.alloc(chunkSize, 'a');
    const chunk0Hash = createHash('sha256').update(chunk0).digest('hex');

    const res0 = await chunkedService.uploadChunk(
      'user-1',
      session.uploadId,
      0,
      chunk0,
      chunk0Hash,
    );
    expect(res0.chunkIndex).toBe(0);
    expect(res0.receivedChunks).toBe(1);
    expect(res0.isComplete).toBe(false);

    // Mismatched checksum should throw error
    const chunk1 = Buffer.alloc(chunkSize, 'b');
    await expect(
      chunkedService.uploadChunk(
        'user-1',
        session.uploadId,
        1,
        chunk1,
        'incorrect-checksum-deadbeef',
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'CHECKSUM_MISMATCH',
    });

    // Valid chunk 1
    const res1 = await chunkedService.uploadChunk('user-1', session.uploadId, 1, chunk1);
    expect(res1.receivedChunks).toBe(2);
    expect(res1.isComplete).toBe(true);

    const status = chunkedService.getStatus('user-1', session.uploadId);
    expect(status.isComplete).toBe(true);
    expect(status.receivedChunks).toEqual([0, 1]);
    expect(status.missingChunks).toEqual([]);
  });

  it('completes the upload, concatenates chunks, encrypts, and commits quota', async () => {
    const totalSize = 150 * 1024;
    const chunkSize = 100 * 1024;
    const session = await chunkedService.initiate('user-1', {
      name: 'data.bin',
      totalSize,
      chunkSize,
    });

    const chunk0 = Buffer.alloc(100 * 1024, 'x');
    const chunk1 = Buffer.alloc(50 * 1024, 'y');

    await chunkedService.uploadChunk('user-1', session.uploadId, 0, chunk0);
    await chunkedService.uploadChunk('user-1', session.uploadId, 1, chunk1);

    const result = await chunkedService.complete('user-1', session.uploadId);
    expect(result.file).toBeDefined();
    expect(result.file.id).toBe('file-123');
    expect(result.file.size).toBe(totalSize);
    expect(putDriveObjectMock).toHaveBeenCalled();
    expect(quotaService.getReservedUsage('user-1')).toBe(0);
  });

  it('aborts upload and cleans up reservation', async () => {
    const session = await chunkedService.initiate('user-1', {
      name: 'aborted.iso',
      totalSize: 50 * 1024 * 1024,
    });
    expect(quotaService.getReservedUsage('user-1')).toBe(50 * 1024 * 1024);

    await chunkedService.abort('user-1', session.uploadId);
    expect(quotaService.getReservedUsage('user-1')).toBe(0);
  });
});
