import type { PrismaClient, MailFilter } from '@prisma/client';
import { createAppError } from '@quant/server-core';

/**
 * A single matching condition. String matches are case-insensitive substring
 * matches. `from` and `domain` are matched against the email's `fromAddress`.
 */
export interface FilterCondition {
  from?: string;
  to?: string;
  subjectContains?: string;
  bodyContains?: string;
  hasAttachment?: boolean;
  domain?: string;
}

/**
 * A single action to apply when a filter matches.
 */
export interface FilterAction {
  addLabelId?: string;
  moveToFolderId?: string;
  markRead?: boolean;
  star?: boolean;
  archive?: boolean;
  markSpam?: boolean;
  forwardTo?: string;
  delete?: boolean;
}

/**
 * The minimal email shape required to evaluate filters against.
 */
export interface EvaluatedEmail {
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  bodyPlain?: string | null;
  bodyHtml?: string | null;
  hasAttachments: boolean;
}

export interface CreateFilterInput {
  userId: string;
  name: string;
  enabled?: boolean;
  priority?: number;
  matchAll?: boolean;
  conditions: FilterCondition[];
  actions: FilterAction[];
}

export interface UpdateFilterInput {
  name?: string;
  enabled?: boolean;
  priority?: number;
  matchAll?: boolean;
  conditions?: FilterCondition[];
  actions?: FilterAction[];
}

/**
 * The merged, resolved set of actions produced by evaluating all matching
 * filters for an email. Boolean flags are only present when at least one
 * matching filter requested them. `addLabelIds` and `forwardTo` accumulate
 * (deduplicated) across all matching filters.
 */
export interface ResolvedActions {
  matchedFilterIds: string[];
  markRead?: boolean;
  star?: boolean;
  archive?: boolean;
  markSpam?: boolean;
  delete?: boolean;
  addLabelIds: string[];
  moveToFolderId?: string;
  forwardTo?: string[];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function includesInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Normalizes a Prisma `Json` value (which may be a single object or an array)
 * into an array of the expected type. Non-object values yield an empty array.
 */
function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is T => item !== null && typeof item === 'object');
  }
  if (value !== null && typeof value === 'object') {
    return [value as T];
  }
  return [];
}

export class MailFilterService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async createFilter(input: CreateFilterInput): Promise<MailFilter> {
    this.assertValidActions(input.actions);

    return this.prisma.mailFilter.create({
      data: {
        userId: input.userId,
        name: input.name,
        enabled: input.enabled ?? true,
        priority: input.priority ?? 0,
        matchAll: input.matchAll ?? true,
        conditions: input.conditions,
        actions: input.actions,
      },
    });
  }

  async listFilters(userId: string): Promise<MailFilter[]> {
    return this.prisma.mailFilter.findMany({
      where: { userId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async getFilter(filterId: string, userId: string): Promise<MailFilter> {
    const filter = await this.prisma.mailFilter.findUnique({ where: { id: filterId } });

    if (!filter) {
      throw createAppError('Mail filter not found', 404, 'MAIL_FILTER_NOT_FOUND');
    }

    if (filter.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    return filter;
  }

  async updateFilter(
    filterId: string,
    userId: string,
    input: UpdateFilterInput,
  ): Promise<MailFilter> {
    // Ownership check (throws 404 / 403 as appropriate).
    await this.getFilter(filterId, userId);

    if (input.actions !== undefined) {
      this.assertValidActions(input.actions);
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.enabled !== undefined) data.enabled = input.enabled;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.matchAll !== undefined) data.matchAll = input.matchAll;
    if (input.conditions !== undefined) data.conditions = input.conditions;
    if (input.actions !== undefined) data.actions = input.actions;

    return this.prisma.mailFilter.update({
      where: { id: filterId },
      data,
    });
  }

  async deleteFilter(filterId: string, userId: string): Promise<MailFilter> {
    // Ownership check (throws 404 / 403 as appropriate).
    await this.getFilter(filterId, userId);

    return this.prisma.mailFilter.delete({ where: { id: filterId } });
  }

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------

  /**
   * Pure function: returns whether the given filter matches the given email.
   * Conditions are combined with AND when `matchAll` is true, otherwise OR.
   * A filter with no conditions never matches.
   */
  evaluate(filter: Pick<MailFilter, 'matchAll' | 'conditions'>, email: EvaluatedEmail): boolean {
    const conditions = toArray<FilterCondition>(filter.conditions);

    if (conditions.length === 0) {
      return false;
    }

    const results = conditions.map((condition) => this.matchCondition(condition, email));

    return filter.matchAll ? results.every(Boolean) : results.some(Boolean);
  }

  /**
   * Evaluates a single condition. All fields specified within the condition
   * must match (logical AND within a condition). An empty condition (no fields)
   * does not match.
   */
  private matchCondition(condition: FilterCondition, email: EvaluatedEmail): boolean {
    const checks: boolean[] = [];

    if (condition.from !== undefined) {
      checks.push(includesInsensitive(email.fromAddress, condition.from));
    }

    if (condition.domain !== undefined) {
      checks.push(includesInsensitive(email.fromAddress, condition.domain));
    }

    if (condition.to !== undefined) {
      const needle = condition.to;
      checks.push(email.toAddresses.some((addr) => includesInsensitive(addr, needle)));
    }

    if (condition.subjectContains !== undefined) {
      checks.push(includesInsensitive(email.subject, condition.subjectContains));
    }

    if (condition.bodyContains !== undefined) {
      const body = `${email.bodyPlain ?? ''}\n${email.bodyHtml ?? ''}`;
      checks.push(includesInsensitive(body, condition.bodyContains));
    }

    if (condition.hasAttachment !== undefined) {
      checks.push(email.hasAttachments === condition.hasAttachment);
    }

    if (checks.length === 0) {
      return false;
    }

    return checks.every(Boolean);
  }

  /**
   * Loads all enabled filters for the user (in priority order) and returns the
   * merged set of resolved actions across every matching filter. Later /
   * lower-priority filters may add actions; `archive` and `delete` are sticky
   * (once requested they remain set).
   */
  async computeActions(userId: string, email: EvaluatedEmail): Promise<ResolvedActions> {
    const filters = await this.prisma.mailFilter.findMany({
      where: { userId, enabled: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    const resolved: ResolvedActions = {
      matchedFilterIds: [],
      addLabelIds: [],
    };

    const labelSet = new Set<string>();
    const forwardSet = new Set<string>();

    for (const filter of filters) {
      if (!this.evaluate(filter, email)) {
        continue;
      }

      resolved.matchedFilterIds.push(filter.id);

      const actions = toArray<FilterAction>(filter.actions);
      for (const action of actions) {
        if (action.addLabelId !== undefined) {
          labelSet.add(action.addLabelId);
        }
        if (action.moveToFolderId !== undefined) {
          resolved.moveToFolderId = action.moveToFolderId;
        }
        if (action.forwardTo !== undefined) {
          forwardSet.add(action.forwardTo);
        }
        if (action.markRead === true) {
          resolved.markRead = true;
        }
        if (action.star === true) {
          resolved.star = true;
        }
        if (action.markSpam === true) {
          resolved.markSpam = true;
        }
        if (action.archive === true) {
          resolved.archive = true;
        }
        if (action.delete === true) {
          resolved.delete = true;
        }
      }
    }

    resolved.addLabelIds = Array.from(labelSet);
    if (forwardSet.size > 0) {
      resolved.forwardTo = Array.from(forwardSet);
    }

    return resolved;
  }

  /**
   * Evaluates the given filter against existing user emails in the database and applies
   * all matching actions (adding labels, moving folders, marking read/starred/spam/deleted).
   */
  async applyFilterToMessages(
    filterId: string,
    userId: string,
  ): Promise<{ filterId: string; processedCount: number; affectedCount: number }> {
    const filter = await this.getFilter(filterId, userId);
    const emails = await this.prisma.email.findMany({
      where: { userId, deletedAt: null },
      orderBy: { receivedAt: 'desc' },
      take: 1000,
    });

    let affectedCount = 0;
    const actions = toArray<FilterAction>(filter.actions);

    for (const email of emails) {
      const matches = this.evaluate(filter, {
        fromAddress: email.fromAddress,
        toAddresses: (email.toAddresses as string[]) ?? [],
        subject: email.subject ?? '',
        bodyPlain: email.bodyPlain,
        bodyHtml: email.bodyHtml,
        hasAttachments: email.hasAttachments ?? false,
      });

      if (!matches) continue;

      const updateData: Record<string, unknown> = {};
      let modified = false;

      for (const action of actions) {
        if (action.addLabelId) {
          const currentLabels = ((email as any).labels as string[]) ?? [];
          if (!currentLabels.includes(action.addLabelId)) {
            updateData.labels = [...currentLabels, action.addLabelId];
            modified = true;
          }
        }
        if (action.moveToFolderId && email.folderId !== action.moveToFolderId) {
          updateData.folderId = action.moveToFolderId;
          modified = true;
        }
        if (action.markRead === true && !email.isRead) {
          updateData.isRead = true;
          modified = true;
        }
        if (action.star === true && !email.isStarred) {
          updateData.isStarred = true;
          modified = true;
        }
        if (action.markSpam === true && !(email as any).isSpam) {
          updateData.isSpam = true;
          modified = true;
        }
        if (action.delete === true) {
          updateData.deletedAt = new Date();
          modified = true;
        }
      }

      if (modified) {
        await this.prisma.email.update({
          where: { id: email.id },
          data: updateData,
        });
        affectedCount++;
      }
    }

    return {
      filterId,
      processedCount: emails.length,
      affectedCount,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private assertValidActions(actions: FilterAction[]): void {
    for (const action of actions) {
      if (action.forwardTo !== undefined) {
        validateForwardRecipient(action.forwardTo);
      }
    }
  }
}

export const DISALLOWED_FORWARD_DOMAINS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'test',
  'invalid',
  'example.com',
  'example.org',
  'example.net',
  'mailinator.com',
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'trashmail.com',
  'yopmail.com',
  'sharklasers.com',
  'throwawaymail.com',
]);

export function validateForwardRecipient(email: string, userEmail?: string): void {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalized)) {
    throw createAppError(
      `Invalid forwardTo email address: "${email}"`,
      400,
      'INVALID_FORWARD_ADDRESS',
    );
  }

  const parts = normalized.split('@');
  const domain = parts[1];
  if (!domain) {
    throw createAppError(`Invalid forwarding domain in "${email}"`, 400, 'INVALID_FORWARD_DOMAIN');
  }

  if (
    DISALLOWED_FORWARD_DOMAINS.has(domain) ||
    domain.endsWith('.local') ||
    domain.endsWith('.internal') ||
    domain.endsWith('.test') ||
    domain.endsWith('.invalid')
  ) {
    throw createAppError(
      `Forwarding to domain "${domain}" is disallowed for safety reasons (R-SEC)`,
      400,
      'UNSAFE_FORWARD_DOMAIN',
    );
  }

  if (!domain.includes('.') || domain.endsWith('.')) {
    throw createAppError(
      `Forwarding domain "${domain}" is not a valid fully-qualified domain name`,
      400,
      'INVALID_FORWARD_DOMAIN',
    );
  }

  if (userEmail && normalized === userEmail.trim().toLowerCase()) {
    throw createAppError(
      'Cannot forward emails to your own email address',
      400,
      'FORWARD_LOOP_DETECTED',
    );
  }
}
