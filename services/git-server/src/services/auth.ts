import { randomBytes, scryptSync } from 'node:crypto';
import { z } from 'zod';

const TokenPayloadSchema = z.object({
  userId: z.string(),
  scopes: z.array(z.string()),
});

export type TokenPayload = z.infer<typeof TokenPayloadSchema>;

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

export class GitAuthService {
  private tokens: Map<string, TokenPayload>;
  private salt: string;

  constructor(tokens?: Map<string, TokenPayload>, salt?: string) {
    this.tokens = tokens ?? new Map();
    this.salt = salt ?? randomBytes(16).toString('hex');
  }

  async validateToken(token: string): Promise<{ userId: string; scopes: string[] } | null> {
    const hash = this.hashToken(token);
    const payload = this.tokens.get(hash);
    if (!payload) {
      return null;
    }
    const parsed = TokenPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return null;
    }
    return { userId: parsed.data.userId, scopes: parsed.data.scopes };
  }

  generateToken(userId: string, scopes: string[]): string {
    const token = randomBytes(32).toString('hex');
    const hash = this.hashToken(token);
    this.tokens.set(hash, { userId, scopes });
    return token;
  }

  private hashToken(token: string): string {
    return scryptSync(token, this.salt, SCRYPT_KEYLEN, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
    }).toString('hex');
  }
}
