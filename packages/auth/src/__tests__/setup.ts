import { vi } from 'vitest';

vi.mock('@prisma/client', () => {
  const store = new Map<string, any>();

  const mockPrisma = {
    refreshToken: {
      create: vi.fn().mockImplementation((args: { data: any }) => {
        const record = {
          id: args.data.id || 'tok-mock',
          ...args.data,
          family: args.data.familyId,
          familyId: args.data.familyId,
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
    session: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation((args: { data: any }) => Promise.resolve(args.data)),
      update: vi.fn().mockResolvedValue({ id: 'sess-123' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(0),
    },
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
