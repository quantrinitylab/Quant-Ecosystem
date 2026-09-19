import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';

const databaseUrl = process.env['DATABASE_URL'] || process.env['MEMORY_SHADOW_TEST_DATABASE_URL'];
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres('SnapView PostgreSQL concurrency and unique index proof (SEC-2)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    // Ensure parent tables and snap_views exist via authentic DDL (single command per statement)
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "users" ("id" TEXT PRIMARY KEY)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "messages" ("id" TEXT PRIMARY KEY)`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "snap_views" (
          "id" TEXT NOT NULL,
          "messageId" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "snap_views_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "snap_views_messageId_userId_key"
          ON "snap_views" ("messageId", "userId")
    `);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('guarantees under genuine parallel concurrency that exactly one insert succeeds and the race loser takes P2002', async () => {
    const messageId = `msg-race-${randomUUID()}`;
    const userId = `user-race-${randomUUID()}`;

    // Ensure foreign key targets exist in parent tables
    await prisma.$executeRawUnsafe(
      `INSERT INTO "users" ("id") VALUES ($1) ON CONFLICT DO NOTHING`,
      userId,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "messages" ("id") VALUES ($1) ON CONFLICT DO NOTHING`,
      messageId,
    );

    // Fire 10 simultaneous concurrent inserts for the EXACT SAME (messageId, userId) pair
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        (prisma as any).snapView.create({
          data: {
            messageId,
            userId,
          },
        }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 1 winner in PostgreSQL
    expect(fulfilled).toHaveLength(1);
    // Exactly 9 losers rejected by PostgreSQL unique constraint
    expect(rejected).toHaveLength(9);

    for (const r of rejected) {
      if (r.status === 'rejected') {
        expect(r.reason).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
        expect((r.reason as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
      }
    }

    // Verify exactly 1 row exists in Postgres
    const count = await (prisma as any).snapView.count({
      where: { messageId, userId },
    });
    expect(count).toBe(1);
  });
});
