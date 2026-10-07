// ============================================================================
// QuantChat — Durable call-history service (Prisma-backed)
//
// Live call signaling (LiveKit room lifecycle) is handled by `CallService`,
// which keeps only EPHEMERAL in-memory state for the duration of an active
// call. That state is lost on restart, so it cannot answer "what calls did I
// have?".
//
// `CallRecordService` is the DURABLE tier: it persists the call lifecycle to
// the existing Prisma `Call` model so call history survives restarts/redeploys
// and is shared across all backend instances. It is intentionally a SEPARATE
// service (not a rewrite of CallService) so the live-signaling Map logic — and
// its tests — remain untouched.
//
// The Prisma client is injected through a narrow interface covering only the
// `call` delegate operations this service issues, mirroring the repo's
// established DI pattern (see PrismaKeyStorage). This keeps the service unit
// testable against an in-memory fake with no live Postgres.
// ============================================================================

import { createAppError } from '@quant/server-core';

/** Call media type — mirrors the Prisma `CallType` enum. */
export type CallType = 'AUDIO' | 'VIDEO';

/** Call lifecycle status — mirrors the Prisma `CallStatus` enum. */
export type CallStatus = 'RINGING' | 'ACTIVE' | 'ENDED' | 'MISSED' | 'DECLINED';

/** A persisted `Call` row (the subset of columns this service reads/writes). */
export interface CallRow {
  id: string;
  conversationId: string;
  initiatorId: string;
  type: CallType;
  status: CallStatus;
  startedAt: Date | null;
  endedAt: Date | null;
  duration: number | null;
  participants: unknown;
  roomId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Narrow view of the Prisma client — exactly the `call` delegate operations
 * {@link CallRecordService} issues. Injected via the constructor so the service
 * can be driven against the real client in production and an in-memory fake in
 * tests.
 */
export interface CallRecordPrisma {
  call: {
    create(args: { data: Record<string, unknown> }): Promise<CallRow>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<CallRow>;
    findUnique(args: { where: { id: string } }): Promise<CallRow | null>;
    findFirst(args: { where: Record<string, unknown> }): Promise<CallRow | null>;
    findMany(args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, unknown> | Array<Record<string, unknown>>;
      skip?: number;
      take?: number;
    }): Promise<CallRow[]>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
}

/** Input for {@link CallRecordService.recordStarted}. */
export interface RecordStartedInput {
  conversationId: string;
  initiatorId: string;
  type?: CallType;
  roomId?: string;
  participants: string[];
}

/** Input for {@link CallRecordService.recordEnded}. */
export interface RecordEndedInput {
  endedAt?: Date;
}

/** Pagination options for {@link CallRecordService.listHistory}. */
export interface HistoryOptions {
  page?: number;
  pageSize?: number;
}

/** A page of the caller's call history. */
export interface CallHistoryPage {
  calls: CallHistoryEntry[];
  page: number;
  pageSize: number;
  total: number;
}

/** A single call-history entry returned to clients (participants normalized). */
export interface CallHistoryEntry {
  id: string;
  conversationId: string;
  initiatorId: string;
  type: CallType;
  status: CallStatus;
  startedAt: Date | null;
  endedAt: Date | null;
  duration: number | null;
  participants: string[];
  roomId: string | null;
  createdAt: Date;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export class CallRecordService {
  constructor(private readonly prisma: CallRecordPrisma) {}

  /**
   * Persist the start of a call. Creates a `Call` row in the ACTIVE state with
   * `startedAt = now`. Public, non-secret identifiers only.
   *
   * Idempotent on `roomId`: live signaling can retry a "call started" persist
   * (e.g. reconnects, at-least-once event delivery), so when a row already
   * exists for the same `roomId` the existing row is returned rather than
   * creating a duplicate history entry.
   *
   * @throws 400 when required fields are missing/empty.
   */
  async recordStarted(input: RecordStartedInput): Promise<CallRow> {
    const conversationId = input.conversationId?.trim();
    const initiatorId = input.initiatorId?.trim();

    if (!conversationId) {
      throw createAppError('conversationId is required', 400, 'INVALID_CALL_RECORD');
    }
    if (!initiatorId) {
      throw createAppError('initiatorId is required', 400, 'INVALID_CALL_RECORD');
    }
    if (!Array.isArray(input.participants)) {
      throw createAppError('participants must be an array', 400, 'INVALID_CALL_RECORD');
    }

    // Normalize participants: de-duplicate, drop empties, and always include the
    // initiator (a call always involves the person who started it).
    const participants = this.normalizeParticipants([initiatorId, ...input.participants]);
    const type: CallType = input.type ?? 'VIDEO';
    const roomId = input.roomId?.trim() || null;

    // Idempotency: never write two history rows for the same room.
    if (roomId) {
      const existing = await this.prisma.call.findFirst({ where: { roomId } });
      if (existing) {
        return existing;
      }
    }

    return this.prisma.call.create({
      data: {
        conversationId,
        initiatorId,
        type,
        status: 'ACTIVE',
        startedAt: new Date(),
        participants,
        roomId,
      },
    });
  }

  /**
   * Persist the end of a call: marks it ENDED, stamps `endedAt`, and computes
   * `duration` in whole seconds from `startedAt` (falling back to `createdAt`
   * when the call was never marked started).
   *
   * Idempotent: a call already in a terminal state (ENDED/MISSED/DECLINED) is
   * returned unchanged so duplicate "call ended" events do not overwrite the
   * recorded duration.
   *
   * @throws 400 when `callId` is missing, 404 when no such call exists.
   */
  async recordEnded(callId: string, input: RecordEndedInput = {}): Promise<CallRow> {
    const id = callId?.trim();
    if (!id) {
      throw createAppError('callId is required', 400, 'INVALID_CALL_RECORD');
    }

    const existing = await this.prisma.call.findUnique({ where: { id } });
    if (!existing) {
      throw createAppError('Call record not found', 404, 'CALL_RECORD_NOT_FOUND');
    }

    // Idempotent: do not re-end an already-terminal call.
    if (
      existing.status === 'ENDED' ||
      existing.status === 'MISSED' ||
      existing.status === 'DECLINED'
    ) {
      return existing;
    }

    const endedAt = input.endedAt ?? new Date();
    const startReference = existing.startedAt ?? existing.createdAt;
    const duration = this.computeDurationSeconds(startReference, endedAt);

    return this.prisma.call.update({
      where: { id },
      data: {
        status: 'ENDED',
        endedAt,
        duration,
      },
    });
  }

  /**
   * Return the caller's call history newest-first, scoped to calls they
   * initiated OR participated in. Other users' calls are never returned.
   *
   * @throws 400 when `userId` is missing.
   */
  async listHistory(userId: string, options: HistoryOptions = {}): Promise<CallHistoryPage> {
    const uid = userId?.trim();
    if (!uid) {
      throw createAppError('userId is required', 400, 'INVALID_CALL_HISTORY_QUERY');
    }

    const page = Math.max(1, Math.floor(options.page ?? 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(options.pageSize ?? DEFAULT_PAGE_SIZE)),
    );

    // Ownership scope: the user initiated the call OR is in its participants
    // array. `array_contains` filters the Prisma `Json` participants column.
    const where = {
      OR: [{ initiatorId: uid }, { participants: { array_contains: uid } }],
    };

    const [rows, total] = await Promise.all([
      this.prisma.call.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.call.count({ where }),
    ]);

    return {
      calls: rows.map((row) => this.toEntry(row)),
      page,
      pageSize,
      total,
    };
  }

  /** Normalize a participant list: trim, drop empties, de-duplicate (stable order). */
  private normalizeParticipants(ids: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of ids) {
      const id = typeof raw === 'string' ? raw.trim() : '';
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  }

  /** Whole seconds between two instants, never negative. */
  private computeDurationSeconds(start: Date, end: Date): number {
    const ms = end.getTime() - start.getTime();
    return Math.max(0, Math.round(ms / 1000));
  }

  /** Map a persisted row to a client entry, coercing the Json participants column. */
  private toEntry(row: CallRow): CallHistoryEntry {
    return {
      id: row.id,
      conversationId: row.conversationId,
      initiatorId: row.initiatorId,
      type: row.type,
      status: row.status,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      duration: row.duration,
      participants: this.coerceParticipants(row.participants),
      roomId: row.roomId,
      createdAt: row.createdAt,
    };
  }

  /** The `participants` Json column is `string[]`; coerce defensively. */
  private coerceParticipants(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === 'string');
    }
    return [];
  }
}
