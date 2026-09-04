import type { PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';

export interface ContactGroup {
  id: string;
  userId: string;
  name: string;
  /** Trimmed, lowercased, de-duplicated. See {@link normalizeEmails}. */
  emails: string[];
  color?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactGroupWritableFields {
  name?: string;
  emails?: string[];
  color?: string | null;
}

export interface CreateContactGroupInput extends ContactGroupWritableFields {
  userId: string;
  name: string;
}

/**
 * Named sets of addresses the user writes to as a unit.
 *
 * The shape mirrors {@link ContactService} deliberately — same 404-then-403
 * ownership order, same empty-patch rejection — because the two are read
 * side by side and a reader should not have to check whether the rules changed.
 */
export class ContactGroupService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Trim, lowercase and de-duplicate, first spelling wins.
   *
   * Lowercased because a group is a set of people, and `Ann@x.com` typed today
   * plus `ann@x.com` typed tomorrow is one person: storing both would send the
   * same message twice and show a member count that is a lie. This matches
   * `ContactService.listContactEmails`, which folds on read so a client's
   * membership test matches either spelling of a contact row.
   *
   * Empty strings are dropped rather than rejected — but note that over HTTP the
   * route never lets one through: `z.string().trim().email()` 400s a blank member
   * before this runs. The fold is here for a direct service caller, and so that
   * this method is total on its own input; it is not a promise the API makes.
   */
  private static normalizeEmails(emails: readonly string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of emails) {
      if (typeof raw !== 'string') continue;
      const email = raw.trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      out.push(email);
    }
    return out;
  }

  private get model() {
    return (this.prisma as unknown as { contactGroup: ContactGroupModel }).contactGroup;
  }

  /**
   * Reject a name that already exists for this user, case-insensitively.
   *
   * `@@unique([userId, name])` only catches an exact repeat, and `Family` next to
   * `family` in a chip row is two controls a reader cannot tell apart. Excluding
   * `exceptId` so renaming a group to its own name — which the editor sends every
   * time the name field is untouched — is not a conflict with itself.
   */
  private async assertNameFree(userId: string, name: string, exceptId?: string): Promise<void> {
    const clash = await this.model.findFirst({
      where: {
        userId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
    });

    if (clash) {
      throw createAppError(`You already have a group called "${clash.name}"`, 409, 'GROUP_EXISTS');
    }
  }

  /**
   * Every group, alphabetically.
   *
   * Unpaginated on purpose. These render as a chip strip that the user built by
   * hand, one at a time — a page-two of groups the strip does not show is a
   * group the user cannot reach, and there is no plausible book of them large
   * enough for the payload to matter.
   */
  async listGroups(userId: string): Promise<ContactGroup[]> {
    return this.model.findMany({ where: { userId }, orderBy: [{ name: 'asc' }] });
  }

  async createGroup(input: CreateContactGroupInput): Promise<ContactGroup> {
    const name = input.name.trim();
    await this.assertNameFree(input.userId, name);

    return this.model.create({
      data: {
        userId: input.userId,
        name,
        emails: ContactGroupService.normalizeEmails(input.emails ?? []),
        color: input.color ?? null,
      },
    });
  }

  /**
   * Load one group, proving it belongs to the caller.
   *
   * 404 before 403, like `ContactService.requireOwnedContact`: checking ownership
   * first would confirm, via the 403, that somebody else's id is real.
   */
  private async requireOwnedGroup(groupId: string, userId: string): Promise<ContactGroup> {
    const group = await this.model.findUnique({ where: { id: groupId } });

    if (!group) {
      throw createAppError('Group not found', 404, 'GROUP_NOT_FOUND');
    }

    if (group.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    return group;
  }

  async getGroup(groupId: string, userId: string): Promise<ContactGroup> {
    return this.requireOwnedGroup(groupId, userId);
  }

  /**
   * Patch a group. `emails` is a full replacement, not a merge — the editor
   * always holds the whole member list, and an add/remove pair of endpoints would
   * make two clients editing the same group silently interleave.
   */
  async updateGroup(
    groupId: string,
    userId: string,
    data: ContactGroupWritableFields,
  ): Promise<ContactGroup> {
    await this.requireOwnedGroup(groupId, userId);

    if (Object.keys(data).length === 0) {
      throw createAppError('No updatable fields were supplied', 400, 'EMPTY_UPDATE');
    }

    const patch: Record<string, unknown> = {};

    if (data.name !== undefined) {
      const name = data.name.trim();
      await this.assertNameFree(userId, name, groupId);
      patch.name = name;
    }

    if (data.emails !== undefined) {
      patch.emails = ContactGroupService.normalizeEmails(data.emails);
    }

    if (data.color !== undefined) {
      patch.color = data.color;
    }

    return this.model.update({ where: { id: groupId }, data: patch });
  }

  async deleteGroup(groupId: string, userId: string): Promise<ContactGroup> {
    await this.requireOwnedGroup(groupId, userId);
    return this.model.delete({ where: { id: groupId } });
  }
}

/** Type helper for Prisma contactGroup model operations. */
interface ContactGroupModel {
  findFirst(args: unknown): Promise<ContactGroup | null>;
  findUnique(args: unknown): Promise<ContactGroup | null>;
  findMany(args: unknown): Promise<ContactGroup[]>;
  create(args: unknown): Promise<ContactGroup>;
  update(args: unknown): Promise<ContactGroup>;
  delete(args: unknown): Promise<ContactGroup>;
}
