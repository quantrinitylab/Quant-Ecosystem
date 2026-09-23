import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { driveSyncRoutes } from '../routes/drive-sync.js';
import { DriveSyncService } from '../services/drive-sync.service.js';
import { fastCdcChunk, computeBlake3Hash, buildFileManifest } from '@quant/storage';

describe('Task W35-07: QuantDrive Delta Sync REST Endpoints', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(driveSyncRoutes);
    await app.ready();
  });

  it('checks chunk existence and returns missing hashes via POST /drive/sync/check-chunks', async () => {
    const chunk1Data = new Uint8Array([1, 2, 3, 4, 5]);
    const hash1 = computeBlake3Hash(chunk1Data);
    const hash2 = 'a'.repeat(64);
    const hash3 = 'b'.repeat(64);

    // 1. Upload chunk 1 first
    await app.inject({
      method: 'POST',
      url: '/drive/sync/upload-chunk',
      payload: {
        hash: hash1,
        dataBase64: Buffer.from(chunk1Data).toString('base64'),
      },
    });

    // 2. Check chunks: hash1 should exist, hash2 and hash3 should be missing
    const res = await app.inject({
      method: 'POST',
      url: '/drive/sync/check-chunks',
      payload: {
        hashes: [hash1, hash2, hash3],
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.success).toBe(true);
    expect(json.data.missingHashes).toContain(hash2);
    expect(json.data.missingHashes).toContain(hash3);
    expect(json.data.missingHashes).not.toContain(hash1);
    expect(json.data.existingCount).toBe(1);
  });

  it('uploads a chunk and verifies hash integrity via POST /drive/sync/upload-chunk', async () => {
    const data = new TextEncoder().encode('FastCDC 64KB Chunk Data');
    const realHash = computeBlake3Hash(data);

    // Upload with matching hash
    const resSuccess = await app.inject({
      method: 'POST',
      url: '/drive/sync/upload-chunk',
      payload: {
        hash: realHash,
        dataBase64: Buffer.from(data).toString('base64'),
      },
    });

    expect(resSuccess.statusCode).toBe(200);
    const json = JSON.parse(resSuccess.payload);
    expect(json.success).toBe(true);
    expect(json.data.hash).toBe(realHash);

    // Upload with spoofed/mismatched hash must fail 400
    const resFail = await app.inject({
      method: 'POST',
      url: '/drive/sync/upload-chunk',
      payload: {
        hash: 'c'.repeat(64),
        dataBase64: Buffer.from(data).toString('base64'),
      },
    });

    expect(resFail.statusCode).toBe(400);
    const failJson = JSON.parse(resFail.payload);
    expect(failJson.error.code).toBe('HASH_MISMATCH');
  });

  it('fails manifest commit with 409 if referenced chunks are missing', async () => {
    const unuploadedHash = 'd'.repeat(64);

    const res = await app.inject({
      method: 'POST',
      url: '/drive/sync/commit-manifest',
      payload: {
        fileId: 'file_missing_test',
        fileName: 'dataset.bin',
        totalSize: 65536,
        chunks: [
          {
            hash: unuploadedHash,
            offset: 0,
            length: 65536,
          },
        ],
      },
    });

    expect(res.statusCode).toBe(409);
    const json = JSON.parse(res.payload);
    expect(json.error.code).toBe('CHUNKS_MISSING');
    expect(json.error.missingChunks).toContain(unuploadedHash);
  });

  it('commits manifest successfully when all chunks exist and retrieves it', async () => {
    const chunkData = new Uint8Array(65536);
    chunkData.fill(0x55);
    const hash = computeBlake3Hash(chunkData);

    // Upload chunk
    await app.inject({
      method: 'POST',
      url: '/drive/sync/upload-chunk',
      payload: {
        hash,
        dataBase64: Buffer.from(chunkData).toString('base64'),
      },
    });

    // Commit manifest
    const commitRes = await app.inject({
      method: 'POST',
      url: '/drive/sync/commit-manifest',
      payload: {
        fileId: 'file_complete_test',
        fileName: 'video_render.mp4',
        totalSize: 65536,
        chunks: [
          {
            hash,
            offset: 0,
            length: 65536,
          },
        ],
      },
    });

    expect(commitRes.statusCode).toBe(200);
    const commitJson = JSON.parse(commitRes.payload);
    expect(commitJson.success).toBe(true);
    expect(commitJson.data.fileId).toBe('file_complete_test');

    // GET manifest
    const getRes = await app.inject({
      method: 'GET',
      url: '/drive/sync/manifest/file_complete_test',
    });

    expect(getRes.statusCode).toBe(200);
    const getJson = JSON.parse(getRes.payload);
    expect(getJson.data.fileName).toBe('video_render.mp4');
  });

  it('demonstrates 99%+ bandwidth savings on delta sync calculation', () => {
    const service = new DriveSyncService();

    // 10MB simulated file: 160 chunks of 64KB
    const oldChunks = [];
    const newChunks = [];

    for (let i = 0; i < 160; i++) {
      const hash = `chunk_hash_${i.toString().padStart(50, '0')}`;
      oldChunks.push({ hash, offset: i * 65536, length: 65536 });
      // Only chunk index 10 is modified in the new file
      if (i === 10) {
        newChunks.push({
          hash: 'modified_chunk_hash'.padStart(64, '0'),
          offset: i * 65536,
          length: 65536,
        });
      } else {
        newChunks.push({ hash, offset: i * 65536, length: 65536 });
      }
    }

    const oldManifest = {
      fileId: 'file_v1',
      fileName: 'large_archive.tar',
      totalSize: 160 * 65536,
      chunks: oldChunks,
      createdAt: 1000,
    };

    const newManifest = {
      fileId: 'file_v2',
      fileName: 'large_archive.tar',
      totalSize: 160 * 65536,
      chunks: newChunks,
      createdAt: 2000,
    };

    const savings = service.calculateSyncSavings(oldManifest, newManifest);

    expect(savings.totalSize).toBe(10485760);
    // Only 1 chunk (64KB = 65536 bytes) needed to be uploaded
    expect(savings.uploadedBytes).toBe(65536);
    expect(savings.savingsBytes).toBe(10485760 - 65536);
    // Over 99.37% bandwidth savings!
    expect(savings.savingsPercentage).toBeGreaterThan(99.0);
  });
});
