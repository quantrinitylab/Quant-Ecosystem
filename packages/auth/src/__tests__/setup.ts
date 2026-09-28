import { vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => {
  const store = new Map<string, any>();
  const sessionStore = new Map<string, any>();

  const mockPrisma = {
    refreshToken: {
      create: vi.fn().mockImplementation((args: { data: any }) => {
        const record = {
          id: args.data.id || 'tok-mock',
          // Real Prisma applies the schema default; tests may override via data.
          isRevoked: false,
          ...args.data,
          // Preserve whichever alias the caller provided. The previous
          // implementation unconditionally overwrote `family` with the
          // (usually undefined) `familyId`, which broke family binding.
          family: args.data.family ?? args.data.familyId,
          familyId: args.data.familyId ?? args.data.family,
        };
        store.set(record.id, record);
        return Promise.resolve(record);
      }),
      findUnique: vi.fn().mockImplementation((args: { where: { id?: string; token?: string } }) => {
        const id = args.where.id || args.where.token;
        const found = id ? store.get(id) : undefined;
        return Promise.resolve(found || null);
      }),
      findFirst: vi.fn().mockImplementation((args: { where: any }) => {
        for (const [, record] of store) {
          let match = true;
          for (const [key, value] of Object.entries(args.where)) {
            if (record[key] !== value) {
              match = false;
              break;
            }
          }
          if (match) return Promise.resolve(record);
        }
        return Promise.resolve(null);
      }),
      updateMany: vi.fn().mockImplementation((args: { where: any; data: any }) => {
        let count = 0;
        for (const [id, record] of store) {
          let match = true;
          // Match by id
          if (args.where.id !== undefined && id !== args.where.id) {
            match = false;
          }
          // Match by field like family, userId, etc
          if (match) {
            for (const [key, value] of Object.entries(args.where)) {
              if (key !== 'id' && record[key] !== value) {
                match = false;
                break;
              }
            }
          }
          if (match) {
            Object.assign(record, args.data);
            count++;
          }
        }
        return Promise.resolve({ count });
      }),
      update: vi.fn().mockImplementation((args: { where: { id?: string }; data: any }) => {
        const id = args.where.id;
        if (id && store.has(id)) {
          Object.assign(store.get(id)!, args.data);
          return Promise.resolve(store.get(id));
        }
        return Promise.reject(new Error('Record not found'));
      }),
      delete: vi.fn().mockImplementation((args: { where: { id: string } }) => {
        store.delete(args.where.id);
        return Promise.resolve(undefined);
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      findUnique: vi.fn().mockImplementation((args: { where: { id?: string; email?: string } }) => {
        const id: string = args.where.id || args.where.email || 'default';
        const knownUsers: Record<string, { email: string; username: string; role: string }> = {
          'user-claims': { email: 'claims@quant.app', username: 'claimsuser', role: 'admin' },
          'user-refresh': { email: 'refresh@quant.app', username: 'refreshuser', role: 'user' },
          'user-reuse': { email: 'reuse@quant.app', username: 'reuseuser', role: 'user' },
          'user-revoke': { email: 'revoke@quant.app', username: 'revokeuser', role: 'user' },
          'user-123': { email: 'test@quant.app', username: 'testuser', role: 'user' },
        };
        const known = knownUsers[id];
        return Promise.resolve({
          id,
          email: known?.email || args.where.email || 'test@quant.app',
          username: known?.username || 'testuser',
          role: known?.role || 'user',
          passwordHash: 'hash123',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args: { data: any }) => {
        store.set(args.data.id || 'user-new', args.data);
        return Promise.resolve(args.data);
      }),
      update: vi.fn().mockResolvedValue({ id: 'user-123' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    session: (() => {
      const time = (x: any) => (x instanceof Date ? x.getTime() : x);
      const matches = (rec: any, where: Record<string, any> = {}): boolean => {
        for (const [key, cond] of Object.entries(where)) {
          const val = rec[key];
          if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
            if ('gt' in cond && !(time(val) > time(cond.gt))) return false;
            if ('gte' in cond && !(time(val) >= time(cond.gte))) return false;
            if ('lt' in cond && !(time(val) < time(cond.lt))) return false;
            if ('lte' in cond && !(time(val) <= time(cond.lte))) return false;
            if ('not' in cond && val === cond.not) return false;
          } else if (val !== cond) {
            return false;
          }
        }
        return true;
      };
      // Live references (for update/delete); readers get copies.
      const live = (where?: Record<string, any>) =>
        Array.from(sessionStore.values()).filter((r) => matches(r, where));
      return {
        create: vi.fn().mockImplementation((args: { data: any }) => {
          sessionStore.set(args.data.id, { ...args.data });
          return Promise.resolve({ ...sessionStore.get(args.data.id) });
        }),
        findUnique: vi
          .fn()
          .mockImplementation((args: { where: { id: string } }) =>
            Promise.resolve(
              sessionStore.has(args.where.id) ? { ...sessionStore.get(args.where.id) } : null,
            ),
          ),
        findFirst: vi.fn().mockImplementation((args: { where?: any }) => {
          const hit = live(args?.where)[0];
          return Promise.resolve(hit ? { ...hit } : null);
        }),
        findMany: vi.fn().mockImplementation((args: { where?: any; orderBy?: any }) => {
          let rows = live(args?.where);
          if (args?.orderBy) {
            const [field, dir] = Object.entries(args.orderBy)[0] as [string, 'asc' | 'desc'];
            rows = [...rows].sort((a, b) =>
              dir === 'desc' ? time(b[field]) - time(a[field]) : time(a[field]) - time(b[field]),
            );
          }
          return Promise.resolve(rows.map((r) => ({ ...r })));
        }),
        update: vi.fn().mockImplementation((args: { where: { id: string }; data: any }) => {
          const rec = sessionStore.get(args.where.id);
          if (!rec) return Promise.reject(new Error('Record not found'));
          Object.assign(rec, args.data);
          return Promise.resolve({ ...rec });
        }),
        updateMany: vi.fn().mockImplementation((args: { where?: any; data: any }) => {
          let count = 0;
          for (const rec of live(args?.where)) {
            Object.assign(rec, args.data);
            count++;
          }
          return Promise.resolve({ count });
        }),
        delete: vi.fn().mockImplementation((args: { where: { id: string } }) => {
          sessionStore.delete(args.where.id);
          return Promise.resolve(undefined);
        }),
        deleteMany: vi.fn().mockImplementation((args: { where?: any }) => {
          const victims = live(args?.where);
          for (const rec of victims) sessionStore.delete(rec.id);
          return Promise.resolve({ count: victims.length });
        }),
        count: vi
          .fn()
          .mockImplementation((args?: { where?: any }) =>
            Promise.resolve(live(args?.where).length),
          ),
      };
    })(),
    loginAttempt: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args: { data: any }) => Promise.resolve(args.data)),
      update: vi.fn().mockResolvedValue({ id: 'la-123' }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi
      .fn()
      .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $connect: vi.fn().mockResolvedValue(undefined),
  };

  return {
    PrismaClient: vi.fn().mockImplementation(function () {
      return mockPrisma;
    }),
  };
});

// Clear the shared session store before every test so persisted-session state
// never leaks between tests. `new PrismaClient()` returns the same closed-over
// mock, so this drives the reset through the public mock API and touches no
// other model's store.
import { PrismaClient } from '@prisma/client';
const __mockPrismaForReset = new PrismaClient();
beforeEach(async () => {
  await (
    __mockPrismaForReset as unknown as {
      session: { deleteMany(a: { where: Record<string, unknown> }): Promise<{ count: number }> };
    }
  ).session.deleteMany({ where: {} });
});
