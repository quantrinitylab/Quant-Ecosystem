#!/usr/bin/env tsx
// ============================================================================
// QuantTube - Seed the video catalog with the shared sample catalog.
//
// P0-2: the staging catalog is completely empty (GET /api/videos → total: 0).
// This script inserts the 12 shared sample videos (backend/lib/sample-catalog.ts)
// as REAL, playable, PUBLIC rows so /api/videos and /api/videos/:id serve
// genuine content instead of 404ing.
//
// Idempotent: safe to re-run (upserts by id). Sample rows are clearly marked:
//   - owned by the system user `quantube-samples@quantrinity.in`
//   - published on the channel `QuantTube Samples` (handle: quantube-samples)
//   - viewCount/likeCount start at 0 (never fabricated popularity)
//   - tagged `["sample"]`
//
// Usage (from apps/quantube):
//   pnpm seed:samples
// Requires DATABASE_URL to point at the target database.
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { SAMPLE_CATALOG } from '../lib/sample-catalog';

const SAMPLE_USER_EMAIL = 'quantube-samples@quantrinity.in';
const SAMPLE_CHANNEL_HANDLE = 'quantube-samples';

async function main() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.upsert({
      where: { email: SAMPLE_USER_EMAIL },
      update: {},
      create: {
        email: SAMPLE_USER_EMAIL,
        username: 'quantube-samples',
        displayName: 'QuantTube Samples',
        // Not a login account: unusable placeholder hash.
        passwordHash: '$2a$12$quantube.samples.seed.not.a.login.account',
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: true,
        isVerified: true,
      },
    });

    const channel = await prisma.videoChannel.upsert({
      where: { handle: SAMPLE_CHANNEL_HANDLE },
      update: { name: 'QuantTube Samples' },
      create: {
        userId: user.id,
        name: 'QuantTube Samples',
        handle: SAMPLE_CHANNEL_HANDLE,
        description:
          'Built-in sample videos with real playback, shown while the catalog is being populated. Not creator uploads.',
        isVerified: true,
      },
    });

    let created = 0;
    let updated = 0;
    for (const v of SAMPLE_CATALOG) {
      const existing = await prisma.video.findUnique({ where: { id: v.id } });
      await prisma.video.upsert({
        where: { id: v.id },
        update: {
          title: v.title,
          description: v.description,
          videoUrl: v.videoUrl,
          thumbnailUrl: v.thumbnailUrl,
          duration: v.duration,
          category: v.category,
          channelId: channel.id,
          visibility: 'PUBLIC',
          processingStatus: 'COMPLETED',
          publishedAt: new Date(v.publishedAt),
          deletedAt: null,
        },
        create: {
          id: v.id,
          userId: user.id,
          channelId: channel.id,
          title: v.title,
          description: v.description,
          videoUrl: v.videoUrl,
          thumbnailUrl: v.thumbnailUrl,
          duration: v.duration,
          category: v.category,
          tags: ['sample'],
          visibility: 'PUBLIC',
          viewCount: 0,
          likeCount: 0,
          commentCount: 0,
          processingStatus: 'COMPLETED',
          publishedAt: new Date(v.publishedAt),
        },
      });
      if (existing) updated++;
      else created++;
    }

    // eslint-disable-next-line no-console
    console.log(
      `seed-sample-catalog: done. created=${created} updated=${updated} channel=${channel.handle}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seed-sample-catalog: FAILED', err);
  process.exit(1);
});
