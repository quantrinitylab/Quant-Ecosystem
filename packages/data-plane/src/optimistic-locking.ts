import type { PrismaClient } from '@quant/database';

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export class OptimisticLockError extends Error {
  public readonly expectedVersion: number;
  public readonly actualVersion: number;

  constructor(expectedVersion: number, actualVersion: number) {
    super(`Optimistic lock conflict: expected version ${expectedVersion}, found ${actualVersion}`);
    this.name = 'OptimisticLockError';
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class OptimisticLock {
  async checkAndUpdate(
    tx: TransactionClient,
    model: string,
    id: string,
    expectedVersion: number,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const delegate = (
      tx as unknown as Record<
        string,
        {
          findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
          update: (args: unknown) => Promise<Record<string, unknown>>;
        }
      >
    )[model];

    if (!delegate) {
      throw new Error(`Model delegate not found: ${model}`);
    }

    const current = await delegate.findUnique({ where: { id } });

    if (!current) {
      throw new Error(`Record not found: ${model}#${id}`);
    }

    const currentVersion = current['version'] as number;

    if (currentVersion !== expectedVersion) {
      throw new OptimisticLockError(expectedVersion, currentVersion);
    }

    const updated = await delegate.update({
      where: { id },
      data: { ...data, version: expectedVersion + 1 },
    });

    return updated;
  }
}

export function createOptimisticLock(): OptimisticLock {
  return new OptimisticLock();
}
