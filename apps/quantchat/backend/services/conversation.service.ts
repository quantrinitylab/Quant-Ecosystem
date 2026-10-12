import type { PrismaClient, Conversation, ConversationMember } from '@prisma/client';
import { Prisma, ConversationType, ConversationRole } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { getPrivacyService, type PrivacyService } from './privacy.service';

/** Map the public (lowercase) conversation-type string to the Prisma enum. */
function toConversationType(type: string): ConversationType {
  switch (type) {
    case 'group':
      return ConversationType.GROUP;
    case 'channel':
      return ConversationType.CHANNEL;
    default:
      return ConversationType.DIRECT;
  }
}

/** Map a role string (any case) to the Prisma `ConversationRole` enum. */
function toConversationRole(role: string): ConversationRole {
  switch (role.toUpperCase()) {
    case 'OWNER':
      return ConversationRole.OWNER;
    case 'ADMIN':
      return ConversationRole.ADMIN;
    default:
      return ConversationRole.MEMBER;
  }
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
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

export interface CreateConversationInput {
  creatorId: string;
  participantIds: string[];
  type: 'direct' | 'group';
  name?: string;
  description?: string;
}

export interface UpdateConversationInput {
  name?: string;
  description?: string;
  isArchived?: boolean;
}

/**
 * QM-CHAT-001: public participant shape consumed by the web client
 * (apps/quantchat/src/types ConversationParticipant). The backend previously
 * returned raw Prisma conversation records with NO participants array, which
 * crashed the /chat/[id] page ("Cannot read properties of undefined
 * (reading 'find')"). Both read paths now always include this array.
 */
export interface ConversationParticipantDto {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  role: 'admin' | 'moderator' | 'member';
  joinedAt: Date;
  lastReadAt?: Date | null;
  nickname?: string | null;
}

export type ConversationWithParticipants = Conversation & {
  participants: ConversationParticipantDto[];
};

type MemberWithUser = ConversationMember & {
  user: { id: string; username: string; displayName: string; avatarUrl: string | null };
};

function toParticipantRole(role: ConversationRole): 'admin' | 'moderator' | 'member' {
  switch (role) {
    case ConversationRole.OWNER:
    case ConversationRole.ADMIN:
      return 'admin';
    default:
      return 'member';
  }
}

function toParticipantDto(m: MemberWithUser): ConversationParticipantDto {
  return {
    userId: m.userId,
    username: m.user.username,
    displayName: m.user.displayName,
    avatarUrl: m.user.avatarUrl,
    role: toParticipantRole(m.role),
    joinedAt: m.joinedAt,
    lastReadAt: m.lastReadAt,
    nickname: m.nickname,
  };
}

/** Active members with the minimal user fields the client needs for names/avatars. */
const activeMembersWithUser = {
  where: { leftAt: null },
  include: {
    user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
  },
} as const;

export class ConversationService {
  private readonly privacy: PrivacyService;

  constructor(
    private readonly prisma: PrismaClient,
    privacy?: PrivacyService,
  ) {
    this.privacy = privacy ?? getPrivacyService(prisma);
  }

  /**
   * QC-F-017: authorization gate for every conversation-scoped operation.
   *
   * Previously getConversation / updateConversation / addMember /
   * removeMember never received the requester's identity, so ANY logged-in
   * user could read, rename, or take over ANY conversation (including
   * promoting themselves to ADMIN via DELETE + POST member). The check lives
   * in the service layer — the same place sendMessage / pinMessage enforce
   * membership in MessageService — so no future route can forget it.
   *
   * Convention (codebase-dominant, cf. MessageService.sendMessage):
   * non-member → 403 NOT_A_MEMBER; role-gated action by a non-admin member
   * → 403 NOT_CONVERSATION_ADMIN.
   */
  private async requireMembership(
    conversationId: string,
    requesterId: string,
  ): Promise<ConversationMember> {
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId: requesterId, leftAt: null },
    });

    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }

    return membership;
  }

  private async requireAdmin(
    conversationId: string,
    requesterId: string,
  ): Promise<ConversationMember> {
    const membership = await this.requireMembership(conversationId, requesterId);

    if (
      membership.role !== ConversationRole.OWNER &&
      membership.role !== ConversationRole.ADMIN
    ) {
      throw createAppError(
        'Only conversation admins can perform this action',
        403,
        'NOT_CONVERSATION_ADMIN',
      );
    }

    return membership;
  }

  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    const { creatorId, participantIds, type, name, description } = input;

    // For direct conversations, ensure exactly 2 participants
    if (type === 'direct' && participantIds.length !== 1) {
      throw createAppError(
        'Direct conversations must have exactly one other participant',
        400,
        'INVALID_PARTICIPANT_COUNT',
      );
    }

    // QC-F-042: whoCanMessage gate — NEW direct conversations only. The
    // target's pref decides whether a stranger may START a conversation:
    // 'everyone' allows anyone, 'nobody' allows no one, 'friends' (the
    // default) allows the target's close friends and existing chat
    // partners (PrivacyService.isFriendOf v1). Existing conversations are
    // deliberately NOT gated anywhere — sendMessage keeps membership as
    // its only authority, so flipping this pref never strands a live
    // conversation. Group creation is out of scope for v1 (being invited
    // into a group is a different social act). A target that does not
    // exist keeps today's behaviour (missing-target → no gate); a prefs
    // read failure answers an honest 503, not a fabricated refusal.
    if (type === 'direct') {
      const targetId = participantIds[0];
      if (targetId && targetId !== creatorId) {
        const verdict = await this.privacy.checkCanMessage(creatorId, targetId);
        if (verdict === 'denied') {
          throw createAppError(
            'This user is not accepting new messages',
            403,
            'MESSAGE_NOT_ALLOWED',
          );
        }
        if (verdict === 'unavailable') {
          throw createAppError(
            'Privacy preferences are temporarily unavailable',
            503,
            'UPSTREAM_UNAVAILABLE',
          );
        }
      }
    }

    const allParticipants = [creatorId, ...participantIds.filter((id) => id !== creatorId)];

    // Use a transaction to create conversation and members atomically
    const conversation = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const conv = await tx.conversation.create({
        data: {
          type: toConversationType(type),
          name: name ?? null,
          description: description ?? null,
          createdBy: creatorId,
          lastMessageAt: new Date(),
          metadata: {},
        },
      });

      const memberData = allParticipants.map((userId, index) => ({
        conversationId: conv.id,
        userId,
        role: userId === creatorId ? ConversationRole.OWNER : ConversationRole.MEMBER,
        joinedAt: new Date(),
        nickname: null,
        isMuted: false,
        lastReadAt: index === 0 ? new Date() : null,
      }));

      await tx.conversationMember.createMany({ data: memberData });

      return conv;
    });

    return conversation;
  }

  async getConversation(
    id: string,
    requesterId: string,
  ): Promise<ConversationWithParticipants | null> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id },
      include: { members: activeMembersWithUser },
    });
    if (!conv) return null;
    // QC-F-017: only active members may read the conversation (incl. its
    // participant list). The loaded active-members relation is the
    // membership proof — a requester absent from it is not a member.
    if (!conv.members.some((m) => m.userId === requesterId)) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }
    const { members, ...rest } = conv;
    return {
      ...rest,
      participants: (members as MemberWithUser[]).map(toParticipantDto),
    };
  }

  async getUserConversations(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<ConversationWithParticipants>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [members, total] = await Promise.all([
      this.prisma.conversationMember.findMany({
        where: { userId, leftAt: null },
        include: {
          conversation: {
            include: { members: activeMembersWithUser },
          },
        },
        orderBy: { conversation: { lastMessageAt: 'desc' } },
        skip,
        take: pageSize,
      }),
      this.prisma.conversationMember.count({ where: { userId, leftAt: null } }),
    ]);

    const data: ConversationWithParticipants[] = members.map((m: unknown) => {
      const conv = (
        m as unknown as {
          conversation: Conversation & { members: MemberWithUser[] };
        }
      ).conversation;
      const { members: convMembers, ...rest } = conv;
      return { ...rest, participants: convMembers.map(toParticipantDto) };
    });
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

  async addMember(
    conversationId: string,
    requesterId: string,
    userId: string,
    role: string = 'MEMBER',
  ): Promise<ConversationMember> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw createAppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    }

    if (conversation.type === ConversationType.DIRECT) {
      throw createAppError(
        'Cannot add members to direct conversations',
        400,
        'DIRECT_CONVERSATION',
      );
    }

    // QC-F-017: the requester must already be a member — an outsider can no
    // longer add themselves (or anyone) into a conversation they cannot see.
    const requesterMembership = await this.requireMembership(conversationId, requesterId);

    // QC-F-017: assigning a privileged role requires an admin/owner
    // requester. A plain member may invite others as MEMBER only; this
    // closes the self-promotion path (add self with role=ADMIN).
    if (
      toConversationRole(role) !== ConversationRole.MEMBER &&
      requesterMembership.role !== ConversationRole.OWNER &&
      requesterMembership.role !== ConversationRole.ADMIN
    ) {
      throw createAppError(
        'Only conversation admins can perform this action',
        403,
        'NOT_CONVERSATION_ADMIN',
      );
    }

    // Check if user is already a member
    const existing = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId, leftAt: null },
    });

    if (existing) {
      throw createAppError('User is already a member', 409, 'ALREADY_MEMBER');
    }

    return this.prisma.conversationMember.create({
      data: {
        conversationId,
        userId,
        role: toConversationRole(role),
        joinedAt: new Date(),
        nickname: null,
        isMuted: false,
        lastReadAt: null,
      },
    });
  }

  async removeMember(
    conversationId: string,
    requesterId: string,
    userId: string,
  ): Promise<void> {
    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId, leftAt: null },
    });

    if (!member) {
      throw createAppError('User is not a member of this conversation', 404, 'NOT_A_MEMBER');
    }

    // QC-F-017: removing SOMEONE ELSE requires an admin/owner requester.
    // Removing yourself (leaving) only requires being the member, which the
    // lookup above already proved. Previously any logged-in user could kick
    // any member out of any conversation — and, combined with addMember,
    // replace the whole roster and take the group over.
    if (requesterId !== userId) {
      await this.requireAdmin(conversationId, requesterId);
    }

    await this.prisma.conversationMember.update({
      where: { id: member.id },
      data: { leftAt: new Date() },
    });
  }

  async updateConversation(
    id: string,
    requesterId: string,
    data: UpdateConversationInput,
  ): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      throw createAppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    }

    // QC-F-017: only members may update a conversation at all, and changing
    // the group's identity (name/description) is an admin action — a plain
    // member or outsider renaming the group was the takeover's first step.
    // Archive-only updates stay available to any member.
    if (data.name !== undefined || data.description !== undefined) {
      await this.requireAdmin(id, requesterId);
    } else {
      await this.requireMembership(id, requesterId);
    }

    return this.prisma.conversation.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isArchived !== undefined && { isArchived: data.isArchived }),
      },
    });
  }

  async markRead(conversationId: string, userId: string): Promise<ConversationMember> {
    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId, leftAt: null },
    });

    if (!member) {
      throw createAppError('User is not a member of this conversation', 404, 'NOT_A_MEMBER');
    }

    return this.prisma.conversationMember.update({
      where: { id: member.id },
      data: { lastReadAt: new Date() },
    });
  }
}
