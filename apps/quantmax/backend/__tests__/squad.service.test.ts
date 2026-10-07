import { describe, it, expect, beforeEach } from 'vitest';
import { SquadService, type SquadPrisma } from '../services/squad.service';
import type { VideoChatTokenIssuer } from '../services/video-chat.service';

interface Squad {
  id: string;
  name: string;
  ownerId: string;
}
interface Member {
  id: string;
  squadId: string;
  userId: string;
  role: string;
  leftAt: Date | null;
}

function createFakePrisma() {
  const squads = new Map<string, Squad>();
  const members: Member[] = [];
  let n = 0;
  const prisma: SquadPrisma & { squads: Map<string, Squad>; members: Member[] } = {
    squads,
    members,
    squad: {
      async create({ data }) {
        n += 1;
        const s: Squad = {
          id: `sq-${n}`,
          name: String(data['name']),
          ownerId: String(data['ownerId']),
        };
        squads.set(s.id, s);
        return s;
      },
      async findUnique({ where }) {
        return squads.get(where.id) ?? null;
      },
    },
    squadMember: {
      async create({ data }) {
        n += 1;
        const m: Member = {
          id: `m-${n}`,
          squadId: String(data['squadId']),
          userId: String(data['userId']),
          role: String(data['role']),
          leftAt: null,
        };
        members.push(m);
        return m;
      },
      async findFirst({ where }) {
        return (
          members.find(
            (m) =>
              m.squadId === where['squadId'] && m.userId === where['userId'] && m.leftAt === null,
          ) ?? null
        );
      },
      async count({ where }) {
        return members.filter((m) => m.squadId === where['squadId'] && m.leftAt === null).length;
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const m of members) {
          if (m.squadId === where['squadId'] && m.userId === where['userId'] && m.leftAt === null) {
            m.leftAt = data['leftAt'] as Date;
            count += 1;
          }
        }
        return { count };
      },
    },
  };
  return prisma;
}

const fakeIssuer: VideoChatTokenIssuer = {
  issue: async (roomName, identity) => `tok:${roomName}:${identity}`,
};

describe('SquadService', () => {
  let prisma: ReturnType<typeof createFakePrisma>;
  let svc: SquadService;

  beforeEach(() => {
    prisma = createFakePrisma();
    svc = new SquadService(prisma as never, { tokenIssuer: fakeIssuer });
  });

  it('creates a squad with the creator as OWNER', async () => {
    const sq = await svc.createSquad('owner-1', { name: 'Alpha' });
    expect(sq.ownerId).toBe('owner-1');
    expect(sq.memberCount).toBe(1);
    expect(prisma.members[0]!.role).toBe('OWNER');
  });

  it('rejects an empty squad name', async () => {
    await expect(svc.createSquad('o', { name: '  ' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('joins idempotently as MEMBER', async () => {
    const sq = await svc.createSquad('owner-1', { name: 'Alpha' });
    await svc.join(sq.id, 'u2');
    await svc.join(sq.id, 'u2');
    expect(await svc.memberCount(sq.id)).toBe(2);
    expect(prisma.members.find((m) => m.userId === 'u2')!.role).toBe('MEMBER');
  });

  it('leaves a squad', async () => {
    const sq = await svc.createSquad('owner-1', { name: 'Alpha' });
    await svc.join(sq.id, 'u2');
    expect((await svc.leave(sq.id, 'u2')).left).toBe(true);
    expect(await svc.memberCount(sq.id)).toBe(1);
  });

  it('issues an own-token-only room token for a member', async () => {
    const sq = await svc.createSquad('owner-1', { name: 'Alpha' });
    await svc.join(sq.id, 'u2');
    const room = await svc.createRoomToken(sq.id, 'u2');
    expect(room.roomName).toBe(`max-squad:${sq.id}`);
    expect(room.token).toBe(`tok:max-squad:${sq.id}:u2`);
    expect(room.token).not.toContain('owner-1');
  });

  it('forbids a non-member from getting a room token', async () => {
    const sq = await svc.createSquad('owner-1', { name: 'Alpha' });
    await expect(svc.createRoomToken(sq.id, 'stranger')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('fails closed (no token) when LiveKit is unconfigured', async () => {
    const noKit = new SquadService(prisma as never, { tokenIssuer: undefined });
    const sq = await noKit.createSquad('owner-1', { name: 'Alpha' });
    const room = await noKit.createRoomToken(sq.id, 'owner-1');
    expect(room.roomName).toBe(`max-squad:${sq.id}`);
    expect(room.token).toBeUndefined();
  });

  it('reports isAdmin by role', async () => {
    const sq = await svc.createSquad('owner-1', { name: 'Alpha' });
    await svc.join(sq.id, 'u2');
    expect(await svc.isAdmin(sq.id, 'owner-1')).toBe(true);
    expect(await svc.isAdmin(sq.id, 'u2')).toBe(false);
  });

  it('404s for a missing squad', async () => {
    await expect(svc.join('missing', 'u1')).rejects.toMatchObject({ statusCode: 404 });
  });
});
