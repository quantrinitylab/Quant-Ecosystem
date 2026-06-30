import { describe, it, expect, beforeEach } from 'vitest';
import {
  ClickFraudService,
  type AdClickEventRow,
  type ClickFraudPrisma,
} from '../services/click-fraud.service';

function createFakePrisma(): ClickFraudPrisma & { rows: AdClickEventRow[] } {
  const rows: AdClickEventRow[] = [];
  let seq = 0;
  return {
    rows,
    adClickEvent: {
      async findMany(args: { where?: Record<string, unknown> }) {
        const where = args.where ?? {};
        const createdAt = where['createdAt'] as { gte?: Date } | undefined;
        const gte = createdAt?.gte ? new Date(createdAt.gte).getTime() : -Infinity;
        return rows.filter((r) => {
          if (where['userId'] && r.userId !== where['userId']) return false;
          if (where['ipHash'] && r.ipHash !== where['ipHash']) return false;
          return new Date(r.createdAt).getTime() >= gte;
        });
      },
      async create(args: { data: Record<string, unknown> }) {
        seq += 1;
        const row: AdClickEventRow = {
          id: String(args.data['id'] ?? `evt-${seq}`),
          adId: String(args.data['adId']),
          campaignId: (args.data['campaignId'] as string | null) ?? null,
          userId: String(args.data['userId']),
          ipHash: (args.data['ipHash'] as string | null) ?? null,
          deviceFp: (args.data['deviceFp'] as string | null) ?? null,
          billable: Boolean(args.data['billable']),
          fraudFlag: Boolean(args.data['fraudFlag']),
          fraudReason: (args.data['fraudReason'] as string | null) ?? null,
          createdAt: (args.data['createdAt'] as Date) ?? new Date(),
        };
        rows.push(row);
        return row;
      },
    },
  };
}

describe('ClickFraudService', () => {
  let prisma: ReturnType<typeof createFakePrisma>;
  let now: number;

  beforeEach(() => {
    prisma = createFakePrisma();
    now = 1_000_000_000;
  });

  function build(overrides = {}) {
    return new ClickFraudService(prisma as never, {
      now: () => new Date(now),
      generateId: () => `evt-${prisma.rows.length + 1}`,
      ...overrides,
    });
  }

  it('accepts a legitimate first click as billable and records it', async () => {
    const svc = build();
    const verdict = await svc.assessAndRecord({ adId: 'ad-1', userId: 'u1', ip: '1.2.3.4' });
    expect(verdict.billable).toBe(true);
    expect(verdict.fraudFlag).toBe(false);
    expect(prisma.rows).toHaveLength(1);
  });

  it('never stores a raw IP (only a salted hash)', async () => {
    const svc = build();
    await svc.assessAndRecord({ adId: 'ad-1', userId: 'u1', ip: '203.0.113.9' });
    expect(prisma.rows[0]!.ipHash).toBeTruthy();
    expect(prisma.rows[0]!.ipHash).not.toContain('203.0.113.9');
  });

  it('flags a duplicate (same user+ad within the dedup window) as non-billable', async () => {
    const svc = build({ dedupWindowMs: 30_000 });
    await svc.assessAndRecord({ adId: 'ad-1', userId: 'u1', ip: '1.2.3.4' });
    now += 5_000; // 5s later, same ad
    const verdict = await svc.assessAndRecord({ adId: 'ad-1', userId: 'u1', ip: '1.2.3.4' });
    expect(verdict.billable).toBe(false);
    expect(verdict.fraudReason).toBe('duplicate_click');
  });

  it('allows the same user clicking a DIFFERENT ad (not a duplicate)', async () => {
    const svc = build();
    await svc.assessAndRecord({ adId: 'ad-1', userId: 'u1', ip: '1.2.3.4' });
    now += 1_000;
    const verdict = await svc.assessAndRecord({ adId: 'ad-2', userId: 'u1', ip: '1.2.3.4' });
    expect(verdict.billable).toBe(true);
  });

  it('flags user velocity once the per-user threshold is reached', async () => {
    const svc = build({ maxClicksPerUser: 3, dedupWindowMs: 0 });
    // 3 clicks on distinct ads within the window are allowed...
    for (let i = 0; i < 3; i += 1) {
      now += 1_000;
      await svc.assessAndRecord({ adId: `ad-${i}`, userId: 'u1', ip: '1.2.3.4' });
    }
    now += 1_000;
    const verdict = await svc.assessAndRecord({ adId: 'ad-x', userId: 'u1', ip: '1.2.3.4' });
    expect(verdict.billable).toBe(false);
    expect(verdict.fraudReason).toBe('user_velocity');
  });

  it('flags IP velocity across different users sharing one IP', async () => {
    const svc = build({ maxClicksPerIp: 2, maxClicksPerUser: 1000, dedupWindowMs: 0 });
    now += 1_000;
    await svc.assessAndRecord({ adId: 'ad-1', userId: 'u1', ip: '9.9.9.9' });
    now += 1_000;
    await svc.assessAndRecord({ adId: 'ad-2', userId: 'u2', ip: '9.9.9.9' });
    now += 1_000;
    const verdict = await svc.assessAndRecord({ adId: 'ad-3', userId: 'u3', ip: '9.9.9.9' });
    expect(verdict.billable).toBe(false);
    expect(verdict.fraudReason).toBe('ip_velocity');
  });
});
