// ============================================================================
// QC-F-573 — MediaService: real presign + fail-closed + finalize pipeline.
//
// The old service handed out a SIMULATED presigned URL (comment-admitted),
// kept metadata in a process-memory Map, and omitted audio/webm from the
// allowlist. Every test below FAILS against that original implementation
// (verified by negative control) and passes with the real pipeline.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { MediaService } from '../services/media.service';
import { createMediaPrismaFake, StubObjectStorage } from './fake-media-stack';

const OWNER = 'user_voice_owner';
const STRANGER = 'user_voice_stranger';

type AppErrorLike = Error & { statusCode?: number; code?: string };

async function expectAppError(
  promise: Promise<unknown>,
  statusCode: number,
  code: string,
): Promise<AppErrorLike> {
  try {
    await promise;
  } catch (err) {
    const e = err as AppErrorLike;
    expect(e.statusCode).toBe(statusCode);
    expect(e.code).toBe(code);
    return e;
  }
  throw new Error(`Expected ${code} (${statusCode}) but the call succeeded`);
}

describe('QC-F-573 MediaService.generateUploadUrl', () => {
  let prisma: PrismaClient;
  let storage: StubObjectStorage;
  let service: MediaService;

  beforeEach(() => {
    ({ prisma } = createMediaPrismaFake());
    storage = new StubObjectStorage();
    service = new MediaService(prisma, storage);
  });

  it('accepts the recorder output audio/webm and returns a real presigned URL', async () => {
    const res = await service.generateUploadUrl(OWNER, 'voice-1.webm', 'audio/webm');
    expect(res.mediaId).toMatch(/^media_[0-9a-f-]{36}$/);
    expect(res.uploadUrl).toContain(encodeURIComponent(`${OWNER}/${res.mediaId}/voice-1.webm`));
    expect(res.fields['key']).toBe(`${OWNER}/${res.mediaId}/voice-1.webm`);
    expect(res.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('accepts the other allowlisted audio containers', async () => {
    for (const ct of ['audio/mp4', 'audio/mpeg', 'audio/ogg']) {
      const res = await service.generateUploadUrl(OWNER, 'note.bin', ct);
      expect(res.uploadUrl).toBeTruthy();
    }
  });

  it('rejects a non-allowlisted content type with 400 INVALID_CONTENT_TYPE', async () => {
    await expectAppError(
      service.generateUploadUrl(OWNER, 'note.wav', 'audio/wav'),
      400,
      'INVALID_CONTENT_TYPE',
    );
  });

  it('fails closed 503 STORAGE_NOT_CONFIGURED when no storage is configured', async () => {
    const noStorage = new MediaService(prisma, null);
    await expectAppError(
      noStorage.generateUploadUrl(OWNER, 'voice-1.webm', 'audio/webm'),
      503,
      'STORAGE_NOT_CONFIGURED',
    );
  });

  it('rejects missing filename/contentType with 400 INVALID_INPUT', async () => {
    await expectAppError(service.generateUploadUrl(OWNER, '', 'audio/webm'), 400, 'INVALID_INPUT');
  });
});

describe('QC-F-573 MediaService.finalizeUpload', () => {
  let prisma: PrismaClient;
  let storage: StubObjectStorage;
  let service: MediaService;

  beforeEach(() => {
    ({ prisma } = createMediaPrismaFake());
    storage = new StubObjectStorage();
    service = new MediaService(prisma, storage);
  });

  async function presignAndPut(
    userId: string,
    filename = 'voice-1.webm',
    contentType = 'audio/webm',
    bytes = new Uint8Array([1, 2, 3, 4]),
    storedContentType?: string,
  ) {
    const presign = await service.generateUploadUrl(userId, filename, contentType);
    storage.putObject(
      `${userId}/${presign.mediaId}/${filename}`,
      bytes,
      storedContentType ?? contentType,
    );
    return presign;
  }

  it('finalizes a real upload: HEAD-verified, durable AUDIO row, idempotent re-finalize', async () => {
    const presign = await presignAndPut(OWNER);
    const meta = await service.finalizeUpload(presign.mediaId, OWNER, {
      filename: 'voice-1.webm',
      contentType: 'audio/webm',
      durationMs: 5320,
    });
    expect(meta.mediaId).toBe(presign.mediaId);
    expect(meta.userId).toBe(OWNER);
    expect(meta.url).toContain(encodeURIComponent(`${OWNER}/${presign.mediaId}/voice-1.webm`));
    expect(meta.contentType).toBe('audio/webm');

    // Idempotent: re-finalize returns the same row, no duplicate.
    const again = await service.finalizeUpload(presign.mediaId, OWNER, {
      filename: 'voice-1.webm',
      contentType: 'audio/webm',
      durationMs: 5320,
    });
    expect(again.mediaId).toBe(meta.mediaId);
    expect(again.url).toBe(meta.url);
  });

  it('rejects finalize when the object was never uploaded: 404 MEDIA_NOT_UPLOADED', async () => {
    const presign = await service.generateUploadUrl(OWNER, 'voice-2.webm', 'audio/webm');
    await expectAppError(
      service.finalizeUpload(presign.mediaId, OWNER, {
        filename: 'voice-2.webm',
        contentType: 'audio/webm',
      }),
      404,
      'MEDIA_NOT_UPLOADED',
    );
  });

  it('rejects an empty (0-byte) object: 400 EMPTY_UPLOAD', async () => {
    const presign = await presignAndPut(OWNER, 'voice-3.webm', 'audio/webm', new Uint8Array(0));
    await expectAppError(
      service.finalizeUpload(presign.mediaId, OWNER, {
        filename: 'voice-3.webm',
        contentType: 'audio/webm',
      }),
      400,
      'EMPTY_UPLOAD',
    );
  });

  it('rejects a content-type mismatch between stored bytes and the claim: 400', async () => {
    const presign = await presignAndPut(
      OWNER,
      'voice-4.webm',
      'audio/webm',
      new Uint8Array([9, 9]),
      'image/png',
    );
    await expectAppError(
      service.finalizeUpload(presign.mediaId, OWNER, {
        filename: 'voice-4.webm',
        contentType: 'audio/webm',
      }),
      400,
      'CONTENT_TYPE_MISMATCH',
    );
  });

  it('rejects finalize of an existing row by a non-owner: 403 NOT_MEDIA_OWNER', async () => {
    const presign = await presignAndPut(OWNER);
    await service.finalizeUpload(presign.mediaId, OWNER, {
      filename: 'voice-1.webm',
      contentType: 'audio/webm',
    });
    // The stranger's key would not exist in storage, but the existing-row
    // owner check fires first — 403, never a 404 leak.
    await expectAppError(
      service.finalizeUpload(presign.mediaId, STRANGER, {
        filename: 'voice-1.webm',
        contentType: 'audio/webm',
      }),
      403,
      'NOT_MEDIA_OWNER',
    );
  });

  it('rejects a forged media id: 400 INVALID_MEDIA_ID', async () => {
    await expectAppError(
      service.finalizeUpload('media_not-a-real-id', OWNER, {
        filename: 'voice-1.webm',
        contentType: 'audio/webm',
      }),
      400,
      'INVALID_MEDIA_ID',
    );
  });

  it('requires authentication: 401 UNAUTHORIZED', async () => {
    await expectAppError(
      service.finalizeUpload('media_12345678-1234-1234-1234-123456789012', '', {
        filename: 'voice-1.webm',
        contentType: 'audio/webm',
      }),
      401,
      'UNAUTHORIZED',
    );
  });

  it('fails closed 503 STORAGE_NOT_CONFIGURED on finalize without storage', async () => {
    const noStorage = new MediaService(prisma, null);
    await expectAppError(
      noStorage.finalizeUpload('media_12345678-1234-1234-1234-123456789012', OWNER, {
        filename: 'voice-1.webm',
        contentType: 'audio/webm',
      }),
      503,
      'STORAGE_NOT_CONFIGURED',
    );
  });
});

describe('QC-F-573 MediaService owner gates (durable)', () => {
  let prisma: PrismaClient;
  let storage: StubObjectStorage;
  let service: MediaService;
  let mediaId: string;

  beforeEach(async () => {
    ({ prisma } = createMediaPrismaFake());
    storage = new StubObjectStorage();
    service = new MediaService(prisma, storage);
    const presign = await service.generateUploadUrl(OWNER, 'voice-1.webm', 'audio/webm');
    storage.putObject(`${OWNER}/${presign.mediaId}/voice-1.webm`, new Uint8Array([7]), 'audio/webm');
    const meta = await service.finalizeUpload(presign.mediaId, OWNER, {
      filename: 'voice-1.webm',
      contentType: 'audio/webm',
    });
    mediaId = meta.mediaId;
  });

  it('owner reads their finalized metadata', async () => {
    const meta = await service.getMediaMetadata(mediaId, OWNER);
    expect(meta.mediaId).toBe(mediaId);
    expect(meta.filename).toBe('voice-1.webm');
  });

  it('non-owner is denied 403 NOT_MEDIA_OWNER', async () => {
    await expectAppError(service.getMediaMetadata(mediaId, STRANGER), 403, 'NOT_MEDIA_OWNER');
  });

  it('unknown media is 404 MEDIA_NOT_FOUND', async () => {
    await expectAppError(
      service.getMediaMetadata('media_12345678-1234-1234-1234-123456789012', OWNER),
      404,
      'MEDIA_NOT_FOUND',
    );
  });

  it('deleteMedia: non-owner denied, record survives; owner can delete', async () => {
    await expectAppError(service.deleteMedia(mediaId, STRANGER), 403, 'NOT_MEDIA_OWNER');
    const meta = await service.getMediaMetadata(mediaId, OWNER);
    expect(meta.mediaId).toBe(mediaId);

    await service.deleteMedia(mediaId, OWNER);
    await expectAppError(service.getMediaMetadata(mediaId, OWNER), 404, 'MEDIA_NOT_FOUND');
  });
});
