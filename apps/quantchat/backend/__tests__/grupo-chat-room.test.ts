import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createRoom,
  verifyRoomPassword,
  checkSlowMode,
  recordUserMessageSent,
  filterProfanity,
  getRoom,
  clearRoomsForTesting,
} from '../services/grupo-chat-room.service';

describe('Grupo Chat Room Service', () => {
  const SECRET_KEY = 'super_secret_test_key_123';

  beforeEach(() => {
    clearRoomsForTesting();
    vi.useRealTimers();
  });

  describe('Password-Protected Rooms', () => {
    it('should create a room with password and hash it correctly', () => {
      const room = createRoom(
        {
          name: 'Secret Room',
          slug: 'secret-room',
          password: 'my_secure_password',
          creatorUserId: 'user_1',
        },
        SECRET_KEY,
      );

      expect(room.isPasswordProtected).toBe(true);
      expect(room.passwordHash).toBeDefined();
      expect(room.salt).toBeDefined();
    });

    it('should verify password correctly with the correct password', () => {
      const room = createRoom(
        {
          name: 'Top Secret',
          slug: 'top-secret',
          password: 'correct_horse_battery_staple',
          creatorUserId: 'user_2',
        },
        SECRET_KEY,
      );

      const isVerified = verifyRoomPassword(room.id, 'correct_horse_battery_staple', SECRET_KEY);
      expect(isVerified).toBe(true);
    });

    it('should fail password verification with an incorrect password', () => {
      const room = createRoom(
        {
          name: 'Top Secret',
          slug: 'top-secret',
          password: 'correct_horse_battery_staple',
          creatorUserId: 'user_2',
        },
        SECRET_KEY,
      );

      const isVerified = verifyRoomPassword(room.id, 'wrong_password', SECRET_KEY);
      expect(isVerified).toBe(false);
    });
  });

  describe('Slow Mode Rate Limiting', () => {
    it('should enforce cooldown between messages for normal users', () => {
      const room = createRoom(
        {
          name: 'Slow Room',
          slug: 'slow-room',
          slowModeSeconds: 10,
          creatorUserId: 'user_3',
        },
        SECRET_KEY,
      );

      const userId = 'normal_user_1';

      // First check should allow
      let check = checkSlowMode(room.id, userId, false);
      expect(check.allowed).toBe(true);

      // Record message sent
      recordUserMessageSent(room.id, userId);

      // Immediate second check should fail
      check = checkSlowMode(room.id, userId, false);
      expect(check.allowed).toBe(false);
      expect(check.remainingSeconds).toBeGreaterThan(0);
      expect(check.remainingSeconds).toBeLessThanOrEqual(10);
    });

    it('should allow message after slow mode cooldown expires', async () => {
      const room = createRoom(
        {
          name: 'Fast Slow Room',
          slug: 'fast-slow-room',
          slowModeSeconds: 1, // 1 second for fast testing
          creatorUserId: 'user_4',
        },
        SECRET_KEY,
      );

      const userId = 'normal_user_2';
      recordUserMessageSent(room.id, userId);

      // Check immediately (should fail)
      let check = checkSlowMode(room.id, userId, false);
      expect(check.allowed).toBe(false);

      // Wait 1.1 seconds
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Check again (should succeed)
      check = checkSlowMode(room.id, userId, false);
      expect(check.allowed).toBe(true);
    });

    it('should bypass slow mode cooldown for admin users', () => {
      const room = createRoom(
        {
          name: 'Admin Room',
          slug: 'admin-room',
          slowModeSeconds: 60,
          creatorUserId: 'user_5',
        },
        SECRET_KEY,
      );

      const adminId = 'admin_user_1';

      recordUserMessageSent(room.id, adminId);

      // Admin should be allowed immediately
      const check = checkSlowMode(room.id, adminId, true);
      expect(check.allowed).toBe(true);
      expect(check.remainingSeconds).toBe(0);
    });
  });

  describe('Profanity Filter', () => {
    it('should mask prohibited terms with asterisks and return matched words', () => {
      const content = 'This is a badword and some other bad stuff like fuck and shiT.';
      const result = filterProfanity(content);

      expect(result.hasProfanity).toBe(true);
      expect(result.cleanContent).toBe(
        'This is a ******* and some other bad stuff like **** and ****.',
      );
      expect(result.matchedWords).toContain('badword');
      expect(result.matchedWords).toContain('fuck');
      expect(result.matchedWords).toContain('shit');
    });

    it('should return clean content without profanity unchanged', () => {
      const content = 'This is a completely clean and nice message hello world.';
      const result = filterProfanity(content);

      expect(result.hasProfanity).toBe(false);
      expect(result.cleanContent).toBe(content);
      expect(result.matchedWords.length).toBe(0);
    });

    it('should use custom prohibited words when provided', () => {
      const content = 'I love apples and bananas.';
      const result = filterProfanity(content, ['apples', 'bananas']);

      expect(result.hasProfanity).toBe(true);
      expect(result.cleanContent).toBe('I love ****** and *******.');
      expect(result.matchedWords).toContain('apples');
      expect(result.matchedWords).toContain('bananas');
    });
  });
});
