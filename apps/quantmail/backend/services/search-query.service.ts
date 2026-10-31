import type { PrismaClient } from '@prisma/client';

/**
 * QuantMail advanced search — a Gmail/Superhuman-style query language parsed
 * into a structured query and a Prisma `where` filter for the Email model.
 *
 * Supported operators (whitespace-separated; values may be "quoted"):
 *   from:alice            subject:invoice      to:bob@x.com
 *   label:work            in:inbox|sent|...    folder:<folderId>
 *   in:anywhere           has:attachment        is:unread|read|starred|important|spam
 *   before:YYYY-MM-DD     after:YYYY-MM-DD     newer_than:7d  older_than:2w
 *   "exact phrase"        free text terms
 *
 * Boolean operators (Gmail parity — `OR` must be UPPERCASE; lowercase `or`
 * is an ordinary free-text term):
 *   from:alice OR from:bob     either sender (OR binds tighter than the
 *                              implicit AND, so `from:a OR from:b invoice`
 *                              means "(from a or b) and invoice")
 *   -from:spammy  -unsubscribe  -"exact phrase"
 *                              exclusion: the `-` prefix negates one atom
 *                              (operator or free-text term, quoted or not).
 *                              A `-` on `in:anywhere` is a no-op: a scope
 *                              modifier cannot be negated, so it is dropped.
 *
 * `in:anywhere` is a scope modifier (Gmail parity): it searches ALL mail
 * including Spam and Trash. It adds no folder predicate and drops the default
 * trash/spam exclusions — the userId scope and the soft-delete exclusion
 * (deletedAt IS NULL) are always preserved.
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
  /**
   * `in:anywhere` scope modifier (Gmail parity): search all mail including
   * Spam and Trash. Adds no folder predicate; drops the default trash/spam
   * exclusions while keeping userId + deletedAt:null.
   */
  inAnywhere?: boolean;
  hasAttachment?: boolean;
  isUnread?: boolean;
  isStarred?: boolean;
  isImportant?: boolean;
  isSpam?: boolean;
  before?: Date;
  after?: Date;
  /** Free-text terms (incl. de-quoted phrases). */
  terms: string[];
  /**
   * OR-groups: each inner array holds the atoms joined by uppercase `OR`
   * (2+ atoms; OR binds tighter than the implicit AND, so each group is
   * ANDed with the flat fields and with the other groups). Atoms that are
   * not adjacent to an `OR` live in the flat fields above, never here.
   */
  orGroups: SearchAtom[][];
  /** Negated atoms (`-` prefix) that are not part of an OR-group. */
  excluded: SearchAtom[];
}

/**
 * One parsed query atom: a single operator (or free-text term) with its
 * value. Relative dates are already resolved against `now` at parse time:
 * `newer_than` becomes an `after` atom and `older_than` a `before` atom,
 * both carrying the resolved `date`. Unknown operators never become atoms —
 * they fall back to plain `term` atoms, mirroring the flat fields.
 */
export interface SearchAtom {
  op:
    | 'from'
    | 'to'
    | 'subject'
    | 'label'
    | 'in'
    | 'folder'
    | 'has'
    | 'is'
    | 'before'
    | 'after'
    | 'term';
  value: string;
  /** Resolved date for `before`/`after` atoms (incl. relative forms). */
  date?: Date;
  /**
   * True when the atom carried a `-` prefix. Atoms in `excluded` are always
   * negated; atoms in `orGroups` may or may not be (e.g. `-from:a OR from:b`
   * negates only the first branch).
   */
  negated: boolean;
}

const KNOWN_FOLDER_TYPES = new Set(['inbox', 'sent', 'drafts', 'spam', 'trash', 'archive']);

/**
 * Translate one canonical `in:` folder type (lowercased) into a Prisma `Email`
 * condition. Mirrors the folder-listing semantics of `GET /emails`
 * (`apps/quantmail/backend/routes/emails.ts`): system folders are expressed
 * through the Email flags (`isSent`/`isDraft`/`isSpam`/`isTrash`) plus the
 * `EmailFolder.type` relation where the listing route uses it.
 */
function folderTypeCondition(type: string): Record<string, unknown> {
  switch (type) {
    case 'sent':
      return { isSent: true, isTrash: false };
    case 'drafts':
      return { isDraft: true, isTrash: false };
    case 'spam':
      return { isSpam: true, isTrash: false };
    case 'trash':
      return { isTrash: true };
    case 'archive':
      return { isTrash: false, folder: { is: { type: 'ARCHIVE' } } };
    case 'inbox':
      // Default inbox view: active mail (not Draft/Spam/Trash) that is unfiled,
      // in the INBOX folder, or sent in an active thread.
      return {
        isDraft: false,
        isSpam: false,
        isTrash: false,
        AND: [
          {
            OR: [
              { folderId: null },
              { folder: { is: { type: 'INBOX' } } },
              { isSent: true },
            ],
          },
        ],
      };
    default:
      return {};
  }
}

const RELATIVE_UNIT_MS: Record<string, number> = {
  d: 86_400_000,
  w: 604_800_000,
  m: 2_592_000_000, // 30 days
  y: 31_536_000_000, // 365 days
};

/** Split a query into tokens, keeping "quoted phrases" together. A quoted
 *  value may be attached to an operator (e.g. `subject:"year end review"`),
 *  in which case the operator prefix is preserved on the token. A leading
 *  `-` (negation) is preserved on the token too, including before a quoted
 *  phrase (`-"exact phrase"`), so the parser can see what is negated. */
function tokenize(query: string): string[] {
  const tokens: string[] = [];
  const regex = /(-?)(\S+?:)?"([^"]*)"|(-?)(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(query)) !== null) {
    if (match[3] !== undefined) {
      // Quoted phrase, optionally negated and/or prefixed by an `operator:`.
      tokens.push(`${match[1] ?? ''}${match[2] ?? ''}${match[3]}`);
    } else if (match[5] !== undefined) {
      tokens.push(`${match[4] ?? ''}${match[5]}`);
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

/**
 * Parse one token into an atom. Returns null when the token carries no
 * usable condition (empty operator value, invalid date, or an unrecognised
 * `has:`/`is:` value) — matching the old parser, which silently skipped
 * those tokens. An unknown operator prefix falls back to a plain `term`
 * atom holding the whole token, exactly as the old parser did.
 * `newer_than`/`older_than` are normalised here to `after`/`before` atoms
 * with the date already resolved against `now`.
 */
function parseAtomToken(token: string, now: Date): SearchAtom | null {
  let negated = false;
  let body = token;
  if (body.startsWith('-') && body.length > 1) {
    negated = true;
    body = body.slice(1);
  }

  const colon = body.indexOf(':');
  if (colon <= 0) {
    return { op: 'term', value: body, negated };
  }

  const op = body.slice(0, colon).toLowerCase();
  // Strip surrounding quotes from the operator value (e.g. subject:"a b").
  const value = body.slice(colon + 1).replace(/^"|"$/g, '');
  if (value.length === 0 && op !== 'has' && op !== 'is') {
    return null;
  }

  switch (op) {
    case 'from':
    case 'to':
    case 'subject':
    case 'label':
    case 'in':
    case 'folder':
      return { op, value, negated };
    case 'has': {
      const v = value.toLowerCase();
      return v === 'attachment' || v === 'attachments'
        ? { op: 'has', value: v, negated }
        : null;
    }
    case 'is': {
      const v = value.toLowerCase();
      return v === 'unread' || v === 'read' || v === 'starred' || v === 'important' || v === 'spam'
        ? { op: 'is', value: v, negated }
        : null;
    }
    case 'before': {
      const d = parseDate(value);
      return d ? { op: 'before', value, date: d, negated } : null;
    }
    case 'after': {
      const d = parseDate(value);
      return d ? { op: 'after', value, date: d, negated } : null;
    }
    case 'newer_than': {
      const ms = parseRelativeMs(value);
      return ms !== undefined
        ? { op: 'after', value, date: new Date(now.getTime() - ms), negated }
        : null;
    }
    case 'older_than': {
      const ms = parseRelativeMs(value);
      return ms !== undefined
        ? { op: 'before', value, date: new Date(now.getTime() - ms), negated }
        : null;
    }
    default:
      // Unknown operator -> treat the whole token as a free-text term.
      return { op: 'term', value: body, negated };
  }
}

/** Apply one non-negated, non-grouped atom to the flat parsed fields. */
function applyFlatAtom(parsed: ParsedSearchQuery, atom: SearchAtom): void {
  switch (atom.op) {
    case 'from':
      parsed.from.push(atom.value);
      break;
    case 'to':
      parsed.to.push(atom.value);
      break;
    case 'subject':
      parsed.subject.push(atom.value);
      break;
    case 'label':
      parsed.labels.push(atom.value);
      break;
    case 'in': {
      const v = atom.value.toLowerCase();
      if (KNOWN_FOLDER_TYPES.has(v)) {
        parsed.inFolderTypes.push(v);
      } else {
        parsed.folderIds.push(atom.value);
      }
      break;
    }
    case 'folder':
      parsed.folderIds.push(atom.value);
      break;
    case 'has':
      parsed.hasAttachment = true;
      break;
    case 'is': {
      if (atom.value === 'unread') parsed.isUnread = true;
      else if (atom.value === 'read') parsed.isUnread = false;
      else if (atom.value === 'starred') parsed.isStarred = true;
      else if (atom.value === 'important') parsed.isImportant = true;
      else if (atom.value === 'spam') parsed.isSpam = true;
      break;
    }
    case 'before':
      if (atom.date) parsed.before = atom.date;
      break;
    case 'after':
      if (atom.date) parsed.after = atom.date;
      break;
    case 'term':
      parsed.terms.push(atom.value);
      break;
  }
}

/** Translate one parsed atom into its Prisma `Email` condition, or null
 *  when the atom contributes no predicate (`in:anywhere`, already hoisted
 *  to the scope flag). The caller wraps negated atoms in `NOT`. */
function atomPrismaCondition(atom: SearchAtom): Record<string, unknown> | null {
  switch (atom.op) {
    case 'from':
      return { fromAddress: { contains: atom.value, mode: 'insensitive' } };
    case 'to':
      return { toAddresses: { array_contains: atom.value } };
    case 'subject':
      return { subject: { contains: atom.value, mode: 'insensitive' } };
    case 'label':
      return { labels: { array_contains: atom.value } };
    case 'in': {
      const v = atom.value.toLowerCase();
      if (v === 'anywhere') {
        return null;
      }
      if (KNOWN_FOLDER_TYPES.has(v)) {
        return folderTypeCondition(v);
      }
      return { folderId: { in: [atom.value] } };
    }
    case 'folder':
      return { folderId: { in: [atom.value] } };
    case 'has':
      return { hasAttachments: true };
    case 'is': {
      if (atom.value === 'unread') return { isRead: false };
      if (atom.value === 'read') return { isRead: true };
      if (atom.value === 'starred') return { isStarred: true };
      if (atom.value === 'important') return { isImportant: true };
      if (atom.value === 'spam') return { isSpam: true };
      return null;
    }
    case 'before':
      return atom.date ? { receivedAt: { lte: atom.date } } : null;
    case 'after':
      return atom.date ? { receivedAt: { gte: atom.date } } : null;
    case 'term':
      return {
        OR: [
          { subject: { contains: atom.value, mode: 'insensitive' } },
          { snippet: { contains: atom.value, mode: 'insensitive' } },
          { bodyPlain: { contains: atom.value, mode: 'insensitive' } },
        ],
      };
  }
}

/** True when a non-negated OR-group atom asks for a folder type: such a
 *  branch must not be ANDed with the default trash/spam exclusion, for the
 *  same reason an explicit flat `in:trash`/`in:spam` lifts it. Negated
 *  branches (`-in:trash OR ...`) stay compatible with the exclusion. */
function orGroupWantsFolder(groups: SearchAtom[][], type: string): boolean {
  return groups.some((group) =>
    group.some((atom) => !atom.negated && atom.op === 'in' && atom.value.toLowerCase() === type),
  );
}

/** True when a non-negated OR-group atom asks for spam via `is:spam`. */
function orGroupWantsSpam(groups: SearchAtom[][]): boolean {
  return groups.some((group) =>
    group.some((atom) => !atom.negated && atom.op === 'is' && atom.value === 'spam'),
  );
}

export class SearchQueryService {
  constructor(private readonly prisma?: PrismaClient) {}

  /**
   * Parse a raw query string into a structured {@link ParsedSearchQuery}.
   *
   * Boolean rules (Gmail parity):
   * - A bare `OR` token (exact uppercase) between two atoms joins them
   *   into one OR-group; OR binds tighter than the implicit AND, so
   *   `from:a OR from:b invoice` is "(a or b) and invoice". Lowercase
   *   `or` is an ordinary term. A stray `OR` (leading, trailing, or
   *   doubled) is treated as an ordinary term, never as a separator.
   * - A `-` prefix negates one atom (`-from:x`, `-term`, `-"phrase"`).
   *   Negated atoms outside OR-groups land in `excluded`; negated atoms
   *   inside a group negate only their own branch.
   * - `in:anywhere` stays a scope modifier wherever it appears: it sets
   *   the flag and contributes no atom. A negated `-in:anywhere` is
   *   dropped entirely (a scope modifier cannot be negated).
   */
  parse(query: string, now: Date = new Date()): ParsedSearchQuery {
    const parsed: ParsedSearchQuery = {
      from: [],
      to: [],
      subject: [],
      labels: [],
      inFolderTypes: [],
      folderIds: [],
      terms: [],
      orGroups: [],
      excluded: [],
    };

    const tokens = tokenize(query)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    type Item = { kind: 'atom'; token: string } | { kind: 'or' };
    const items: Item[] = tokens.map((t) =>
      t === 'OR' ? { kind: 'or' } : { kind: 'atom', token: t },
    );

    // Group consecutive atoms connected by separator `OR`s. An `OR` is a
    // separator only when a group atom precedes it and an atom follows it;
    // otherwise it is a stray term that starts its own single-atom group.
    const tokenGroups: string[][] = [];
    let current: string[] = [];
    let joining = false;
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      if (item.kind === 'or') {
        const isSeparator = current.length > 0 && items[i + 1]?.kind === 'atom';
        if (isSeparator) {
          joining = true;
        } else {
          if (current.length > 0) tokenGroups.push(current);
          current = ['OR'];
          joining = false;
        }
        continue;
      }
      if (joining) {
        current.push(item.token);
        joining = false;
      } else {
        if (current.length > 0) tokenGroups.push(current);
        current = [item.token];
      }
    }
    if (current.length > 0) tokenGroups.push(current);

    for (const tokenGroup of tokenGroups) {
      const atoms: SearchAtom[] = [];
      for (const token of tokenGroup) {
        const atom = parseAtomToken(token, now);
        if (!atom) {
          continue;
        }
        // Gmail's `in:anywhere` is a scope modifier, not a folder: it sets
        // the flag wherever it appears and contributes no atom. A negated
        // one is dropped entirely.
        if (atom.op === 'in' && atom.value.toLowerCase() === 'anywhere') {
          if (!atom.negated) {
            parsed.inAnywhere = true;
          }
          continue;
        }
        atoms.push(atom);
      }
      if (atoms.length === 0) {
        continue;
      }
      if (atoms.length === 1) {
        const atom = atoms[0]!;
        if (atom.negated) {
          parsed.excluded.push(atom);
        } else {
          applyFlatAtom(parsed, atom);
        }
      } else {
        parsed.orGroups.push(atoms);
      }
    }

    return parsed;
  }

  /**
   * Build a Prisma `where` filter for the Email model from a query string,
   * always scoped to `userId` and excluding soft-deleted rows. Trash and spam
   * are excluded by default (Gmail parity) — an operator search is a way of
   * finding mail you filed, not of exhuming mail you threw away — with
   * explicit `in:trash`, `in:spam`, `is:spam`, or the `in:anywhere` scope
   * modifier as the escape hatch. The same escape applies to a non-negated
   * `in:trash`/`in:spam`/`is:spam` branch inside an OR-group.
   * Multiple operators of the same kind combine with AND; OR-groups are
   * ANDed with the rest of the query, and each `excluded` atom is ANDed
   * as a `NOT` of its condition.
   */
  buildEmailWhere(userId: string, query: string, now: Date = new Date()): Record<string, unknown> {
    const parsed = this.parse(query, now);
    const and: Record<string, unknown>[] = [];

    // Explicit folder operators override the default trash/spam exclusion:
    // `in:trash` wants trash, `in:spam`/`is:spam` wants spam, and
    // `in:anywhere` wants everything (inbox + spam + trash). ANDing the
    // default exclusion with the explicit request would match nothing.
    const wantTrash =
      parsed.inFolderTypes.includes('trash') ||
      parsed.inAnywhere === true ||
      orGroupWantsFolder(parsed.orGroups, 'trash');
    const wantSpam =
      parsed.inFolderTypes.includes('spam') ||
      parsed.isSpam === true ||
      parsed.inAnywhere === true ||
      orGroupWantsFolder(parsed.orGroups, 'spam') ||
      orGroupWantsSpam(parsed.orGroups);

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
    if (parsed.inFolderTypes.length > 0) {
      const branches = parsed.inFolderTypes.map(folderTypeCondition);
      and.push(branches.length === 1 ? branches[0]! : { OR: branches });
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
    // Excluded atoms: each is ANDed as the negation of its condition.
    for (const atom of parsed.excluded) {
      const cond = atomPrismaCondition(atom);
      if (cond) {
        and.push({ NOT: cond });
      }
    }
    // OR-groups: each group is one OR of its branches (a negated branch
    // contributes its own NOT), ANDed with everything else.
    for (const group of parsed.orGroups) {
      const branches: Record<string, unknown>[] = [];
      for (const atom of group) {
        const cond = atomPrismaCondition(atom);
        if (cond) {
          branches.push(atom.negated ? { NOT: cond } : cond);
        }
      }
      if (branches.length === 1) {
        and.push(branches[0]!);
      } else if (branches.length > 1) {
        and.push({ OR: branches });
      }
    }

    const where: Record<string, unknown> = { userId, deletedAt: null };
    if (!wantTrash) {
      where.isTrash = false;
    }
    if (!wantSpam) {
      where.isSpam = false;
    }
    if (and.length > 0) {
      where.AND = and;
    }
    return where;
  }

  /**
   * Execute a search against the Email model. Requires a PrismaClient (supplied
   * via the constructor). Returns a paginated result ordered by `receivedAt`.
   * Supports both offset (page/pageSize) and cursor-based (cursor/limit) pagination.
   * Uses PostgreSQL GIN index `emails_fts_idx` via `plainto_tsquery` when terms are present.
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
    const parsed = this.parse(query, options.now);
    const limit = options.limit ?? options.pageSize ?? 25;
    const page = options.page ?? 1;
    const offset = options.cursor ? 0 : (page - 1) * limit;

    // G3-10: When terms are present and $queryRawUnsafe is available, execute a single
    // bounded SQL query with LIMIT and OFFSET directly against emails_fts_idx,
    // eliminating unbounded in-memory ID arrays and parameter overflow.
    if (parsed.terms.length > 0 && typeof (this.prisma as any).$queryRawUnsafe === 'function') {
      try {
        const fullTerms = parsed.terms.join(' ');
        // Same trash/spam rule as buildEmailWhere(): excluded by default,
        // with explicit `in:trash` / `in:spam` / `is:spam` / `in:anywhere`
        // as the escape hatch (an in:trash isTrash clause would contradict
        // the default exclusion; in:anywhere drops both exclusions).
        const wantTrash =
          parsed.inFolderTypes.includes('trash') ||
          parsed.inAnywhere === true ||
          orGroupWantsFolder(parsed.orGroups, 'trash');
        const wantSpam =
          parsed.inFolderTypes.includes('spam') ||
          parsed.isSpam === true ||
          parsed.inAnywhere === true ||
          orGroupWantsFolder(parsed.orGroups, 'spam') ||
          orGroupWantsSpam(parsed.orGroups);
        const whereClauses: string[] = [
          `"userId" = $1`,
          `"deletedAt" IS NULL`,
          `to_tsvector('english', coalesce(subject, '') || ' ' || coalesce("bodyPlain", '') || ' ' || coalesce("fromAddress", '')) @@ plainto_tsquery('english', $2)`,
        ];
        const params: any[] = [userId, fullTerms];
        let paramIdx = 3;
        // Raw-SQL mirror of folderTypeCondition() for the GIN full-text path.
        // $1 is always the userId bind (see params initialisation above);
        // folder membership resolves through email_folders (EmailFolder.type).
        const bind = (value: unknown): string => {
          params.push(value);
          return `$${paramIdx++}`;
        };
        const folderOfType = (folderType: string): string =>
          `"folderId" IN (SELECT id FROM email_folders WHERE "userId" = $1 AND type = '${folderType}')`;
        const clauseFor = (type: string): string => {
          switch (type) {
            case 'sent':
              return `"isSent" = ${bind(true)} AND "isTrash" = ${bind(false)}`;
            case 'drafts':
              return `"isDraft" = ${bind(true)} AND "isTrash" = ${bind(false)}`;
            case 'spam':
              return `"isSpam" = ${bind(true)} AND "isTrash" = ${bind(false)}`;
            case 'trash':
              return `"isTrash" = ${bind(true)}`;
            case 'archive':
              return `"isTrash" = ${bind(false)} AND ${folderOfType('ARCHIVE')}`;
            case 'inbox':
              return (
                `"isDraft" = ${bind(false)} AND "isSpam" = ${bind(false)} AND ` +
                `"isTrash" = ${bind(false)} AND ("folderId" IS NULL OR ` +
                `${folderOfType('INBOX')} OR "isSent" = ${bind(true)})`
              );
            default:
              // Unreachable: inFolderTypes only holds KNOWN_FOLDER_TYPES.
              // A no-op guard rather than silently filtering everything out.
              return 'TRUE';
          }
        };
        /** Raw-SQL mirror of atomPrismaCondition() for OR-group/excluded atoms. */
        const atomSqlClause = (atom: SearchAtom): string | null => {
          switch (atom.op) {
            case 'from':
              return `"fromAddress" ILIKE ${bind(`%${atom.value}%`)}`;
            case 'subject':
              return `subject ILIKE ${bind(`%${atom.value}%`)}`;
            case 'to':
              return `"toAddresses"::text ILIKE ${bind(`%${atom.value}%`)}`;
            case 'label':
              return `"labels"::text ILIKE ${bind(`%${atom.value}%`)}`;
            case 'in': {
              const v = atom.value.toLowerCase();
              if (v === 'anywhere') return null;
              if (KNOWN_FOLDER_TYPES.has(v)) return clauseFor(v);
              return `"folderId" = ${bind(atom.value)}`;
            }
            case 'folder':
              return `"folderId" = ${bind(atom.value)}`;
            case 'has':
              return `"hasAttachments" = ${bind(true)}`;
            case 'is': {
              if (atom.value === 'unread') return `"isRead" = ${bind(false)}`;
              if (atom.value === 'read') return `"isRead" = ${bind(true)}`;
              if (atom.value === 'starred') return `"isStarred" = ${bind(true)}`;
              if (atom.value === 'important') return `"isImportant" = ${bind(true)}`;
              if (atom.value === 'spam') return `"isSpam" = ${bind(true)}`;
              return null;
            }
            case 'before':
              return atom.date ? `"receivedAt" <= ${bind(atom.date)}` : null;
            case 'after':
              return atom.date ? `"receivedAt" >= ${bind(atom.date)}` : null;
            case 'term':
              return `to_tsvector('english', coalesce(subject, '') || ' ' || coalesce("bodyPlain", '') || ' ' || coalesce("fromAddress", '')) @@ plainto_tsquery('english', ${bind(atom.value)})`;
          }
        };
        if (!wantTrash) {
          whereClauses.push(`"isTrash" = $${paramIdx++}`);
          params.push(false);
        }
        if (!wantSpam) {
          whereClauses.push(`"isSpam" = $${paramIdx++}`);
          params.push(false);
        }

        for (const from of parsed.from) {
          whereClauses.push(`"fromAddress" ILIKE $${paramIdx++}`);
          params.push(`%${from}%`);
        }
        for (const subj of parsed.subject) {
          whereClauses.push(`subject ILIKE $${paramIdx++}`);
          params.push(`%${subj}%`);
        }
        for (const to of parsed.to) {
          whereClauses.push(`"toAddresses"::text ILIKE $${paramIdx++}`);
          params.push(`%${to}%`);
        }
        for (const label of parsed.labels) {
          whereClauses.push(`"labels"::text ILIKE $${paramIdx++}`);
          params.push(`%${label}%`);
        }
        if (parsed.folderIds.length > 0) {
          whereClauses.push(`"folderId" = ANY($${paramIdx++}::text[])`);
          params.push(parsed.folderIds);
        }
        if (parsed.inFolderTypes.length > 0) {
          const clauses = parsed.inFolderTypes.map((type) => `(${clauseFor(type)})`);
          whereClauses.push(clauses.length === 1 ? clauses[0]! : `(${clauses.join(' OR ')})`);
        }
        if (parsed.hasAttachment !== undefined) {
          whereClauses.push(`"hasAttachments" = $${paramIdx++}`);
          params.push(parsed.hasAttachment);
        }
        if (parsed.isUnread !== undefined) {
          whereClauses.push(`"isRead" = $${paramIdx++}`);
          params.push(!parsed.isUnread);
        }
        if (parsed.isStarred !== undefined) {
          whereClauses.push(`"isStarred" = $${paramIdx++}`);
          params.push(parsed.isStarred);
        }
        if (parsed.isImportant !== undefined) {
          whereClauses.push(`"isImportant" = $${paramIdx++}`);
          params.push(parsed.isImportant);
        }
        if (parsed.isSpam !== undefined) {
          whereClauses.push(`"isSpam" = $${paramIdx++}`);
          params.push(parsed.isSpam);
        }
        if (parsed.after) {
          whereClauses.push(`"receivedAt" >= $${paramIdx++}`);
          params.push(parsed.after);
        }
        if (parsed.before) {
          whereClauses.push(`"receivedAt" <= $${paramIdx++}`);
          params.push(parsed.before);
        }
        // Excluded atoms and OR-groups ride the raw path too: without them
        // a query like `invoice -from:spammy` would silently ignore the
        // exclusion on the fast path while honouring it on the Prisma path.
        for (const atom of parsed.excluded) {
          const clause = atomSqlClause(atom);
          if (clause) {
            whereClauses.push(`NOT (${clause})`);
          }
        }
        for (const group of parsed.orGroups) {
          const clauses: string[] = [];
          for (const atom of group) {
            const clause = atomSqlClause(atom);
            if (clause) {
              clauses.push(atom.negated ? `NOT (${clause})` : clause);
            }
          }
          if (clauses.length === 1) {
            whereClauses.push(clauses[0]!);
          } else if (clauses.length > 1) {
            whereClauses.push(`(${clauses.join(' OR ')})`);
          }
        }

        const whereSql = whereClauses.join(' AND ');
        const countSql = `SELECT COUNT(*)::int AS total FROM emails WHERE ${whereSql}`;
        // `attachments` and `labels` ride along so formatEmailRecord (applied
        // by the /search/emails route) keeps the attachment clip icon and
        // label filters honest: it derives `hasAttachments` from the
        // attachments array, and the client's chip matcher reads `labels`.
        const dataSql = `SELECT id, "userId", "folderId", "threadId", "fromAddress", "fromName", "toAddresses", "ccAddresses", "bccAddresses", subject, "bodyPlain", snippet, "isRead", "isStarred", "isArchived", "isDraft", "isTrash", "isSpam", "hasAttachments", "attachments", "labels", "createdAt", "receivedAt", "sentAt" FROM emails WHERE ${whereSql} ORDER BY "receivedAt" DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;

        const [countRes, data] = await Promise.all([
          (this.prisma as any).$queryRawUnsafe(countSql, ...params),
          (this.prisma as any).$queryRawUnsafe(dataSql, ...params, limit, offset),
        ]);

        const total = Number(countRes[0]?.total ?? countRes[0]?.count ?? 0);
        const hasMore = offset + limit < total;
        const nextCursor =
          hasMore && data.length > 0 ? (data[data.length - 1] as { id: string }).id : null;
        return {
          data,
          total,
          page,
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
          nextCursor,
          hasMore,
        };
      } catch {
        // Fall through to Prisma query builder if raw query fails on test double
      }
    }

    const where = this.buildEmailWhere(userId, query, options.now);

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

    const pageSize = options.pageSize ?? limit;
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

  /**
   * Search drive files by name leveraging the GIN trigram index (drive_files_name_trgm_idx).
   */
  async searchFiles(
    userId: string,
    query: string,
    options: { page?: number; pageSize?: number; limit?: number } = {},
  ): Promise<{
    data: unknown[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    if (!this.prisma) throw new Error('SearchQueryService requires a PrismaClient');
    const q = query.trim();
    const where: Record<string, unknown> = {
      userId,
      isDeleted: false,
      ...(q.length > 0 ? { name: { contains: q, mode: 'insensitive' } } : {}),
    };
    const page = options.page ?? 1;
    const pageSize = options.limit ?? options.pageSize ?? 25;
    const [data, total] = await Promise.all([
      (this.prisma as any).file.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      (this.prisma as any).file.count({ where }),
    ]);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Search documents by title and content leveraging the GIN full-text index (documents_fts_idx).
   * Executes authentic PostgreSQL to_tsvector('english', ...) @@ plainto_tsquery('english', $query)
   * matching the GIN index expression created in migration 0067.
   */
  async searchDocuments(
    userId: string,
    query: string,
    options: { page?: number; pageSize?: number; limit?: number } = {},
  ): Promise<{
    data: unknown[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    if (!this.prisma) throw new Error('SearchQueryService requires a PrismaClient');
    const q = query.trim();
    const page = options.page ?? 1;
    const pageSize = options.limit ?? options.pageSize ?? 25;
    const offset = (page - 1) * pageSize;

    // 1. When PostgreSQL raw query is available, execute authentic GIN full-text search
    if (q.length > 0 && typeof (this.prisma as any).$queryRawUnsafe === 'function') {
      try {
        const [data, countRes] = await Promise.all([
          (this.prisma as any).$queryRawUnsafe(
            `SELECT id, title, "userId", "createdAt", "updatedAt", "snapshotStorageKey"
             FROM documents
             WHERE "userId" = $1
               AND "isDeleted" = false
               AND to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')) @@ plainto_tsquery('english', $2)
             ORDER BY "updatedAt" DESC
             LIMIT $3 OFFSET $4`,
            userId,
            q,
            pageSize,
            offset,
          ),
          (this.prisma as any).$queryRawUnsafe(
            `SELECT count(*)::int as total
             FROM documents
             WHERE "userId" = $1
               AND "isDeleted" = false
               AND to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')) @@ plainto_tsquery('english', $2)`,
            userId,
            q,
          ),
        ]);
        const total = Number(countRes[0]?.total ?? 0);
        return {
          data,
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        };
      } catch {
        // Fall through to delegate if raw query fails on test double
      }
    }

    const where: Record<string, unknown> = {
      userId,
      isDeleted: false,
      ...(q.length > 0
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { content: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      (this.prisma as any).document.findMany({
        where,
        skip: offset,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
          snapshotStorageKey: true,
        },
      }),
      (this.prisma as any).document.count({ where }),
    ]);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Unified cross-app search across emails, drive files, and collaborative documents.
   */
  async searchAll(
    userId: string,
    query: string,
    options: { limit?: number } = {},
  ): Promise<{
    emails: unknown[];
    files: unknown[];
    documents: unknown[];
    query: string;
  }> {
    const limit = options.limit ?? 10;
    const [emailRes, fileRes, docRes] = await Promise.all([
      this.search(userId, query, { limit }),
      this.searchFiles(userId, query, { limit }),
      this.searchDocuments(userId, query, { limit }),
    ]);
    return {
      query,
      emails: emailRes.data,
      files: fileRes.data,
      documents: docRes.data,
    };
  }
}
