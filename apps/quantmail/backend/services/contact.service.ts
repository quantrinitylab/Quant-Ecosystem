import type { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { createAppError } from '@quant/server-core';

export interface Contact {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatar?: string | null;
  /** Collected by the create/edit form and written into the vCard export. */
  phone?: string | null;
  company?: string | null;
  tags: string[];
  /** The star in the list, and what the Favorites tab filters on. */
  isFavorite: boolean;
  /** Incremented by {@link ContactService.recordInteraction} on every send. */
  frequency: number;
  /** Set by that same write path; makes "frequent" orderable by recency. */
  lastContactedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The fields a client is allowed to set. `frequency` and `lastContactedAt` are
 * deliberately absent — they are derived from send activity, and a client that
 * could write them could fake its own "frequently contacted" ordering.
 */
export interface ContactWritableFields {
  name?: string;
  email?: string;
  avatar?: string | null;
  phone?: string | null;
  company?: string | null;
  tags?: string[];
  isFavorite?: boolean;
}

export interface AddContactInput extends ContactWritableFields {
  userId: string;
  name: string;
  email: string;
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

/**
 * What the list endpoint is actually asked for. The contacts page has sent `q`,
 * `tag` and `favorites` since the day it shipped; a non-`.strict()` pagination
 * schema dropped all three without complaint, so the search box filtered
 * nothing and the Favorites tab showed everybody.
 */
export interface ContactListOptions extends PaginationOptions {
  q?: string;
  tag?: string;
  favorites?: boolean;
}

/**
 * A person who shows up in this user's mail often but is not a saved contact
 * yet — the data behind the contacts page's "Suggested from your mail"
 * section (Gmail's Merge & Fix analogue).
 *
 * `name` is the best-known display name from the most recent mail that
 * carried one, and is null when the address never carried a name — callers
 * must render the address itself rather than inventing one.
 */
export interface ContactActivitySuggestion {
  email: string;
  name: string | null;
  messageCount: number;
  lastMessageAt: Date | null;
  direction: 'inbound' | 'outbound' | 'both';
}

/**
 * The scan behind {@link ContactService.getContactSuggestions}: a bounded
 * window over the user's most recent mail — one indexed query — rather than
 * an unbounded full-mailbox aggregation, which would turn the endpoint into
 * a table scan on large mailboxes. The trade is honest and documented on the
 * surface: suggestions reflect recent activity, and a correspondent who went
 * quiet long ago drops out.
 */
const SUGGESTION_SCAN_WINDOW = 2000;

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * One company card on the Companies tab: every member's contact row, grouped
 * by the contacts' own `company` field. Aggregated server-side across ALL of
 * the caller's contacts — the tab used to group on the client from the
 * paginated list page, so companies whose members all sat on other pages
 * never appeared and member counts undercounted while the header copy read
 * as complete.
 */
export interface CompanyGroup {
  /** The company name as written on the first member's record (trimmed). */
  name: string;
  /**
   * Most common email domain among the members, `@`-prefixed — derived from
   * the members' real addresses, never an invented HQ or domain.
   */
  subtitle?: string;
  members: Contact[];
}

/** Filters the companies aggregation honours: the list's search + favorites. */
export type CompanyGroupOptions = Pick<ContactListOptions, 'q' | 'favorites'>;

/**
 * One letter bucket for the contacts A–Z index: how many of the caller's
 * contacts (under the list's filters) start with this letter. Aggregated
 * server-side across ALL matching contacts — the page used to count from the
 * paginated list page, so a header reading "A (7)" on page 2 of 5 counted
 * only page 2's A-contacts while reading as a total.
 */
export interface LetterGroup {
  letter: string;
  count: number;
}

/** Filters the letter aggregation honours: the list's search + favorites. */
export type LetterGroupOptions = Pick<ContactListOptions, 'q' | 'favorites'>;

export interface ImportResult {
  imported: number;
  duplicates: number;
  errors: number;
  total: number;
}

export interface DuplicateGroup {
  primaryContact: Contact;
  duplicates: Contact[];
  reason: 'email' | 'name' | 'phone';
}

/**
 * Order-normalized pair key for a dismissed duplicate pair: the two contact
 * ids sorted and joined, so the key is identical whichever side the detector
 * reported as primary.
 */
export function duplicatePairKey(contactIdA: string, contactIdB: string): string {
  return [contactIdA, contactIdB].sort().join('::');
}

/**
 * The wizard's grouping algorithm, shared by findDuplicates (what the dedupe
 * modal lists) and deduplicateContacts (POST /contacts/deduplicate).
 *
 * Both paths MUST use the same grouping: "Auto-Merge All" merges exactly the
 * groups the wizard surfaced — never a different, wider set. The old bulk
 * path ran a union-find over normalized email (trim+lower) AND normalized
 * phone (digits-only, last-10, min 7) with full transitivity, so one click
 * could merge pairs the wizard never displayed (last-10-digit phone matches
 * with differing full strings, or A-B/B-C chains the wizard never grouped).
 * That is now impossible by construction: the bulk path consumes this helper.
 *
 * Grouping rules (unchanged from the wizard):
 *  1. Same email, trimmed + case-insensitive (empty emails never group).
 *  2. Among the rest: same exact name (trimmed, case-insensitive) AND at
 *     least one pair in the name-bucket sharing the exact phone string or
 *     the same company (case-insensitive).
 * Each contact appears in at most one group; groups never chain across keys.
 */
function buildDuplicateGroups(contacts: Contact[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const groupedIds = new Set<string>();

  // 1. Group by email (case-insensitive)
  const byEmail = new Map<string, Contact[]>();
  for (const c of contacts) {
    const emailKey = (c.email ?? '').trim().toLowerCase();
    if (!emailKey) continue;
    const list = byEmail.get(emailKey) ?? [];
    list.push(c);
    byEmail.set(emailKey, list);
  }
  for (const [, list] of byEmail) {
    if (list.length > 1) {
      const primary = list[0]!;
      const dups = list.slice(1);
      groups.push({ primaryContact: primary, duplicates: dups, reason: 'email' });
      list.forEach((c) => groupedIds.add(c.id));
    }
  }

  // 2. Group by exact Name + same Company or Phone
  const remaining = contacts.filter((c) => !groupedIds.has(c.id));
  const byName = new Map<string, Contact[]>();
  for (const c of remaining) {
    const name = (c.name ?? '').trim().toLowerCase();
    const list = byName.get(name) ?? [];
    list.push(c);
    byName.set(name, list);
  }
  for (const [, list] of byName) {
    if (list.length > 1) {
      const hasMatching = list.some((c1, i) =>
        list.some(
          (c2, j) =>
            i !== j &&
            ((c1.phone && c1.phone === c2.phone) ||
              (c1.company &&
                c2.company &&
                c1.company.toLowerCase() === c2.company.toLowerCase())),
        ),
      );
      if (hasMatching) {
        const primary = list[0]!;
        const dups = list.slice(1);
        groups.push({ primaryContact: primary, duplicates: dups, reason: 'name' });
        list.forEach((c) => groupedIds.add(c.id));
      }
    }
  }

  return groups;
}

/**
 * One post-dismissal, survivor-resolved merge group. This is the unit BOTH
 * the wizard preview (findDuplicates) and the bulk executor
 * (deduplicateContacts) consume — "Auto-Merge All" merges exactly the groups
 * the wizard listed, by construction, because there is only one plan.
 */
export interface MergePlanGroup {
  /** The survivor after deterministic resolution (see buildMergePlan). */
  survivor: Contact;
  /** Ids absorbed into the survivor, in deterministic merge order. */
  mergeIds: string[];
  reason: 'email' | 'name' | 'phone';
}

/**
 * Build THE merge plan from a contact list and the user's persisted
 * "keep separate" dismissals. Shared by findDuplicates (preview) and
 * deduplicateContacts (execution) — this is what fixed the #1328 follow-up:
 * the preview used to filter dismissals against the ORIGINAL (DB-order)
 * primary while the bulk path re-sorted members (picking a different
 * survivor) and applied dismissal filtering differently, so bulk merged
 * groups the preview never showed (or showed differently) and deleted
 * contacts the preview had excluded.
 *
 * Plan semantics:
 *  1. Group with the wizard's grouping algorithm (buildDuplicateGroups).
 *  2. Resolve the survivor with the deterministic order: favorite first,
 *     then higher frequency, then earlier createdAt, then id (final
 *     tiebreak so the plan is independent of DB row order).
 *  3. Apply dismissals AFTER survivor resolution, pairwise, over the whole
 *     group: a contact is kept only if it has no dismissed "keep separate"
 *     pair with ANY already-kept contact. A dismissed pair can therefore
 *     never be collapsed into one record no matter which contact the sort
 *     picks as survivor — the cannot-merge relationship survives survivor
 *     changes atomically.
 * Groups left with nothing to merge (dismissal-exhausted) are dropped: they
 * neither surface in the preview nor merge in bulk.
 */
/**
 * Sort-safe createdAt: a missing or invalid date sorts as epoch, never NaN.
 * A NaN comparator result is treated as "equal" by V8's sort, which would
 * silently make the survivor follow DB row order instead of the tiebreak
 * chain — the tiebreak must be total even for partial rows.
 */
function toSortTime(value: unknown): number {
  const time = value ? new Date(value as string | number | Date).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

export function buildMergePlan(contacts: Contact[], dismissed: Set<string>): MergePlanGroup[] {
  const plan: MergePlanGroup[] = [];
  for (const group of buildDuplicateGroups(contacts)) {
    const members = [group.primaryContact, ...group.duplicates];
    members.sort((a, b) => {
      if (Boolean(a.isFavorite) !== Boolean(b.isFavorite)) return a.isFavorite ? -1 : 1;
      const freqA = a.frequency ?? 0;
      const freqB = b.frequency ?? 0;
      if (freqA !== freqB) return freqB - freqA;
      const timeA = toSortTime(a.createdAt);
      const timeB = toSortTime(b.createdAt);
      if (timeA !== timeB) return timeA - timeB;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    const kept: Contact[] = [];
    for (const c of members) {
      const conflicts = kept.some((k) => dismissed.has(duplicatePairKey(k.id, c.id)));
      if (!conflicts) kept.push(c);
    }

    const survivor = kept[0];
    if (!survivor) continue;
    const mergeIds = kept.slice(1).map((c) => c.id);
    if (mergeIds.length === 0) continue;
    plan.push({ survivor, mergeIds, reason: group.reason });
  }
  return plan;
}

/**
 * Stable fingerprint of a merge plan (order-independent): survivor id +
 * sorted merge ids per group, groups sorted. The wizard hands this back to
 * POST /contacts/deduplicate; a mismatch means the data changed under the
 * preview and the bulk path 409s instead of silently expanding the merge.
 */
export function fingerprintMergePlan(plan: MergePlanGroup[]): string {
  const canonical = plan
    .map((g) => `${g.survivor.id}<${[...g.mergeIds].sort().join(',')}`)
    .sort()
    .join('|');
  return createHash('sha1').update(canonical).digest('hex').slice(0, 16);
}

export class ContactService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Canonical email form for every contact write path: trimmed + case-folded.
   * Contact dedupe is keyed on (userId, email) under a case-SENSITIVE unique
   * constraint, so storing the mixed-case variant is what produced duplicate
   * rows for the same person (Alice@x.com vs alice@x.com): frequency split
   * across the duplicates and a 409 CONTACT_EXISTS guard that never fired.
   */
  private static canonicalEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async addContact(input: AddContactInput): Promise<Contact> {
    const email = ContactService.canonicalEmail(input.email);
    // Case-insensitive check: a legacy mixed-case row for the same person
    // still trips the 409 guard instead of silently creating a duplicate.
    const existing = await (this.prisma as unknown as { contact: ContactModel }).contact.findFirst({
      where: { userId: input.userId, email: { equals: email, mode: 'insensitive' } },
    });

    if (existing) {
      throw createAppError('Contact with this email already exists', 409, 'CONTACT_EXISTS');
    }

    return (this.prisma as unknown as { contact: ContactModel }).contact.create({
      data: {
        userId: input.userId,
        name: input.name,
        email,
        avatar: input.avatar ?? null,
        phone: input.phone ?? null,
        company: input.company ?? null,
        tags: input.tags ?? [],
        isFavorite: input.isFavorite ?? false,
        frequency: 0,
      },
    });
  }

  /**
   * The Prisma `where` for one user's contacts under the list filters.
   *
   * Shared by `findMany` and `count` on purpose. When they disagree the page
   * renders three rows and the pager claims eleven, which is the classic
   * filtered-list bug — the count must see exactly the same predicate.
   */
  private listWhere(userId: string, options: ContactListOptions): Record<string, unknown> {
    const where: Record<string, unknown> = { userId };

    const q = options.q?.trim();
    if (q) {
      // Name, email, company and phone are the four things a person actually
      // types into a contacts search box.
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { company: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const tag = options.tag?.trim();
    if (tag) {
      where.tags = { has: tag };
    }

    // Only `favorites=true` narrows. `false` means "no filter", not "show me
    // the un-starred ones" — that is what the tab actually means.
    if (options.favorites === true) {
      where.isFavorite = true;
    }

    return where;
  }

  async getContacts(
    userId: string,
    options: ContactListOptions = {},
  ): Promise<PaginatedResult<Contact>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;
    const where = this.listWhere(userId, options);

    const [data, total] = await Promise.all([
      contactModel.findMany({
        where,
        skip,
        take: pageSize,
        // Starred first, then most-contacted, then alphabetical. `frequency`
        // alone left a fresh account — where every row is 0 — in whatever order
        // Postgres felt like, which made the list appear to reshuffle itself.
        orderBy: [{ isFavorite: 'desc' }, { frequency: 'desc' }, { name: 'asc' }],
      }),
      contactModel.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  /**
   * Company groups for the Companies tab, aggregated across ALL of the
   * caller's contacts.
   *
   * Deliberately UNPAGINATED: the tab used to group on the client from the
   * loaded list page (`GET /contacts` is 20/page, capped at 100), which
   * silently dropped companies whose members all sat on other pages and
   * undercounted the members of companies that spanned pages. The list's
   * filters (search `q`, `favorites`) still apply via the shared `listWhere`
   * so the tab stays consistent with what the list tab shows under the same
   * filters.
   *
   * Grouping mirrors the client code this replaces: one row per address (a
   * duplicated import must not inflate a company's headcount), group key is
   * the trimmed company name case-insensitively, members with no company are
   * skipped, and the subtitle is the most common email domain among the
   * group's own members — never an invented HQ or domain.
   */
  async getCompanyGroups(
    userId: string,
    options: CompanyGroupOptions = {},
  ): Promise<CompanyGroup[]> {
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;
    const contacts = await contactModel.findMany({
      where: this.listWhere(userId, options),
      orderBy: [{ name: 'asc' }],
    });

    const seenEmails = new Set<string>();
    const unique: Contact[] = [];
    for (const c of contacts) {
      const email = (c.email || '').trim().toLowerCase();
      if (email) {
        if (seenEmails.has(email)) continue;
        seenEmails.add(email);
      }
      unique.push(c);
    }

    const groups = new Map<string, { name: string; members: Contact[] }>();
    for (const c of unique) {
      const raw = (c.company || '').trim();
      if (!raw) continue; // no company on the record — nothing honest to group by
      const key = raw.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.members.push(c);
      } else {
        groups.set(key, { name: raw, members: [c] });
      }
    }

    return [...groups.values()]
      .map((g) => {
        const domainCounts = new Map<string, number>();
        for (const m of g.members) {
          const email = (m.email || '').trim();
          const at = email.lastIndexOf('@');
          if (at > 0) {
            const domain = email.slice(at + 1).toLowerCase();
            if (domain) domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
          }
        }
        let commonDomain = '';
        domainCounts.forEach((count, domain) => {
          if (count > (domainCounts.get(commonDomain) || 0)) commonDomain = domain;
        });
        return { ...g, subtitle: commonDomain ? `@${commonDomain}` : undefined };
      })
      .sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name));
  }

  /**
   * The address book's first letter for one contact. This MUST stay identical
   * to the grouping in `apps/quantmail/src/app/contacts/page.tsx`
   * (`groupedContacts`): first character of `name`, else first character of
   * `email`, uppercased; anything that is not A–Z (digits, symbols, CJK, a
   * missing name AND email on a phone-only record) buckets into '#'. If the
   * two ever disagree, the rail index and the list sections describe different
   * address books.
   */
  private static letterKey(name?: string | null, email?: string | null): string {
    const letter = (name?.[0] || email?.[0] || '#').toUpperCase();
    return /^[A-Z]$/.test(letter) ? letter : '#';
  }

  /**
   * Per-letter contact totals for the A–Z index, aggregated across ALL of the
   * caller's contacts.
   *
   * Deliberately UNPAGINATED: the contacts page used to render `{letter}
   * ({group.contacts.length})` from the paginated list page (`GET /contacts`
   * is 20/page, capped at 100), so a header reading "A (7)" on page 2 of 5
   * counted only page 2's A-contacts while reading as a total — and letters
   * whose contacts all sat on other pages vanished from the sidebar index
   * entirely. The list's filters (search `q`, `favorites`) still apply via the
   * shared `listWhere` so the index stays consistent with the list under the
   * same filters.
   *
   * Only `name`/`email` are selected — the index needs nothing else, and the
   * rows themselves keep coming from the paginated list query. Unlike company
   * groups, rows are NOT deduped by address here: the list renders every row
   * including duplicate imports, so the totals must count what the list shows.
   */
  async getLetterCounts(
    userId: string,
    options: LetterGroupOptions = {},
  ): Promise<LetterGroup[]> {
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;
    const contacts = await contactModel.findMany({
      where: this.listWhere(userId, options),
      select: { name: true, email: true },
    });

    const counts = new Map<string, number>();
    for (const c of contacts) {
      const key = ContactService.letterKey(c.name, c.email);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([letter, count]) => ({ letter, count }))
      .sort((a, b) => (a.letter === '#' ? 1 : b.letter === '#' ? -1 : a.letter.localeCompare(b.letter)));
  }

  /**
   * Load one contact, proving it belongs to the caller.
   *
   * Every by-id operation needs the same two rejections in the same order —
   * 404 when the row is absent, 403 when it belongs to somebody else — so they
   * live here rather than being retyped in each caller. Order matters: checking
   * ownership before existence would leak, via a 403, that an id is real.
   */
  private async requireOwnedContact(contactId: string, userId: string): Promise<Contact> {
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;
    const contact = await contactModel.findUnique({ where: { id: contactId } });

    if (!contact) {
      throw createAppError('Contact not found', 404, 'CONTACT_NOT_FOUND');
    }

    if (contact.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    return contact;
  }

  /**
   * One contact by id. `GET /contacts/:id` was in the API client and in the
   * detail panel's data path but had no route, so opening a contact 404ed.
   */
  async getContact(contactId: string, userId: string): Promise<Contact> {
    return this.requireOwnedContact(contactId, userId);
  }

  /**
   * Contact lookup for the composer autocomplete and the universal search
   * "people" tab. Gmail matches names, addresses AND company names; this used
   * to check name/email only, so a person stored with just a company ("Acme")
   * was unfindable. Company and phone are substring-matched like name/email
   * (same four-field set the contacts list route's `q` filter uses); tags
   * match on exact element — Prisma has no case-insensitive substring
   * operator for String[] columns, and exact is the same semantics the list
   * route's `tag` filter already uses. Name/email hits rank above
   * company/phone/tags hits; frequency keeps the order inside each tier.
   */
  async searchContacts(userId: string, query: string): Promise<Contact[]> {
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;
    const q = query.trim();

    const results = await contactModel.findMany({
      where: {
        userId,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { company: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { tags: { has: q } },
        ],
      },
      take: 10,
      orderBy: { frequency: 'desc' },
    });

    // Stable: name/email hits first, then company/phone/tags hits; the
    // frequency ordering from the query survives inside each tier.
    const qLower = q.toLowerCase();
    const isPrimaryHit = (c: Contact) =>
      c.name?.toLowerCase().includes(qLower) || c.email.toLowerCase().includes(qLower);
    return [...results].sort((a, b) => Number(isPrimaryHit(b)) - Number(isPrimaryHit(a)));
  }

  async updateContact(
    contactId: string,
    userId: string,
    data: ContactWritableFields,
  ): Promise<Contact> {
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;

    await this.requireOwnedContact(contactId, userId);

    // An empty patch is a client bug, not a successful update. Prisma would
    // happily run `update({ data: {} })` and return the row unchanged, which is
    // exactly how the star used to report "Added to favorites" and then revert:
    // `isFavorite` was stripped by a non-strict schema, leaving `{}`.
    if (Object.keys(data).length === 0) {
      throw createAppError('No updatable fields were supplied', 400, 'EMPTY_UPDATE');
    }

    // A case-variant email patch must canonicalize like every other write
    // path, or the update itself creates the duplicate-row problem.
    const patch: ContactWritableFields =
      data.email !== undefined ? { ...data, email: ContactService.canonicalEmail(data.email) } : data;

    return contactModel.update({
      where: { id: contactId },
      data: patch,
    });
  }

  /**
   * Record an interaction with a contact (e.g. when an email is sent to them).
   * Keyed on the case-folded (userId, email): the upsert key and every stored
   * value are canonicalized, and the lookup is case-insensitive so a legacy
   * mixed-case row still accumulates frequency on one row instead of spawning
   * a duplicate. (Postgres's (userId, email) unique constraint is
   * case-sensitive, so a blind upsert would create the second row the blind
   * read then misses.)
   *  - on create: frequency starts at 1 (and name is stored if provided)
   *  - on update: frequency is incremented by 1 (and name refreshed if provided)
   *
   * This is the write path that finally makes the previously-dead `frequency`
   * field meaningful, powering "frequently contacted" ordering.
   */
  async recordInteraction(userId: string, email: string, name?: string): Promise<Contact> {
    const normalizedEmail = ContactService.canonicalEmail(email);
    if (!normalizedEmail) {
      throw createAppError('Email is required', 400, 'INVALID_EMAIL');
    }

    const trimmedName = name?.trim();
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;
    const now = new Date();

    const existing = await contactModel.findFirst({
      where: { userId, email: { equals: normalizedEmail, mode: 'insensitive' } },
    });

    if (existing) {
      return contactModel.update({
        where: { id: existing.id },
        data: {
          frequency: { increment: 1 },
          lastContactedAt: now,
          ...(trimmedName && trimmedName.length > 0 ? { name: trimmedName } : {}),
        },
      });
    }

    return contactModel.create({
      data: {
        userId,
        email: normalizedEmail,
        name: trimmedName && trimmedName.length > 0 ? trimmedName : normalizedEmail,
        frequency: 1,
        lastContactedAt: now,
      },
    });
  }

  /**
   * Record one interaction per distinct recipient of a message that was sent.
   *
   * Takes the raw To/Cc/Bcc arrays, so callers hand over what the send path
   * already has rather than each of the three of them re-deriving a recipient
   * list. Addresses are de-duplicated case-insensitively: the same person in To
   * and Cc is one interaction, not two.
   *
   * **Never throws.** A contact-book write must not be able to turn a delivered
   * message into a failed request, so every failure is counted and returned for
   * the caller to log. That is also why it is `allSettled` and not `all` — one
   * bad address must not cost the other nine their interaction.
   */
  async recordRecipients(
    userId: string,
    addressGroups: Array<readonly (string | undefined)[] | undefined>,
  ): Promise<{ recorded: number; failed: number; total: number }> {
    const recipients = ContactService.distinctAddresses(addressGroups);
    if (recipients.length === 0) {
      return { recorded: 0, failed: 0, total: 0 };
    }

    try {
      const results = await Promise.allSettled(
        recipients.map((address) => this.recordInteraction(userId, address)),
      );
      const failed = results.filter((result) => result.status === 'rejected').length;
      return { recorded: results.length - failed, failed, total: results.length };
    } catch {
      // `allSettled` does not reject, so this is unreachable in practice — it is
      // here so the "never throws" contract holds even if that changes.
      return { recorded: 0, failed: recipients.length, total: recipients.length };
    }
  }

  /** Trimmed, non-empty, first-spelling-wins across every address group. */
  private static distinctAddresses(
    addressGroups: Array<readonly (string | undefined)[] | undefined>,
  ): string[] {
    const seen = new Set<string>();
    const addresses: string[] = [];

    for (const group of addressGroups) {
      for (const raw of group ?? []) {
        if (typeof raw !== 'string') continue;
        const address = raw.trim();
        if (!address) continue;
        const key = address.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        addresses.push(address);
      }
    }

    return addresses;
  }

  /**
   * Return the user's most-frequently-contacted contacts, highest frequency
   * first, then most recently contacted, then name for determinism.
   *
   * `lastContactedAt` sits above `updatedAt` because editing a contact's phone
   * number should not promote them past somebody you actually write to. Nulls
   * last: a hand-added contact you have never written to ranks below one you
   * have, at equal frequency.
   */
  async getFrequentContacts(userId: string, limit = 10): Promise<Contact[]> {
    const take = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;

    return contactModel.findMany({
      where: { userId },
      orderBy: [
        { frequency: 'desc' },
        { lastContactedAt: { sort: 'desc', nulls: 'last' } },
        { name: 'asc' },
      ],
      take,
    });
  }

  /**
   * People this user corresponds with often who are NOT saved contacts yet.
   *
   * `GET /contacts/frequent` answers "who do I talk to most" but only from the
   * `contact` table, so a correspondent emailed 50 times who was never saved —
   * most often somebody who emails *you* and you have never replied to, since
   * the send path auto-creates contacts via {@link ContactService.recordRecipients}
   * but nothing ever records inbound senders — never appears anywhere. This
   * aggregates from real mail instead: inbound from `Email.fromAddress`,
   * outbound from the to/cc/bcc of rows this user sent (`isSent`).
   *
   * Excluded, deliberately: the user's own address, every address already in
   * the address book (case-insensitive), drafts (writing half a message to
   * somebody is not contacting them — the same rule as the send-path wiring),
   * spam, trash and soft-deleted rows. Suggesting a spammer as a contact would
   * be a bug, not a feature.
   *
   * Ranked by message count, then recency, so a burst from last week outranks
   * a trickle from last year at equal counts.
   */
  async getContactSuggestions(userId: string, limit = 10): Promise<ContactActivitySuggestion[]> {
    const take = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const delegates = this.prisma as unknown as {
      user: { findUnique(args: unknown): Promise<{ email: string } | null> };
      email: { findMany(args: unknown): Promise<SuggestionEmailRow[]> };
    };

    const userRow = await delegates.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const ownEmail = userRow?.email?.trim().toLowerCase() ?? null;
    const known = new Set(await this.listContactEmails(userId));

    const rows = await delegates.email.findMany({
      where: { userId, deletedAt: null, isDraft: false, isSpam: false, isTrash: false },
      orderBy: [{ createdAt: 'desc' }],
      take: SUGGESTION_SCAN_WINDOW,
      select: {
        fromAddress: true,
        fromName: true,
        toAddresses: true,
        ccAddresses: true,
        bccAddresses: true,
        isSent: true,
        receivedAt: true,
        createdAt: true,
      },
    });

    interface SuggestionBucket {
      email: string;
      name: string | null;
      nameAt: Date | null;
      count: number;
      inbound: boolean;
      outbound: boolean;
      lastAt: Date | null;
    }

    const buckets = new Map<string, SuggestionBucket>();

    const track = (
      rawAddress: unknown,
      opts: { name?: string | null; at: Date | null; direction: 'inbound' | 'outbound' },
    ): void => {
      if (typeof rawAddress !== 'string') return;
      const email = rawAddress.trim();
      if (!email) return;
      const key = email.toLowerCase();
      if (ownEmail && key === ownEmail) return;
      if (known.has(key)) return;

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { email, name: null, nameAt: null, count: 0, inbound: false, outbound: false, lastAt: null };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      if (opts.direction === 'inbound') bucket.inbound = true;
      else bucket.outbound = true;
      if (opts.at && (!bucket.lastAt || opts.at > bucket.lastAt)) bucket.lastAt = opts.at;
      // The name from the most recent mail that carries one wins; an older
      // display name never overwrites a newer one.
      const candidate = opts.name?.trim();
      if (candidate && (!bucket.nameAt || (opts.at !== null && opts.at >= bucket.nameAt))) {
        bucket.name = candidate;
        bucket.nameAt = opts.at;
      }
    };

    for (const row of rows) {
      const at = row.receivedAt ?? row.createdAt ?? null;
      if (!row.isSent) {
        track(row.fromAddress, { name: row.fromName, at, direction: 'inbound' });
      } else {
        // One message = one count per correspondent: the same address in To
        // and Cc of a single send is one message to them, not two.
        const recipients = new Map<string, string>();
        for (const group of [row.toAddresses, row.ccAddresses, row.bccAddresses]) {
          if (!Array.isArray(group)) continue;
          for (const address of group) {
            if (typeof address !== 'string') continue;
            const trimmed = address.trim();
            if (!trimmed) continue;
            const key = trimmed.toLowerCase();
            if (!recipients.has(key)) recipients.set(key, trimmed);
          }
        }
        for (const address of recipients.values()) track(address, { at, direction: 'outbound' });
      }
    }

    return Array.from(buckets.values())
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        const aTime = a.lastAt?.getTime() ?? -1;
        const bTime = b.lastAt?.getTime() ?? -1;
        return bTime - aTime;
      })
      .slice(0, take)
      .map((bucket) => ({
        email: bucket.email,
        name: bucket.name,
        messageCount: bucket.count,
        lastMessageAt: bucket.lastAt,
        direction: (
          bucket.inbound && bucket.outbound ? 'both' : bucket.inbound ? 'inbound' : 'outbound'
        ) as 'inbound' | 'outbound' | 'both',
      }));
  }

  /**
   * Every address in this user's address book, lowercased and deduplicated.
   *
   * This exists because the inbox has to answer "is this conversation with
   * somebody I know?", and it cannot answer that from `GET /contacts`: that route
   * is paginated at 20 by default and capped at 100, so a client joining against
   * one page would call contact 21 a stranger. Walking every page to rebuild the
   * set on the client is the same data in n round trips.
   *
   * A projection, not whole rows — the caller wants set membership, and a name,
   * phone, company, tag list and avatar per contact is a payload it throws away.
   * Even a large book is a few KB of addresses.
   *
   * Lowercased here because {@link ContactService.recordInteraction} trims but does
   * not case-fold, so the same person can hold two rows (`Alice@x.com` and
   * `alice@x.com`). Folding on read means a client comparing lowercased addresses
   * matches either spelling, which is the behaviour every caller wants; the
   * duplicate rows themselves are a separate data problem.
   */
  async listContactEmails(userId: string): Promise<string[]> {
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;

    const rows = await contactModel.findMany({ where: { userId }, select: { email: true } });

    const seen = new Set<string>();
    for (const row of rows) {
      const email = row.email?.trim().toLowerCase();
      if (email) seen.add(email);
    }

    return Array.from(seen);
  }

  async deleteContact(contactId: string, userId: string): Promise<Contact> {
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;

    await this.requireOwnedContact(contactId, userId);

    return contactModel.delete({ where: { id: contactId } });
  }

  async exportVCard(userId: string): Promise<string> {
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;
    const contacts = await contactModel.findMany({ where: { userId } });
    const cards: string[] = [];

    for (const c of contacts) {
      const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${c.name}`, `EMAIL:${c.email}`];
      if (c.phone) lines.push(`TEL:${c.phone}`);
      if (c.company) lines.push(`ORG:${c.company}`);
      // Round-trips the avatar stored by import or the create/edit form. The
      // avatar column only ever holds URL strings, so PHOTO is always
      // URL-valued here — never a base64 blob.
      if (c.avatar) lines.push(`PHOTO:${c.avatar}`);
      if (c.tags && c.tags.length > 0) lines.push(`CATEGORIES:${c.tags.join(',')}`);
      lines.push('END:VCARD');
      cards.push(lines.join('\r\n'));
    }

    return cards.join('\r\n\r\n');
  }

  async importVCard(userId: string, content: string): Promise<ImportResult> {
    const blocks = content.split(/BEGIN:VCARD/i).slice(1);
    let imported = 0;
    let duplicates = 0;
    let errors = 0;

    for (const block of blocks) {
      let name = '';
      let email = '';
      let phone: string | undefined;
      let company: string | undefined;
      let tags: string[] | undefined;
      let avatar: string | undefined;

      const lines = block.split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const upper = line.toUpperCase();
        if (upper.startsWith('FN:')) {
          name = line.slice(3).trim();
        } else if (upper.startsWith('EMAIL:') || upper.startsWith('EMAIL;')) {
          const colonIdx = line.indexOf(':');
          if (colonIdx !== -1) {
            email = line
              .slice(colonIdx + 1)
              .trim()
              .toLowerCase();
          }
        } else if (upper.startsWith('TEL:') || upper.startsWith('TEL;')) {
          const colonIdx = line.indexOf(':');
          if (colonIdx !== -1) {
            phone = line.slice(colonIdx + 1).trim();
          }
        } else if (upper.startsWith('ORG:') || upper.startsWith('ORG;')) {
          const colonIdx = line.indexOf(':');
          if (colonIdx !== -1) {
            company = line.slice(colonIdx + 1).trim();
          }
        } else if (upper.startsWith('PHOTO:') || upper.startsWith('PHOTO;')) {
          const colonIdx = line.indexOf(':');
          if (colonIdx !== -1) {
            const photo = line.slice(colonIdx + 1).trim();
            // Only a URL-valued PHOTO becomes the contact avatar. A
            // base64-embedded photo (ENCODING=b, or a data: URI) is skipped
            // honestly: storing it as a giant data URL in the avatar column
            // would bloat the row, and no crop/upload pipeline exists to host
            // it. The import still succeeds for the rest of the card.
            if (/^https?:\/\//i.test(photo)) {
              avatar = photo;
            }
          }
        } else if (upper.startsWith('CATEGORIES:') || upper.startsWith('CATEGORIES;')) {
          const colonIdx = line.indexOf(':');
          if (colonIdx !== -1) {
            tags = line
              .slice(colonIdx + 1)
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean);
          }
        }
      }

      if (!name || !email || !email.includes('@')) {
        errors++;
        continue;
      }

      try {
        await this.addContact({
          userId,
          name,
          email,
          avatar,
          phone,
          company,
          tags,
        });
        imported++;
      } catch (err: any) {
        if (err?.code === 'CONTACT_EXISTS' || err?.statusCode === 409) {
          duplicates++;
        } else {
          errors++;
        }
      }
    }

    return { imported, duplicates, errors, total: blocks.length };
  }

  async exportCsv(userId: string): Promise<string> {
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;
    const contacts = await contactModel.findMany({ where: { userId } });
    const header = 'Name,Email,Phone,Company,Tags,IsFavorite';

    const escape = (val: string | null | undefined) => `"${(val ?? '').replace(/"/g, '""')}"`;
    const rows = contacts.map((c) =>
      [
        escape(c.name),
        escape(c.email),
        escape(c.phone),
        escape(c.company),
        escape((c.tags ?? []).join(';')),
        c.isFavorite ? 'true' : 'false',
      ].join(','),
    );

    return [header, ...rows].join('\r\n');
  }

  async importCsv(userId: string, content: string): Promise<ImportResult> {
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length <= 1) {
      return { imported: 0, duplicates: 0, errors: 0, total: 0 };
    }

    const dataLines = lines.slice(1);
    let imported = 0;
    let duplicates = 0;
    let errors = 0;

    for (const line of dataLines) {
      const fields: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          fields.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      fields.push(current.trim());

      const [name, email, phone, company, tagsRaw, isFavRaw] = fields;
      if (!name || !email || !email.includes('@')) {
        errors++;
        continue;
      }

      try {
        await this.addContact({
          userId,
          name,
          email: email.toLowerCase(),
          phone: phone || undefined,
          company: company || undefined,
          tags: tagsRaw
            ? tagsRaw
                .split(';')
                .map((t) => t.trim())
                .filter(Boolean)
            : undefined,
          isFavorite: isFavRaw?.toLowerCase() === 'true',
        });
        imported++;
      } catch (err: any) {
        if (err?.code === 'CONTACT_EXISTS' || err?.statusCode === 409) {
          duplicates++;
        } else {
          errors++;
        }
      }
    }

    return { imported, duplicates, errors, total: dataLines.length };
  }

  /**
   * The wizard preview: EXACTLY the shared merge plan (survivor-resolved,
   * post-dismissal). What the modal lists is what "Auto-Merge All" will
   * merge — they cannot diverge because both consume buildMergePlan.
   */
  async findDuplicates(userId: string): Promise<DuplicateGroup[]> {
    return (await this.findDuplicatePlan(userId)).groups;
  }

  /**
   * Wizard preview plus the plan fingerprint the client hands back to
   * POST /contacts/deduplicate for staleness detection.
   */
  async findDuplicatePlan(userId: string): Promise<{
    groups: DuplicateGroup[];
    planFingerprint: string;
  }> {
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;
    const contacts = await contactModel.findMany({ where: { userId } });

    // A pair the user explicitly marked "keep separate" must not reappear on
    // rescan. Dismissal is per pair, and it is applied inside buildMergePlan
    // AFTER survivor resolution — against the resolved survivor set, not the
    // pre-sort original primary — so the preview and the bulk executor see
    // the identical merge set.
    const dismissed = await this.getDismissedPairKeys(userId);
    const plan = buildMergePlan(contacts, dismissed);
    const byId = new Map(contacts.map((c) => [c.id, c]));
    const groups = plan.map((g) => ({
      primaryContact: g.survivor,
      duplicates: g.mergeIds.map((id) => byId.get(id)!).filter(Boolean),
      reason: g.reason,
    }));
    return { groups, planFingerprint: fingerprintMergePlan(plan) };
  }

  /**
   * Persist a "keep separate" decision for one duplicate pair. Both ids are
   * ownership-checked first — a dismissal row for a contact that is not the
   * caller's would be meaningless. Idempotent: dismissing twice is a no-op.
   */
  async dismissDuplicatePair(
    userId: string,
    contactIdA: string,
    contactIdB: string,
  ): Promise<void> {
    await this.requireOwnedContact(contactIdA, userId);
    await this.requireOwnedContact(contactIdB, userId);
    const dismissedPairModel = (
      this.prisma as unknown as { dismissedDuplicatePair: DismissedPairModel }
    ).dismissedDuplicatePair;
    await dismissedPairModel.upsert({
      where: {
        userId_pairKey: { userId, pairKey: duplicatePairKey(contactIdA, contactIdB) },
      },
      update: {},
      create: { userId, pairKey: duplicatePairKey(contactIdA, contactIdB) },
    });
  }

  private async getDismissedPairKeys(userId: string): Promise<Set<string>> {
    const dismissedPairModel = (
      this.prisma as unknown as { dismissedDuplicatePair: DismissedPairModel }
    ).dismissedDuplicatePair;
    const rows = await dismissedPairModel.findMany({ where: { userId } });
    return new Set(rows.map((row) => row.pairKey));
  }

  async mergeContacts(userId: string, primaryId: string, duplicateIds: string[]): Promise<Contact> {
    const dismissed = await this.getDismissedPairKeys(userId);
    return this.mergeContactsWithDismissals(userId, primaryId, duplicateIds, dismissed);
  }

  /**
   * mergeContacts with the caller's dismissal set already loaded (so the bulk
   * path does not re-read the table per group).
   *
   * A "keep separate" decision is a cannot-merge relationship: merging a
   * dismissed pair — directly (A into B) or transitively (both A and B into
   * a third primary P, which collapses the pair into one record) — destroys
   * the user's explicit decision. This is enforced here, at the single merge
   * entry point, so it holds for the wizard's per-cluster "Merge" (which lets
   * the user pick any survivor), for stale previews merged on a second call,
   * and across service instances — POST /contacts/merge used to bypass the
   * dismissal table entirely (#1241).
   *
   * Enforcement alone is not enough for SEQUENTIAL calls: each call checks
   * only its own ids, so A→P followed by B→P (each individually clean) would
   * still collapse the dismissed pair (A,B) into P. The merge therefore also
   * PROPAGATES dismissals: every dismissed pair naming an absorbed contact
   * is re-recorded against the survivor (A,B) becomes (P,B) when A merges
   * into P. The row lives in the dismissal table — never in memory — so it
   * holds across service instances, and it chains: a later merge of P into Q
   * propagates (P,B) to (Q,B) the same way. A dismissed pair can thus never
   * collapse no matter how many merges, in how many calls, absorb its sides.
   */
  private async mergeContactsWithDismissals(
    userId: string,
    primaryId: string,
    duplicateIds: string[],
    dismissed: Set<string>,
  ): Promise<Contact> {
    const blocked = duplicateIds.filter(
      (id) =>
        dismissed.has(duplicatePairKey(primaryId, id)) ||
        duplicateIds.some((other) => other !== id && dismissed.has(duplicatePairKey(id, other))),
    );
    if (blocked.length > 0) {
      throw createAppError(
        `Cannot merge: ${blocked.length} contact(s) are marked "keep separate" from a merge target`,
        409,
        'KEEP_SEPARATE_CONFLICT',
      );
    }

    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;
    const primary = await this.requireOwnedContact(primaryId, userId);

    const duplicates: Contact[] = [];
    for (const id of duplicateIds) {
      const dup = await this.requireOwnedContact(id, userId);
      duplicates.push(dup);
    }

    const mergedTags = Array.from(new Set([...primary.tags, ...duplicates.flatMap((d) => d.tags)]));
    const mergedPhone = primary.phone ?? duplicates.find((d) => !!d.phone)?.phone ?? null;
    const mergedCompany = primary.company ?? duplicates.find((d) => !!d.company)?.company ?? null;
    const mergedAvatar = primary.avatar ?? duplicates.find((d) => !!d.avatar)?.avatar ?? null;
    const mergedFrequency =
      primary.frequency + duplicates.reduce((sum, d) => sum + (d.frequency || 0), 0);
    const lastContactedTimes = [
      primary.lastContactedAt,
      ...duplicates.map((d) => d.lastContactedAt),
    ]
      .filter((d): d is Date => d instanceof Date)
      .map((d) => d.getTime());
    const mergedLastContacted =
      lastContactedTimes.length > 0
        ? new Date(Math.max(...lastContactedTimes))
        : primary.lastContactedAt;
    const isFavorite = primary.isFavorite || duplicates.some((d) => d.isFavorite);

    const updated = await contactModel.update({
      where: { id: primaryId },
      data: {
        tags: mergedTags,
        phone: mergedPhone,
        company: mergedCompany,
        avatar: mergedAvatar,
        frequency: mergedFrequency,
        lastContactedAt: mergedLastContacted,
        isFavorite,
      },
    });

    for (const id of duplicateIds) {
      await contactModel.delete({ where: { id } });
    }

    // Dismissal propagation (see the doc comment above): re-record every
    // dismissed pair that named an absorbed contact against the survivor, so
    // a later call cannot absorb the pair's other side into this same record.
    // This runs AFTER the deletes so a failed merge never writes a row for a
    // merge that did not happen. Pairs already naming the survivor, or both
    // sides of this same merge (already 409'd above), are skipped; upsert
    // makes re-propagation of an already-recorded pair a no-op.
    const absorbedIds = new Set(duplicateIds);
    const dismissedPairModel = (
      this.prisma as unknown as { dismissedDuplicatePair: DismissedPairModel }
    ).dismissedDuplicatePair;
    for (const key of dismissed) {
      const parts = key.split('::');
      if (parts.length !== 2) continue;
      const [first, second] = parts as [string, string];
      const absorbed = absorbedIds.has(first)
        ? first
        : absorbedIds.has(second)
          ? second
          : null;
      if (!absorbed) continue;
      const other = absorbed === first ? second : first;
      if (other === primaryId || absorbedIds.has(other)) continue;
      const propagatedKey = duplicatePairKey(primaryId, other);
      if (propagatedKey === key || dismissed.has(propagatedKey)) continue;
      await dismissedPairModel.upsert({
        where: { userId_pairKey: { userId, pairKey: propagatedKey } },
        update: {},
        create: { userId, pairKey: propagatedKey },
      });
    }

    return updated;
  }

  /**
   * Bulk "Auto-Merge All". Executes EXACTLY the shared merge plan the wizard
   * previewed (buildMergePlan) — never a wider set.
   *
   * When the caller passes the fingerprint of the plan it previewed
   * (GET /contacts/duplicates returns it), a mismatch means the underlying
   * data changed since the preview (new duplicates, new dismissals, ...) and
   * the call 409s with STALE_MERGE_PLAN instead of silently merging an
   * expanded set — the client re-previews and retries. Without a fingerprint
   * (legacy callers) the current plan is executed as-is.
   */
  async deduplicateContacts(
    userId: string,
    options?: { expectedFingerprint?: string },
  ): Promise<{ mergedCount: number; planFingerprint: string }> {
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;
    const contacts = await contactModel.findMany({ where: { userId } });

    if (!contacts || contacts.length <= 1) {
      return { mergedCount: 0, planFingerprint: fingerprintMergePlan([]) };
    }

    // A pair the user explicitly marked "keep separate" must never be
    // union-merged by the bulk path either. The dismissal set is applied
    // inside buildMergePlan, after survivor resolution, identically to the
    // wizard preview — the two paths cannot diverge.
    const dismissed = await this.getDismissedPairKeys(userId);
    const plan = buildMergePlan(contacts, dismissed);
    const planFingerprint = fingerprintMergePlan(plan);

    if (options?.expectedFingerprint && options.expectedFingerprint !== planFingerprint) {
      throw createAppError(
        'Duplicate merge plan changed since the preview — please review the updated list and try again',
        409,
        'STALE_MERGE_PLAN',
        { planFingerprint },
      );
    }

    let mergedCount = 0;
    for (const group of plan) {
      await this.mergeContactsWithDismissals(userId, group.survivor.id, group.mergeIds, dismissed);
      mergedCount += group.mergeIds.length;
    }

    return { mergedCount, planFingerprint };
  }

  async importBatch(
    userId: string,
    content: string,
    format?: 'csv' | 'vcard',
  ): Promise<{ importedCount: number; errors: string[] }> {
    const isVCard = format === 'vcard' || (format !== 'csv' && /BEGIN:VCARD/i.test(content));
    const errors: string[] = [];
    const parsed: Array<{
      name: string;
      email: string;
      phone?: string | null;
      company?: string | null;
      avatar?: string | null;
      tags: string[];
    }> = [];

    if (isVCard) {
      const blocks = content.split(/BEGIN:VCARD/i).slice(1);
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]!;
        let name = '';
        let email = '';
        let phone: string | undefined;
        let company: string | undefined;
        let avatar: string | undefined;
        const tags: string[] = [];

        const lines = block.split(/\r?\n/);
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          const upper = line.toUpperCase();
          if (upper.startsWith('FN:')) {
            name = line.slice(3).trim();
          } else if (upper.startsWith('EMAIL:') || upper.startsWith('EMAIL;')) {
            const colonIdx = line.indexOf(':');
            if (colonIdx !== -1) {
              email = line
                .slice(colonIdx + 1)
                .trim()
                .toLowerCase();
            }
          } else if (upper.startsWith('TEL:') || upper.startsWith('TEL;')) {
            const colonIdx = line.indexOf(':');
            if (colonIdx !== -1) {
              phone = line.slice(colonIdx + 1).trim();
            }
          } else if (upper.startsWith('ORG:') || upper.startsWith('ORG;')) {
            const colonIdx = line.indexOf(':');
            if (colonIdx !== -1) {
              company = line.slice(colonIdx + 1).trim();
            }
          } else if (upper.startsWith('CATEGORIES:') || upper.startsWith('CATEGORIES;')) {
            const colonIdx = line.indexOf(':');
            if (colonIdx !== -1) {
              const cat = line
                .slice(colonIdx + 1)
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);
              tags.push(...cat);
            }
          } else if (upper.startsWith('NOTE:') || upper.startsWith('NOTE;')) {
            const colonIdx = line.indexOf(':');
            if (colonIdx !== -1) {
              const note = line.slice(colonIdx + 1).trim();
              if (note) tags.push(note);
            }
          } else if (upper.startsWith('PHOTO:') || upper.startsWith('PHOTO;')) {
            const colonIdx = line.indexOf(':');
            if (colonIdx !== -1) {
              const photo = line.slice(colonIdx + 1).trim();
              // Same rule as importVCard: only URL-valued PHOTO becomes the
              // avatar; base64-embedded photos are skipped honestly.
              if (/^https?:\/\//i.test(photo)) {
                avatar = photo;
              }
            }
          }
        }

        if (!email || !email.includes('@')) {
          errors.push(`vCard entry ${i + 1}: Missing or invalid email`);
          continue;
        }

        parsed.push({
          name: name || email.split('@')[0] || 'Unknown',
          email,
          phone: phone || null,
          company: company || null,
          avatar: avatar || null,
          tags: Array.from(new Set(tags)),
        });
      }
    } else {
      const lines = content
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) {
        return { importedCount: 0, errors: ['CSV content is empty'] };
      }

      const parseCsvLine = (line: string): string[] => {
        const fields: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            fields.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        fields.push(current.trim());
        return fields;
      };

      const firstRow = parseCsvLine(lines[0]!);
      const isHeader = firstRow.some((h) =>
        ['name', 'email', 'phone', 'company', 'notes', 'tags'].includes(h.toLowerCase().trim()),
      );

      let nameIdx = 0;
      let emailIdx = 1;
      let phoneIdx = 2;
      let companyIdx = 3;
      let notesIdx = 4;
      let tagsIdx = 5;

      let dataLines = lines;
      if (isHeader) {
        const header = firstRow.map((h) => h.toLowerCase().trim());
        if (header.indexOf('name') !== -1) nameIdx = header.indexOf('name');
        if (header.indexOf('email') !== -1) emailIdx = header.indexOf('email');
        if (header.indexOf('phone') !== -1) phoneIdx = header.indexOf('phone');
        if (header.indexOf('company') !== -1) companyIdx = header.indexOf('company');
        if (header.indexOf('notes') !== -1) notesIdx = header.indexOf('notes');
        if (header.indexOf('tags') !== -1) tagsIdx = header.indexOf('tags');
        dataLines = lines.slice(1);
      }

      for (let i = 0; i < dataLines.length; i++) {
        const row = parseCsvLine(dataLines[i]!);
        const rawEmail = (row[emailIdx] ?? '').trim().toLowerCase();
        const rawName = (row[nameIdx] ?? '').trim();
        const rawPhone = (row[phoneIdx] ?? '').trim();
        const rawCompany = (row[companyIdx] ?? '').trim();
        const rawNotes = (row[notesIdx] ?? '').trim();
        const rawTags = (row[tagsIdx] ?? '').trim();

        if (!rawEmail || !rawEmail.includes('@')) {
          errors.push(`Row ${i + 1}: Invalid email address "${rawEmail}"`);
          continue;
        }

        const tags: string[] = [];
        if (rawTags) {
          tags.push(
            ...rawTags
              .split(/[;,]/)
              .map((t) => t.trim())
              .filter(Boolean),
          );
        }
        if (rawNotes) {
          tags.push(rawNotes);
        }

        parsed.push({
          name: rawName || rawEmail.split('@')[0] || 'Unknown',
          email: rawEmail,
          phone: rawPhone || null,
          company: rawCompany || null,
          tags: Array.from(new Set(tags)),
        });
      }
    }

    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;
    let importedCount = 0;

    const uniqueByEmail = new Map<string, (typeof parsed)[0]>();
    for (const item of parsed) {
      if (!uniqueByEmail.has(item.email)) {
        uniqueByEmail.set(item.email, item);
      }
    }

    const items = Array.from(uniqueByEmail.values());

    for (const item of items) {
      try {
        const existing = await contactModel.findFirst({
          where: { userId, email: item.email },
        });

        if (existing) {
          await contactModel.update({
            where: { id: existing.id },
            data: {
              name: existing.name || item.name,
              phone: existing.phone || item.phone,
              company: existing.company || item.company,
              avatar: existing.avatar || item.avatar || null,
              tags: Array.from(new Set([...existing.tags, ...item.tags])),
            },
          });
          importedCount++;
        } else {
          await contactModel.create({
            data: {
              userId,
              name: item.name,
              email: item.email,
              phone: item.phone,
              company: item.company,
              avatar: item.avatar || null,
              tags: item.tags,
              isFavorite: false,
              frequency: 0,
            },
          });
          importedCount++;
        }
      } catch (err: any) {
        errors.push(`Failed to insert contact "${item.email}": ${err.message || String(err)}`);
      }
    }

    return { importedCount, errors };
  }
}

// The projection getContactSuggestions scans: only the columns the
// aggregation touches, never bodies or attachments.
interface SuggestionEmailRow {
  fromAddress: string;
  fromName: string | null;
  toAddresses: unknown;
  ccAddresses: unknown;
  bccAddresses: unknown;
  isSent: boolean;
  receivedAt: Date | null;
  createdAt: Date | null;
}

// Type helper for Prisma contact model operations
interface ContactModel {
  findFirst(args: unknown): Promise<Contact | null>;
  findUnique(args: unknown): Promise<Contact | null>;
  /**
   * A `select` projection returns the selected columns, not a whole `Contact` —
   * so it gets its own signature rather than a cast at the call site. Overload
   * order matters: this one is tried first and only matches an argument that
   * actually carries `select`, so every existing whole-row call still resolves to
   * the signature below it.
   */
  findMany(args: { where: unknown; select: { email: true } }): Promise<Array<{ email: string }>>;
  findMany(args: {
    where: unknown;
    select: { name: true; email: true };
  }): Promise<Array<{ name: string; email: string }>>;
  findMany(args: unknown): Promise<Contact[]>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<Contact>;
  update(args: unknown): Promise<Contact>;
  upsert(args: unknown): Promise<Contact>;
  delete(args: unknown): Promise<Contact>;
}

interface DismissedPairModel {
  findMany(args: unknown): Promise<Array<{ pairKey: string }>>;
  upsert(args: unknown): Promise<unknown>;
}
