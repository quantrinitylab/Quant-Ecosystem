import type { PrismaClient } from '@prisma/client';

/**
 * QuantMail advanced search — a Gmail/Superhuman-style query language parsed
 * into a structured query and a Prisma `where` filter for the Email model.
 *
 * Supported operators (whitespace-separated; values may be "quoted"):
 *   from:alice            subject:invoice      to:bob@x.com
 *   label:work            in:inbox|sent|...    folder:<folderId>
 *   has:attachment        is:unread|read|starred|important|spam
 *   before:YYYY-MM-DD     after:YYYY-MM-DD     newer_than:7d  older_than:2w
 *   "exact phrase"        free text terms
 *
 * Anything not recognised as an operator becomes a free-text term, matched
 * (case-insensitive) against subject, snippet, and plain body.
 */

export interface ParsedSearchQuery {
  from: string[];
  to: string[];
  subject: string[];
  labels: string[];
  /** Folder by canonical type (inbox/sent/...) — lowercased. */
  inFolderTypes: string[];
  /** Folder by explicit id. */
  folderIds: string[];
  hasAttachment?: boolean;
  isUnread?: boolean;
  isStarred?: boolean;
  isImportant?: boolean;
  isSpam?: boolean;
  before?: Date;
  after?: Date;
  /** Free-text terms (incl. de-quoted phrases). */
  terms: string[];
}

const KNOWN_FOLDER_TYPES = new Set(['inbox', 'sent', 'drafts', 'spam', 'trash', 'archive']);

const RELATIVE_UNIT_MS: Record<string, number> = {
  d: 86_400_000,
  w: 604_800_000,
  m: 2_592_000_000, // 30 days
  y: 31_536_000_000, // 365 days
};

/** Split a query into tokens, keeping "quoted phrases" together. A quoted
 *  value may be attached to an operator (e.g. `subject:"year end review"`),
 *  in which case the operator prefix is preserved on the token. */
function tokenize(query: string): string[] {
  const tokens: string[] = [];
  const regex = /(\S+?:)?"([^"]*)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(query)) !== null) {
    if (match[2] !== undefined) {
      // Quoted phrase, optionally prefixed by an `operator:`.
      tokens.push(`${match[1] ?? ''}${match[2]}`);
    } else if (match[3] !== undefined) {
      tokens.push(match[3]);
    }
  }
  return tokens;
}

/** Parse a YYYY-MM-DD date at UTC midnight; returns undefined when invalid. */
function parseDate(value: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) {
    return undefined;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Parse a relative duration like `7d`, `2w`, `3m`, `1y` into milliseconds. */
function parseRelativeMs(value: string): number | undefined {
  const m = /^(\d+)\s*([dwmy])$/.exec(value.toLowerCase());
  if (!m) {
    return undefined;
  }
  const amount = Number.parseInt(m[1] as string, 10);
  const unit = RELATIVE_UNIT_MS[m[2] as string];
  return unit === undefined ? undefined : amount * unit;
}

export class SearchQueryService {
  constructor(private readonly prisma?: PrismaClient) {}

  /** Parse a raw query string into a structured {@link ParsedSearchQuery}. */
  parse(query: string, now: Date = new Date()): ParsedSearchQuery {
    const parsed: ParsedSearchQuery = {
      from: [],
      to: [],
      subject: [],
      labels: [],
      inFolderTypes: [],
      folderIds: [],
      terms: [],
    };

    for (const rawToken of tokenize(query)) {
      const token = rawToken.trim();
      if (token.length === 0) {
        continue;
      }

      const colon = token.indexOf(':');
      if (colon <= 0) {
        parsed.terms.push(token);
        continue;
      }

      const op = token.slice(0, colon).toLowerCase();
      // Strip surrounding quotes from the operator value (e.g. subject:"a b").
      const value = token.slice(colon + 1).replace(/^"|"$/g, '');
      if (value.length === 0 && op !== 'has' && op !== 'is') {
        continue;
      }

      switch (op) {
        case 'from':
          parsed.from.push(value);
          break;
        case 'to':
          parsed.to.push(value);
          break;
        case 'subject':
          parsed.subject.push(value);
          break;
        case 'label':
          parsed.labels.push(value);
          break;
        case 'in':
        case 'folder': {
          const v = value.toLowerCase();
          if (op === 'in' && KNOWN_FOLDER_TYPES.has(v)) {
            parsed.inFolderTypes.push(v);
          } else {
            parsed.folderIds.push(value);
          }
          break;
        }
        case 'has':
          if (value.toLowerCase() === 'attachment' || value.toLowerCase() === 'attachments') {
            parsed.hasAttachment = true;
          }
          break;
        case 'is': {
          const v = value.toLowerCase();
          if (v === 'unread') parsed.isUnread = true;
          else if (v === 'read') parsed.isUnread = false;
          else if (v === 'starred') parsed.isStarred = true;
          else if (v === 'important') parsed.isImportant = true;
          else if (v === 'spam') parsed.isSpam = true;
          break;
        }
        case 'before': {
          const d = parseDate(value);
          if (d) parsed.before = d;
          break;
        }
        case 'after': {
          const d = parseDate(value);
          if (d) parsed.after = d;
          break;
        }
        case 'newer_than': {
          const ms = parseRelativeMs(value);
          if (ms !== undefined) parsed.after = new Date(now.getTime() - ms);
          break;
        }
        case 'older_than': {
          const ms = parseRelativeMs(value);
          if (ms !== undefined) parsed.before = new Date(now.getTime() - ms);
          break;
        }
        default:
          // Unknown operator -> treat the whole token as a free-text term.
          parsed.terms.push(token);
      }
    }

    return parsed;
  }

  /**
   * Build a Prisma `where` filter for the Email model from a query string,
   * always scoped to `userId` and excluding soft-deleted rows. Multiple
   * operators of the same kind combine with AND.
   */
  buildEmailWhere(userId: string, query: string, now: Date = new Date()): Record<string, unknown> {
    const parsed = this.parse(query, now);
    const and: Record<string, unknown>[] = [];

    for (const from of parsed.from) {
      and.push({ fromAddress: { contains: from, mode: 'insensitive' } });
    }
    for (const subject of parsed.subject) {
      and.push({ subject: { contains: subject, mode: 'insensitive' } });
    }
    for (const to of parsed.to) {
      and.push({ toAddresses: { array_contains: to } });
    }
    for (const label of parsed.labels) {
      and.push({ labels: { array_contains: label } });
    }
    if (parsed.folderIds.length > 0) {
      and.push({ folderId: { in: parsed.folderIds } });
    }
    if (parsed.hasAttachment !== undefined) {
      and.push({ hasAttachments: parsed.hasAttachment });
    }
    if (parsed.isUnread !== undefined) {
      and.push({ isRead: !parsed.isUnread });
    }
    if (parsed.isStarred !== undefined) {
      and.push({ isStarred: parsed.isStarred });
    }
    if (parsed.isImportant !== undefined) {
      and.push({ isImportant: parsed.isImportant });
    }
    if (parsed.isSpam !== undefined) {
      and.push({ isSpam: parsed.isSpam });
    }
    if (parsed.before || parsed.after) {
      const receivedAt: Record<string, Date> = {};
      if (parsed.after) receivedAt.gte = parsed.after;
      if (parsed.before) receivedAt.lte = parsed.before;
      and.push({ receivedAt });
    }
    for (const term of parsed.terms) {
      and.push({
        OR: [
          { subject: { contains: term, mode: 'insensitive' } },
          { snippet: { contains: term, mode: 'insensitive' } },
          { bodyPlain: { contains: term, mode: 'insensitive' } },
        ],
      });
    }

    const where: Record<string, unknown> = { userId, deletedAt: null };
    if (and.length > 0) {
      where.AND = and;
    }
    return where;
  }

  /**
   * Execute a search against the Email model. Requires a PrismaClient (supplied
   * via the constructor). Returns a paginated result ordered by `receivedAt`.
   * Supports both offset (page/pageSize) and cursor-based (cursor/limit) pagination.
   */
  async search(
    userId: string,
    query: string,
    options: {
      page?: number;
      pageSize?: number;
      cursor?: string;
      limit?: number;
      now?: Date;
    } = {},
  ): Promise<{
    data: unknown[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    if (!this.prisma) {
      throw new Error('SearchQueryService.search requires a PrismaClient');
    }
    const where = this.buildEmailWhere(userId, query, options.now);
    const limit = options.limit ?? options.pageSize ?? 25;

    if (options.cursor) {
      const [rawItems, total] = await Promise.all([
        (this.prisma.email as any).findMany({
          where,
          take: limit + 1,
          skip: 1,
          cursor: { id: options.cursor },
          orderBy: { receivedAt: 'desc' },
        }),
        this.prisma.email.count({ where }),
      ]);
      const hasMore = rawItems.length > limit;
      const data = hasMore ? rawItems.slice(0, limit) : rawItems;
      const nextCursor =
        hasMore && data.length > 0 ? (data[data.length - 1] as { id: string }).id : null;
      return {
        data,
        total,
        page: options.page ?? 1,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
        nextCursor,
        hasMore,
      };
    }

    if (options.limit !== undefined) {
      const [rawItems, total] = await Promise.all([
        this.prisma.email.findMany({
          where,
          take: limit + 1,
          orderBy: { receivedAt: 'desc' },
        }),
        this.prisma.email.count({ where }),
      ]);
      const hasMore = rawItems.length > limit;
      const data = hasMore ? rawItems.slice(0, limit) : rawItems;
      const nextCursor =
        hasMore && data.length > 0 ? (data[data.length - 1] as { id: string }).id : null;
      return {
        data,
        total,
        page: 1,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
        nextCursor,
        hasMore,
      };
    }

    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 25;
    const [data, total] = await Promise.all([
      this.prisma.email.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { receivedAt: 'desc' },
      }),
      this.prisma.email.count({ where }),
    ]);

    const hasMore = page * pageSize < total;
    const nextCursor =
      hasMore && data.length > 0 ? (data[data.length - 1] as { id: string }).id : null;

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      nextCursor,
      hasMore,
    };
  }
}
