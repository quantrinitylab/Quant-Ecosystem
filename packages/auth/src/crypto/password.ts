// ============================================================================
// Auth - Password Hashing (argon2id)
// ============================================================================

import argon2 from 'argon2';

/**
 * Password Service using argon2id with OWASP recommended parameters
 */
export class PasswordService {
  private readonly memoryCost = 19456; // 19 MiB
  private readonly timeCost = 2;
  private readonly parallelism = 1;

  /**
   * Hash a password using argon2id
   */
  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.memoryCost,
      timeCost: this.timeCost,
      parallelism: this.parallelism,
    });
  }

  /**
   * Verify a password against a hash
   */
  async verify(digest: string, password: string): Promise<boolean> {
    return argon2.verify(digest, password);
  }

  /**
   * Check if a hash needs to be rehashed (params changed)
   */
  needsRehash(digest: string): boolean {
    return argon2.needsRehash(digest, {
      memoryCost: this.memoryCost,
      timeCost: this.timeCost,
      parallelism: this.parallelism,
    });
  }
}

/** Singleton password service instance */
export const passwordService = new PasswordService();
