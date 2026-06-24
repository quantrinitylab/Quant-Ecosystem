import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import type { OversightUser } from '../../../lib/domain';

/**
 * Owner user-oversight listing. Reads the shared User model (read-only) with an
 * optional text search, and degrades gracefully to an empty list when the DB is
 * unavailable so the surface always renders.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();
  const take = Math.min(Number(request.nextUrl.searchParams.get('take') ?? '50') || 50, 100);

  try {
    const where = q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' as const } },
            { username: { contains: q, mode: 'insensitive' as const } },
            { displayName: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const rows = await prisma.user.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        status: true,
        level: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    const users: OversightUser[] = rows.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      displayName: u.displayName,
      role: String(u.role),
      status: String(u.status),
      level: u.level,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data: users, dbConnected: true });
  } catch {
    return NextResponse.json({ success: true, data: [], dbConnected: false });
  }
}
