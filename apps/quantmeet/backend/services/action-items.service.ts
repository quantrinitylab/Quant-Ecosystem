// ============================================================================
// QuantMeet — Durable meeting action items (Prisma-backed)
//
// Previously ActionItemsService kept extracted action items in an in-memory
// `Map<string, ActionItem[]>`, so action items were lost on restart/redeploy
// and never shared across backend instances. This rewrite makes action items
// DURABLE by persisting them to the Prisma `MeetingActionItem` model while
// preserving the existing AI (transcript → action items) compute behavior.
//
// The EXACT createAppError messages / codes / statuses are preserved (the route
// + tests depend on them):
//   'Transcript is empty'          400 EMPTY_TRANSCRIPT
//   'No transcript found for room' 404 TRANSCRIPT_NOT_FOUND
//   'Action item not found'        404 ACTION_ITEM_NOT_FOUND
//
// `extractActionItems` stays a PURE compute that returns items (no
// persistence). `extractFromRoomId` AWAITs the now-async transcript read,
// persists the extracted items tagged with `roomId`, and returns them.
// getActionItems and completeActionItem are now ASYNC. The Prisma client is
// injected through a NARROW interface (`ActionItemsPrisma`) covering only the
// `meetingActionItem` delegate operations this service issues, mirroring the
// repo's established DI pattern: prisma FIRST, then the existing collaborators.
// ============================================================================

import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import type { TranscriptSegment } from './transcript.service';
import type { TranscriptService } from './transcript.service';

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  assignee: string | null;
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed';
}

// ---------------------------------------------------------------------------
// Cross-app commitment bridge (issue #29). A meeting action item assigned to a
// known participant ALSO becomes a user commitment in the shared memory
// channel - so it surfaces in QuantMail follow-ups. Best-effort by design.
// ---------------------------------------------------------------------------

/** The narrow slice of UserCommitmentMemory the bridge needs. */
export interface CommitmentChannel {
  add(commitment: {
    id: string;
    userId: string;
    description: string;
    dueDate: string | null;
    source: string;
    status: 'active' | 'completed' | 'dismissed';
    createdAt: string;
  }): Promise<void>;
}

/** Resolves a room's participants for assignee -> userId mapping. */
export interface ParticipantResolver {
  getRoom(roomId: string): Promise<{
    participants: Array<{ id: string; userId: string; displayName: string }>;
  }>;
}

export interface CommitmentBridge {
  channel: CommitmentChannel;
  rooms: ParticipantResolver;
}

/**
 * Local AIInference interface for scaffold purposes.
 * This interface mirrors the patterns in @quant/ai and should be aligned
 * with the actual @quant/ai package types in a future integration pass.
 */
export interface AIInference {
  generateText(prompt: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Persisted row shape (the subset of columns this service reads/writes).
// ---------------------------------------------------------------------------

/** A persisted `MeetingActionItem` row. */
export interface MeetingActionItemRow {
  id: string;
  roomId: string;
  title: string;
  description: string;
  assignee: string | null;
  dueDate: string | null;
  priority: string;
  status: string;
  createdAt: Date;
}

/**
 * Narrow view of the Prisma client — exactly the `meetingActionItem` delegate
 * operations {@link ActionItemsService} issues. Injected via the constructor so
 * the service can run against the real client in production and an in-memory
 * fake in tests.
 */
export interface ActionItemsPrisma {
  meetingActionItem: {
    create(args: { data: Record<string, unknown> }): Promise<MeetingActionItemRow>;
    findMany(args: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, unknown> | Array<Record<string, unknown>>;
    }): Promise<MeetingActionItemRow[]>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<MeetingActionItemRow>;
  };
}

export class ActionItemsService {
  constructor(
    private readonly prisma: ActionItemsPrisma,
    private readonly ai: AIInference,
    private readonly commitmentBridge?: CommitmentBridge,
  ) {}

  /**
   * Best-effort: mirror an assigned action item into the shared commitments
   * channel when the assignee resolves to a room participant. Resolution is
   * by participant id OR case-insensitive display name. Never throws.
   */
  private async bridgeCommitment(roomId: string, item: ActionItem): Promise<void> {
    if (!this.commitmentBridge || !item.assignee) return;
    try {
      const room = await this.commitmentBridge.rooms.getRoom(roomId);
      const needle = item.assignee.trim().toLowerCase();
      const participant = room.participants.find(
        (p) => p.id === item.assignee || p.displayName.trim().toLowerCase() === needle,
      );
      if (!participant) return;
      await this.commitmentBridge.channel.add({
        id: item.id,
        userId: participant.userId,
        description: item.title + (item.description ? ` - ${item.description}` : ''),
        dueDate: item.dueDate,
        source: 'quantmeet',
        status: 'active',
        createdAt: new Date().toISOString(),
      });
    } catch {
      /* best-effort by design - never fail the meeting flow */
    }
  }

  /**
   * Pure compute: extract action items from transcript segments. Returns the
   * items without persisting them.
   *
   * @throws createAppError('Transcript is empty', 400, 'EMPTY_TRANSCRIPT') when
   *   the transcript has no segments.
   */
  async extractActionItems(transcript: TranscriptSegment[]): Promise<ActionItem[]> {
    if (transcript.length === 0) {
      throw createAppError('Transcript is empty', 400, 'EMPTY_TRANSCRIPT');
    }

    const transcriptText = transcript.map((s) => `[${s.participantId}]: ${s.text}`).join('\n');

    const prompt = `Extract action items from the following meeting transcript. For each item, identify the title, description, assignee, due date, and priority.\n\nTranscript:\n${transcriptText}`;
    const result = await this.ai.generateText(prompt);

    const lines = result.split('\n').filter((l) => l.trim().length > 0);
    const items: ActionItem[] = lines.map((line) => ({
      id: randomUUID(),
      title: line.trim(),
      description: '',
      assignee: null,
      dueDate: null,
      priority: 'medium' as const,
      status: 'pending' as const,
    }));

    return items;
  }

  /** Load a room's persisted action items, oldest first. */
  async getActionItems(roomId: string): Promise<ActionItem[]> {
    const rows = await this.prisma.meetingActionItem.findMany({
      where: { roomId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toActionItem(row));
  }

  /**
   * Mark an action item completed.
   *
   * @throws createAppError('Action item not found', 404, 'ACTION_ITEM_NOT_FOUND')
   *   when no row matches the id.
   */
  async completeActionItem(itemId: string, _userId?: string): Promise<ActionItem> {
    try {
      const row = await this.prisma.meetingActionItem.update({
        where: { id: itemId },
        data: { status: 'completed' },
      });
      return this.toActionItem(row);
    } catch {
      throw createAppError('Action item not found', 404, 'ACTION_ITEM_NOT_FOUND');
    }
  }

  /**
   * Extract action items for a room from its transcript and persist them
   * (tagged with `roomId`).
   *
   * @throws createAppError('No transcript found for room', 404,
   *   'TRANSCRIPT_NOT_FOUND') when the room has no transcript.
   */
  async extractFromRoomId(
    roomId: string,
    transcriptService: TranscriptService,
  ): Promise<ActionItem[]> {
    const transcript = await transcriptService.getTranscript(roomId);
    if (transcript.length === 0) {
      throw createAppError('No transcript found for room', 404, 'TRANSCRIPT_NOT_FOUND');
    }

    const items = await this.extractActionItems(transcript);

    const persisted: ActionItem[] = [];
    for (const item of items) {
      await this.bridgeCommitment(roomId, item);
      const row = await this.prisma.meetingActionItem.create({
        data: {
          roomId,
          title: item.title,
          description: item.description,
          assignee: item.assignee,
          dueDate: item.dueDate,
          priority: item.priority,
          status: item.status,
        },
      });
      persisted.push(this.toActionItem(row));
    }

    return persisted;
  }

  // -------------------------------------------------------------------------
  // Mapping helpers
  // -------------------------------------------------------------------------

  /** Map a persisted action item row to the public ActionItem shape. */
  private toActionItem(row: MeetingActionItemRow): ActionItem {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      assignee: row.assignee,
      dueDate: row.dueDate,
      priority: this.parsePriority(row.priority),
      status: this.parseStatus(row.status),
    };
  }

  /** Coerce the persisted priority string into the ActionItem priority union. */
  private parsePriority(value: string): ActionItem['priority'] {
    switch (value) {
      case 'low':
      case 'medium':
      case 'high':
      case 'urgent':
        return value;
      default:
        return 'medium';
    }
  }

  /** Coerce the persisted status string into the ActionItem status union. */
  private parseStatus(value: string): ActionItem['status'] {
    switch (value) {
      case 'pending':
      case 'in_progress':
      case 'completed':
        return value;
      default:
        return 'pending';
    }
  }
}
