// ============================================================================
// QuantEdits - Object-storage adapter (P0-3)
//
// Single responsibility: build the narrow storage port the QuantCooks
// backend depends on, backed by the monorepo's @quant/storage StorageClient
// (S3/R2/MinIO) — the same integration QuantChat's message.service.ts uses.
// No new storage code lives here: config resolution, signing and SigV4 rules
// all belong to @quant/storage.
//
// When the resolver returns null (storage env not configured), the port is
// null and every storage-dependent operation in the services fails closed
// with 503 STORAGE_NOT_CONFIGURED — never a fabricated URL, never a silent
// no-op. Metadata-only operations (DB rows) do not need the port.
// ============================================================================

import { StorageClient, resolveStorageConfigFromEnv } from '@quant/storage';
import type { Readable } from 'node:stream';

/** The narrow storage surface QuantCooks services depend on (DI'd for tests). */
export interface StoragePort {
  getSignedUploadUrl(params: {
    key: string;
    contentType: string;
    contentLength: number;
    maxBytes?: number;
  }): Promise<{
    url: string;
    key: string;
    expiresAt: Date;
    requiredHeaders: Record<string, string>;
    maxBytes: number;
  }>;
  upload(
    key: string,
    body: Buffer | Readable,
    contentType: string,
  ): Promise<{ key: string; etag: string }>;
  download(
    key: string,
  ): Promise<{ body: Readable; contentType: string; contentLength: number }>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  headObject(
    key: string,
  ): Promise<{ contentLength: number; contentType?: string; etag?: string } | null>;
  delete(key: string): Promise<void>;
}

/** Same NotFound check @quant/storage uses internally (name or HTTP 404). */
function isNotFound(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return candidate?.name === 'NotFound' || candidate?.$metadata?.httpStatusCode === 404;
}

export function buildStoragePort(): StoragePort | null {
  const config = resolveStorageConfigFromEnv();
  if (!config) return null;

  const client = new StorageClient(config);

  return {
    async getSignedUploadUrl(params) {
      const signed = await client.getSignedUploadUrl(params);
      return {
        url: signed.url,
        key: signed.key,
        expiresAt: signed.expiresAt,
        requiredHeaders: signed.requiredHeaders,
        maxBytes: signed.maxBytes,
      };
    },
    upload: (key, body, contentType) => client.upload(key, body, contentType),
    download: (key) => client.download(key),
    getSignedUrl: (key, expiresIn) => client.getSignedUrl(key, expiresIn),
    async headObject(key) {
      try {
        const head = await client.headObject(key);
        return { contentLength: head.contentLength, contentType: head.contentType };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    delete: (key) => client.delete(key),
  };
}
