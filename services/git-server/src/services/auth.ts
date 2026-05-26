import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';

const TokenPayloadSchema = z.object({
  userId: z.string(),
  scopes: z.array(z.string()),
});

export type TokenPayload = z.infer<typeof TokenPayloadSchema>;

export class GitAuthService {
  private tokens: Map<string, TokenPayload>;

  constructor(tokens?: Map<string, TokenPayload>) {
    this.tokens = tokens ?? new Map();
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
    return createHash('sha256').update(token).digest('hex');
  }
}
