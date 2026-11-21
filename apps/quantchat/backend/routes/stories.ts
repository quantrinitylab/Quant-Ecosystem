// ============================================================================
// QuantChat - Stories Backend Routes (Prisma-backed)
//
//   GET    /stories/feed            - non-expired stories grouped by author
//   POST   /stories                 - create a story (expires after 24h)
//   DELETE /stories/:storyId        - delete your own story
//   POST   /stories/:storyId/view   - mark a story viewed (idempotent)
//   GET    /stories/:storyId/viewers - list viewers (story owner only)
//   POST   /stories/:storyId/reply  - deliver a reply to the story author
//                                       as a direct-conversation message
//                                       (QC-F-078)
//   GET    /stories/:storyId        - one story by id, audience-gated
//                                       (QC-F-556: share-card / link target)
//   POST   /stories/:storyId/share  - share a story into a conversation as
//                                       a gated reference card (QC-F-556)
//
// The feed response shape matches what the web client's useStories hook
// expects: { groups: [{ userId, userName, userAvatar, stories, hasUnviewed }] }.
// ============================================================================
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ConversationService } from '../services/conversation.service';
import { MessageService } from '../services/message.service';
import { getPrivacyService } from '../services/privacy.service';
import { publishConversationEvent } from '../services/realtime-publisher';
import { assertMediaUrlAllowed } from '../lib/media-url';

const STORY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Prisma StoryType (IMAGE/VIDEO/TEXT) <-> client story type ('photo'/'video'/'text')
const prismaToClientType = { IMAGE: 'photo', VIDEO: 'video', TEXT: 'text' } as const;
const clientToPrismaType = { photo: 'IMAGE', video: 'VIDEO', text: 'TEXT' } as const;

const createStoryBodySchema = z.object({
  type: z.enum(['photo', 'video', 'text']).default('photo'),
  // QC-F-330: the cap is 12 Mi chars so a real inline `data:` photo story
  // (the shipped client's only photo path — a canvas JPEG is 100KB+) is no
  // longer rejected by the schema; the media-url validator re-imposes the
  // historic 4096 bound on non-`data:` URLs itself, so nothing loosens.
  mediaUrl: z.string().min(1).max(12_582_912).optional(),
  // Text-story body. Only meaningful for type 'text'; silently dropped (never
  // stored) for photo/video so a media story can never smuggle stray text.
  text: z.string().min(1).max(500).optional(),
  duration: z.number().int().min(1).max(120).default(15),
  audience: z.enum(['ALL', 'CLOSE_FRIENDS']).default('ALL'),
});

const replyBodySchema = z.object({
  message: z.string().min(1).max(1000),
});

const shareBodySchema = z.object({
  conversationId: z.string().min(1),
});

function getPrisma(fastify: FastifyInstance): PrismaClient {
  return (fastify as unknown as { prisma: PrismaClient }).prisma;
}

function getUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

interface StoryWithAuthor {
  id: string;
  userId: string;
  type: 'IMAGE' | 'VIDEO' | 'TEXT';
  mediaUrl: string | null;
  textContent: string | null;
  duration: number;
  viewCount: number;
  audience: string;
  createdAt: Date;
  expiresAt: Date;
  user: { id: string; displayName: string; avatarUrl: string | null };
}

// --- Story audience gate (QC-F-021) ---------------------------------------
//
// QC-F-447 adds Gate 0 in front of the two gates below: a BLOCKED pair —
// either direction (PrivacyService.checkBlockedBy semantics, resolved in
// batch by blockedExclusionsFor) — never views, whatever the audience or
// the pref says. Block used to be only a preferences list that message
// SEND consulted (QC-F-359); a blocked user could still watch the
// blocker's stories and leave their name in the owner's viewers list.
// Stories are a leak surface, so an UNPROVEN pair (either side's stored
// block list unreadable) is hidden too — same fail-closed direction as
// every gate below.
//
// A story is visible only when BOTH gates pass (QC-F-042 §3.3a AND rule):
//   1. Per-story audience: 'ALL' passes for anyone; 'CLOSE_FRIENDS' only
//      for viewers the AUTHOR listed as a close friend (CloseFriend edge
//      userId=author, friendId=viewer).
//   2. Per-author privacy pref `whoCanSeeStory` (settings DEFAULT_PRIVACY,
//      default 'friends'): 'everyone' passes for anyone; 'friends' and
//      'custom' only for "friends" of the author. 'custom' is treated as
//      'friends' — no custom-list storage exists in the codebase, and
//      reading it as 'everyone' would open what the user tried to narrow.
// "Friend" (v1, same definition as the QC-F-042 brief §3.1): the author
// listed the viewer as a close friend, OR author and viewer share an
// active DIRECT conversation (both members, leftAt null). Group
// membership does NOT count.
// Missing prefs resolve to the settings defaults ('friends'); a failed
// prefs/relationship read resolves fail-closed in the same direction
// (never 'everyone') — see QC-F-042 §4.

type WhoCanSeeStory = 'everyone' | 'friends' | 'custom';

interface FriendContext {
  /** Authors who listed the viewer as a close friend. */
  closeFriendAuthors: Set<string>;
  /** Authors sharing an active DIRECT conversation with the viewer. */
  directChatAuthors: Set<string>;
  /** Author id -> whoCanSeeStory pref (absent = default 'friends'). */
  prefByAuthor: Map<string, WhoCanSeeStory>;
  /**
   * QC-F-447 Gate 0: authors in a blocked pair with the viewer — proven
   * blocked in either direction OR unproven (unreadable block list).
   * Stories fail closed, so both kinds are hidden alike.
   */
  blockedAuthors: Set<string>;
}

function readWhoCanSeeStory(preferences: unknown): WhoCanSeeStory {
  if (!preferences || typeof preferences !== 'object') return 'friends';
  const chat = (preferences as Record<string, unknown>)['chatSettings'];
  if (!chat || typeof chat !== 'object') return 'friends';
  const privacy = (chat as Record<string, unknown>)['privacy'];
  if (!privacy || typeof privacy !== 'object') return 'friends';
  const value = (privacy as Record<string, unknown>)['whoCanSeeStory'];
  return value === 'everyone' || value === 'friends' || value === 'custom'
    ? value
    : 'friends';
}

async function loadFriendContext(
  prisma: PrismaClient,
  viewerId: string,
  authorIds: string[],
): Promise<FriendContext> {
  const ctx: FriendContext = {
    closeFriendAuthors: new Set<string>(),
    directChatAuthors: new Set<string>(),
    prefByAuthor: new Map<string, WhoCanSeeStory>(),
    blockedAuthors: new Set<string>(),
  };
  const authors = [...new Set(authorIds)].filter((id) => id !== viewerId);
  if (authors.length === 0) return ctx;

  try {
    const edges = await prisma.closeFriend.findMany({
      where: { userId: { in: authors }, friendId: viewerId },
      select: { userId: true },
    });
    for (const edge of edges) ctx.closeFriendAuthors.add(edge.userId);
  } catch {
    // Fail-closed: no close-friend edges are assumed on error.
  }

  try {
    const rows = await prisma.user.findMany({
      where: { id: { in: authors } },
      select: { id: true, preferences: true },
    });
    for (const row of rows) {
      ctx.prefByAuthor.set(row.id, readWhoCanSeeStory(row.preferences));
    }
  } catch {
    // Fail-closed: absent pref = default 'friends' in canViewStory.
  }

  try {
    const viewerMemberships = await prisma.conversationMember.findMany({
      where: { userId: viewerId, leftAt: null },
      select: { conversationId: true },
    });
    const conversationIds = viewerMemberships.map((m) => m.conversationId);
    if (conversationIds.length > 0) {
      const authorMemberships = await prisma.conversationMember.findMany({
        where: {
          conversationId: { in: conversationIds },
          userId: { in: authors },
          leftAt: null,
        },
        select: { conversationId: true, userId: true },
      });
      if (authorMemberships.length > 0) {
        const direct = await prisma.conversation.findMany({
          where: {
            id: { in: [...new Set(authorMemberships.map((m) => m.conversationId))] },
            type: 'DIRECT',
          },
          select: { id: true },
        });
        const directIds = new Set(direct.map((c) => c.id));
        for (const m of authorMemberships) {
          if (directIds.has(m.conversationId)) ctx.directChatAuthors.add(m.userId);
        }
      }
    }
  } catch {
    // Fail-closed: no direct-chat relationships are assumed on error.
  }

  // QC-F-447 Gate 0 data: one batched blocked-pair resolution for all
  // authors (blockedExclusionsFor does a single findMany and never
  // throws). Excluded (proven block, either direction) and uncertain
  // (a block list could not be read) both hide the author here — this
  // is a leak surface, so unproven means not shown.
  const { excluded, uncertain } = await getPrivacyService(
    prisma,
  ).blockedExclusionsFor(viewerId, authors);
  for (const id of excluded) ctx.blockedAuthors.add(id);
  for (const id of uncertain) ctx.blockedAuthors.add(id);

  return ctx;
}

function canViewStory(
  viewerId: string,
  story: { userId: string; audience?: string | null },
  ctx: FriendContext,
): boolean {
  if (story.userId === viewerId) return true;
  // Gate 0 (QC-F-447): a blocked pair — either direction — never views,
  // ahead of every audience/pref gate (a close-friend edge or an
  // 'everyone' pref must not resurrect access a block has cut).
  if (ctx.blockedAuthors.has(story.userId)) return false;
  // Gate 1: per-story audience.
  if (
    story.audience === 'CLOSE_FRIENDS' &&
    !ctx.closeFriendAuthors.has(story.userId)
  ) {
    return false;
  }
  // Gate 2: per-author privacy preference.
  const pref = ctx.prefByAuthor.get(story.userId) ?? 'friends';
  if (pref === 'everyone') return true;
  // 'friends' | 'custom' (custom == friends in v1, see header note).
  return (
    ctx.closeFriendAuthors.has(story.userId) ||
    ctx.directChatAuthors.has(story.userId)
  );
}

function serializeStory(story: StoryWithAuthor, isViewed: boolean) {
  return {
    id: story.id,
    authorId: story.userId,
    authorName: story.user.displayName,
    authorAvatar: story.user.avatarUrl ?? '',
    type: prismaToClientType[story.type],
    mediaUrl: story.mediaUrl ?? undefined,
    // Client type for TEXT stories: the viewer renders `text`. Omit for
    // photo/video so a media story never carries stale text.
    text: story.type === 'TEXT' ? story.textContent ?? undefined : undefined,
    duration: story.duration,
    viewCount: story.viewCount,
    audience: story.audience ?? 'ALL',
    createdAt: story.createdAt.toISOString(),
    expiresAt: story.expiresAt.toISOString(),
    isViewed,
    replies: 0,
  };
}

// --- Story share / single-fetch (QC-F-556) ---------------------------------
//
// A story share is a REFERENCE, never a copy. The card message's
// serverMetadata.storyShare snapshot carries only identity + type +
// expiry — never mediaUrl/text/thumbnail: a photo story's mediaUrl is an
// inline `data:` URL (QC-F-330), i.e. the content itself, so putting it in
// the snapshot would hand the content to every member of the target
// conversation and bypass the audience gate entirely. The real content is
// only ever served by the gated GET /stories/:storyId below, which applies
// the exact same loadFriendContext + canViewStory gate as feed/view/reply.
//
// Expiry answers 404 (never 410): revealing "this existed but expired" is
// itself an existence leak — the house pattern from QC-F-021/QC-F-299.
// The one exception is the OWNER resolving their own story via GET: their
// own expired story still resolves for them (it is their content; the
// archive surface is QC-F-368's, this only keeps an author's own shared
// card from looking broken to its author). Sharing an expired story is
// 404 for everyone, owner included — a dead card must not be minted.

async function loadStoryWithAuthor(
  prisma: PrismaClient,
  storyId: string,
): Promise<StoryWithAuthor | null> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  return (story as StoryWithAuthor | null) ?? null;
}

function isExpired(story: { expiresAt: Date }): boolean {
  return story.expiresAt.getTime() <= Date.now();
}

// --- Story reply delivery (QC-F-078) --------------------------------------
//
// A story reply is an ordinary direct message to the story author. Delivery
// reuses the real messaging paths — never a parallel store:
//   * an EXISTING active DIRECT conversation between replier and author is
//     reused (the same lookup shape loadFriendContext uses for its
//     direct-chat friend test);
//   * otherwise a new direct conversation is bootstrapped through
//     ConversationService.createConversation, which enforces the author's
//     whoCanMessage privacy gate (QC-F-042) — a viewer who may SEE an
//     'everyone' story but may not message the author gets that gate's
//     honest 403/503, never a fake "Reply sent";
//   * the message itself is sent through MessageService.sendMessage, whose
//     membership gate is the authority inside the conversation, and which
//     persists the message + delivery outbox row atomically.
// The delivered message carries `metadata.storyReply = { storyId }` so the
// author client can attribute it to the story without inventing a second
// reply store. It is a plain permanent DM — NOT view-once/disappearing:
// the replier's own words are theirs to keep in the conversation.

async function findDirectConversationId(
  prisma: PrismaClient,
  userAId: string,
  userBId: string,
): Promise<string | null> {
  const aMemberships = await prisma.conversationMember.findMany({
    where: { userId: userAId, leftAt: null },
    select: { conversationId: true },
  });
  const aConversationIds = aMemberships.map((m) => m.conversationId);
  if (aConversationIds.length === 0) return null;

  const bMemberships = await prisma.conversationMember.findMany({
    where: {
      conversationId: { in: aConversationIds },
      userId: userBId,
      leftAt: null,
    },
    select: { conversationId: true },
  });
  if (bMemberships.length === 0) return null;

  const direct = await prisma.conversation.findMany({
    where: {
      id: { in: [...new Set(bMemberships.map((m) => m.conversationId))] },
      type: 'DIRECT',
    },
    select: { id: true },
  });
  return direct[0]?.id ?? null;
}

export default async function storiesRoutes(fastify: FastifyInstance) {
  // GET /stories/feed - story groups from non-expired stories, own group first
  fastify.get('/feed', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);

    const [stories, views] = await Promise.all([
      prisma.story.findMany({
        where: { expiresAt: { gt: new Date() } },
        include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.storyView.findMany({
        where: { viewerId: userId },
        select: { storyId: true },
      }),
    ]);
    const viewedIds = new Set(views.map((v) => v.storyId));

    // QC-F-021: drop every story the viewer is not allowed to see BEFORE
    // grouping, so an invisible story leaves no group/existence trace.
    const allStories = stories as StoryWithAuthor[];
    const friendCtx = await loadFriendContext(
      prisma,
      userId,
      allStories.map((s) => s.userId),
    );
    const visibleStories = allStories.filter((s) =>
      canViewStory(userId, s, friendCtx),
    );

    // Group by author, preserving recency order; viewer's own group first.
    const groupOrder: string[] = [];
    const groupsByUser = new Map<string, ReturnType<typeof serializeStory>[]>();
    for (const story of visibleStories) {
      if (!groupsByUser.has(story.userId)) {
        groupsByUser.set(story.userId, []);
        groupOrder.push(story.userId);
      }
      groupsByUser
        .get(story.userId)!
        .push(serializeStory(story, viewedIds.has(story.id)));
    }
    groupOrder.sort((a, b) => {
      if (a === userId) return -1;
      if (b === userId) return 1;
      return 0;
    });

    const groups = groupOrder.map((authorId) => {
      const authorStories = groupsByUser.get(authorId)!;
      const first = visibleStories.find((s) => s.userId === authorId)!;
      return {
        userId: authorId,
        userName: first.user.displayName,
        userAvatar: first.user.avatarUrl ?? '',
        stories: authorStories,
        hasUnviewed: authorStories.some((s) => !s.isViewed),
      };
    });

    return reply.send({ groups });
  });

  // POST /stories - create a story
  // QC-F-493: the 12 Mi-char mediaUrl cap above is unreachable under
  // Fastify's default 1 MiB bodyLimit — a real canvas photo or gallery
  // video was 413'd before validation. 13 MiB covers the cap plus the
  // JSON envelope; the zod/validator caps remain the real bound.
  fastify.post('/', { bodyLimit: 13_631_488 }, async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);
    const parsed = createStoryBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid story payload', 400, 'BAD_REQUEST');
    }
    // A text story with no text is a no-op the client would render as a blank
    // card — reject honestly instead of persisting an empty story.
    const textBody = parsed.data.text?.trim();
    if (parsed.data.type === 'text' && !textBody) {
      throw createAppError('Text content is required for text stories', 400, 'BAD_REQUEST');
    }

    // QC-F-330: a story's mediaUrl is loaded verbatim by every viewer's
    // browser — it must be own-storage or inline data, never an arbitrary
    // host. Text stories carry no mediaUrl and skip the gate.
    if (parsed.data.mediaUrl) {
      assertMediaUrlAllowed(parsed.data.mediaUrl, {
        ownerId: userId,
        allowData: ['image/', 'video/'],
        maxDataLength: 12_582_912,
        maxUrlLength: 4096,
      });
    }

    const story = await prisma.story.create({
      data: {
        userId,
        type: clientToPrismaType[parsed.data.type],
        mediaUrl: parsed.data.mediaUrl ?? null,
        // Persist the text body only for TEXT stories; photo/video rows keep
        // textContent NULL.
        textContent: parsed.data.type === 'text' ? textBody ?? null : null,
        duration: parsed.data.duration,
        audience: parsed.data.audience,
        expiresAt: new Date(Date.now() + STORY_TTL_MS),
      },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
    });

    return reply
      .status(201)
      .send({ success: true, story: serializeStory(story as StoryWithAuthor, false) });
  });

  // GET /stories/:storyId - one story by id (QC-F-556). This is the gated
  // resolution target for share cards and shareable links: the same
  // three-layer gate as the feed, an invisible or (for non-owners) expired
  // story answers 404 so neither its existence nor its expiry leaks. The
  // read is side-effect free — it never records a StoryView and never
  // bumps viewCount; the honest count only moves when a receiver opens
  // the real viewer and the existing /view flow runs.
  fastify.get('/:storyId', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);
    const { storyId } = request.params as { storyId: string };

    const story = await loadStoryWithAuthor(prisma, storyId);
    if (!story) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }
    if (story.userId !== userId) {
      if (isExpired(story)) {
        throw createAppError('Story not found', 404, 'NOT_FOUND');
      }
      const friendCtx = await loadFriendContext(prisma, userId, [story.userId]);
      if (!canViewStory(userId, story, friendCtx)) {
        throw createAppError('Story not found', 404, 'NOT_FOUND');
      }
    }

    const view = await prisma.storyView.findUnique({
      where: { storyId_viewerId: { storyId, viewerId: userId } },
      select: { storyId: true },
    });
    return reply.send({
      success: true,
      story: serializeStory(story, Boolean(view)),
    });
  });

  // DELETE /stories/:storyId - delete your own story
  fastify.delete('/:storyId', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);
    const { storyId } = request.params as { storyId: string };

    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }
    if (story.userId !== userId) {
      throw createAppError('You can only delete your own stories', 403, 'FORBIDDEN');
    }

    // StoryView is relation-free, so delete view rows explicitly.
    await prisma.storyView.deleteMany({ where: { storyId } });
    await prisma.story.delete({ where: { id: storyId } });

    return reply.send({ success: true });
  });

  // POST /stories/:storyId/view - mark viewed (idempotent, owner views excluded)
  fastify.post('/:storyId/view', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);
    const { storyId } = request.params as { storyId: string };

    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }
    // QC-F-021: an invisible story answers 404 (not 403) so its existence
    // is not leaked, and no view is recorded for it.
    const friendCtx = await loadFriendContext(prisma, userId, [story.userId]);
    if (!canViewStory(userId, story, friendCtx)) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }

    if (story.userId !== userId) {
      const existing = await prisma.storyView.findUnique({
        where: { storyId_viewerId: { storyId, viewerId: userId } },
      });
      if (!existing) {
        await prisma.storyView.create({ data: { storyId, viewerId: userId } });
        await prisma.story.update({
          where: { id: storyId },
          data: { viewCount: { increment: 1 } },
        });
      }
    }

    const updated = await prisma.story.findUnique({
      where: { id: storyId },
      select: { viewCount: true },
    });
    return reply.send({ success: true, viewCount: updated?.viewCount ?? story.viewCount });
  });

  // GET /stories/:storyId/viewers - viewers of your story
  fastify.get('/:storyId/viewers', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);
    const { storyId } = request.params as { storyId: string };

    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }
    if (story.userId !== userId) {
      throw createAppError('Only the story owner can see viewers', 403, 'FORBIDDEN');
    }

    const views = await prisma.storyView.findMany({
      where: { storyId },
      orderBy: { viewedAt: 'desc' },
      take: 200,
    });
    const viewerIds = [...new Set(views.map((v) => v.viewerId))];
    const users = await prisma.user.findMany({
      where: { id: { in: viewerIds } },
      select: { id: true, displayName: true, avatarUrl: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    // QC-F-447: a viewer who is NOW in a blocked pair with the owner
    // (either direction, or unproven) is filtered out of the list — a
    // blocked user must not keep leaving their name in front of the
    // person who blocked them. The StoryView rows themselves are
    // history and are NOT deleted: unblocking restores the honest
    // record; only the current exposure is gated.
    const { excluded, uncertain } = await getPrivacyService(
      prisma,
    ).blockedExclusionsFor(userId, viewerIds);
    const hiddenViewers = new Set([...excluded, ...uncertain]);
    const visibleViews = views.filter((v) => !hiddenViewers.has(v.viewerId));

    return reply.send({
      viewers: visibleViews.map((v) => ({
        userId: v.viewerId,
        name: userById.get(v.viewerId)?.displayName ?? 'Unknown',
        avatar: userById.get(v.viewerId)?.avatarUrl ?? '',
        viewedAt: v.viewedAt.toISOString(),
      })),
    });
  });

  // POST /stories/:storyId/reply - deliver a reply to the story author as
  // a direct message (QC-F-078). Success is returned ONLY after the message
  // is persisted through the membership-gated send path; every failure
  // (audience gate, privacy gate, membership) surfaces as its real error.
  fastify.post('/:storyId/reply', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);
    const { storyId } = request.params as { storyId: string };

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, userId: true, audience: true },
    });
    if (!story) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }
    // QC-F-021: same audience gate as the feed/view — an invisible story
    // answers 404 and accepts no reply.
    const friendCtx = await loadFriendContext(prisma, userId, [story.userId]);
    if (!canViewStory(userId, story, friendCtx)) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }
    const parsed = replyBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Reply message is required', 400, 'BAD_REQUEST');
    }
    if (story.userId === userId) {
      throw createAppError('You cannot reply to your own story', 400, 'BAD_REQUEST');
    }

    // QC-F-078: deliver — do not just log. Find the pair's existing direct
    // conversation, or bootstrap one through the privacy-gated create path,
    // then send through the membership-gated MessageService (which also
    // writes the delivery outbox row in the same transaction).
    const authorId = story.userId;
    let conversationId = await findDirectConversationId(prisma, userId, authorId);
    if (!conversationId) {
      const conversations = new ConversationService(prisma);
      const created = await conversations.createConversation({
        creatorId: userId,
        participantIds: [authorId],
        type: 'direct',
      });
      conversationId = created.id;
    }

    const messages = new MessageService(prisma);
    const message = await messages.sendMessage({
      conversationId,
      senderId: userId,
      content: parsed.data.message,
      type: 'text',
      // QC-F-274: `storyReply` is a server-owned metadata key — it goes
      // through the trusted serverMetadata channel, not client metadata
      // (client-supplied `storyReply` is stripped by MessageService).
      serverMetadata: { storyReply: { storyId } },
    });

    // Realtime fan-out, same as the REST message send path: the durable
    // message above is the source of truth; this only accelerates live
    // delivery and never fails the response (the publisher logs and
    // no-ops when no backplane is decorated).
    const sentMessage = message as unknown as { id: string; version?: number };
    void publishConversationEvent(fastify, conversationId, {
      eventType: 'chat.message.created.v1',
      resourceRef: sentMessage.id,
      aggregateVersion:
        typeof sentMessage.version === 'number' ? sentMessage.version : 1,
      data: message,
    });

    return reply.send({ success: true, conversationId, messageId: sentMessage.id });
  });

  // POST /stories/:storyId/share - share a story into a caller-chosen
  // conversation as a reference card (QC-F-556). Gate order mirrors the
  // reply route and never leaks: story-load 404 -> expiry 404 -> audience
  // gate 404 -> body 400 -> MessageService's own membership/blocked gates.
  // Only a user who can actually VIEW the story may share it, and the
  // card grants its receivers nothing — opening it re-runs the same gate
  // through GET /stories/:storyId. Sharing never records a view and never
  // bumps viewCount.
  fastify.post('/:storyId/share', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);
    const { storyId } = request.params as { storyId: string };

    const story = await loadStoryWithAuthor(prisma, storyId);
    if (!story) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }
    if (isExpired(story)) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }
    const friendCtx = await loadFriendContext(prisma, userId, [story.userId]);
    if (!canViewStory(userId, story, friendCtx)) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }
    const parsed = shareBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('A target conversation is required', 400, 'BAD_REQUEST');
    }

    const messages = new MessageService(prisma);
    const message = await messages.sendMessage({
      conversationId: parsed.data.conversationId,
      senderId: userId,
      content: 'Shared a story',
      type: 'text',
      // QC-F-274: `storyShare` is a server-owned metadata key — it goes
      // through the trusted serverMetadata channel, never client metadata
      // (client-supplied `storyShare` is stripped by MessageService). The
      // snapshot is identity + type + expiry ONLY — no mediaUrl, no text,
      // no thumbnail: content stays behind the gate (see § header note).
      serverMetadata: {
        storyShare: {
          storyId: story.id,
          authorId: story.userId,
          authorName: story.user.displayName,
          authorAvatar: story.user.avatarUrl ?? '',
          storyType: prismaToClientType[story.type],
          audience: story.audience ?? 'ALL',
          createdAt: story.createdAt.toISOString(),
          expiresAt: story.expiresAt.toISOString(),
        },
      },
    });

    // Realtime fan-out, same contract as the reply route / REST send path.
    const sentMessage = message as unknown as { id: string; version?: number };
    void publishConversationEvent(fastify, parsed.data.conversationId, {
      eventType: 'chat.message.created.v1',
      resourceRef: sentMessage.id,
      aggregateVersion:
        typeof sentMessage.version === 'number' ? sentMessage.version : 1,
      data: message,
    });

    return reply
      .status(201)
      .send({ success: true, conversationId: parsed.data.conversationId, messageId: sentMessage.id });
  });
}
