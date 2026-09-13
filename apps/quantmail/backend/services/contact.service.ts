import type { PrismaClient } from '@prisma/client';
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

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

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

export class ContactService {
  constructor(private readonly prisma: PrismaClient) {}

  async addContact(input: AddContactInput): Promise<Contact> {
    const existing = await (this.prisma as unknown as { contact: ContactModel }).contact.findFirst({
      where: { userId: input.userId, email: input.email },
    });

    if (existing) {
      throw createAppError('Contact with this email already exists', 409, 'CONTACT_EXISTS');
    }

    return (this.prisma as unknown as { contact: ContactModel }).contact.create({
      data: {
        userId: input.userId,
        name: input.name,
        email: input.email,
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

  async searchContacts(userId: string, query: string): Promise<Contact[]> {
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;

    return contactModel.findMany({
      where: {
        userId,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 10,
      orderBy: { frequency: 'desc' },
    });
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

    return contactModel.update({
      where: { id: contactId },
      data,
    });
  }

  /**
   * Record an interaction with a contact (e.g. when an email is sent to them).
   * Upserts the contact keyed by the (userId, email) unique constraint:
   *  - on create: frequency starts at 1 (and name is stored if provided)
   *  - on update: frequency is incremented by 1 (and name refreshed if provided)
   *
   * This is the write path that finally makes the previously-dead `frequency`
   * field meaningful, powering "frequently contacted" ordering.
   */
  async recordInteraction(userId: string, email: string, name?: string): Promise<Contact> {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      throw createAppError('Email is required', 400, 'INVALID_EMAIL');
    }

    const trimmedName = name?.trim();
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;
    const now = new Date();

    return contactModel.upsert({
      where: { userId_email: { userId, email: normalizedEmail } },
      create: {
        userId,
        email: normalizedEmail,
        name: trimmedName && trimmedName.length > 0 ? trimmedName : normalizedEmail,
        frequency: 1,
        lastContactedAt: now,
      },
      update: {
        frequency: { increment: 1 },
        lastContactedAt: now,
        ...(trimmedName && trimmedName.length > 0 ? { name: trimmedName } : {}),
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

  async findDuplicates(userId: string): Promise<DuplicateGroup[]> {
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;
    const contacts = await contactModel.findMany({ where: { userId } });

    const groups: DuplicateGroup[] = [];
    const groupedIds = new Set<string>();

    // 1. Group by email (case-insensitive)
    const byEmail = new Map<string, Contact[]>();
    for (const c of contacts) {
      const email = c.email.trim().toLowerCase();
      const list = byEmail.get(email) ?? [];
      list.push(c);
      byEmail.set(email, list);
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
      const name = c.name.trim().toLowerCase();
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

  async mergeContacts(userId: string, primaryId: string, duplicateIds: string[]): Promise<Contact> {
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

    return updated;
  }
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
  findMany(args: unknown): Promise<Contact[]>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<Contact>;
  update(args: unknown): Promise<Contact>;
  upsert(args: unknown): Promise<Contact>;
  delete(args: unknown): Promise<Contact>;
}
