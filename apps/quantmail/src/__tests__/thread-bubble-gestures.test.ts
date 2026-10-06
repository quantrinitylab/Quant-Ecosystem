import { describe, expect, it } from 'vitest';
import {
  CLICK_SUPPRESSION_MS,
  LONG_PRESS_MS,
  MAX_SWIPE_OFFSET_PX,
  REACTION_EMOJI,
  SWIPE_REPLY_THRESHOLD_PX,
  clampMenuPosition,
  clampSwipeOffset,
  shouldCommitSwipeReply,
} from '../components/ThreadBubbleGestures';

/**
 * The thread bubble's four gestures (swipe-reply, long-press, right-click,
 * hover actions) are driven by three tiny pure functions. The gesture timing
 * and pointer math live here so the component stays a thin state machine.
 */
describe('thread bubble gesture math', () => {
  describe('clampSwipeOffset', () => {
    it('drops leftward or zero travel', () => {
      expect(clampSwipeOffset(-40)).toBe(0);
      expect(clampSwipeOffset(0)).toBe(0);
    });

    it('passes rightward travel through 1:1', () => {
      expect(clampSwipeOffset(30)).toBe(30);
      expect(clampSwipeOffset(59)).toBe(59);
    });

    it('clamps a long drag so the bubble cannot leave the screen', () => {
      expect(clampSwipeOffset(500)).toBe(MAX_SWIPE_OFFSET_PX);
      expect(clampSwipeOffset(MAX_SWIPE_OFFSET_PX)).toBe(MAX_SWIPE_OFFSET_PX);
    });
  });

  describe('shouldCommitSwipeReply', () => {
    it('commits exactly at the 60px line', () => {
      expect(shouldCommitSwipeReply(SWIPE_REPLY_THRESHOLD_PX)).toBe(true);
      expect(shouldCommitSwipeReply(SWIPE_REPLY_THRESHOLD_PX + 1)).toBe(true);
    });

    it('springs back below the line', () => {
      expect(shouldCommitSwipeReply(SWIPE_REPLY_THRESHOLD_PX - 1)).toBe(false);
      expect(shouldCommitSwipeReply(0)).toBe(false);
    });
  });

  describe('clampMenuPosition', () => {
    it('keeps the menu on-screen near the bottom-right corner', () => {
      const pos = clampMenuPosition(1900, 1000, 1920, 1080);
      expect(pos.left).toBeLessThanOrEqual(1920 - 232 - 8);
      expect(pos.top).toBeLessThanOrEqual(1080 - 8);
      expect(pos.left).toBeGreaterThanOrEqual(8);
      expect(pos.top).toBeGreaterThanOrEqual(8);
    });

    it('passes through a comfortable interior point', () => {
      const pos = clampMenuPosition(400, 300, 1920, 1080);
      expect(pos).toEqual({ left: 400, top: 300 });
    });

    it('never goes negative on a tiny viewport', () => {
      const pos = clampMenuPosition(10, 10, 200, 200);
      expect(pos.left).toBeGreaterThanOrEqual(8);
      expect(pos.top).toBeGreaterThanOrEqual(8);
    });
  });

  describe('gesture constants', () => {
    it('matches the WhatsApp-style contract', () => {
      expect(SWIPE_REPLY_THRESHOLD_PX).toBe(60);
      // 500ms: the architect's recommendation over the inbox row's 450ms.
      expect(LONG_PRESS_MS).toBe(500);
      expect(CLICK_SUPPRESSION_MS).toBe(400);
    });

    it('ships a standard six-emoji reaction tray', () => {
      expect(REACTION_EMOJI).toHaveLength(6);
      expect(REACTION_EMOJI).toContain('👍');
    });
  });
});
