import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import type { TranscriptSegment, TranscriptService } from './transcript.service';

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  assignee: string | null;
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed';
}

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

export interface ParticipantResolver {
  getRoom(roomId: string): Promise<{
    participants: Array<{ id: string; userId: string; displayName: string }>;
  }>;
}

export interface CommitmentBridge {
  channel: CommitmentChannel;
  rooms: ParticipantResolver;
}

export interface AIInference {
  generateText(prompt: string): Promise<string>;
}

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

  private async bridgeCommitment(roomId: string, item: ActionItem): Promise<void> {
    if (!this.commitmentBridge || !item.assignee) return;

    try {
      const room = await this.commitmentBridge.rooms.getRoom(roomId);
      const needle = item.assignee.trim().toLowerCase();
      const participant = room.participants.find(
        (candidate) =>
          candidate.id === item.assignee ||
          candidate.displayName.trim().toLowerCase() === needle,
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
      // Best-effort by design: commitment bridging never fails meeting flow.
    }
  }

  async extractActionItems(transcript: TranscriptSegment[]): Promise<ActionItem[]> {
    if (transcript.length === 0) {
      throw createAppError('Transcript is empty', 400, 'EMPTY_TRANSCRIPT');
    }

    const transcriptText = transcript.map((segment) => `[${segment.participantId}]: ${segment.text}`).join('\n');
    const prompt =
      'Extract action items from the following meeting transcript. ' +
      'Return ONE line per item in EXACTLY this format:\n' +
      'Title: <short title> | Assignee: <participant display name or none> | ' +
      'Due: <date phrase or none> | Priority: <low|medium|high|urgent>\n\n' +
      `Transcript:\n${transcriptText}`;
    const result = await this.ai.generateText(prompt);

    const lines = result
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !/^no action items?\b/i.test(line));

    return lines.map((line) => this.parseActionItemLine(line));
  }

  private parseActionItemLine(rawLine: string): ActionItem {
    const line = rawLine
      .replace(/^\*\*(.+)\*\*$/, '$1')
      .replace(/^\d+[.)]\s*/, '')
      .trim();
    const base: ActionItem = {
      id: randomUUID(),
      title: line,
      description: '',
      assignee: null,
      dueDate: null,
      priority: 'medium',
      status: 'pending',
    };

    const normalize = (value: string | undefined): string | null => {
      const trimmed = (value ?? '').trim();
      return trimmed.length === 0 || /^(none|null|n\/a|-)$/i.test(trimmed) ? null : trimmed;
    };

    if (/\btitle\s*:/i.test(line) && line.includes('|')) {
      const fields = new Map<string, string>();
      for (const part of line.split('|')) {
        const match = part.match(/^\s*([a-z ]+?)\s*:\s*(.+?)\s*$/i);
        if (match) fields.set(match[1]!.trim().toLowerCase(), match[2]!.trim());
      }

      const title = normalize(fields.get('title'));
      if (title) {
        const rawPriority = (fields.get('priority') ?? '').toLowerCase();
        const priority = (['low', 'medium', 'high', 'urgent'] as const).find(
          (candidate) => candidate === rawPriority,
        );
        return {
          ...base,
          title,
          assignee: normalize(fields.get('assignee')),
          dueDate: normalize(fields.get('due') ?? fields.get('due date')),
          priority: priority ?? 'medium',
        };
      }
    }

    const prose = line.match(
      /^[-*•]?\s*(\w[\w .'-]*?)\s+(?:will|needs to|should)\s+(.+?)(?:\s+by\s+(.+?))?[.]?$/i,
    );
    if (prose) {
      return {
        ...base,
        title: line.replace(/^[-*•]\s*/, ''),
        assignee: prose[1]!.trim(),
        dueDate: normalize(prose[3]),
      };
    }

    return { ...base, title: line.replace(/^[-*•]\s*/, '') };
  }

  async getActionItems(roomId: string): Promise<ActionItem[]> {
    const rows = await this.prisma.meetingActionItem.findMany({
      where: { roomId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toActionItem(row));
  }

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
