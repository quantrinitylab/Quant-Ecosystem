import type { PrismaClient } from '@prisma/client';
import { InMemoryKeyStorage, type KeyStorage } from './encryption.service';
import { PrismaKeyStorage } from './prisma-key-storage';

/**
 * Config-driven selection of the E2EE {@link KeyStorage} implementation
 * (design Component 1 "Wiring"; Requirements 3.5, 3.6).
 *
 * - `KEY_STORAGE=memory` → the volatile {@link InMemoryKeyStorage} (retained
 *   only for local dev / unit tests).
 * - `KEY_STORAGE` absent or set to any other value (e.g. `prisma`) → the durable
 *   {@link PrismaKeyStorage}, so prekey bundles, one-time prekeys, and X3DH
 *   sessions survive restarts/redeploys and are shared across all instances.
 *
 * The backend remains a zero-knowledge relay regardless of implementation
 * (Requirement 16): only PUBLIC key material is ever persisted.
 */
export function createKeyStorage(prisma: PrismaClient): KeyStorage {
  if (process.env['KEY_STORAGE'] === 'memory') {
    return new InMemoryKeyStorage();
  }
  return new PrismaKeyStorage(prisma);
}
