import type { PrismaClient } from '@quant/database';

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface WhereClause {
  [key: string]: unknown;
}

export class SoftDeleteMixin {
  applySoftDelete(where: WhereClause): WhereClause {
    return { ...where, deletedAt: null };
  }

  async softDelete(tx: TransactionClient, model: string, id: string): Promise<void> {
    const delegate = (
      tx as unknown as Record<string, { update: (args: unknown) => Promise<unknown> }>
    )[model];
    if (!delegate) {
      throw new Error(`Model delegate not found: ${model}`);
    }
    await delegate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async restore(tx: TransactionClient, model: string, id: string): Promise<void> {
    const delegate = (
      tx as unknown as Record<string, { update: (args: unknown) => Promise<unknown> }>
    )[model];
    if (!delegate) {
      throw new Error(`Model delegate not found: ${model}`);
    }
    await delegate.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  findActive(where: WhereClause): WhereClause {
    return { ...where, deletedAt: null };
  }

  findDeleted(where: WhereClause): WhereClause {
    return { ...where, deletedAt: { not: null } };
  }
}

export function createSoftDeleteMixin(): SoftDeleteMixin {
  return new SoftDeleteMixin();
}
