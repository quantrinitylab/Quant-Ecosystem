import crypto from 'node:crypto';
import { z } from 'zod';

export const DisposableEmailSchema = z.object({
  id: z.string(),
  address: z.string(),
  userId: z.string(),
  createdAt: z.number(),
  expiresAt: z.number(),
  isActive: z.boolean(),
});

export type DisposableEmail = z.infer<typeof DisposableEmailSchema>;

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class DisposableEmailService {
  /**
   * In-memory store for disposable email addresses. This is ephemeral and will be
   * lost on process restart. Will be replaced with database persistence in production.
   */
  private disposables: Map<string, DisposableEmail> = new Map();

  createDisposable(userId: string, ttlMs?: number): DisposableEmail {
    const randomPart = crypto.randomBytes(8).toString('hex');
    const address = `${randomPart}@quant.email`;
    const now = Date.now();

    const entry: DisposableEmail = {
      id: crypto.randomUUID(),
      address,
      userId,
      createdAt: now,
      expiresAt: now + (ttlMs ?? DEFAULT_TTL_MS),
      isActive: true,
    };

    this.disposables.set(address, entry);
    return entry;
  }

  getDisposable(address: string): DisposableEmail | null {
    const entry = this.disposables.get(address);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt < Date.now()) {
      entry.isActive = false;
      return null;
    }

    return entry;
  }

  listActive(userId: string): DisposableEmail[] {
    const now = Date.now();
    return Array.from(this.disposables.values()).filter(
      (d) => d.userId === userId && d.isActive && d.expiresAt > now,
    );
  }

  revokeDisposable(address: string, userId: string): boolean {
    const entry = this.disposables.get(address);
    if (!entry || entry.userId !== userId) {
      return false;
    }

    entry.isActive = false;
    this.disposables.set(address, entry);
    return true;
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [address, entry] of this.disposables.entries()) {
      if (entry.expiresAt < now) {
        this.disposables.delete(address);
        removed++;
      }
    }

    return removed;
  }
}
