// ============================================================================
// Auth - Session Service (persisted; SSO design §3.6)
// ============================================================================
// Sessions live in the `sessions` Postgres table so they survive process
// restarts and are shared across instances. The Prisma client is injectable
// (2nd ctor arg) exactly like TokenService, defaulting to the shared
// singleton so existing `new SessionService(config)` call sites are unchanged.

import type { AuthConfig, AuthSession, DeviceLoginInfo } from '../types';
import type { QuantApp } from '@quant/common';
import { generateId } from '../crypto/secure-random';
import { prisma as defaultPrisma } from '../lib/prisma';

/** Session creation options (unchanged public shape). */
export interface CreateSessionOptions {
  userId: string;
  tokenId: string;
  refreshTokenFamily: string;
  deviceInfo: DeviceLoginInfo;
  app: QuantApp;
}

/** A persisted `sessions` row, as the service reads/writes it. */
interface SessionRow {
  id: string;
  userId: string;
  tokenId: string | null;
  refreshTokenFamily: string | null;
  app: string | null;
  isActive: boolean;
  lastActivityAt: Date;
  createdAt: Date;
  expiresAt: Date;
  deviceInfo: unknown; // Json column, narrowed to DeviceLoginInfo on read
}
/**
 * The subset of `PrismaClient` this service uses. Injecting an interface
 * (not the concrete client) is what makes the store swappable in tests.
 */
export interface SessionPrismaClient {
  session: {
    create(args: { data: SessionRow }): Promise<SessionRow>;
    findUnique(args: { where: { id: string } }): Promise<SessionRow | null>;
    findMany(args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
    }): Promise<SessionRow[]>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
}

export class SessionService {
  private prisma: SessionPrismaClient;
  private maxSessionsPerUser: number;
  private sessionTimeout: number; // ms
  // Trusted-device trust stays in-memory: the sessions table has no such
  // concept (see plan "Design decisions locked").
  private trustedDevices: Map<string, Set<string>> = new Map();

  constructor(
    _config: AuthConfig,
    prismaClient: SessionPrismaClient = defaultPrisma as unknown as SessionPrismaClient,
  ) {
    this.prisma = prismaClient;
    this.maxSessionsPerUser = 10;
    this.sessionTimeout = 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  private toSession(row: SessionRow): AuthSession {
    return {
      id: row.id,
      userId: row.userId,
      tokenId: row.tokenId ?? '',
      refreshTokenFamily: row.refreshTokenFamily ?? '',
      deviceInfo: row.deviceInfo as DeviceLoginInfo,
      app: (row.app ?? '') as QuantApp,
      isActive: row.isActive,
      lastActivityAt: new Date(row.lastActivityAt),
      createdAt: new Date(row.createdAt),
      expiresAt: new Date(row.expiresAt),
    };
  }

  async createSession(options: CreateSessionOptions): Promise<AuthSession> {
    await this.enforceSessionLimit(options.userId);
    const now = new Date();
    const row: SessionRow = {
      id: this.generateSessionId(),
      userId: options.userId,
      tokenId: options.tokenId,
      refreshTokenFamily: options.refreshTokenFamily,
      app: options.app,
      isActive: true,
      lastActivityAt: now,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.sessionTimeout),
      deviceInfo: options.deviceInfo,
    };
    const created = await this.prisma.session.create({ data: row });
    return this.toSession(created);
  }

  async getSession(sessionId: string): Promise<AuthSession | null> {
    const row = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!row) return null;
    if (new Date(row.expiresAt) < new Date()) {
      await this.revokeSession(sessionId); // expired → hard-delete, as before
      return null;
    }
    if (!row.isActive) return null;
    return this.toSession(row);
  }

  async getUserSessions(userId: string): Promise<AuthSession[]> {
    const rows = await this.prisma.session.findMany({
      where: { userId, isActive: true, expiresAt: { gt: new Date() } },
      orderBy: { lastActivityAt: 'desc' },
    });
    return rows.map((r) => this.toSession(r));
  }

  async touchSession(sessionId: string): Promise<void> {
    // Only active sessions are touched; the {isActive:true} guard reproduces
    // the old "don't update inactive sessions" behaviour.
    await this.prisma.session.updateMany({
      where: { id: sessionId, isActive: true },
      data: { lastActivityAt: new Date() },
    });
  }

  async revokeSession(sessionId: string): Promise<boolean> {
    const { count } = await this.prisma.session.deleteMany({ where: { id: sessionId } });
    return count > 0;
  }

  async revokeAllSessions(userId: string): Promise<number> {
    const { count } = await this.prisma.session.deleteMany({ where: { userId } });
    return count;
  }

  async revokeOtherSessions(userId: string, currentSessionId: string): Promise<number> {
    const { count } = await this.prisma.session.deleteMany({
      where: { userId, id: { not: currentSessionId } },
    });
    return count;
  }

  async getActiveSessionCount(userId: string): Promise<number> {
    const sessions = await this.getUserSessions(userId);
    return sessions.length;
  }

  async hasActiveSessionForApp(userId: string, app: QuantApp): Promise<boolean> {
    const sessions = await this.getUserSessions(userId);
    return sessions.some((s) => s.app === app && s.isActive);
  }

  async getSessionsByApp(userId: string): Promise<Map<QuantApp, AuthSession[]>> {
    const sessions = await this.getUserSessions(userId);
    const grouped = new Map<QuantApp, AuthSession[]>();
    for (const session of sessions) {
      const appSessions = grouped.get(session.app) || [];
      appSessions.push(session);
      grouped.set(session.app, appSessions);
    }
    return grouped;
  }

  private async enforceSessionLimit(userId: string): Promise<void> {
    const sessions = await this.getUserSessions(userId);
    if (sessions.length >= this.maxSessionsPerUser) {
      // Oldest-first; free exactly enough room for the incoming session.
      const sorted = [...sessions].sort(
        (a, b) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime(),
      );
      const toRemove = sorted.slice(0, sessions.length - this.maxSessionsPerUser + 1);
      for (const session of toRemove) {
        await this.revokeSession(session.id);
      }
    }
  }

  async getDeviceList(
    userId: string,
  ): Promise<{ deviceId: string; name: string; platform: string; lastSeen: Date }[]> {
    const sessions = await this.getUserSessions(userId);
    const deviceMap = new Map<
      string,
      { deviceId: string; name: string; platform: string; lastSeen: Date }
    >();
    for (const session of sessions) {
      const existing = deviceMap.get(session.deviceInfo.deviceId);
      if (!existing || session.lastActivityAt > existing.lastSeen) {
        deviceMap.set(session.deviceInfo.deviceId, {
          deviceId: session.deviceInfo.deviceId,
          name: `${session.deviceInfo.platform} - ${session.deviceInfo.userAgent.substring(0, 30)}`,
          platform: session.deviceInfo.platform,
          lastSeen: session.lastActivityAt,
        });
      }
    }
    return Array.from(deviceMap.values());
  }

  async revokeByDeviceId(userId: string, deviceId: string): Promise<number> {
    const sessions = await this.getUserSessions(userId);
    const targets = sessions.filter((s) => s.deviceInfo.deviceId === deviceId);
    for (const session of targets) {
      await this.revokeSession(session.id);
    }
    return targets.length;
  }
  isDeviceTrusted(userId: string, deviceId: string): boolean {
    const trusted = this.trustedDevices.get(userId);
    if (!trusted) return false;
    return trusted.has(deviceId);
  }

  markDeviceTrusted(userId: string, deviceId: string): void {
    if (!this.trustedDevices.has(userId)) {
      this.trustedDevices.set(userId, new Set());
    }
    this.trustedDevices.get(userId)!.add(deviceId);
  }

  async cleanup(): Promise<number> {
    const now = new Date();
    const expired = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    const inactive = await this.prisma.session.deleteMany({
      where: { isActive: false },
    });
    return expired.count + inactive.count;
  }

  private generateSessionId(): string {
    return generateId('sess');
  }
}
