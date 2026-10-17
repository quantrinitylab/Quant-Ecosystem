// ===========================================================================
// QC-F-467 — ConversationParticipantDto.birthdayMonthDay.
//
// Before this fix the participant DTO had no birthday field at all (and the
// member query never selected dateOfBirth/preferences). These tests pin:
//   - visible (pref 'everyone', or 'friends' + a shared DIRECT) → the DTO
//     carries { month, day } ONLY — a deep census proves no full date, no
//     year, no preferences blob leaks anywhere in the DTO;
//   - pref 'nobody', missing DOB, a blocked pair, and a GROUP co-member
//     under 'friends' (the v1 friend definition never counts GROUP) → null.
// The service runs against an in-memory fake whose delegates honestly
// evaluate the where clauses both ConversationService and PrivacyService
// issue (same evaluator family as qc-f-467-birthdays-today).
//
// Negative control: on the pre-fix service the DTO field does not exist,
// so the visible cases fail (undefined where {month, day} is expected).
// ===========================================================================

import { describe, expect, it } from 'vitest';
import { ConversationService } from '../services/conversation.service';
import { PrivacyService } from '../services/privacy.service';

const VIEWER = 'u_viewer';
const DOB = new Date(Date.UTC(1990, 2, 12)); // 12 March — month/day {3, 12}

type Where = Record<string, unknown>;

function matchField(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (typeof cond === 'object') {
    const c = cond as Record<string, unknown>;
    if ('not' in c) return !matchField(value, c.not);
    if ('notIn' in c) return !(c.notIn as unknown[]).includes(value);
    if ('in' in c) return (c.in as unknown[]).includes(value);
  }
  return value === cond;
}

function matchWhere(row: Record<string, unknown>, where: Where): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(cond as Where[]).some((clause) => matchWhere(row, clause))) return false;
    } else if (!matchField(row[key], cond)) return false;
  }
  return true;
}

function project<T extends Record<string, unknown>>(row: T, select?: Record<string, boolean>): T {
  if (!select) return row;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) if (select[key]) out[key] = row[key];
  return out as T;
}

interface FakeUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  dateOfBirth: Date | null;
  preferences: unknown;
}

function prefs(privacy: Record<string, unknown>): unknown {
  return { chatSettings: { privacy } };
}

function makeService(opts: {
  otherPrefs: unknown;
  otherDob: Date | null;
  convType: 'DIRECT' | 'GROUP';
}) {
  const users: FakeUser[] = [
    {
      id: VIEWER,
      username: 'viewer',
      displayName: 'Viewer',
      avatarUrl: null,
      dateOfBirth: null,
      preferences: null,
    },
    {
      id: 'u_other',
      username: 'other',
      displayName: 'Other',
      avatarUrl: null,
      dateOfBirth: opts.otherDob,
      preferences: opts.otherPrefs,
    },
  ];
  const conv = { id: 'conv_1', type: opts.convType, deletedAt: null };
  const memberRows = [VIEWER, 'u_other'].map((userId, i) => ({
    id: `m_${userId}`,
    conversationId: 'conv_1',
    userId,
    role: i === 0 ? 'OWNER' : 'MEMBER',
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    lastReadAt: null,
    nickname: null,
    leftAt: null,
    user: users.find((u) => u.id === userId)!,
  }));
  const findManyIn =
    <T extends Record<string, unknown>>(rows: T[]) =>
    async (args: unknown) => {
      const { where = {}, select } = (args ?? {}) as {
        where?: Where;
        select?: Record<string, boolean>;
      };
      return rows.filter((r) => matchWhere(r, where)).map((r) => project(r, select));
    };
  const prisma = {
    user: { findMany: findManyIn(users as unknown as Record<string, unknown>[]) },
    conversation: {
      findMany: findManyIn([conv] as unknown as Record<string, unknown>[]),
      findUnique: async () => ({ ...conv, members: memberRows }),
    },
    conversationMember: {
      findMany: findManyIn(memberRows as unknown as Record<string, unknown>[]),
      findFirst: async (args: unknown) => {
        const { where = {} } = (args ?? {}) as { where?: Where };
        return (
          (memberRows as unknown as Record<string, unknown>[]).find((r) => matchWhere(r, where)) ??
          null
        );
      },
    },
    closeFriend: { findMany: async () => [] },
  };
  const privacy = new PrivacyService(prisma as never);
  return new ConversationService(prisma as never, privacy);
}

async function otherParticipant(opts: Parameters<typeof makeService>[0]) {
  const svc = makeService(opts);
  const conv = await svc.getConversation('conv_1', VIEWER);
  const other = conv?.participants.find((p) => p.userId === 'u_other');
  return other;
}

describe('QC-F-467: participant DTO birthdayMonthDay', () => {
  it('T3-1: pref everyone → { month, day } only, with a deep no-leak census', async () => {
    const other = await otherParticipant({
      otherPrefs: prefs({ whoCanSeeBirthday: 'everyone' }),
      otherDob: DOB,
      convType: 'DIRECT',
    });
    expect(other?.birthdayMonthDay).toEqual({ month: 3, day: 12 });
    const serialized = JSON.stringify(other);
    expect(serialized).not.toContain('1990');
    expect(serialized).not.toContain('dateOfBirth');
    expect(serialized).not.toContain('preferences');
    expect(serialized).not.toContain('whoCanSeeBirthday');
  });

  it('T3-2: pref friends + shared DIRECT → visible (v1 friend definition)', async () => {
    const other = await otherParticipant({
      otherPrefs: prefs({ whoCanSeeBirthday: 'friends' }),
      otherDob: DOB,
      convType: 'DIRECT',
    });
    expect(other?.birthdayMonthDay).toEqual({ month: 3, day: 12 });
  });

  it('T3-3: pref nobody → null; missing DOB → null', async () => {
    const nobody = await otherParticipant({
      otherPrefs: prefs({ whoCanSeeBirthday: 'nobody' }),
      otherDob: DOB,
      convType: 'DIRECT',
    });
    expect(nobody?.birthdayMonthDay).toBeNull();

    const noDob = await otherParticipant({
      otherPrefs: prefs({ whoCanSeeBirthday: 'everyone' }),
      otherDob: null,
      convType: 'DIRECT',
    });
    expect(noDob?.birthdayMonthDay).toBeNull();
  });

  it('T3-4: blocked pair → null even with pref everyone', async () => {
    const other = await otherParticipant({
      otherPrefs: {
        chatSettings: {
          privacy: { whoCanSeeBirthday: 'everyone' },
          blockedUsers: [{ id: VIEWER, name: 'Viewer', username: 'viewer', blockedAt: 'x' }],
        },
      },
      otherDob: DOB,
      convType: 'DIRECT',
    });
    expect(other?.birthdayMonthDay).toBeNull();
  });

  it('T3-5: GROUP co-member under pref friends → null (GROUP is not friendship)', async () => {
    const other = await otherParticipant({
      otherPrefs: prefs({ whoCanSeeBirthday: 'friends' }),
      otherDob: DOB,
      convType: 'GROUP',
    });
    expect(other?.birthdayMonthDay).toBeNull();
  });
});
