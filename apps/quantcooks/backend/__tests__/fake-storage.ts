// ============================================================================
// In-memory fake for the StoragePort (P0-3 tests; P0-4 reuses this too).
//
// Implements the narrow storage surface services depend on over a Map, with
// the same contracts as @quant/storage's StorageClient: content-length is
// pinned at signing time (getSignedUploadUrl rejects oversize / non-positive
// lengths), headObject returns null for a missing key, signed URLs are
// host-distinct so tests can prove no fabricated domain survives. The
// test-only `put()` helper simulates the client's direct browser→storage
// PUT, which the backend never sees in the real flow.
// ============================================================================

import type { Readable } from 'node:stream';
import type { StoragePort } from '../services/storage.adapter';

// Mirrors @quant/storage's DEFAULT_MAX_UPLOAD_BYTES (25 MB) without importing
// the storage SDK module graph into the test process.
const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const FAKE_STORAGE_HOST = 'https://fake-storage.test';

interface FakeObject {
  bytes: Buffer;
  contentType: string;
  etag: string;
}

export function createFakeStorage() {
  const objects = new Map<string, FakeObject>();
  let etagCounter = 0;

  const port: StoragePort = {
    async getSignedUploadUrl(params) {
      const maxBytes = params.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
      if (!Number.isInteger(params.contentLength) || params.contentLength <= 0) {
        throw new Error('contentLength must be a positive integer');
      }
      if (params.contentLength > maxBytes) {
        throw new Error(
          `contentLength ${params.contentLength} exceeds maxBytes ${maxBytes}`,
        );
      }
      return {
        url: `${FAKE_STORAGE_HOST}/${params.key}`,
        key: params.key,
        expiresAt: new Date(Date.now() + 900 * 1000),
        requiredHeaders: {
          'Content-Type': params.contentType,
          'Content-Length': String(params.contentLength),
        },
        maxBytes,
      };
    },

    async upload(key, body, contentType) {
      const bytes = Buffer.isBuffer(body) ? body : await streamToBuffer(body);
      etagCounter++;
      const etag = `fake-etag-${etagCounter}`;
      objects.set(key, { bytes, contentType, etag });
      return { key, etag };
    },

    async download(key) {
      const object = objects.get(key);
      if (!object) throw new Error(`NoSuchKey: ${key}`);
      const { Readable: NodeReadable } = await import('node:stream');
      return {
        body: NodeReadable.from(object.bytes),
        contentType: object.contentType,
        contentLength: object.bytes.length,
      };
    },

    async getSignedUrl(key) {
      return `${FAKE_STORAGE_HOST}/${key}?signed=1`;
    },

    async headObject(key) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        contentLength: object.bytes.length,
        contentType: object.contentType,
        etag: object.etag,
      };
    },

    async delete(key) {
      objects.delete(key);
    },
  };

  return {
    port,
    objects,
    /** Test-only: simulate the client's direct PUT of raw bytes. */
    put(key: string, bytes: Buffer, contentType = 'application/octet-stream') {
      etagCounter++;
      objects.set(key, { bytes, contentType, etag: `fake-etag-${etagCounter}` });
    },
    has(key: string) {
      return objects.has(key);
    },
  };
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

export type FakeStorage = ReturnType<typeof createFakeStorage>;
