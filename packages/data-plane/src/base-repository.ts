import type { PrismaClient } from '@prisma/client';
import { ReplicaRouter } from './replica-router.js';
import { OutboxPublisher } from './outbox.js';
import { FieldEncryption } from './field-encryption.js';
import { AuditLogger } from './audit-log.js';
import { SoftDeleteMixin } from './soft-delete.js';
import { OptimisticLock, OptimisticLockError } from './optimistic-locking.js';

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface DataPlaneRepositoryConfig {
  modelName: string;
  primaryClient: PrismaClient;
  replicaClient?: PrismaClient;
  encryptedFields?: string[];
  enableAudit?: boolean;
  enableSoftDelete?: boolean;
  enableOptimisticLocking?: boolean;
  encryptionKey?: string;
}

export interface OperationContext {
  actorId?: string;
  ipAddress?: string;
  userAgent?: string;
  expectedVersion?: number;
}

export interface FindOptions {
  usePrimary?: boolean;
}

export class DataPlaneRepository<T extends Record<string, unknown>> {
  protected readonly config: DataPlaneRepositoryConfig;
  protected readonly router: ReplicaRouter;
  protected readonly outbox: OutboxPublisher;
  protected readonly encryption: FieldEncryption | null;
  protected readonly auditLogger: AuditLogger;
  protected readonly softDelete: SoftDeleteMixin;
  protected readonly optimisticLock: OptimisticLock;

  constructor(config: DataPlaneRepositoryConfig) {
    this.config = config;
    this.router = new ReplicaRouter(
      config.primaryClient,
      config.replicaClient ?? config.primaryClient,
    );
    this.outbox = new OutboxPublisher();
    this.encryption = config.encryptionKey ? new FieldEncryption(config.encryptionKey) : null;
    this.auditLogger = new AuditLogger();
    this.softDelete = new SoftDeleteMixin();
    this.optimisticLock = new OptimisticLock();
  }

  private getDelegate(client: PrismaClient | TransactionClient): {
    findUnique: (args: unknown) => Promise<T | null>;
    findMany: (args: unknown) => Promise<T[]>;
    create: (args: unknown) => Promise<T>;
    update: (args: unknown) => Promise<T>;
    delete: (args: unknown) => Promise<T>;
  } {
    const delegate = (
      client as unknown as Record<
        string,
        {
          findUnique: (args: unknown) => Promise<T | null>;
          findMany: (args: unknown) => Promise<T[]>;
          create: (args: unknown) => Promise<T>;
          update: (args: unknown) => Promise<T>;
          delete: (args: unknown) => Promise<T>;
        }
      >
    )[this.config.modelName];

    if (!delegate) {
      throw new Error(`Model delegate not found: ${this.config.modelName}`);
    }

    return delegate;
  }

  private encryptFields(data: Record<string, unknown>): Record<string, unknown> {
    if (!this.encryption || !this.config.encryptedFields?.length) {
      return data;
    }

    const key = this.encryption.getDerivedKey(this.config.modelName);
    const result = { ...data };

    for (const field of this.config.encryptedFields) {
      if (field in result && typeof result[field] === 'string') {
        const encrypted = this.encryption.encrypt(result[field] as string, key);
        result[field] = JSON.stringify(encrypted);
      }
    }

    return result;
  }

  private decryptFields(record: T): T {
    if (!this.encryption || !this.config.encryptedFields?.length) {
      return record;
    }

    const key = this.encryption.getDerivedKey(this.config.modelName);
    const result = { ...record };

    for (const field of this.config.encryptedFields) {
      if (field in result && typeof result[field] === 'string') {
        try {
          const encrypted = JSON.parse(result[field] as string) as {
            ciphertext: string;
            iv: string;
            authTag: string;
          };
          (result as Record<string, unknown>)[field] = this.encryption.decrypt(
            encrypted.ciphertext,
            encrypted.iv,
            encrypted.authTag,
            key,
          );
        } catch {
          // Field may not be encrypted, leave as-is
        }
      }
    }

    return result;
  }

  async findById(id: string, opts?: FindOptions): Promise<T | null> {
    const client = opts?.usePrimary ? this.router.forWrite() : this.router.forRead();

    const where = this.config.enableSoftDelete ? this.softDelete.applySoftDelete({ id }) : { id };

    const delegate = this.getDelegate(client);
    const record = await delegate.findUnique({ where });

    if (!record) return null;

    return this.decryptFields(record);
  }

  async findMany(where: Record<string, unknown>, opts?: FindOptions): Promise<T[]> {
    const client = opts?.usePrimary ? this.router.forWrite() : this.router.forRead();

    const effectiveWhere = this.config.enableSoftDelete ? this.softDelete.findActive(where) : where;

    const delegate = this.getDelegate(client);
    const records = await delegate.findMany({ where: effectiveWhere });

    return records.map((r) => this.decryptFields(r));
  }

  async create(data: Record<string, unknown>, context?: OperationContext): Promise<T> {
    const client = this.router.forWrite();
    const encryptedData = this.encryptFields(data);

    const result = await (client as PrismaClient).$transaction(async (tx: TransactionClient) => {
      const delegate = this.getDelegate(tx);
      const created = await delegate.create({ data: encryptedData });

      await this.outbox.publish(
        tx,
        this.config.modelName,
        (created as Record<string, unknown>)['id'] as string,
        `${this.config.modelName}.created`,
        { data: encryptedData },
      );

      if (this.config.enableAudit && context?.actorId) {
        await this.auditLogger.log(tx, {
          actorId: context.actorId,
          action: 'create',
          resourceType: this.config.modelName,
          resourceId: (created as Record<string, unknown>)['id'] as string,
          diff: { before: {}, after: data },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });
      }

      return created;
    });

    return this.decryptFields(result);
  }

  async update(id: string, data: Record<string, unknown>, context?: OperationContext): Promise<T> {
    const client = this.router.forWrite();
    const encryptedData = this.encryptFields(data);

    const result = await (client as PrismaClient).$transaction(async (tx: TransactionClient) => {
      const delegate = this.getDelegate(tx);

      let before: T | null = null;
      let updated: T;

      if (this.config.enableOptimisticLocking && context?.expectedVersion !== undefined) {
        // Optimistic lock path: checkAndUpdate reads, verifies version, and updates in one pass
        before = (await delegate.findUnique({ where: { id } })) as T | null;
        updated = (await this.optimisticLock.checkAndUpdate(
          tx,
          this.config.modelName,
          id,
          context.expectedVersion,
          encryptedData,
        )) as T;
      } else {
        // Normal path: read then update
        before = (await delegate.findUnique({ where: { id } })) as T | null;
        updated = await delegate.update({
          where: { id },
          data: encryptedData,
        });
      }

      await this.outbox.publish(tx, this.config.modelName, id, `${this.config.modelName}.updated`, {
        data: encryptedData,
      });

      if (this.config.enableAudit && context?.actorId) {
        await this.auditLogger.log(tx, {
          actorId: context.actorId,
          action: 'update',
          resourceType: this.config.modelName,
          resourceId: id,
          diff: {
            before: (before as Record<string, unknown>) ?? {},
            after: data,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });
      }

      return updated;
    });

    return this.decryptFields(result);
  }

  async delete(id: string, context?: OperationContext): Promise<void> {
    const client = this.router.forWrite();

    await (client as PrismaClient).$transaction(async (tx: TransactionClient) => {
      if (this.config.enableSoftDelete) {
        await this.softDelete.softDelete(tx, this.config.modelName, id);
      } else {
        const delegate = this.getDelegate(tx);
        await delegate.delete({ where: { id } });
      }

      await this.outbox.publish(tx, this.config.modelName, id, `${this.config.modelName}.deleted`, {
        id,
      });

      if (this.config.enableAudit && context?.actorId) {
        await this.auditLogger.log(tx, {
          actorId: context.actorId,
          action: 'delete',
          resourceType: this.config.modelName,
          resourceId: id,
          diff: { before: { id }, after: {} },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });
      }
    });
  }
}

export { OptimisticLockError };
