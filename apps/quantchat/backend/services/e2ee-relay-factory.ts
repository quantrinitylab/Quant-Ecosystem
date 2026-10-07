import type { PrismaClient } from '@prisma/client';
import { InMemoryE2EERelay, type E2EERelay } from '../lib/e2ee-relay';
import { PrismaE2EERelay } from './prisma-e2ee-relay';

/**
 * Config-driven selection of the E2EE {@link E2EERelay} implementation
 * (K27 — doc 16 §1/§7, §11).
 *
 * - `E2EE_RELAY=memory` → the volatile {@link InMemoryE2EERelay} (local dev /
 *   unit tests only; state is lost on restart).
 * - `E2EE_RELAY` absent or set to any other value (e.g. `prisma`) → the durable
 *   {@link PrismaE2EERelay}, so published pre-key bundles and relayed
 *   ciphertext envelopes survive restarts/redeploys and are shared across all
 *   backend instances.
 *
 * The backend remains a zero-knowledge relay regardless of implementation:
 * only PUBLIC key material and opaque ciphertext are ever persisted.
 */
export function createE2EERelay(prisma: PrismaClient): E2EERelay {
  if (process.env['E2EE_RELAY'] === 'memory') {
    return new InMemoryE2EERelay();
  }
  return PrismaE2EERelay.fromPrisma(prisma);
}
