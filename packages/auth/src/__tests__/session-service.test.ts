import { describe, it, expect, beforeEach } from 'vitest';
import { SessionService } from '../services/session-service';
import type { AuthConfig, DeviceLoginInfo } from '../types';
import { prisma } from '../lib/prisma';

const TEST_CONFIG: AuthConfig = {
  jwtSecret: 'test-secret-key-for-unit-tests-minimum-length',
  jwtRefreshSecret: 'test-refresh-secret-key-for-unit-tests',
  accessTokenExpiresIn: 900,
  refreshTokenExpiresIn: 604800,
  issuer: 'quant-test',
  audience: 'quant-test-audience',
  bcryptRounds: 10,
  maxLoginAttempts: 5,
  lockoutDuration: 900,
};

const deviceInfo: DeviceLoginInfo = {
  deviceId: 'device-1',
  platform: 'web',
  userAgent: 'Mozilla/5.0 Test Browser',
  ipAddress: '127.0.0.1',
};

const deviceInfo2: DeviceLoginInfo = {
  deviceId: 'device-2',
  platform: 'ios',
  userAgent: 'QuantApp iOS/1.0',
  ipAddress: '192.168.1.1',
};

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(() => {
    service = new SessionService(TEST_CONFIG);
  });

  describe('createSession', () => {
    it('should create a session with correct properties', async () => {
      const session = await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });

      expect(session.id).toMatch(/^sess_/);
      expect(session.userId).toBe('user-1');
      expect(session.tokenId).toBe('tok-1');
      expect(session.refreshTokenFamily).toBe('fam-1');
      expect(session.deviceInfo).toEqual(deviceInfo);
      expect(session.app).toBe('quantmail');
      expect(session.isActive).toBe(true);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastActivityAt).toBeInstanceOf(Date);
      expect(session.expiresAt).toBeInstanceOf(Date);
      expect(session.expiresAt.getTime()).toBeGreaterThan(session.createdAt.getTime());
    });

    it('should create multiple sessions for the same user', async () => {
      const s1 = await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });
      const s2 = await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-2',
        refreshTokenFamily: 'fam-2',
        deviceInfo: deviceInfo2,
        app: 'quantchat',
      });

      expect(s1.id).not.toBe(s2.id);
      const sessions = await service.getUserSessions('user-1');
      expect(sessions.length).toBe(2);
    });
  });

  describe('getSession', () => {
    it('should return a session by ID', async () => {
      const created = await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });

      const found = await service.getSession(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('should return null for non-existent session', async () => {
      const found = await service.getSession('non-existent');
      expect(found).toBeNull();
    });

    it('should return null and revoke expired sessions', async () => {
      const session = await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });

      await prisma.session.update({
        where: { id: session.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const found = await service.getSession(session.id);
      expect(found).toBeNull();
    });
  });

  describe('getUserSessions', () => {
    it('should return empty array for user with no sessions', async () => {
      const sessions = await service.getUserSessions('no-sessions-user');
      expect(sessions).toEqual([]);
    });

    it('should return only active, non-expired sessions', async () => {
      await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });
      const s2 = await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-2',
        refreshTokenFamily: 'fam-2',
        deviceInfo: deviceInfo2,
        app: 'quantchat',
      });

      await service.revokeSession(s2.id);

      const sessions = await service.getUserSessions('user-1');
      expect(sessions.length).toBe(1);
      expect(sessions[0]!.tokenId).toBe('tok-1');
    });

    it('should sort sessions by lastActivityAt descending', async () => {
      const s1 = await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });
      const s2 = await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-2',
        refreshTokenFamily: 'fam-2',
        deviceInfo: deviceInfo2,
        app: 'quantchat',
      });

      await prisma.session.update({
        where: { id: s1.id },
        data: { lastActivityAt: new Date(Date.now() + 10000) },
      });

      const sessions = await service.getUserSessions('user-1');
      expect(sessions[0]!.id).toBe(s1.id);
      expect(sessions[1]!.id).toBe(s2.id);
    });
  });

  describe('touchSession', () => {
    it('should update lastActivityAt', async () => {
      const session = await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });

      const originalTime = session.lastActivityAt.getTime();
      await new Promise((r) => setTimeout(r, 10));
      await service.touchSession(session.id);

      const touched = await service.getSession(session.id);
      expect(touched!.lastActivityAt.getTime()).toBeGreaterThan(originalTime);
    });

    it('should not update inactive sessions', async () => {
      const session = await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });

      await prisma.session.updateMany({
        where: { id: session.id },
        data: { isActive: false },
      });
      const before = await prisma.session.findUnique({ where: { id: session.id } });
      await service.touchSession(session.id);
      const after = await prisma.session.findUnique({ where: { id: session.id } });
      expect(after!.lastActivityAt).toEqual(before!.lastActivityAt);
    });
  });

  describe('revokeSession', () => {
    it('should revoke a session and return true', async () => {
      const session = await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });

      const result = await service.revokeSession(session.id);
      expect(result).toBe(true);

      const found = await service.getSession(session.id);
      expect(found).toBeNull();
    });

    it('should return false for non-existent session', async () => {
      const result = await service.revokeSession('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('revokeAllSessions', () => {
    it('should revoke all sessions for a user', async () => {
      await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });
      await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-2',
        refreshTokenFamily: 'fam-2',
        deviceInfo: deviceInfo2,
        app: 'quantchat',
      });

      const revoked = await service.revokeAllSessions('user-1');
      expect(revoked).toBe(2);

      const sessions = await service.getUserSessions('user-1');
      expect(sessions.length).toBe(0);
    });

    it('should return 0 for user with no sessions', async () => {
      const revoked = await service.revokeAllSessions('no-user');
      expect(revoked).toBe(0);
    });
  });

  describe('revokeOtherSessions', () => {
    it('should revoke all sessions except the current one', async () => {
      const s1 = await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });
      await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-2',
        refreshTokenFamily: 'fam-2',
        deviceInfo: deviceInfo2,
        app: 'quantchat',
      });

      const revoked = await service.revokeOtherSessions('user-1', s1.id);
      expect(revoked).toBe(1);

      const sessions = await service.getUserSessions('user-1');
      expect(sessions.length).toBe(1);
      expect(sessions[0]!.id).toBe(s1.id);
    });

    it('should return 0 when user has no sessions', async () => {
      const revoked = await service.revokeOtherSessions('no-user', 'some-id');
      expect(revoked).toBe(0);
    });
  });

  describe('getActiveSessionCount', () => {
    it('should return count of active sessions', async () => {
      await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });
      await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-2',
        refreshTokenFamily: 'fam-2',
        deviceInfo: deviceInfo2,
        app: 'quantchat',
      });

      const count = await service.getActiveSessionCount('user-1');
      expect(count).toBe(2);
    });
  });

  describe('hasActiveSessionForApp', () => {
    it('should return true when user has session for app', async () => {
      await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });

      const has = await service.hasActiveSessionForApp('user-1', 'quantmail');
      expect(has).toBe(true);
    });

    it('should return false when user has no session for app', async () => {
      await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });

      const has = await service.hasActiveSessionForApp('user-1', 'quantchat');
      expect(has).toBe(false);
    });
  });

  describe('getSessionsByApp', () => {
    it('should group sessions by app', async () => {
      await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });
      await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-2',
        refreshTokenFamily: 'fam-2',
        deviceInfo: deviceInfo2,
        app: 'quantchat',
      });
      await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-3',
        refreshTokenFamily: 'fam-3',
        deviceInfo,
        app: 'quantmail',
      });

      const grouped = await service.getSessionsByApp('user-1');
      expect(grouped.get('quantmail')!.length).toBe(2);
      expect(grouped.get('quantchat')!.length).toBe(1);
    });
  });

  describe('getDeviceList', () => {
    it('should return deduplicated device list', async () => {
      await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });
      await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-2',
        refreshTokenFamily: 'fam-2',
        deviceInfo,
        app: 'quantchat',
      });

      const devices = await service.getDeviceList('user-1');
      expect(devices.length).toBe(1);
      expect(devices[0]!.deviceId).toBe('device-1');
      expect(devices[0]!.platform).toBe('web');
    });
  });

  describe('revokeByDeviceId', () => {
    it('should revoke all sessions for a specific device', async () => {
      await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });
      await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-2',
        refreshTokenFamily: 'fam-2',
        deviceInfo,
        app: 'quantchat',
      });
      await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-3',
        refreshTokenFamily: 'fam-3',
        deviceInfo: deviceInfo2,
        app: 'quantmail',
      });

      const revoked = await service.revokeByDeviceId('user-1', 'device-1');
      expect(revoked).toBe(2);

      const sessions = await service.getUserSessions('user-1');
      expect(sessions.length).toBe(1);
      expect(sessions[0]!.deviceInfo.deviceId).toBe('device-2');
    });

    it('should return 0 for user with no sessions', async () => {
      const revoked = await service.revokeByDeviceId('no-user', 'device-1');
      expect(revoked).toBe(0);
    });
  });

  describe('trusted devices', () => {
    it('should mark and check trusted devices', () => {
      expect(service.isDeviceTrusted('user-1', 'device-1')).toBe(false);

      service.markDeviceTrusted('user-1', 'device-1');
      expect(service.isDeviceTrusted('user-1', 'device-1')).toBe(true);
      expect(service.isDeviceTrusted('user-1', 'device-2')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should remove expired and inactive sessions', async () => {
      const s1 = await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });
      const s2 = await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-2',
        refreshTokenFamily: 'fam-2',
        deviceInfo: deviceInfo2,
        app: 'quantchat',
      });

      await prisma.session.update({
        where: { id: s1.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await prisma.session.updateMany({
        where: { id: s2.id },
        data: { isActive: false },
      });

      const cleaned = await service.cleanup();
      expect(cleaned).toBe(2);
    });

    it('should not remove active, non-expired sessions', async () => {
      await service.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo,
        app: 'quantmail',
      });

      const cleaned = await service.cleanup();
      expect(cleaned).toBe(0);
    });
  });

  describe('session limit enforcement', () => {
    it('should enforce max session limit by revoking oldest', async () => {
      const sessions = [];
      for (let i = 0; i < 12; i++) {
        const s = await service.createSession({
          userId: 'user-1',
          tokenId: `tok-${i}`,
          refreshTokenFamily: `fam-${i}`,
          deviceInfo: { ...deviceInfo, deviceId: `device-${i}` },
          app: 'quantmail',
        });
        sessions.push(s);
      }

      const active = await service.getUserSessions('user-1');
      expect(active.length).toBeLessThanOrEqual(10);
    });
  });

  describe('persistence', () => {
    it('persists sessions across SessionService instances (survives restart)', async () => {
      const first = new SessionService(TEST_CONFIG);
      const created = await first.createSession({
        userId: 'user-persist',
        tokenId: 'tok-p',
        refreshTokenFamily: 'fam-p',
        deviceInfo,
        app: 'quantmail',
      });

      // A brand-new instance models a fresh process/instance reading the store.
      const second = new SessionService(TEST_CONFIG);
      const found = await second.getSession(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.userId).toBe('user-persist');
      expect(await second.getUserSessions('user-persist')).toHaveLength(1);
    });
  });
});
