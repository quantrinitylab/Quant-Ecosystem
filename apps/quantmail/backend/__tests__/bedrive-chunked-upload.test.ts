// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import {
  initiateChunkedUpload,
  uploadChunk,
  getUploadSessionStatus,
  completeChunkedUpload,
  cancelChunkedUpload,
  clearUploadsForTesting,
  DEFAULT_CHUNK_SIZE,
} from '../services/chunked-upload.service';
import { chunkedUploadRoutes } from '../routes/chunked-upload';

describe('BeDrive v3.2.2 Resumable Chunked Multipart Upload Engine', () => {
  beforeEach(() => {
    clearUploadsForTesting();
  });

  describe('Core Service Logic', () => {
    it('initiating session computes correct totalChunks and 0% progress', () => {
      // 15MB file with default 5MB chunk size -> 3 chunks
      const fileSize = 15 * 1024 * 1024;
      const session = initiateChunkedUpload('workspace-alpha', {
        fileName: 'dataset-large.tar.gz',
        fileSize,
        mimeType: 'application/gzip',
      });

      expect(session.uploadId).toBeDefined();
      expect(session.workspaceId).toBe('workspace-alpha');
      expect(session.fileName).toBe('dataset-large.tar.gz');
      expect(session.fileSize).toBe(fileSize);
      expect(session.mimeType).toBe('application/gzip');
      expect(session.chunkSize).toBe(DEFAULT_CHUNK_SIZE);
      expect(session.totalChunks).toBe(3);
      expect(session.uploadedChunkIndexes).toEqual([]);
      expect(session.isCompleted).toBe(false);
      expect(session.createdAt).toBeDefined();
      expect(session.expiresAt).toBeDefined();

      const status = getUploadSessionStatus(session.uploadId);
      expect(status.progressPercentage).toBe(0);
      expect(status.missingChunks).toEqual([0, 1, 2]);
    });

    it('custom chunkSize correctly calculates totalChunks', () => {
      // 11MB file with 2MB chunk size -> Math.ceil(11 / 2) = 6 chunks
      const session = initiateChunkedUpload('workspace-alpha', {
        fileName: 'firmware.bin',
        fileSize: 11 * 1024 * 1024,
        mimeType: 'application/octet-stream',
        chunkSize: 2 * 1024 * 1024,
      });

      expect(session.totalChunks).toBe(6);
      expect(session.chunkSize).toBe(2 * 1024 * 1024);
    });

    it('uploading individual chunks updates uploadedChunkIndexes and progressPercentage', () => {
      const fileSize = 15 * 1024 * 1024; // 3 chunks (chunk 0, 1, 2)
      const session = initiateChunkedUpload('workspace-beta', {
        fileName: 'archive.zip',
        fileSize,
        mimeType: 'application/zip',
      });

      // Upload chunk 0
      const chunk0 = Buffer.alloc(DEFAULT_CHUNK_SIZE, 'a');
      const res0 = uploadChunk(session.uploadId, 0, chunk0);
      expect(res0.chunkIndex).toBe(0);
      expect(res0.uploadedChunks).toEqual([0]);
      expect(res0.isComplete).toBe(false);
      expect(res0.progressPercentage).toBe(33); // 1/3 ~ 33%

      // Upload chunk 2 out of order
      const chunk2 = Buffer.alloc(DEFAULT_CHUNK_SIZE, 'c');
      const res2 = uploadChunk(session.uploadId, 2, chunk2);
      expect(res2.chunkIndex).toBe(2);
      expect(res2.uploadedChunks).toEqual([0, 2]);
      expect(res2.isComplete).toBe(false);
      expect(res2.progressPercentage).toBe(67); // 2/3 ~ 67%

      // Duplicate upload of chunk 0 should not duplicate in array
      const res0Dup = uploadChunk(session.uploadId, 0, chunk0);
      expect(res0Dup.uploadedChunks).toEqual([0, 2]);
      expect(res0Dup.progressPercentage).toBe(67);
    });

    it('status check accurately lists missingChunks', () => {
      const fileSize = 20 * 1024 * 1024; // 4 chunks (0, 1, 2, 3)
      const session = initiateChunkedUpload('workspace-gamma', {
        fileName: '4k-video.mp4',
        fileSize,
        mimeType: 'video/mp4',
      });

      uploadChunk(session.uploadId, 0, 'chunk-data-0');
      uploadChunk(session.uploadId, 3, 'chunk-data-3');

      const status = getUploadSessionStatus(session.uploadId);
      expect(status.session.uploadedChunkIndexes).toEqual([0, 3]);
      expect(status.missingChunks).toEqual([1, 2]);
      expect(status.progressPercentage).toBe(50);
    });

    it('attempting to complete before all chunks are received throws INCOMPLETE_CHUNKS error', () => {
      const fileSize = 10 * 1024 * 1024; // 2 chunks (0, 1)
      const session = initiateChunkedUpload('workspace-delta', {
        fileName: 'backup.sql',
        fileSize,
        mimeType: 'application/sql',
      });

      // Upload only chunk 0
      uploadChunk(session.uploadId, 0, 'chunk-0');

      expect(() => completeChunkedUpload(session.uploadId)).toThrow(
        /INCOMPLETE_CHUNKS: Missing chunks: 1/,
      );
    });

    it('completing with all chunks finalizes assembly and marks session isCompleted: true', () => {
      const fileSize = 10 * 1024 * 1024; // 2 chunks
      const session = initiateChunkedUpload('workspace-delta', {
        fileName: 'final-document.pdf',
        fileSize,
        mimeType: 'application/pdf',
      });

      uploadChunk(session.uploadId, 0, 'chunk-data-0');
      const res1 = uploadChunk(session.uploadId, 1, 'chunk-data-1');
      expect(res1.isComplete).toBe(true);
      expect(res1.progressPercentage).toBe(100);

      const completeResult = completeChunkedUpload(session.uploadId);
      expect(completeResult.success).toBe(true);
      expect(completeResult.file.id).toBeDefined();
      expect(completeResult.file.name).toBe('final-document.pdf');
      expect(completeResult.file.size).toBe(fileSize);
      expect(completeResult.file.mimeType).toBe('application/pdf');
      expect(completeResult.file.completedAt).toBeDefined();

      const status = getUploadSessionStatus(session.uploadId);
      expect(status.session.isCompleted).toBe(true);
      expect(status.session.assembledFileId).toBe(completeResult.file.id);
      expect(status.missingChunks).toEqual([]);
      expect(status.progressPercentage).toBe(100);
    });

    it('throws error when uploading chunk to invalid chunk index', () => {
      const session = initiateChunkedUpload('workspace-1', {
        fileName: 'test.dat',
        fileSize: 5 * 1024 * 1024, // 1 chunk (chunk 0)
        mimeType: 'application/octet-stream',
      });

      expect(() => uploadChunk(session.uploadId, 1, 'invalid')).toThrow(/INVALID_CHUNK_INDEX/);
      expect(() => uploadChunk(session.uploadId, -1, 'invalid')).toThrow(/INVALID_CHUNK_INDEX/);
    });

    it('throws error when uploading chunk to completed session', () => {
      const session = initiateChunkedUpload('workspace-1', {
        fileName: 'test.dat',
        fileSize: 5 * 1024 * 1024,
        mimeType: 'application/octet-stream',
      });
      uploadChunk(session.uploadId, 0, 'data');
      completeChunkedUpload(session.uploadId);

      expect(() => uploadChunk(session.uploadId, 0, 'data')).toThrow(/UPLOAD_ALREADY_COMPLETED/);
    });

    it('cancelling session removes upload', () => {
      const session = initiateChunkedUpload('workspace-omega', {
        fileName: 'scratch.bin',
        fileSize: 10 * 1024 * 1024,
        mimeType: 'application/octet-stream',
      });

      const cancelled = cancelChunkedUpload(session.uploadId);
      expect(cancelled).toBe(true);

      // Attempting to cancel again returns false
      expect(cancelChunkedUpload(session.uploadId)).toBe(false);

      // Status check fails with session not found
      expect(() => getUploadSessionStatus(session.uploadId)).toThrow(/UPLOAD_SESSION_NOT_FOUND/);
    });
  });

  describe('Fastify REST API Route Endpoints', () => {
    async function createTestApp() {
      const app = Fastify();
      await app.register(chunkedUploadRoutes);
      return app;
    }

    it('POST /api/drive/chunked/init initializes upload session', async () => {
      const app = await createTestApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/drive/chunked/init',
        payload: {
          fileName: 'presentation.pptx',
          fileSize: 15728640, // 15MB
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.uploadId).toBeDefined();
      expect(body.data.totalChunks).toBe(3);
      expect(body.data.uploadedChunkIndexes).toEqual([]);
      expect(body.data.isCompleted).toBe(false);
    });

    it('POST /api/drive/chunked/part uploads chunk and tracks progress', async () => {
      const app = await createTestApp();

      const initRes = await app.inject({
        method: 'POST',
        url: '/api/drive/chunked/init',
        payload: {
          fileName: 'video.mov',
          fileSize: 15728640,
          mimeType: 'video/quicktime',
        },
      });
      const { uploadId } = initRes.json().data;

      const partRes = await app.inject({
        method: 'POST',
        url: '/api/drive/chunked/part',
        payload: {
          uploadId,
          chunkIndex: 0,
          chunkData: 'sample-chunk-payload-0',
        },
      });

      expect(partRes.statusCode).toBe(200);
      const partBody = partRes.json();
      expect(partBody.success).toBe(true);
      expect(partBody.data.chunkIndex).toBe(0);
      expect(partBody.data.uploadedChunks).toEqual([0]);
      expect(partBody.data.progressPercentage).toBe(33);
      expect(partBody.data.isComplete).toBe(false);
    });

    it('GET /api/drive/chunked/:uploadId/status returns status and missing chunks', async () => {
      const app = await createTestApp();

      const initRes = await app.inject({
        method: 'POST',
        url: '/api/drive/chunked/init',
        payload: {
          fileName: 'iso-image.iso',
          fileSize: 15728640,
          mimeType: 'application/x-iso9660-image',
        },
      });
      const { uploadId } = initRes.json().data;

      // Upload chunk 1 only
      await app.inject({
        method: 'POST',
        url: '/api/drive/chunked/part',
        payload: {
          uploadId,
          chunkIndex: 1,
          chunkData: 'chunk-1',
        },
      });

      const statusRes = await app.inject({
        method: 'GET',
        url: `/api/drive/chunked/${uploadId}/status`,
      });

      expect(statusRes.statusCode).toBe(200);
      const statusBody = statusRes.json();
      expect(statusBody.success).toBe(true);
      expect(statusBody.data.missingChunks).toEqual([0, 2]);
      expect(statusBody.data.progressPercentage).toBe(33);
    });

    it('POST /api/drive/chunked/:uploadId/complete returns 400 when missing chunks', async () => {
      const app = await createTestApp();

      const initRes = await app.inject({
        method: 'POST',
        url: '/api/drive/chunked/init',
        payload: {
          fileName: 'incomplete.tar',
          fileSize: 15728640,
          mimeType: 'application/x-tar',
        },
      });
      const { uploadId } = initRes.json().data;

      const completeRes = await app.inject({
        method: 'POST',
        url: `/api/drive/chunked/${uploadId}/complete`,
      });

      expect(completeRes.statusCode).toBe(400);
      const body = completeRes.json();
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('INCOMPLETE_CHUNKS');
    });

    it('Full lifecycle: init -> upload all parts -> complete -> delete', async () => {
      const app = await createTestApp();

      // 1. Init
      const initRes = await app.inject({
        method: 'POST',
        url: '/api/drive/chunked/init',
        payload: {
          fileName: 'complete-file.zip',
          fileSize: 10485760, // 10MB -> 2 chunks
          mimeType: 'application/zip',
        },
      });
      const { uploadId } = initRes.json().data;

      // 2. Upload part 0
      await app.inject({
        method: 'POST',
        url: '/api/drive/chunked/part',
        payload: { uploadId, chunkIndex: 0, chunkData: 'chunk-0' },
      });

      // 3. Upload part 1
      await app.inject({
        method: 'POST',
        url: '/api/drive/chunked/part',
        payload: { uploadId, chunkIndex: 1, chunkData: 'chunk-1' },
      });

      // 4. Complete
      const completeRes = await app.inject({
        method: 'POST',
        url: `/api/drive/chunked/${uploadId}/complete`,
      });
      expect(completeRes.statusCode).toBe(200);
      const completeBody = completeRes.json();
      expect(completeBody.success).toBe(true);
      expect(completeBody.data.file.name).toBe('complete-file.zip');

      // 5. Delete / Cancel
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/drive/chunked/${uploadId}`,
      });
      expect(delRes.statusCode).toBe(200);

      // 6. Verify deleted
      const checkRes = await app.inject({
        method: 'GET',
        url: `/api/drive/chunked/${uploadId}/status`,
      });
      expect(checkRes.statusCode).toBe(404);
    });
  });
});
