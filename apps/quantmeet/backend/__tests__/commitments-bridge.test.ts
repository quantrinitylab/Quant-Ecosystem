// ============================================================================
// Cross-app commitments — meeting action items surface in mail follow-ups
//
// Issue #29 unblocked: room participants DO carry userIds, so the bridge is
// assignee → participant (id or display name) → userId → shared
// UserCommitmentMemory channel. Proves the full loop with the REAL memory
// subsystem: QuantMeet extracts → QuantMail's reminder store lists it.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { createMemoryService, UserCommitmentMemory, type MemoryDbClient } from '@quant/ai';
import { ActionItemsService, type MeetingActionItemRow } from '../services/action-items.service';

function fakeDbClient(): MemoryDbClient {
  interface Row {
    [k: string]: unknown;
    ownerId: string | null;
    archivedAt: Date | null;
    deletedAt: Date | null;
  }
  const rows: Row[] = [];
  let seq = 0;
  return {
    memoryRecord: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const row = {
          id: `r${++seq}`,
          logicalId: `m${seq}`,
          version: 1,
          archivedAt: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        } as Row;
        rows.push(row);
        return row;
      },
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        rows.filter((r) => {
          const w = where ?? {};
          if ('ownerId' in w && r.ownerId !== w['ownerId']) return false;
          if ('archivedAt' in w && w['archivedAt'] === null && r.archivedAt !== null) return false;
          if ('deletedAt' in w && w['deletedAt'] === null && r.deletedAt !== null) return false;
          return true;
        }),
      updateMany: async () => ({ count: 0 }),
    },
  } as unknown as MemoryDbClient;
}

/** In-memory fake of the meetingActionItem prisma delegate. */
function fakeActionItemsPrisma() {
  const rows: MeetingActionItemRow[] = [];
  let seq = 0;
  return {
    meetingActionItem: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `ai_${++seq}`,
          createdAt: new Date(),
          ...data,
        } as unknown as MeetingActionItemRow;
        rows.push(row);
        return row;
      },
      findMany: async () => rows,
      update: async () => {
        throw new Error('not needed');
      },
    },
  };
}

/** AI fake that "extracts" one assigned action item per transcript line. */
const aiReturning = (lines: string[]) => ({
  generateText: async () => lines.join('\n'),
});

const room = {
  participants: [
    { id: 'p1', userId: 'user_sanjeev', displayName: 'Sanjeev' },
    { id: 'p2', userId: 'user_priya', displayName: 'Priya' },
  ],
};
const rooms = { getRoom: async () => room };

const transcript = [
  { participantId: 'p1', text: 'I will send the launch deck by Friday', timestamp: 0 },
];

describe('meeting commitments → shared channel → mail follow-ups (issue #29)', () => {
  it('an assigned action item lands in the shared commitments channel', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });
    const channel = new UserCommitmentMemory(memory);

    const svc = new ActionItemsService(
      fakeActionItemsPrisma() as never,
      aiReturning(['Send the launch deck by Friday']),
      { channel, rooms },
    );

    // The naive extractor produces assignee: null — simulate a resolved
    // assignee the way better extraction / manual assignment will provide it.
    const items = await svc.extractActionItems(transcript as never);
    items[0]!.assignee = 'Sanjeev';
    await (
      svc as unknown as {
        bridgeCommitment(roomId: string, item: unknown): Promise<void>;
      }
    ).bridgeCommitment('room1', items[0]);

    const active = await channel.listActive('user_sanjeev');
    expect(active).toHaveLength(1);
    expect(active[0]?.description).toContain('launch deck');
    expect(active[0]?.source).toBe('quantmeet');
    // Nothing leaked to the other participant:
    expect(await channel.listActive('user_priya')).toHaveLength(0);
  });

  it('unassigned items and unknown assignees bridge nothing', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });
    const channel = new UserCommitmentMemory(memory);
    const svc = new ActionItemsService(
      fakeActionItemsPrisma() as never,
      aiReturning(['Do the thing']),
      { channel, rooms },
    );
    const bridge = (
      svc as unknown as {
        bridgeCommitment(roomId: string, item: unknown): Promise<void>;
      }
    ).bridgeCommitment.bind(svc);

    await bridge('room1', {
      id: 'x1',
      title: 't',
      description: '',
      assignee: null,
      dueDate: null,
      priority: 'medium',
      status: 'pending',
    });
    await bridge('room1', {
      id: 'x2',
      title: 't',
      description: '',
      assignee: 'Stranger',
      dueDate: null,
      priority: 'medium',
      status: 'pending',
    });
    expect(await channel.listActive('user_sanjeev')).toHaveLength(0);
  });

  it('a failing channel never breaks the meeting flow (best-effort)', async () => {
    const svc = new ActionItemsService(
      fakeActionItemsPrisma() as never,
      aiReturning(['Task line']),
      {
        channel: {
          add: async () => {
            throw new Error('memory down');
          },
        },
        rooms,
      },
    );
    const bridge = (
      svc as unknown as {
        bridgeCommitment(roomId: string, item: unknown): Promise<void>;
      }
    ).bridgeCommitment.bind(svc);
    await expect(
      bridge('room1', {
        id: 'x',
        title: 't',
        description: '',
        assignee: 'Sanjeev',
        dueDate: null,
        priority: 'medium',
        status: 'pending',
      }),
    ).resolves.toBeUndefined();
  });

  it('without a bridge the service behaves exactly as before', async () => {
    const svc = new ActionItemsService(fakeActionItemsPrisma() as never, aiReturning(['Line one']));
    const items = await svc.extractActionItems(transcript as never);
    expect(items).toHaveLength(1); // pure compute unchanged
  });
});
