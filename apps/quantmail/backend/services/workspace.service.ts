// ============================================================================
// QuantMail — Workspace collaboration service
// ----------------------------------------------------------------------------
// A "workspace" is an Organization row: a shared space that people from
// *different* email addresses join (by emailed invite) to work on one project
// together. Roles are OWNER > ADMIN > MEMBER > VIEWER.
// ============================================================================

import { createHash, randomBytes } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import { sendViaSes } from '../lib/ses-sender';

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

const ROLE_RANK: Record<WorkspaceRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

const INVITE_TTL_DAYS = 14;

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  plan: string;
  role: WorkspaceRole;
  memberCount: number;
  pendingInviteCount: number;
  joinedAt: Date;
  createdAt: Date;
}

export interface WorkspaceMemberView {
  id: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: Date;
  email: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  isYou: boolean;
}

export interface WorkspaceInviteView {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: string;
  message: string | null;
  invitedByName: string | null;
  expiresAt: Date;
  lastSentAt: Date;
  sendCount: number;
  createdAt: Date;
  /** Only present right after create/resend — the raw token is never stored. */
  inviteUrl?: string;
}

/* -------------------------------------------------------------------------- */

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'workspace';
}

function appUrl(): string {
  return (
    process.env['WORKSPACE_APP_URL'] ??
    process.env['NEXT_PUBLIC_APP_URL'] ??
    'https://quantmail.quantrinity.in'
  ).replace(/\/$/, '');
}

function inviteFrom(): string {
  return process.env['WORKSPACE_INVITE_FROM'] ?? 'QuantMail <no-reply@quantmail.in>';
}

function inviteEmailHtml(opts: {
  workspaceName: string;
  inviterName: string;
  role: WorkspaceRole;
  message: string | null;
  url: string;
  expiresAt: Date;
}): string {
  const safeMessage = opts.message
    ? `<p style="margin:0 0 18px;padding:14px 16px;border-left:2px solid #22d3ee;background:#0f172a;color:#cbd5e1;font-size:14px;line-height:1.6;border-radius:6px">${opts.message
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#0b1120;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <div style="border:1px solid #1e293b;border-radius:16px;background:#0f172a;padding:32px">
      <div style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;border-radius:9px;background:rgba(34,211,238,.14);color:#22d3ee;font-weight:700;font-family:ui-monospace,monospace">Q</div>
      <h1 style="margin:22px 0 10px;color:#f1f5f9;font-size:22px;line-height:1.3">You're invited to <strong>${opts.workspaceName}</strong></h1>
      <p style="margin:0 0 18px;color:#94a3b8;font-size:14px;line-height:1.6">
        ${opts.inviterName} added you as <strong style="color:#e2e8f0">${opts.role.toLowerCase()}</strong> in the
        ${opts.workspaceName} workspace on QuantMail. Accept the invite to collaborate on the same project —
        mail, drive, calendar and CodeHub, all in one place.
      </p>
      ${safeMessage}
      <a href="${opts.url}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#22d3ee;color:#06202b;font-weight:600;font-size:14px;text-decoration:none">Accept invitation</a>
      <p style="margin:22px 0 0;color:#64748b;font-size:12px;line-height:1.6">
        Or paste this link in your browser:<br><span style="color:#94a3b8;word-break:break-all">${opts.url}</span><br><br>
        This invitation expires on ${opts.expiresAt.toUTCString()}.
      </p>
    </div>
  </div></body></html>`;
}

/* -------------------------------------------------------------------------- */

// The generated Prisma client is typed at build time in the app package; the
// backend services intentionally take a loose client (same pattern as the other
// services in this folder).
type Db = any;

export class WorkspaceService {
  constructor(private readonly prisma: Db) {}

  /* ------------------------------------------------------------ membership */

  async requireMembership(orgId: string, userId: string, minimum: WorkspaceRole = 'VIEWER') {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
    if (!membership) {
      throw createAppError('Workspace not found.', 404, 'WORKSPACE_NOT_FOUND');
    }
    if (ROLE_RANK[membership.role as WorkspaceRole] < ROLE_RANK[minimum]) {
      throw createAppError(
        `This action requires the ${minimum.toLowerCase()} role.`,
        403,
        'INSUFFICIENT_ROLE',
      );
    }
    return membership;
  }

  /* -------------------------------------------------------------- queries */

  async listWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      include: { org: { include: { _count: { select: { members: true } } } } },
      orderBy: { joinedAt: 'asc' },
    });

    const orgIds = memberships.map((m: any) => m.orgId);
    const pending = orgIds.length
      ? await this.prisma.workspaceInvite.groupBy({
          by: ['orgId'],
          where: { orgId: { in: orgIds }, status: 'PENDING' },
          _count: { _all: true },
        })
      : [];
    const pendingByOrg = new Map<string, number>(
      pending.map((row: any) => [row.orgId, row._count._all]),
    );

    return memberships.map((m: any) => ({
      id: m.org.id,
      name: m.org.name,
      slug: m.org.slug,
      description: m.org.description ?? null,
      plan: m.org.plan,
      role: m.role,
      memberCount: m.org._count.members,
      pendingInviteCount: pendingByOrg.get(m.orgId) ?? 0,
      joinedAt: m.joinedAt,
      createdAt: m.org.createdAt,
    }));
  }

  async getWorkspace(orgId: string, userId: string) {
    const membership = await this.requireMembership(orgId, userId);
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw createAppError('Workspace not found.', 404, 'WORKSPACE_NOT_FOUND');

    const members = await this.listMembers(orgId, userId);
    const invites =
      ROLE_RANK[membership.role as WorkspaceRole] >= ROLE_RANK['ADMIN']
        ? await this.listInvites(orgId, userId)
        : [];

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      description: org.description ?? null,
      plan: org.plan,
      createdAt: org.createdAt,
      role: membership.role as WorkspaceRole,
      members,
      invites,
    };
  }

  async listMembers(orgId: string, userId: string): Promise<WorkspaceMemberView[]> {
    await this.requireMembership(orgId, userId);
    const members = await this.prisma.organizationMember.findMany({
      where: { orgId },
      orderBy: { joinedAt: 'asc' },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: members.map((m: any) => m.userId) } },
      select: { id: true, email: true, displayName: true, username: true, avatarUrl: true },
    });
    const byId = new Map(users.map((u: any) => [u.id, u]));

    return members.map((m: any) => {
      const user = byId.get(m.userId) as any;
      return {
        id: m.id,
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        email: user?.email ?? 'unknown',
        displayName: user?.displayName ?? user?.username ?? 'Removed user',
        username: user?.username ?? '',
        avatarUrl: user?.avatarUrl ?? null,
        isYou: m.userId === userId,
      };
    });
  }

  /* -------------------------------------------------------------- mutation */

  async createWorkspace(
    userId: string,
    input: { name: string; description?: string },
  ): Promise<WorkspaceSummary> {
    const base = slugify(input.name);
    let slug = base;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const clash = await this.prisma.organization.findUnique({ where: { slug } });
      if (!clash) break;
      slug = `${base}-${randomBytes(2).toString('hex')}`;
    }

    const org = await this.prisma.organization.create({
      data: {
        name: input.name.trim(),
        slug,
        description: input.description?.trim() || null,
        createdById: userId,
        members: { create: { userId, role: 'OWNER' } },
      },
    });

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      description: org.description ?? null,
      plan: org.plan,
      role: 'OWNER',
      memberCount: 1,
      pendingInviteCount: 0,
      joinedAt: org.createdAt,
      createdAt: org.createdAt,
    };
  }

  async updateWorkspace(
    orgId: string,
    userId: string,
    input: { name?: string; description?: string | null },
  ) {
    await this.requireMembership(orgId, userId, 'ADMIN');
    return this.prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
      },
    });
  }

  async deleteWorkspace(orgId: string, userId: string) {
    await this.requireMembership(orgId, userId, 'OWNER');
    await this.prisma.organization.delete({ where: { id: orgId } });
    return { deleted: true };
  }

  async updateMemberRole(
    orgId: string,
    actorId: string,
    memberId: string,
    role: WorkspaceRole,
  ): Promise<WorkspaceMemberView[]> {
    const actor = await this.requireMembership(orgId, actorId, 'ADMIN');
    const target = await this.prisma.organizationMember.findFirst({ where: { id: memberId, orgId } });
    if (!target) throw createAppError('Member not found.', 404, 'MEMBER_NOT_FOUND');

    if (role === 'OWNER' || target.role === 'OWNER') {
      if (actor.role !== 'OWNER') {
        throw createAppError('Only the owner can transfer ownership.', 403, 'OWNER_ONLY');
      }
    }

    if (role === 'OWNER') {
      // Ownership transfer: promote the target, demote the acting owner to admin.
      await this.prisma.$transaction([
        this.prisma.organizationMember.update({ where: { id: memberId }, data: { role: 'OWNER' } }),
        this.prisma.organizationMember.update({ where: { id: actor.id }, data: { role: 'ADMIN' } }),
      ]);
    } else {
      if (target.role === 'OWNER') {
        throw createAppError(
          'Transfer ownership to someone else before changing the owner role.',
          400,
          'OWNER_REQUIRED',
        );
      }
      await this.prisma.organizationMember.update({ where: { id: memberId }, data: { role } });
    }

    return this.listMembers(orgId, actorId);
  }

  async removeMember(orgId: string, actorId: string, memberId: string) {
    const actor = await this.requireMembership(orgId, actorId, 'ADMIN');
    const target = await this.prisma.organizationMember.findFirst({ where: { id: memberId, orgId } });
    if (!target) throw createAppError('Member not found.', 404, 'MEMBER_NOT_FOUND');
    if (target.role === 'OWNER') {
      throw createAppError('The workspace owner cannot be removed.', 400, 'OWNER_PROTECTED');
    }
    if (target.userId === actor.userId) {
      throw createAppError('Use "leave workspace" to remove yourself.', 400, 'USE_LEAVE');
    }
    await this.prisma.organizationMember.delete({ where: { id: memberId } });
    return { removed: true };
  }

  async leaveWorkspace(orgId: string, userId: string) {
    const membership = await this.requireMembership(orgId, userId);
    if (membership.role === 'OWNER') {
      throw createAppError(
        'Transfer ownership before leaving this workspace.',
        400,
        'OWNER_CANNOT_LEAVE',
      );
    }
    await this.prisma.organizationMember.delete({ where: { id: membership.id } });
    return { left: true };
  }

  /* --------------------------------------------------------------- invites */

  async listInvites(orgId: string, userId: string): Promise<WorkspaceInviteView[]> {
    await this.requireMembership(orgId, userId, 'ADMIN');
    await this.expireStaleInvites(orgId);

    const invites = await this.prisma.workspaceInvite.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const inviters = await this.prisma.user.findMany({
      where: { id: { in: invites.map((i: any) => i.invitedById) } },
      select: { id: true, displayName: true, email: true },
    });
    const byId = new Map(inviters.map((u: any) => [u.id, u]));

    return invites.map((invite: any) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      message: invite.message ?? null,
      invitedByName:
        (byId.get(invite.invitedById) as any)?.displayName ??
        (byId.get(invite.invitedById) as any)?.email ??
        null,
      expiresAt: invite.expiresAt,
      lastSentAt: invite.lastSentAt,
      sendCount: invite.sendCount,
      createdAt: invite.createdAt,
    }));
  }

  async createInvites(
    orgId: string,
    actorId: string,
    input: { emails: string[]; role: WorkspaceRole; message?: string },
  ) {
    await this.requireMembership(orgId, actorId, 'ADMIN');
    if (input.role === 'OWNER') {
      throw createAppError('Owners cannot be invited — transfer ownership instead.', 400, 'BAD_ROLE');
    }

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw createAppError('Workspace not found.', 404, 'WORKSPACE_NOT_FOUND');
    const inviter = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { displayName: true, email: true },
    });

    const emails = [...new Set(input.emails.map(normalizeEmail))].filter(Boolean);
    const results: Array<{
      email: string;
      status: 'invited' | 'already_member' | 'failed';
      inviteId?: string;
      inviteUrl?: string;
      emailSent?: boolean;
      reason?: string;
    }> = [];

    for (const email of emails) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existingUser) {
        const alreadyMember = await this.prisma.organizationMember.findUnique({
          where: { orgId_userId: { orgId, userId: existingUser.id } },
        });
        if (alreadyMember) {
          results.push({ email, status: 'already_member' });
          continue;
        }
      }

      // One live invite per email per workspace: supersede any earlier pending one.
      await this.prisma.workspaceInvite.updateMany({
        where: { orgId, email, status: 'PENDING' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
      const invite = await this.prisma.workspaceInvite.create({
        data: {
          orgId,
          email,
          role: input.role,
          tokenHash: hashToken(token),
          message: input.message?.trim() || null,
          invitedById: actorId,
          expiresAt,
        },
      });

      const url = `${appUrl()}/invite/${token}`;
      const emailSent = await this.sendInviteEmail({
        to: email,
        workspaceName: org.name,
        inviterName: inviter?.displayName ?? inviter?.email ?? 'A teammate',
        role: input.role,
        message: invite.message,
        url,
        expiresAt,
      });

      results.push({ email, status: 'invited', inviteId: invite.id, inviteUrl: url, emailSent });
    }

    return { results, invites: await this.listInvites(orgId, actorId) };
  }

  async resendInvite(orgId: string, actorId: string, inviteId: string) {
    await this.requireMembership(orgId, actorId, 'ADMIN');
    const invite = await this.prisma.workspaceInvite.findFirst({ where: { id: inviteId, orgId } });
    if (!invite) throw createAppError('Invitation not found.', 404, 'INVITE_NOT_FOUND');
    if (invite.status === 'ACCEPTED') {
      throw createAppError('That invitation was already accepted.', 400, 'INVITE_ACCEPTED');
    }

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    const inviter = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { displayName: true, email: true },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.workspaceInvite.update({
      where: { id: inviteId },
      data: {
        tokenHash: hashToken(token),
        status: 'PENDING',
        expiresAt,
        revokedAt: null,
        lastSentAt: new Date(),
        sendCount: { increment: 1 },
      },
    });

    const url = `${appUrl()}/invite/${token}`;
    const emailSent = await this.sendInviteEmail({
      to: invite.email,
      workspaceName: org?.name ?? 'QuantMail workspace',
      inviterName: inviter?.displayName ?? inviter?.email ?? 'A teammate',
      role: invite.role,
      message: invite.message,
      url,
      expiresAt,
    });

    return { inviteId, inviteUrl: url, emailSent };
  }

  async revokeInvite(orgId: string, actorId: string, inviteId: string) {
    await this.requireMembership(orgId, actorId, 'ADMIN');
    const invite = await this.prisma.workspaceInvite.findFirst({ where: { id: inviteId, orgId } });
    if (!invite) throw createAppError('Invitation not found.', 404, 'INVITE_NOT_FOUND');
    await this.prisma.workspaceInvite.update({
      where: { id: inviteId },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    return { revoked: true };
  }

  /** Invite preview for the accept screen — safe subset, no member list. */
  async previewInvite(token: string) {
    const invite = await this.prisma.workspaceInvite.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!invite) throw createAppError('This invitation link is not valid.', 404, 'INVITE_NOT_FOUND');

    const expired = invite.status === 'PENDING' && invite.expiresAt.getTime() < Date.now();
    const org = await this.prisma.organization.findUnique({ where: { id: invite.orgId } });
    const inviter = await this.prisma.user.findUnique({
      where: { id: invite.invitedById },
      select: { displayName: true, email: true, avatarUrl: true },
    });
    const memberCount = await this.prisma.organizationMember.count({ where: { orgId: invite.orgId } });

    return {
      email: invite.email,
      role: invite.role as WorkspaceRole,
      status: expired ? 'EXPIRED' : invite.status,
      message: invite.message ?? null,
      expiresAt: invite.expiresAt,
      workspace: {
        id: invite.orgId,
        name: org?.name ?? 'Workspace',
        slug: org?.slug ?? '',
        description: org?.description ?? null,
        memberCount,
      },
      invitedBy: {
        name: inviter?.displayName ?? inviter?.email ?? 'A teammate',
        email: inviter?.email ?? null,
        avatarUrl: inviter?.avatarUrl ?? null,
      },
    };
  }

  async acceptInvite(token: string, userId: string) {
    const invite = await this.prisma.workspaceInvite.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!invite) throw createAppError('This invitation link is not valid.', 404, 'INVITE_NOT_FOUND');
    if (invite.status === 'REVOKED') {
      throw createAppError('This invitation was revoked.', 410, 'INVITE_REVOKED');
    }
    if (invite.status === 'ACCEPTED') {
      throw createAppError('This invitation was already used.', 410, 'INVITE_ACCEPTED');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await this.prisma.workspaceInvite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      });
      throw createAppError('This invitation has expired. Ask for a new one.', 410, 'INVITE_EXPIRED');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw createAppError('Authentication required.', 401, 'UNAUTHORIZED');
    if (normalizeEmail(user.email) !== invite.email) {
      throw createAppError(
        `This invitation was sent to ${invite.email}. Sign in with that address to accept it.`,
        403,
        'INVITE_EMAIL_MISMATCH',
      );
    }

    const existing = await this.prisma.organizationMember.findUnique({
      where: { orgId_userId: { orgId: invite.orgId, userId } },
    });
    if (!existing) {
      await this.prisma.organizationMember.create({
        data: {
          orgId: invite.orgId,
          userId,
          role: invite.role,
          invitedById: invite.invitedById,
        },
      });
    }
    await this.prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedById: userId },
    });

    return { workspaceId: invite.orgId, role: invite.role as WorkspaceRole };
  }

  /* --------------------------------------------------------------- helpers */

  private async expireStaleInvites(orgId: string): Promise<void> {
    await this.prisma.workspaceInvite.updateMany({
      where: { orgId, status: 'PENDING', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
  }

  private async sendInviteEmail(opts: {
    to: string;
    workspaceName: string;
    inviterName: string;
    role: WorkspaceRole;
    message: string | null;
    url: string;
    expiresAt: Date;
  }): Promise<boolean> {
    try {
      await sendViaSes({
        from: inviteFrom(),
        to: [opts.to],
        subject: `${opts.inviterName} invited you to ${opts.workspaceName} on QuantMail`,
        bodyText: `${opts.inviterName} invited you to join the ${opts.workspaceName} workspace as ${opts.role.toLowerCase()}.\n\nAccept: ${opts.url}\n\nThis link expires on ${opts.expiresAt.toUTCString()}.`,
        bodyHtml: inviteEmailHtml({
          workspaceName: opts.workspaceName,
          inviterName: opts.inviterName,
          role: opts.role,
          message: opts.message,
          url: opts.url,
          expiresAt: opts.expiresAt,
        }),
      });
      return true;
    } catch (error) {
      // Invite still exists and the link works — email delivery is best-effort
      // (SES sandbox blocks unverified recipients).
      // eslint-disable-next-line no-console
      console.error('[workspace] invite email failed', error);
      return false;
    }
  }
}
