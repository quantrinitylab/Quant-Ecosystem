import type { PrismaClient, EmailSignature } from '@prisma/client';
import { createAppError } from '@quant/server-core';

export interface CreateSignatureInput {
  name: string;
  contentHtml: string;
  isDefault?: boolean;
}

export interface UpdateSignatureInput {
  name?: string;
  contentHtml?: string;
  isDefault?: boolean;
}

/**
 * Manages a user's email signatures.
 *
 * Invariant: a user has at most one default signature. The very first signature
 * a user creates is always the default. Promotions/demotions that touch the
 * default flag are performed inside interactive transactions so the "exactly one
 * default" invariant can never be observed in a broken state.
 */
export class EmailSignatureService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Create a signature for a user.
   *
   * The signature becomes the default when `isDefault` is explicitly requested
   * OR when it is the user's first signature. When it becomes the default, the
   * other signatures for the user are atomically demoted in the same
   * transaction as the insert.
   */
  async createSignature(userId: string, input: CreateSignatureInput): Promise<EmailSignature> {
    const existingCount = await this.prisma.emailSignature.count({ where: { userId } });
    const isFirst = existingCount === 0;
    const shouldBeDefault = input.isDefault === true || isFirst;

    if (!shouldBeDefault) {
      return this.prisma.emailSignature.create({
        data: {
          userId,
          name: input.name,
          contentHtml: input.contentHtml,
          isDefault: false,
        },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.emailSignature.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });

      return tx.emailSignature.create({
        data: {
          userId,
          name: input.name,
          contentHtml: input.contentHtml,
          isDefault: true,
        },
      });
    });
  }

  /** List a user's signatures, default first, then by name ascending. */
  async listSignatures(userId: string): Promise<EmailSignature[]> {
    return this.prisma.emailSignature.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  /** Fetch a single signature, enforcing ownership. */
  async getSignature(id: string, userId: string): Promise<EmailSignature> {
    const signature = await this.prisma.emailSignature.findUnique({ where: { id } });

    if (!signature) {
      throw createAppError('Signature not found', 404, 'SIGNATURE_NOT_FOUND');
    }

    if (signature.userId !== userId) {
      throw createAppError('Not authorized to access this signature', 403, 'FORBIDDEN');
    }

    return signature;
  }

  /** Return the user's default signature, or null when none exists. */
  async getDefaultSignature(userId: string): Promise<EmailSignature | null> {
    return this.prisma.emailSignature.findFirst({
      where: { userId, isDefault: true },
    });
  }

  /**
   * Update a signature, enforcing ownership. When `isDefault` is set to true the
   * other signatures for the user are demoted atomically with the update.
   */
  async updateSignature(
    id: string,
    userId: string,
    input: UpdateSignatureInput,
  ): Promise<EmailSignature> {
    // Ownership check (throws 404 / 403).
    await this.getSignature(id, userId);

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) {
      data['name'] = input.name;
    }
    if (input.contentHtml !== undefined) {
      data['contentHtml'] = input.contentHtml;
    }
    if (input.isDefault !== undefined) {
      data['isDefault'] = input.isDefault;
    }

    if (input.isDefault === true) {
      return this.prisma.$transaction(async (tx) => {
        await tx.emailSignature.updateMany({
          where: { userId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });

        return tx.emailSignature.update({
          where: { id },
          data,
        });
      });
    }

    return this.prisma.emailSignature.update({
      where: { id },
      data,
    });
  }

  /**
   * Mark a signature as the user's default, demoting every other signature in
   * the same transaction.
   */
  async setDefault(id: string, userId: string): Promise<EmailSignature> {
    // Ownership check (throws 404 / 403).
    await this.getSignature(id, userId);

    return this.prisma.$transaction(async (tx) => {
      await tx.emailSignature.updateMany({
        where: { userId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });

      return tx.emailSignature.update({
        where: { id },
        data: { isDefault: true },
      });
    });
  }

  /**
   * Delete a signature, enforcing ownership. If the deleted signature was the
   * default and the user still has other signatures, the next one (by name
   * ascending) is promoted to default in the same transaction.
   */
  async deleteSignature(id: string, userId: string): Promise<EmailSignature> {
    const signature = await this.getSignature(id, userId);

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.emailSignature.delete({ where: { id } });

      if (signature.isDefault) {
        const next = await tx.emailSignature.findFirst({
          where: { userId },
          orderBy: { name: 'asc' },
        });

        if (next) {
          await tx.emailSignature.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }

      return deleted;
    });
  }
}
