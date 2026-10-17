// ===========================================================================
// QC-F-467 — GET /users/birthdays/today.
//
// Before this fix the endpoint did not exist at all (404) — there was no
// birthday surface anywhere. These tests pin the band contract against a
// fake prisma that HONESTLY evaluates the where clauses the route and
// PrivacyService issue (a fake that ignored them would be theatre):
//   - only REAL relationships are candidates (active DIRECT partner or a
//     CloseFriend edge in either direction) — a stranger with pref
//     'everyone' is NOT shown (contacts surface, not discovery);
//   - only today's birthday (viewer's timezone, server clock) is shown;
//   - visibility is fail-closed: pref 'nobody', a blocked pair, a deleted /
//     suspended account, and a malformed privacy block all hide the entry;
//   - the response shape is exactly {userId, displayName, username,
//     avatarUrl, directConversationId} — no date, year, or age anywhere;
//   - an unknown `tz` is a 400; `tz` omitted falls back to UTC.
// Day-relative fixtures are derived from the real clock (the route reads
// the server clock), while the timezone maths and the leap rule are pinned
// deterministically against the pure helpers with fixed instants.
//
// Negative control: on the pre-fix users.ts the route does not exist, so
// every route case fails (404); the helper pins fail at import (the lib
// did not exist).
// ===========================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import usersRoutes from '../routes/users';
import {
  isBirthdayOn,
  parseDateOfBirth,
  todayMonthDayIn,
  toDateOnlyString,
} from '../lib/birthdays';

const VIEWER = 'u_viewer';

// ---------------------------------------------------------------------------
// Fixture users, relative to the real "today" (UTC) so the route's server
// clock and the fixtures always agree.
// ---------------------------------------------------------------------------
function utcDob(monthsDaysFromToday: number, year = 1990): Date {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + monthsDaysFromToday),
  );
  return new Date(Date.UTC(year, d.getUTCMonth(), d.getUTCDate()));
}

interface UserRow {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  status: string;
  deletedAt: Date | null;
  preferences: unknown;
  dateOfBirth: Date | null;
}

function prefs(privacy: Record<string, unknown>): unknown {
  return { chatSettings: { privacy } };
}

function userRow(partial: Partial<UserRow> & { id: string }): UserRow {
  return {
    username: partial.id,
    displayName: partial.id,
    email: `${partial.id}@example.test`,
    avatarUrl: null,
    bio: null,
    status: 'ACTIVE',
    deletedAt: null,
    preferences: null,
    dateOfBirth: null,
    ...partial,
  };
}

// DIRECT partners of the viewer (conv ids keyed by partner id).
const DIRECT: Record<string, string> = {
  u_today: 'conv_today',
  u_tomorrow: 'conv_tomorrow',
  u_shy: 'conv_shy',
  u_blocked: 'conv_blocked',
  u_deleted: 'conv_deleted',
  u_broken: 'conv_broken',
  u_grouponly: 'conv_group', // actually a GROUP conv — must NOT count
};

function buildTables() {
  const users: UserRow[] = [
    userRow({ id: VIEWER, displayName: 'Viewer' }),
    userRow({ id: 'u_today', displayName: 'Tara Today', dateOfBirth: utcDob(0) }),
    userRow({ id: 'u_tomorrow', displayName: 'Tim Tomorrow', dateOfBirth: utcDob(1) }),
    userRow({
      id: 'u_shy',
      displayName: 'Shy',
      dateOfBirth: utcDob(0),
      preferences: prefs({ whoCanSeeBirthday: 'nobody' }),
    }),
    userRow({
      id: 'u_blocked',
      displayName: 'Blocked',
      dateOfBirth: utcDob(0),
      preferences: {
        chatSettings: { blockedUsers: [{ id: VIEWER, name: 'Viewer', username: 'viewer', blockedAt: 'x' }] },
      },
    }),
    userRow({
      id: 'u_deleted',
      displayName: 'Deleted',
      dateOfBirth: utcDob(0),
      deletedAt: new Date(),
    }),
    userRow({
      id: 'u_broken',
      displayName: 'Broken Prefs',
      dateOfBirth: utcDob(0),
      preferences: { chatSettings: { privacy: 'garbage' } },
    }),
    userRow({
      id: 'u_grouponly',
      displayName: 'Group Only',
      dateOfBirth: utcDob(0),
      preferences: prefs({ whoCanSeeBirthday: 'friends' }),
    }),
    // CloseFriend-only (owner listed the viewer), pref 'friends' → visible.
    userRow({
      id: 'u_cf',
      displayName: 'Close Friend',
      dateOfBirth: utcDob(0),
      preferences: prefs({ whoCanSeeBirthday: 'friends' }),
    }),
    // No relationship at all; even 'everyone' must NOT surface them here.
    userRow({
      id: 'u_stranger',
      displayName: 'Stranger',
      dateOfBirth: utcDob(0),
      preferences: prefs({ whoCanSeeBirthday: 'everyone' }),
    }),
    // DIRECT partner with no DOB — no signal, ever.
    userRow({ id: 'u_nodob', displayName: 'No Dob' }),
  ];
  DIRECT['u_nodob'] = 'conv_nodob';

  const conversations = Object.entries(DIRECT).map(([partnerId, id]) => ({
    id,
    type: id === 'conv_group' ? 'GROUP' : 'DIRECT',
    deletedAt: null,
  }));
  const members: Array<{ conversationId: string; userId: string; leftAt: Date | null }> = [];
  for (const [partnerId, convId] of Object.entries(DIRECT)) {
    members.push({ conversationId: convId, userId: VIEWER, leftAt: null });
    members.push({ conversationId: convId, userId: partnerId, leftAt: null });
  }
  const closeFriends = [{ userId: 'u_cf', friendId: VIEWER }];
  return { users, conversations, members, closeFriends };
}

// ---------------------------------------------------------------------------
// Honest fake prisma: evaluates eq / in / notIn / not / OR / null checks,
// then applies select projection. Shared by the route and PrivacyService.
// ---------------------------------------------------------------------------
type Where = Record<string, unknown>;

function matchField(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (typeof cond === 'object') {
    const c = cond as Record<string, unknown>;
    if ('not' in c) return !matchField(value, c.not);
    if ('notIn' in c) return !(c.notIn as unknown[]).includes(value);
    if ('in' in c) return (c.in as unknown[]).includes(value);
    if ('contains' in c) {
      const hay = String(value ?? '');
      const needle = String(c.contains);
      return c.mode === 'insensitive'
        ? hay.toLowerCase().includes(needle.toLowerCase())
        : hay.includes(needle);
    }
  }
  return value === cond;
}

function matchWhere(row: Record<string, unknown>, where: Where): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(cond as Where[]).some((clause) => matchWhere(row, clause))) return false;
    } else if (key === 'AND') {
      if (!(cond as Where[]).every((clause) => matchWhere(row, clause))) return false;
    } else if (!matchField(row[key], cond)) {
      return false;
    }
  }
  return true;
}

function project<T extends Record<string, unknown>>(row: T, select?: Record<string, boolean>): T {
  if (!select) return row;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) if (select[key]) out[key] = row[key];
  return out as T;
}

function makeFakePrisma() {
  const tables = buildTables();
  const findManyIn =
    <T extends Record<string, unknown>>(rows: T[]) =>
    async (args: unknown) => {
      const { where = {}, select, orderBy } = (args ?? {}) as {
        where?: Where;
        select?: Record<string, boolean>;
        orderBy?: unknown;
      };
      let out = rows.filter((r) => matchWhere(r, where));
      void orderBy;
      return out.map((r) => project(r, select));
    };
  return {
    user: { findMany: findManyIn(tables.users as unknown as Record<string, unknown>[]) },
    conversation: { findMany: findManyIn(tables.conversations as unknown as Record<string, unknown>[]) },
    conversationMember: { findMany: findManyIn(tables.members as unknown as Record<string, unknown>[]) },
    closeFriend: { findMany: findManyIn(tables.closeFriends as unknown as Record<string, unknown>[]) },
  };
}

async function buildApp(authenticated = true): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _request, reply) => {
    const e = err as Error & { statusCode?: number; code?: string };
    if (typeof e.statusCode === 'number') {
      return reply.status(e.statusCode).send({
        success: false,
        error: { code: e.code ?? 'ERROR', message: e.message, statusCode: e.statusCode },
      });
    }
    return reply.status(500).send({ success: false, error: { message: e.message } });
  });
  (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
    'prisma',
    makeFakePrisma(),
  );
  if (authenticated) {
    app.addHook('preHandler', async (req) => {
      (req as unknown as { auth: unknown }).auth = { userId: VIEWER, username: 'viewer' };
    });
  }
  await app.register(usersRoutes, { prefix: '/users' });
  await app.ready();
  return app;
}

describe('QC-F-467: GET /users/birthdays/today', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it('T2-1: only visible today-birthdays among real contacts are returned', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/birthdays/today?tz=UTC' });
    expect(res.statusCode).toBe(200);
    const data = (res.json() as { data: Array<{ userId: string }> }).data;
    const ids = data.map((d) => d.userId).sort();
    // u_today (DIRECT, default friends pref + DIRECT = friend) and u_cf
    // (CloseFriend owner→viewer, friends pref). Everything else is hidden
    // for its own pinned reason in T2-2.
    expect(ids).toEqual(['u_cf', 'u_today']);
  });

  it('T2-2: hidden reasons — tomorrow, nobody-pref, blocked, deleted, malformed prefs, group-only, stranger, no-DOB', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/birthdays/today?tz=UTC' });
    const ids = (res.json() as { data: Array<{ userId: string }> }).data.map((d) => d.userId);
    for (const hidden of [
      'u_tomorrow',
      'u_shy',
      'u_blocked',
      'u_deleted',
      'u_broken',
      'u_grouponly',
      'u_stranger',
      'u_nodob',
      VIEWER,
    ]) {
      expect(ids).not.toContain(hidden);
    }
  });

  it('T2-3: response shape is exactly the five band keys — no date/year/age leak', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/birthdays/today?tz=UTC' });
    const data = (res.json() as { data: Array<Record<string, unknown>> }).data;
    expect(data.length).toBeGreaterThan(0);
    for (const entry of data) {
      expect(Object.keys(entry).sort()).toEqual([
        'avatarUrl',
        'directConversationId',
        'displayName',
        'userId',
        'username',
      ]);
    }
    const byId = new Map(data.map((d) => [d['userId'], d]));
    expect(byId.get('u_today')?.['directConversationId']).toBe('conv_today');
    expect(byId.get('u_cf')?.['directConversationId']).toBeNull();
    expect(JSON.stringify(data)).not.toMatch(/dateOfBirth|birthYear|age/);
  });

  it('T2-4: unknown tz is a 400; missing tz falls back to UTC; no auth is 401', async () => {
    const bad = await app.inject({
      method: 'GET',
      url: '/users/birthdays/today?tz=Not%2FAZone',
    });
    expect(bad.statusCode).toBe(400);

    const fallback = await app.inject({ method: 'GET', url: '/users/birthdays/today' });
    expect(fallback.statusCode).toBe(200);

    const anonApp = await buildApp(false);
    try {
      const anon = await anonApp.inject({ method: 'GET', url: '/users/birthdays/today' });
      expect(anon.statusCode).toBe(401);
    } finally {
      await anonApp.close();
    }
  });
});

describe('QC-F-467: birthday helpers (fixed-instant pins)', () => {
  it('T2-5: todayMonthDayIn reads the server clock in the viewer zone', () => {
    // 2026-03-11T19:00Z is already 2026-03-12 in Asia/Kolkata.
    const instant = new Date('2026-03-11T19:00:00.000Z');
    expect(todayMonthDayIn('Asia/Kolkata', instant)).toEqual({ month: 3, day: 12, year: 2026 });
    expect(todayMonthDayIn('UTC', instant)).toEqual({ month: 3, day: 11, year: 2026 });
    expect(() => todayMonthDayIn('Not/AZone', instant)).toThrow();
  });

  it('T2-6: leap rule — Feb 29 shows Feb 29 in leap years, Feb 28 otherwise, never Mar 1', () => {
    const dob = new Date(Date.UTC(2000, 1, 29));
    expect(isBirthdayOn(dob, 2, 29, 2028)).toBe(true); // leap year, real day
    expect(isBirthdayOn(dob, 2, 28, 2028)).toBe(false); // leap year: NOT also on the 28th
    expect(isBirthdayOn(dob, 2, 28, 2027)).toBe(true); // non-leap: observed on the 28th
    expect(isBirthdayOn(dob, 3, 1, 2027)).toBe(false);
    expect(isBirthdayOn(dob, 2, 29, 2027)).toBe(false);
    const plain = new Date(Date.UTC(1990, 2, 12));
    expect(isBirthdayOn(plain, 3, 12, 2027)).toBe(true);
    expect(isBirthdayOn(plain, 3, 13, 2027)).toBe(false);
  });

  it('T2-7: parseDateOfBirth round-trips and rejects impossible/future dates', () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    const parsed = parseDateOfBirth('2000-03-12', now);
    expect(parsed?.toISOString()).toBe('2000-03-12T00:00:00.000Z');
    expect(parsed && toDateOnlyString(parsed)).toBe('2000-03-12');
    expect(parseDateOfBirth('2026-02-30', now)).toBeNull();
    expect(parseDateOfBirth('2026-06-16', now)).toBeNull(); // tomorrow = future
    expect(parseDateOfBirth('2026-06-15', now)).not.toBeNull(); // today is fine
    expect(parseDateOfBirth('1899-01-01', now)).toBeNull();
  });

  it('vi import is used (harness parity)', () => {
    expect(typeof vi.fn).toBe('function');
  });
});
