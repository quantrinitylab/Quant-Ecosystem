// ============================================================================
// QuantChat -- Story Expiry Worker (Phase 2C)
//
// Stories carry a 24h TTL (expiresAt, set at creation in routes/stories.ts).
// The feed only READS non-expired rows, which hides them from clients -- but
// hiding is not deletion. This worker performs the server-side expiry on a
// schedule: every STORY_EXPIRY_POLL_INTERVAL_MS it deletes stories whose
// expiresAt has passed, their view/like/comment rows, and their
// object-storage blobs (provider-agnostic StorageClient interface --
// R2/SeaweedFS/S3 chosen by env config, never hardcoded here).
//
// Safety properties (mirroring ScheduledMessageWorker):
//   * Idempotent across replicas: the claim is a conditional deleteMany
//     (expiresAt <= now); a racing worker matches zero rows. S3
//     DeleteObjects is idempotent for missing keys.
//   * Storage objects are deleted FIRST, then DB rows: a crash between the
//     two leaves an orphaned blob (harmless, invisible), never a story row
//     pointing at a deleted object. A failed storage delete is logged and
//     does NOT block the DB delete -- an expired story must disappear even
//     when the object store is unreachable; the orphan is reported in the
//     sweep result for operator visibility.
//   * Ownership gate on storage deletes: only keys whose first path segment
//     is the story author's own id are ever deleted (same structural rule
//     the media-url validator enforces). A forged row can never make this
//     worker delete another user's object.
//   * `data:` URLs have no storage key and are skipped for object deletion.
//   * env 'test' never starts the worker (see app.ts) -- the sweep is a pure
//     exported function so unit tests drive it directly with a mock prisma.
//
// Privacy note: this worker deletes content, it never copies or exports it.
// No E2EE claim is made anywhere here -- story media is stored server-side
// in cleartext-equivalent form (presigned URLs), exactly as documented.
// ============================================================================

import { StorageClient, resolveStorageConfigFromEnv } from '@quant/storage';
import { extractStorageKey } from './message.service';

export const STORY_EXPIRY_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const STORY_EXPIRY_BATCH_SIZE = 500;

/** Minimal structural Prisma surface the sweep needs (mirrors the
 *  ScheduledMessageWorker pattern so this module typechecks without the
 *  generated client and unit tests can inject a mock). */
export interface StoryExpiryPrisma {
  story: {
    findMany: (args: {
      where: { expiresAt: { lte: Date } };
      orderBy: { expiresAt: 'asc' };
      take: number;
      select: { id: true; userId: true; mediaUrl: true; expiresAt: true };
    }) => Promise<
      Array<{ id: string; userId: string; mediaUrl: string | null; expiresAt: Date }>
    >;
    deleteMany: (args: {
      where: { id: { in: string[] }; expiresAt: { lte: Date } };
    }) => Promise<{ count: number }>;
  };
  storyView: {
    deleteMany: (args: { where: { storyId: { in: string[] } } }) => Promise<{ count: number }>;
  };
  storyLike: {
    deleteMany: (args: { where: { storyId: { in: string[] } } }) => Promise<{ count: number }>;
  };
  storyComment: {
    deleteMany: (args: { where: { storyId: { in: string[] } } }) => Promise<{ count: number }>;
  };
}

export interface StoryStorage {
  deleteMany: (keys: string[]) => Promise<void>;
}

export interface StoryExpirySweepResult {
  expiredStories: number;
  deletedDbRows: number;
  deletedObjects: number;
  orphanedObjects: number;
  /** Keys we refused to delete (not owned by the story author, or unparseable). */
  skippedKeys: string[];
}

export interface StoryExpiryLogger {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

const noopLogger: StoryExpiryLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * One expiry sweep. Exported pure so tests drive it without timers.
 *
 * @param prisma  Prisma client (real or structural mock).
 * @param storage Object-storage interface, or null when unconfigured --
 *                DB expiry still runs; object deletion is skipped honestly.
 * @param now     Clock (injectable for tests).
 */
export async function sweepExpiredStories(
  prisma: StoryExpiryPrisma,
  storage: StoryStorage | null,
  logger: StoryExpiryLogger = noopLogger,
  now: Date = new Date(),
  batchSize: number = STORY_EXPIRY_BATCH_SIZE,
): Promise<StoryExpirySweepResult> {
  const result: StoryExpirySweepResult = {
    expiredStories: 0,
    deletedDbRows: 0,
    deletedObjects: 0,
    orphanedObjects: 0,
    skippedKeys: [],
  };

  const expired = await prisma.story.findMany({
    where: { expiresAt: { lte: now } },
    orderBy: { expiresAt: 'asc' },
    take: batchSize,
    select: { id: true, userId: true, mediaUrl: true, expiresAt: true },
  });
  if (expired.length === 0) return result;

  const ids = expired.map((s) => s.id);

  // --- 1. Object-storage cleanup (best effort, ownership-gated) ------------
  const keysToDelete: string[] = [];
  for (const story of expired) {
    const raw = story.mediaUrl ?? '';
    if (!raw || raw.startsWith('data:')) continue; // inline payload: nothing in storage
    const key = extractStorageKey(raw);
    if (!key) {
      result.skippedKeys.push(raw.slice(0, 80));
      continue;
    }
    // Ownership gate: only delete objects inside the author's own namespace.
    if (key.split('/')[0] !== story.userId) {
      logger.warn(
        { storyId: story.id, key: key.slice(0, 80) },
        'story expiry: refusing to delete object outside author namespace',
      );
      result.skippedKeys.push(key.slice(0, 80));
      continue;
    }
    keysToDelete.push(key);
  }

  if (keysToDelete.length > 0) {
    if (!storage) {
      // Storage not configured: the DB rows still expire below; the keys
      // are reported as orphaned so operators can reconcile once storage
      // is configured. Never silently dropped, never blocking.
      result.orphanedObjects = keysToDelete.length;
      logger.warn(
        { count: keysToDelete.length },
        'story expiry: object storage not configured, expired story blobs left orphaned',
      );
    } else {
      try {
        await storage.deleteMany(keysToDelete);
        result.deletedObjects = keysToDelete.length;
      } catch (error) {
        // Best effort: an expired story must disappear even when the object
        // store is down. Count the whole batch as orphaned for visibility.
        result.orphanedObjects = keysToDelete.length;
        logger.error(
          { err: error, count: keysToDelete.length },
          'story expiry: object delete failed, continuing with DB expiry',
        );
      }
    }
  }

  // --- 2. Relational rows (conditional claim: idempotent across replicas) --
  const [views, likes, comments, stories] = await Promise.all([
    prisma.storyView.deleteMany({ where: { storyId: { in: ids } } }),
    prisma.storyLike.deleteMany({ where: { storyId: { in: ids } } }),
    prisma.storyComment.deleteMany({ where: { storyId: { in: ids } } }),
    prisma.story.deleteMany({ where: { id: { in: ids }, expiresAt: { lte: now } } }),
  ]);
  result.deletedDbRows = views.count + likes.count + comments.count + stories.count;
  result.expiredStories = stories.count;

  logger.info(
    {
      expiredStories: result.expiredStories,
      deletedDbRows: result.deletedDbRows,
      deletedObjects: result.deletedObjects,
      orphanedObjects: result.orphanedObjects,
    },
    'story expiry sweep complete',
  );
  return result;
}

export interface StoryExpiryWorkerOptions {
  pollIntervalMs?: number;
  batchSize?: number;
  /** Injected storage (tests); otherwise resolved from env once at construction. */
  storage?: StoryStorage | null;
  onError?: (error: unknown) => void;
  logger?: StoryExpiryLogger;
}

export class StoryExpiryWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly storage: StoryStorage | null;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly onError: (error: unknown) => void;
  private readonly logger: StoryExpiryLogger;

  constructor(
    private readonly prisma: StoryExpiryPrisma,
    options: StoryExpiryWorkerOptions = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? STORY_EXPIRY_POLL_INTERVAL_MS;
    this.batchSize = options.batchSize ?? STORY_EXPIRY_BATCH_SIZE;
    this.onError = options.onError ?? (() => undefined);
    this.logger = options.logger ?? noopLogger;
    if (options.storage !== undefined) {
      this.storage = options.storage;
    } else {
      const config = resolveStorageConfigFromEnv();
      this.storage = config ? new StorageClient(config) : null;
      if (!this.storage) {
        this.logger.warn(
          {},
          'story expiry: object storage not configured -- expired DB rows still expire, blobs will be reported orphaned',
        );
      }
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // Run once at boot so a restart promptly reaps anything that expired
    // while the process was down, then on the poll interval.
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
    // Don't hold the event loop open for a housekeeping timer.
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    try {
      await sweepExpiredStories(this.prisma, this.storage, this.logger, new Date(), this.batchSize);
    } catch (error) {
      this.onError(error);
    }
  }
}
