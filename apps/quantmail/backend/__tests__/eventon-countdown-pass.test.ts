import { describe, it, expect, beforeEach } from 'vitest';
import {
  EventCountdownPassService,
  VirtualEventConfig,
  AttendeeAccessPass,
} from '../services/event-countdown-pass.service';

describe('EventCountdownPassService', () => {
  let service: EventCountdownPassService;

  beforeEach(() => {
    service = new EventCountdownPassService();
  });

  describe('calculateCountdown', () => {
    it('returns UPCOMING with correct time remaining', () => {
      const start = '2026-10-02T10:00:00Z';
      const end = '2026-10-02T12:00:00Z';
      const current = '2026-10-01T08:30:00Z'; // 1 day, 1 hour, 30 min before start

      const result = service.calculateCountdown('evt1', start, end, current);
      expect(result.status).toBe('UPCOMING');
      expect(result.days).toBe(1);
      expect(result.hours).toBe(1);
      expect(result.minutes).toBe(30);
      expect(result.seconds).toBe(0);
      expect(result.totalSecondsRemaining).toBe(86400 + 3600 + 1800);
      expect(result.eventId).toBe('evt1');
    });

    it('returns LIVE during event duration', () => {
      const start = '2026-10-02T10:00:00Z';
      const end = '2026-10-02T12:00:00Z';
      const current = '2026-10-02T11:00:00Z';

      const result = service.calculateCountdown('evt1', start, end, current);
      expect(result.status).toBe('LIVE');
      expect(result.totalSecondsRemaining).toBe(3600); // 1 hour left until end
    });

    it('returns ENDED after event end', () => {
      const start = '2026-10-02T10:00:00Z';
      const end = '2026-10-02T12:00:00Z';
      const current = '2026-10-02T13:00:00Z';

      const result = service.calculateCountdown('evt1', start, end, current);
      expect(result.status).toBe('ENDED');
      expect(result.totalSecondsRemaining).toBe(0);
    });
  });

  describe('Access Pass & Stream Gate', () => {
    const secretKey = 'super-secret';
    let config: VirtualEventConfig;

    beforeEach(() => {
      config = {
        eventId: 'evt-2026',
        title: 'QuantConf 2026',
        startTimeIso: '2026-10-02T10:00:00Z',
        endTimeIso: '2026-10-02T12:00:00Z',
        privateStreamUrl: 'https://stream.quantube.in/live/conf-2026',
        allowEarlyJoinMinutes: 15,
        isGateEnabled: true,
      };
      service.registerVirtualEvent(config);
    });

    it('issuing access pass generates valid HMAC token', () => {
      const pass = service.issueAccessPass('evt-2026', 'att-123', secretKey);
      expect(pass.token).toBeDefined();
      expect(pass.expiresAt).toBe(new Date('2026-10-02T12:00:00Z').getTime() + 3600000);
    });

    it('unlocking private stream succeeds during allowed early-join window', () => {
      const pass = service.issueAccessPass('evt-2026', 'att-123', secretKey);

      // 10 minutes before start (within 15m window)
      const current = '2026-10-02T09:50:00Z';
      const result = service.unlockPrivateStream('evt-2026', pass.token, secretKey, current);

      expect(result.status).toBe('UNLOCKED');
      expect(result.allowed).toBe(true);
      expect(result.streamUrl).toBe(config.privateStreamUrl);
    });

    it('unlocking fails when accessed too early before early-join window', () => {
      const pass = service.issueAccessPass('evt-2026', 'att-123', secretKey);

      // 20 minutes before start (outside 15m window)
      const current = '2026-10-02T09:40:00Z';
      const result = service.unlockPrivateStream('evt-2026', pass.token, secretKey, current);

      expect(result.status).toBe('NOT_STARTED_YET');
      expect(result.allowed).toBe(false);
    });

    it('unlocking fails when access pass is revoked', () => {
      const pass = service.issueAccessPass('evt-2026', 'att-123', secretKey);
      service.revokeAccessPass(pass.passId);

      const current = '2026-10-02T10:30:00Z';
      const result = service.unlockPrivateStream('evt-2026', pass.token, secretKey, current);

      expect(result.status).toBe('PASS_REVOKED');
      expect(result.allowed).toBe(false);
    });
  });
});
