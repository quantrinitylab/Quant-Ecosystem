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

  async deleteContact(contactId: string, userId: string): Promise<Contact> {
    const contactModel = (this.prisma as unknown as { contact: ContactModel }).contact;

    await this.requireOwnedContact(contactId, userId);

    return contactModel.delete({ where: { id: contactId } });
  }
}

// Type helper for Prisma contact model operations
interface ContactModel {
  findFirst(args: unknown): Promise<Contact | null>;
  findUnique(args: unknown): Promise<Contact | null>;
  findMany(args: unknown): Promise<Contact[]>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<Contact>;
  update(args: unknown): Promise<Contact>;
  upsert(args: unknown): Promise<Contact>;
  delete(args: unknown): Promise<Contact>;
}
