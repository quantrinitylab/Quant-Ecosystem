import type { Prisma, PrismaClient } from '@quant/database';
import { createAppError } from '@quant/server-core';
import type {
  LearnedInboxCategory,
  LearnedInboxCategoryStore,
} from './learned-inbox-category.service';
import { SmartInboxService } from './smart-inbox.service';

export interface SmartInboxBackfillInput {
  limit: number;
  cursor?: string;
}

export interface SmartInboxBackfillResult {
  scanned: number;
  updated: number;
  skipped: number;
  nextCursor: string | null;
  remaining: number;
}

interface BackfillEmail {
  id: string;
  fromAddress: string;
  subject: string;
  toAddresses: string[];
  bodyPlain: string;
  bodyHtml: string;
}

/**
 * Bounded, user-scoped historical categorization.
 *
 * Reads happen before writes, each write repeats the null-category guard, and
 * all category updates share one transaction. A user correction racing this
 * job therefore wins; retries are idempotent because completed rows no longer
 * match `aiCategory: null`.
 */
export class SmartInboxBackfillService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly smartInbox: SmartInboxService,
    private readonly learnedCategory?: LearnedInboxCategoryStore,
  ) {}

  async run(userId: string, input: SmartInboxBackfillInput): Promise<SmartInboxBackfillResult> {
    const limit = Math.min(Math.max(Math.trunc(input.limit), 1), 100);
    const eligibility: Prisma.EmailWhereInput = {
      userId,
      aiCategory: null,
      deletedAt: null,
      isDraft: false,
      isSent: false,
      isSpam: false,
      isTrash: false,
      receivedAt: { not: null },
    };
    const candidates = await this.prisma.email.findMany({
      where: input.cursor ? { ...eligibility, id: { gt: input.cursor } } : eligibility,
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    const hasMore = candidates.length > limit;
    const batch = candidates.slice(0, limit);

    const learnedBySender = await this.loadLearnedCategories(userId, batch);
    const idsByCategory = new Map<LearnedInboxCategory, string[]>();
    for (const email of batch) {
      const sender = email.fromAddress.trim().toLowerCase();
      const category =
        learnedBySender.get(sender) ??
        this.smartInbox.categorize({
          id: email.id,
          from: email.fromAddress,
          subject: email.subject,
          to: email.toAddresses.join(', '),
          body: email.bodyPlain || email.bodyHtml,
        }).category;
      const ids = idsByCategory.get(category) ?? [];
      ids.push(email.id);
      idsByCategory.set(category, ids);
    }

    const writes = Array.from(idsByCategory.entries()).map(([category, ids]) =>
      this.prisma.email.updateMany({
        where: { ...eligibility, id: { in: ids } },
        data: { aiCategory: category },
      }),
    );
    const results =
      writes.length > 0
        ? ((await this.prisma.$transaction(writes)) as Array<{ count: number }>)
        : [];
    const updated = results.reduce((sum, result) => sum + result.count, 0);
    const remaining = await this.prisma.email.count({ where: eligibility });

    return {
      scanned: batch.length,
      updated,
      skipped: batch.length - updated,
      nextCursor: hasMore ? (batch.at(-1)?.id ?? null) : null,
      remaining,
    };
  }

  private async loadLearnedCategories(
    userId: string,
    emails: BackfillEmail[],
  ): Promise<Map<string, LearnedInboxCategory>> {
    const result = new Map<string, LearnedInboxCategory>();
    if (!this.learnedCategory || emails.length === 0) return result;

    const senders = Array.from(
      new Set(emails.map((email) => email.fromAddress.trim().toLowerCase()).filter(Boolean)),
    );
    let categories: Array<LearnedInboxCategory | null>;
    try {
      categories = await Promise.all(
        senders.map((sender) => this.learnedCategory!.lookup(userId, sender)),
      );
    } catch {
      // Live delivery is fail-open; a mass historical write is not. If user
      // preferences cannot be read, change nothing and let a retry decide later.
      throw createAppError(
        'Learned inbox preferences are temporarily unavailable',
        503,
        'CATEGORY_MEMORY_UNAVAILABLE',
      );
    }
    senders.forEach((sender, index) => {
      const category = categories[index];
      if (category) result.set(sender, category);
    });
    return result;
  }
}
