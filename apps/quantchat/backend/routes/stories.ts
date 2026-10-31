// ============================================================================
// QuantChat - Stories Backend Routes (Prisma-backed)
//
//   GET    /stories/feed                  - non-expired stories grouped by author
//   GET    /stories/discover              - public editorial feed (Phase 2C)
//   POST   /stories/upload-url            - presigned PUT for story media (Phase 2C)
//   POST   /stories                       - create a story (expires after 24h)
//   DELETE /stories/:storyId              - delete your own story
//   POST   /stories/:storyId/view         - mark a story viewed (idempotent)
//   GET    /stories/:storyId/viewers      - list viewers (story owner only)
//   POST   /stories/:storyId/reply        - deliver a reply to the story author
//                                             as a direct-conversation message
//                                             (QC-F-078)
//   POST   /stories/:storyId/like         - toggle like (Phase 2C)
//   GET    /stories/:storyId/comments     - list comments (Phase 2C)
//   POST   /stories/:storyId/comments     - add a comment (Phase 2C)
//   POST   /stories/authors/:authorId/follow        - follow an author (Phase 2C)
//   DELETE /stories/authors/:authorId/follow        - unfollow (Phase 2C)
//   GET    /stories/authors/:authorId/follow-status - { isFollowing } (Phase 2C)
//
// The feed response shape matches what the web client's useStories hook
// expects: { groups: [{ userId, userName, userAvatar, stories, hasUnviewed }]}.
// Phase 2C adds per-group `isFriend`/`isFollowing` and per-story
// `likeCount`/`commentCount`/`isLiked`/`placeId`/`placeName`/`name` -- all
// additive, the web shape keeps working.
//
// Media storage (Phase 2C): story media uploads go through the
// provider-agnostic @quant/storage StorageClient interface
// (R2 vs SeaweedFS vs S3 vs MinIO is an env-config choice, never a
// hardcoded bucket here -- see resolveStorageConfigFromEnv). When storage
// is unconfigured, /stories/upload-url answers 503 STORAGE_NOT_CONFIGURED
// and reads serve the stored URL verbatim; nothing crashes at boot.
// ============================================================================
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { RelationshipType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { StorageClient, resolveStorageConfigFromEnv } from '@quant/storage';
import { ConversationService } from '../services/conversation.service';
import { MessageService } from '../services/message.service';
import { extractStorageKey } from '../services/message.service';
import { getPrivacyService } from '../services/privacy.service';
import { publishConversationEvent } from '../services/realtime-publisher';
import { assertMediaUrlAllowed } from '../lib/media-url';

const STORY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SIGNED_VIEW_URL_TTL_S = 3600; // 1h viewer URLs for storage-backed media
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB, aligned with @quant/storage default

// Prisma StoryType (IMAGE/VIDEO/TEXT) <-> client story type ('photo'/'video'/'text')
const prismaToClientType = { IMAGE: 'photo', VIDEO: 'video', TEXT: 'text' } as const;
const clientToPrismaType = { photo: 'IMAGE', video: 'VIDEO', text: 'TEXT' } as const;

// Client audience ('friendsOnly' | 'public' | 'closeFriends') <-> stored
// audience ('FRIENDS' | 'ALL' | 'CLOSE_FRIENDS').
// Any accepted input value -> stored audience. Legacy 'ALL'/'CLOSE_FRIENDS'
// keep working exactly as before; the new client vocabulary maps alongside.
const inputToStoredAudience: Record<string, string> = {
  friendsOnly: 'FRIENDS',
  public: 'ALL',
  closeFriends: 'CLOSE_FRIENDS',
  FRIENDS: 'FRIENDS',
  ALL: 'ALL',
  CLOSE_FRIENDS: 'CLOSE_FRIENDS',
};

const createStoryBodySchema = z.object({
  type: z.enum(['photo', 'video', 'text']).default('photo'),
  // QC-F-330: the cap is 12 Mi chars so a real inline `data:` photo story
  // (the shipped client's only photo path -- a canvas JPEG is 100KB+) is no
  // longer rejected by the schema; the media-url validator re-imposes the
  // historic 4096 bound on non-`data:` URLs itself, so nothing loosens.
  mediaUrl: z.string().min(1).max(12_582_912).optional(),
  // Text-story body. Only meaningful for type 'text'; silently dropped (never
  // stored) for photo/video so a media story can never smuggle stray text.
  text: z.string().min(1).max(500).optional(),
  duration: z.number().int().min(1).max(120).default(15),
  // Phase 2C accepts the client audience vocabulary AND the legacy stored
  // vocabulary ('ALL'/'CLOSE_FRIENDS') the shipped web client sends --
  // both normalize to the stored form below. Default 'public' == 'ALL'.
  audience: z
    .enum(['friendsOnly', 'public', 'closeFriends', 'ALL', 'CLOSE_FRIENDS', 'FRIENDS'])
    .default('public'),
  // Phase 2C: optional place tag (Send To -> location/place story) and an
  // optional story name (Memories -> Create Story batches segments under one
  // name). Both are display metadata only; neither affects visibility.
  placeId: z.string().min(1).max(128).optional(),
  placeName: z.string().min(1).max(200).optional(),
  name: z.string().min(1).max(120).optional(),
});

const replyBodySchema = z.object({
  message: z.string().min(1).max(1000),
});

const commentBodySchema = z.object({
  body: z.string().min(1).max(500),
});

const uploadUrlBodySchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(127),
  contentLength: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
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

// --- Story object storage (Phase 2C) --------------------------------------
// Provider-agnostic: StorageClient is constructed from env config only
// (S3/R2/MinIO -- the R2-vs-SeaweedFS decision lives in deployment config,
// not here). No Cloudflare credential is read or required by this module:
// resolveStorageConfigFromEnv returns null when unconfigured and every
// storage path degrades to 503/verbatim instead of crashing.

let cachedStorage: StorageClient | null | undefined;

function storyStorage(): StorageClient | null {
  if (cachedStorage === undefined) {
    const config = resolveStorageConfigFromEnv();
    cachedStorage = config ? new StorageClient(config) : null;
  }
  return cachedStorage;
}

/** Test hook: replace the cached client (unit tests inject a fake). */
export function __setStoryStorageForTest(client: StorageClient | null | undefined): void {
  cachedStorage = client;
}

function requireStoryStorage(): StorageClient {
  const storage = storyStorage();
  if (!storage) {
    throw createAppError(
      'Object storage is not configured -- set S3/R2 env vars to enable story media uploads',
      503,
      'STORAGE_NOT_CONFIGURED',
    );
  }
  return storage;
}

function sanitizeFilename(raw: string): string {
  const base = raw.split('/').pop()?.split('\\').pop() ?? 'story';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'story';
}

/**
 * Resolve the mediaUrl a client should load for a story row.
 * Storage-backed URLs are minted as short-lived signed GETs (the bucket is
 * private); inline `data:` payloads and unconfigured-storage deployments
 * serve the stored value verbatim. Best-effort: a signing failure falls
 * back to the stored URL rather than failing the whole feed.
 */
async function resolveViewMediaUrl(
  raw: string | null | undefined,
): Promise<string | undefined> {
  if (!raw) return undefined;
  if (raw.startsWith('data:')) return raw;
  const storage = storyStorage();
  if (!storage) return raw;
  const key = extractStorageKey(raw);
  if (!key) return raw;
  try {
    return await storage.getSignedUrl(key, SIGNED_VIEW_URL_TTL_S);
  } catch {
    return raw;
  }
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
  placeId: string | null;
  placeName: string | null;
  name: string | null;
  createdAt: Date;
  expiresAt: Date;
  user: { id: string; displayName: string; avatarUrl: string | null };
}

// --- Story audience gate (QC-F-021) ---------------------------------------
//
// QC-F-447 adds Gate 0 in front of the two gates below: a BLOCKED pair --
// either direction (PrivacyService.checkBlockedBy semantics, resolved in
// batch by blockedExclusionsFor) -- never views, whatever the audience or
// the pref says. Block used to be only a preferences list that message
// SEND consulted (QC-F-359); a blocked user could still watch the
// blocker's stories and leave their name in the owner's viewers list.
// Stories are a leak surface, so an UNPROVEN pair (either side's stored
// block list unreadable) is hidden too -- same fail-closed direction as
// every gate below.
//
// A story is visible only when BOTH gates pass (QC-F-042 sec.3.3a AND rule):
//   1. Per-story audience: 'ALL' passes for anyone; 'FRIENDS' only for
//      "friends" of the author (v1 definition below); 'CLOSE_FRIENDS' only
//      for viewers the AUTHOR listed as a close friend (CloseFriend edge
//      userId=author, friendId=viewer).
//   2. Per-author privacy pref `whoCanSeeStory` (settings DEFAULT_PRIVACY,
//      default 'friends'): 'everyone' passes for anyone; 'friends' and
//      'custom' only for "friends" of the author. 'custom' is treated as
//      'friends' -- no custom-list storage exists in the codebase, and
//      reading it as 'everyone' would open what the user tried to narrow.
// "Friend" (v1, same definition as the QC-F-042 brief sec.3.1): the author
// listed the viewer as a close friend, OR author and viewer share an
// active DIRECT conversation (both members, leftAt null). Group
// membership does NOT count.
// Missing prefs resolve to the settings defaults ('friends'); a failed
// prefs/relationship read resolves fail-closed in the same direction
// (never 'everyone') -- see QC-F-042 sec.4.

type WhoCanSeeStory = 'everyone' | 'friends' | 'custom';

interface FriendContext {
  /** Authors who listed the viewer as a close friend. */
  closeFriendAuthors: Set<string>;
  /** Authors sharing an active DIRECT conversation with the viewer. */
  directChatAuthors: Set<string>;
  /** Author id -> whoCanSeeStory pref (absent = default 'friends'). */
  prefByAuthor: Map<string, WhoCanSeeStory>;
  /**
   * QC-F-447 Gate 0: authors in a blocked pair with the viewer -- proven
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
  // (a block list could not be read) both hide the author here -- this
  // is a leak surface, so unproven means not shown.
  const { excluded, uncertain } = await getPrivacyService(
    prisma,
  ).blockedExclusionsFor(viewerId, authors);
  for (const id of excluded) ctx.blockedAuthors.add(id);
  for (const id of uncertain) ctx.blockedAuthors.add(id);

  return ctx;
}

/** v1 "friend" test shared by the FRIENDS audience gate and feed grouping. */
function isFriendOfAuthor(viewerId: string, authorId: string, ctx: FriendContext): boolean {
  if (authorId === viewerId) return true;
  return ctx.closeFriendAuthors.has(authorId) || ctx.directChatAuthors.has(authorId);
}

export function canViewStory(
  viewerId: string,
  story: { userId: string; audience?: string | null },
  ctx: FriendContext,
): boolean {
  if (story.userId === viewerId) return true;
  // Gate 0 (QC-F-447): a blocked pair -- either direction -- never views,
  // ahead of every audience/pref gate (a close-friend edge or an
  // 'everyone' pref must not resurrect access a block has cut).
  if (ctx.blockedAuthors.has(story.userId)) return false;
  // Gate 1: per-story audience.
  if (story.audience === 'CLOSE_FRIENDS' && !ctx.closeFriendAuthors.has(story.userId)) {
    return false;
  }
  if (story.audience === 'FRIENDS' && !isFriendOfAuthor(viewerId, story.userId, ctx)) {
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

export type { FriendContext };

interface StoryEngagement {
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
}

/** Batch engagement counters for a set of stories (one groupBy per table). */
async function loadEngagement(
  prisma: PrismaClient,
  viewerId: string,
  storyIds: string[],
): Promise<Map<string, StoryEngagement>> {
  const empty = new Map<string, StoryEngagement>();
  if (storyIds.length === 0) return empty;
  const [likeGroups, commentGroups, viewerLikes] = await Promise.all([
    prisma.storyLike.groupBy({
      by: ['storyId'],
      where: { storyId: { in: storyIds } },
      _count: { storyId: true },
    }),
    prisma.storyComment.groupBy({
      by: ['storyId'],
      where: { storyId: { in: storyIds } },
      _count: { storyId: true },
    }),
    prisma.storyLike.findMany({
      where: { storyId: { in: storyIds }, userId: viewerId },
      select: { storyId: true },
    }),
  ]);
  const likedIds = new Set(viewerLikes.map((l) => l.storyId));
  const map = new Map<string, StoryEngagement>();
  for (const id of storyIds) {
    map.set(id, { likeCount: 0, commentCount: 0, isLiked: likedIds.has(id) });
  }
  for (const g of likeGroups) {
    map.get(g.storyId)!.likeCount = g._count.storyId;
  }
  for (const g of commentGroups) {
    map.get(g.storyId)!.commentCount = g._count.storyId;
  }
  return map;
}

interface SerializedStory {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  type: 'photo' | 'video' | 'text';
  mediaUrl?: string;
  text?: string;
  duration: number;
  viewCount: number;
  audience: string;
  placeId?: string;
  placeName?: string;
  name?: string;
  createdAt: string;
  expiresAt: string;
  isViewed: boolean;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  replies: number;
}

function serializeStory(
  story: StoryWithAuthor,
  isViewed: boolean,
  engagement?: StoryEngagement,
): SerializedStory {
  const eng = engagement ?? { likeCount: 0, commentCount: 0, isLiked: false };
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
    placeId: story.placeId ?? undefined,
    placeName: story.placeName ?? undefined,
    name: story.name ?? undefined,
    createdAt: story.createdAt.toISOString(),
    expiresAt: story.expiresAt.toISOString(),
    isViewed,
    likeCount: eng.likeCount,
    commentCount: eng.commentCount,
    isLiked: eng.isLiked,
    replies: 0,
  };
}

/** Resolve storage-backed mediaUrls to short-lived signed view URLs. */
async function withViewMediaUrls(stories: SerializedStory[]): Promise<SerializedStory[]> {
  return Promise.all(
    stories.map(async (s) => ({ ...s, mediaUrl: await resolveViewMediaUrl(s.mediaUrl) })),
  );
}

// --- Story reply delivery (QC-F-078) --------------------------------------
//
// A story reply is an ordinary direct message to the story author. Delivery
// reuses the real messaging paths -- never a parallel store:
//   * an EXISTING active DIRECT conversation between replier and author is
//     reused (the same lookup shape loadFriendContext uses for its
//     direct-chat friend test);
//   * otherwise a new direct conversation is bootstrapped through
//     ConversationService.createConversation, which enforces the author's
//     whoCanMessage privacy gate (QC-F-042) -- a viewer who may SEE an
//     'everyone' story but may not message the author gets that gate's
//     honest 403/503, never a fake "Reply sent";
//   * the message itself is sent through MessageService.sendMessage, whose
//     membership gate is the authority inside the conversation, and which
//     persists the message + delivery outbox row atomically.
// The delivered message carries `metadata.storyReply = { storyId }` so the
// author client can attribute it to the story without inventing a second
// reply store. It is a plain permanent DM -- NOT view-once/disappearing:
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

const storyInclude = {
  user: { select: { id: true, displayName: true, avatarUrl: true } },
} as const;

export default async function storiesRoutes(fastify: FastifyInstance) {
  // POST /stories/upload-url -- presigned PUT for story media (Phase 2C).
  // The issued key shape `<userId>/media_<uuid>/<filename>` is exactly what
  // assertMediaUrlAllowed expects, so the canonical mediaUrl returned here
  // passes the POST /stories media gate without any special-casing.
  // 503 STORAGE_NOT_CONFIGURED when object storage is not configured --
  // never a fake URL.
  fastify.post('/upload-url', async (request, reply) => {
    const userId = getUserId(request);
    const parsed = uploadUrlBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid upload request', 400, 'BAD_REQUEST');
    }
    const { filename, contentType, contentLength } = parsed.data;
    if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
      throw createAppError('Stories accept image/* and video/* media only', 400, 'INVALID_CONTENT_TYPE');
    }

    const storage = requireStoryStorage();
    const key = `${userId}/media_${randomUUID()}/${sanitizeFilename(filename)}`;
    let signed: { url: string; expiresAt: Date; requiredHeaders: Record<string, string>; maxBytes: number };
    try {
      signed = await storage.getSignedUploadUrl({
        key,
        contentType,
        contentLength,
        maxBytes: MAX_UPLOAD_BYTES,
      });
    } catch (error) {
      throw createAppError(
        `Failed to mint story upload URL: ${error instanceof Error ? error.message : 'storage error'}`,
        500,
        'UPLOAD_URL_FAILED',
      );
    }

    // Canonical (unsigned) media URL for the story row: its host is the
    // configured storage endpoint (an own-storage host per media-url.ts)
    // and extractStorageKey derives `key` back from it. Viewers never load
    // this verbatim for private buckets -- reads mint short-lived signed
    // GETs via resolveViewMediaUrl.
    const config = resolveStorageConfigFromEnv();
    const endpoint = (config?.endpoint ?? '').replace(/\/+$/, '');
    const bucket = config?.bucket ?? '';
    const mediaUrl = endpoint && bucket ? `${endpoint}/${bucket}/${key}` : signed.url;

    return reply.status(201).send({
      success: true,
      uploadUrl: signed.url,
      key,
      mediaUrl,
      requiredHeaders: signed.requiredHeaders,
      expiresAt: signed.expiresAt.toISOString(),
      maxBytes: signed.maxBytes,
    });
  });

  // GET /stories/feed - story groups from non-expired stories, own group first
  fastify.get('/feed', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);

    const [stories, views] = await Promise.all([
      prisma.story.findMany({
        where: { expiresAt: { gt: new Date() } },
        include: storyInclude,
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

    const engagement = await loadEngagement(
      prisma,
      userId,
      visibleStories.map((s) => s.id),
    );

    // Follow state for the Following section (batch, one query).
    const authorIds = [...new Set(visibleStories.map((s) => s.userId))].filter(
      (id) => id !== userId,
    );
    const follows = authorIds.length
      ? await prisma.userRelationship.findMany({
          where: { followerId: userId, followingId: { in: authorIds }, type: RelationshipType.FOLLOW },
          select: { followingId: true },
        })
      : [];
    const followingIds = new Set(follows.map((f) => f.followingId));

    // Group by author, preserving recency order; viewer's own group first.
    const groupOrder: string[] = [];
    const groupsByUser = new Map<string, SerializedStory[]>();
    for (const story of visibleStories) {
      if (!groupsByUser.has(story.userId)) {
        groupsByUser.set(story.userId, []);
        groupOrder.push(story.userId);
      }
      groupsByUser
        .get(story.userId)!
        .push(serializeStory(story, viewedIds.has(story.id), engagement.get(story.id)));
    }
    groupOrder.sort((a, b) => {
      if (a === userId) return -1;
      if (b === userId) return 1;
      return 0;
    });

    const groups = await Promise.all(
      groupOrder.map(async (authorId) => {
        const authorStories = groupsByUser.get(authorId)!;
        const first = visibleStories.find((s) => s.userId === authorId)!;
        return {
          userId: authorId,
          userName: first.user.displayName,
          userAvatar: first.user.avatarUrl ?? '',
          stories: await withViewMediaUrls(authorStories),
          hasUnviewed: authorStories.some((s) => !s.isViewed),
          isOwn: authorId === userId,
          isFriend: isFriendOfAuthor(userId, authorId, friendCtx),
          isFollowing: followingIds.has(authorId),
        };
      }),
    );

    return reply.send({ groups });
  });

  // GET /stories/discover -- public editorial feed (Phase 2C).
  // Only stories BOTH gates pass for a stranger: audience ALL and the
  // author's whoCanSeeStory pref 'everyone' (canViewStory with an empty
  // friend context models exactly that). Blocked pairs excluded by Gate 0.
  fastify.get('/discover', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);

    const stories = (await prisma.story.findMany({
      where: { expiresAt: { gt: new Date() }, audience: 'ALL', userId: { not: userId } },
      include: storyInclude,
      orderBy: { createdAt: 'desc' },
      take: 60,
    })) as StoryWithAuthor[];

    const friendCtx = await loadFriendContext(
      prisma,
      userId,
      stories.map((s) => s.userId),
    );
    // An empty friend graph (no close-friend edges, no direct chats) +
    // pref 'everyone' is the only way through -- canViewStory already
    // encodes it; authors the viewer IS friends with are filtered out so
    // Discover stays the non-friend editorial surface.
    const items = stories.filter(
      (s) =>
        canViewStory(userId, s, friendCtx) &&
        !isFriendOfAuthor(userId, s.userId, friendCtx) &&
        friendCtx.prefByAuthor.get(s.userId) === 'everyone',
    ).slice(0, 30);

    const views = await prisma.storyView.findMany({
      where: { viewerId: userId, storyId: { in: items.map((s) => s.id) } },
      select: { storyId: true },
    });
    const viewedIds = new Set(views.map((v) => v.storyId));
    const engagement = await loadEngagement(
      prisma,
      userId,
      items.map((s) => s.id),
    );

    const serialized = items.map((s) =>
      serializeStory(s, viewedIds.has(s.id), engagement.get(s.id)),
    );
    return reply.send({ items: await withViewMediaUrls(serialized) });
  });

  // POST /stories - create a story
  // QC-F-493: the 12 Mi-char mediaUrl cap above is unreachable under
  // Fastify's default 1 MiB bodyLimit -- a real canvas photo or gallery
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
    // card -- reject honestly instead of persisting an empty story.
    const textBody = parsed.data.text?.trim();
    if (parsed.data.type === 'text' && !textBody) {
      throw createAppError('Text content is required for text stories', 400, 'BAD_REQUEST');
    }

    // QC-F-330: a story's mediaUrl is loaded verbatim by every viewer's
    // browser -- it must be own-storage or inline data, never an arbitrary
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
        audience: inputToStoredAudience[parsed.data.audience] ?? 'ALL',
        placeId: parsed.data.placeId ?? null,
        placeName: parsed.data.placeName?.trim() || null,
        name: parsed.data.name?.trim() || null,
        expiresAt: new Date(Date.now() + STORY_TTL_MS),
      },
      include: storyInclude,
    });

    const serialized = serializeStory(story as StoryWithAuthor, false);
    return reply
      .status(201)
      .send({ success: true, story: (await withViewMediaUrls([serialized]))[0] });
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

    // StoryView/Like/Comment are relation-free, so delete their rows
    // explicitly. The story's storage blob is reaped by the expiry worker's
    // ownership-gated path -- but an explicit delete should not wait up to
    // 5 minutes to free the bytes: best-effort delete it here too.
    const rawMediaUrl = story.mediaUrl ?? '';
    if (rawMediaUrl && !rawMediaUrl.startsWith('data:')) {
      const key = extractStorageKey(rawMediaUrl);
      if (key && key.split('/')[0] === userId) {
        try {
          await storyStorage()?.deleteMany([key]);
        } catch {
          // Best effort -- the row delete below is what the user asked for.
        }
      }
    }
    await prisma.storyView.deleteMany({ where: { storyId } });
    await prisma.storyLike.deleteMany({ where: { storyId } });
    await prisma.storyComment.deleteMany({ where: { storyId } });
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
    // (either direction, or unproven) is filtered out of the list -- a
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
    // QC-F-021: same audience gate as the feed/view -- an invisible story
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

    // QC-F-078: deliver -- do not just log. Find the pair's existing direct
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
      // QC-F-274: `storyReply` is a server-owned metadata key -- it goes
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

  // POST /stories/:storyId/like -- toggle the viewer's like (Phase 2C).
  // The audience gate applies: an invisible story answers 404 and cannot
  // be liked. Counters are real rows, never fabricated.
  fastify.post('/:storyId/like', async (request, reply) => {
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
    const friendCtx = await loadFriendContext(prisma, userId, [story.userId]);
    if (!canViewStory(userId, story, friendCtx)) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }

    const existing = await prisma.storyLike.findUnique({
      where: { storyId_userId: { storyId, userId } },
    });
    let liked: boolean;
    if (existing) {
      await prisma.storyLike.delete({ where: { id: existing.id } });
      liked = false;
    } else {
      await prisma.storyLike.create({ data: { storyId, userId } });
      liked = true;
    }
    const likeCount = await prisma.storyLike.count({ where: { storyId } });
    return reply.send({ success: true, liked, likeCount });
  });

  // GET /stories/:storyId/comments -- list comments, oldest first (Phase 2C).
  fastify.get('/:storyId/comments', async (request, reply) => {
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
    const friendCtx = await loadFriendContext(prisma, userId, [story.userId]);
    if (!canViewStory(userId, story, friendCtx)) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }

    const comments = await prisma.storyComment.findMany({
      where: { storyId },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    const authorIds = [...new Set(comments.map((c) => c.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, displayName: true, avatarUrl: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    return reply.send({
      comments: comments.map((c) => ({
        id: c.id,
        storyId: c.storyId,
        userId: c.userId,
        userName: userById.get(c.userId)?.displayName ?? 'Unknown',
        userAvatar: userById.get(c.userId)?.avatarUrl ?? '',
        body: c.body,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  });

  // POST /stories/:storyId/comments -- add a comment (Phase 2C).
  fastify.post('/:storyId/comments', async (request, reply) => {
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
    const friendCtx = await loadFriendContext(prisma, userId, [story.userId]);
    if (!canViewStory(userId, story, friendCtx)) {
      throw createAppError('Story not found', 404, 'NOT_FOUND');
    }
    const parsed = commentBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Comment body is required (1-500 chars)', 400, 'BAD_REQUEST');
    }

    const comment = await prisma.storyComment.create({
      data: { storyId, userId, body: parsed.data.body.trim() },
    });
    const author = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, avatarUrl: true },
    });
    return reply.status(201).send({
      success: true,
      comment: {
        id: comment.id,
        storyId: comment.storyId,
        userId: comment.userId,
        userName: author?.displayName ?? 'Unknown',
        userAvatar: author?.avatarUrl ?? '',
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
      },
    });
  });

  // POST /stories/authors/:authorId/follow -- follow an author (Phase 2C).
  // Powers the Discover viewer's "+ Add"/"Subscribe" pill with a real
  // UserRelationship row. Blocked pairs (either direction) get 403; an
  // unreadable block list fails closed 503 (QC-F-359 semantics) -- a follow
  // must never be created on an unproven verdict.
  fastify.post('/authors/:authorId/follow', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);
    const { authorId } = request.params as { authorId: string };

    if (authorId === userId) {
      throw createAppError('You cannot follow yourself', 400, 'BAD_REQUEST');
    }
    const target = await prisma.user.findUnique({
      where: { id: authorId },
      select: { id: true },
    });
    if (!target) {
      throw createAppError('Author not found', 404, 'NOT_FOUND');
    }
    const verdict = await getPrivacyService(prisma).checkBlockedPair(userId, authorId);
    if (verdict === 'blocked') {
      throw createAppError('You cannot follow this author', 403, 'CANNOT_FOLLOW');
    }
    if (verdict === 'unavailable') {
      throw createAppError(
        'Could not verify block status -- try again',
        503,
        'PRIVACY_UNAVAILABLE',
      );
    }

    await prisma.userRelationship.upsert({
      where: { followerId_followingId: { followerId: userId, followingId: authorId } },
      update: { type: RelationshipType.FOLLOW },
      create: { followerId: userId, followingId: authorId, type: RelationshipType.FOLLOW },
    });
    return reply.send({ success: true, isFollowing: true });
  });

  // DELETE /stories/authors/:authorId/follow -- unfollow (idempotent).
  fastify.delete('/authors/:authorId/follow', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);
    const { authorId } = request.params as { authorId: string };

    await prisma.userRelationship.deleteMany({
      where: { followerId: userId, followingId: authorId, type: RelationshipType.FOLLOW },
    });
    return reply.send({ success: true, isFollowing: false });
  });

  // GET /stories/authors/:authorId/follow-status -- { isFollowing }.
  fastify.get('/authors/:authorId/follow-status', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);
    const { authorId } = request.params as { authorId: string };

    const row = await prisma.userRelationship.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: authorId } },
      select: { type: true },
    });
    return reply.send({ isFollowing: row?.type === RelationshipType.FOLLOW });
  });
}
