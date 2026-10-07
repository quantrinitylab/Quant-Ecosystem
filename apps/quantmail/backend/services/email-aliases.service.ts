import { z } from 'zod';
import crypto from 'node:crypto';

export const AliasSchema = z.object({
  id: z.string(),
  userId: z.string(),
  alias: z.string(),
  fullAddress: z.string(),
  targetAddress: z.string(),
  createdAt: z.date(),
  isActive: z.boolean(),
});

export type Alias = z.infer<typeof AliasSchema>;

export class EmailAliasesService {
  /**
   * In-memory store for email aliases. This is ephemeral and will be lost on
   * process restart. Will be replaced with database persistence in production.
   */
  private aliases: Map<string, Alias> = new Map();

  resolveAlias(address: string): { targetAddress: string; alias: string } | null {
    const plusIndex = address.indexOf('+');
    const atIndex = address.indexOf('@');

    if (plusIndex === -1 || atIndex === -1 || plusIndex > atIndex) {
      return null;
    }

    const baseUser = address.slice(0, plusIndex);
    const domain = address.slice(atIndex);
    const alias = address.slice(plusIndex + 1, atIndex);
    const targetAddress = `${baseUser}${domain}`;

    const entry = Array.from(this.aliases.values()).find(
      (a) => a.fullAddress === address && a.isActive,
    );

    if (!entry) {
      return { targetAddress, alias };
    }

    return { targetAddress: entry.targetAddress, alias: entry.alias };
  }

  createAlias(userId: string, alias: string, baseAddress: string): Alias {
    const atIndex = baseAddress.indexOf('@');
    if (atIndex === -1) {
      throw new Error('Invalid base address');
    }

    const user = baseAddress.slice(0, atIndex);
    const domain = baseAddress.slice(atIndex);
    const fullAddress = `${user}+${alias}${domain}`;

    const entry: Alias = {
      id: crypto.randomUUID(),
      userId,
      alias,
      fullAddress,
      targetAddress: baseAddress,
      createdAt: new Date(),
      isActive: true,
    };

    this.aliases.set(entry.id, entry);
    return entry;
  }

  listAliases(userId: string): Alias[] {
    return Array.from(this.aliases.values()).filter((a) => a.userId === userId);
  }

  deleteAlias(userId: string, aliasId: string): boolean {
    const entry = this.aliases.get(aliasId);
    if (!entry || entry.userId !== userId) {
      return false;
    }

    entry.isActive = false;
    this.aliases.set(aliasId, entry);
    return true;
  }
}
