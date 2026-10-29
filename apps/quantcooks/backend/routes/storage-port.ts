// ============================================================================
// Shared storage-port resolution for the CP-1 routes (tools/jobs).
// Mirrors the decorated-override seams the P0-4/C-2/C-3B routes use:
// a decorated `storagePort` wins (tests, explicit wiring); otherwise the
// port is built from env via the storage adapter's buildStoragePort()
// (dynamic import keeps the SDK graph out of the route module's static
// imports, same as routes/exports.ts). Null = storage not configured.
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { StoragePort } from '../services/storage.adapter';

export async function resolveStoragePort(fastify: FastifyInstance): Promise<StoragePort | null> {
  const decorated = (fastify as unknown as { storagePort?: StoragePort | null }).storagePort;
  if (decorated !== undefined) return decorated ?? null;
  const { buildStoragePort } = await import('../services/storage.adapter');
  return buildStoragePort();
}
