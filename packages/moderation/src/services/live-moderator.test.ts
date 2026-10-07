import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LiveModerator } from './live-moderator';
import type { ImageClassifier } from './image-classifier';
import type { LiveModerationEvent } from '../types';

function createMockImageClassifier(overallScore = 0.1, flags: string[] = []): ImageClassifier {
  return {
    classify: vi.fn().mockResolvedValue({
      id: 'test',
      contentId: 'test',
      contentType: 'image',
      categories: [],
      overallScore,
      action: overallScore >= 0.6 ? 'flag' : 'approve',
      confidence: 0.9,
      automated: true,
      flags,
      metadata: {},
      createdAt: Date.now(),
    }),
  } as unknown as ImageClassifier;
}

describe('LiveModerator', () => {
  let moderator: LiveModerator;
  let mockClassifier: ImageClassifier;

  beforeEach(() => {
    mockClassifier = createMockImageClassifier();
    moderator = new LiveModerator({
      imageClassifier: mockClassifier,
      config: {
        violationThresholdForDisconnect: 3,
        violationThresholdForBan: 5,
      },
    });
  });

  it('should start a session and track it', () => {
    const session = moderator.startSession('session-1', 'user-1');

    expect(session.sessionId).toBe('session-1');
    expect(session.userId).toBe('user-1');
    expect(session.violationCount).toBe(0);
    expect(session.disconnected).toBe(false);
    expect(session.banned).toBe(false);
  });

  it('should emit flag event when profanity keyword detected in transcript', () => {
    const events: LiveModerationEvent[] = [];
    moderator.on('flag', (event: LiveModerationEvent) => events.push(event));
    moderator.startSession('session-1', 'user-1');

    moderator.submitTranscript('session-1', 'this is some shit content');

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('flag');
    expect(events[0]!.sessionId).toBe('session-1');
    expect(events[0]!.reason).toContain('shit');
    expect(events[0]!.violationCount).toBe(1);
  });

  it('should emit flag event immediately (within 5s) of profanity submission', () => {
    const startTime = Date.now();
    const events: LiveModerationEvent[] = [];
    moderator.on('flag', (event: LiveModerationEvent) => events.push(event));
    moderator.startSession('session-1', 'user-1');

    moderator.submitTranscript('session-1', 'what the fuck is this');

    const elapsed = Date.now() - startTime;
    expect(events).toHaveLength(1);
    expect(elapsed).toBeLessThan(5000);
    expect(events[0]!.type).toBe('flag');
  });

  it('should emit disconnect event after violation threshold (default 3)', () => {
    const flagEvents: LiveModerationEvent[] = [];
    const disconnectEvents: LiveModerationEvent[] = [];
    moderator.on('flag', (e: LiveModerationEvent) => flagEvents.push(e));
    moderator.on('disconnect', (e: LiveModerationEvent) => disconnectEvents.push(e));
    moderator.startSession('session-1', 'user-1');

    moderator.submitTranscript('session-1', 'fuck');
    moderator.submitTranscript('session-1', 'shit');
    moderator.submitTranscript('session-1', 'damn');

    expect(flagEvents).toHaveLength(3);
    expect(disconnectEvents).toHaveLength(1);
    expect(disconnectEvents[0]!.type).toBe('disconnect');
    expect(disconnectEvents[0]!.violationCount).toBe(3);

    const session = moderator.getSession('session-1');
    expect(session!.disconnected).toBe(true);
  });

  it('should emit ban event after ban threshold (default 5)', () => {
    const banEvents: LiveModerationEvent[] = [];
    moderator.on('ban', (e: LiveModerationEvent) => banEvents.push(e));
    moderator.startSession('session-1', 'user-1');

    // Custom config sets ban threshold to 5
    for (let i = 0; i < 5; i++) {
      moderator.submitTranscript('session-1', 'fuck');
    }

    expect(banEvents).toHaveLength(1);
    expect(banEvents[0]!.type).toBe('ban');
    expect(moderator.isSessionBanned('session-1')).toBe(true);
  });

  it('should not process input after ban', async () => {
    const flagEvents: LiveModerationEvent[] = [];
    moderator.on('flag', (e: LiveModerationEvent) => flagEvents.push(e));
    moderator.startSession('session-1', 'user-1');

    // Trigger ban (threshold is 5)
    for (let i = 0; i < 5; i++) {
      moderator.submitTranscript('session-1', 'fuck');
    }
    expect(flagEvents).toHaveLength(5);

    // Submit after ban - should be ignored
    moderator.submitTranscript('session-1', 'fuck');
    expect(flagEvents).toHaveLength(5);
  });

  it('should classify frames and flag violations', async () => {
    const violatingClassifier = createMockImageClassifier(0.85, ['nsfw']);
    const mod = new LiveModerator({
      imageClassifier: violatingClassifier,
      config: { violationThresholdForDisconnect: 3 },
    });
    const events: LiveModerationEvent[] = [];
    mod.on('flag', (e: LiveModerationEvent) => events.push(e));
    mod.startSession('session-2', 'user-2');

    await mod.submitFrame('session-2', Buffer.from('fake-frame'));

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('flag');
    expect(events[0]!.reason).toContain('nsfw');
  });

  it('should not flag clean frames', async () => {
    const events: LiveModerationEvent[] = [];
    moderator.on('flag', (e: LiveModerationEvent) => events.push(e));
    moderator.startSession('session-3', 'user-3');

    await moderator.submitFrame('session-3', Buffer.from('clean-frame'));

    expect(events).toHaveLength(0);
  });

  it('should track accumulated violations across frame and transcript', async () => {
    const violatingClassifier = createMockImageClassifier(0.85, ['violence']);
    const mod = new LiveModerator({
      imageClassifier: violatingClassifier,
      config: { violationThresholdForDisconnect: 3 },
    });
    const disconnectEvents: LiveModerationEvent[] = [];
    mod.on('disconnect', (e: LiveModerationEvent) => disconnectEvents.push(e));
    mod.startSession('session-4', 'user-4');

    await mod.submitFrame('session-4', Buffer.from('frame1'));
    mod.submitTranscript('session-4', 'some fuck word');
    await mod.submitFrame('session-4', Buffer.from('frame2'));

    expect(disconnectEvents).toHaveLength(1);
    expect(disconnectEvents[0]!.violationCount).toBe(3);
  });

  it('should end session and remove tracking', () => {
    moderator.startSession('session-5', 'user-5');
    expect(moderator.getSession('session-5')).toBeDefined();

    moderator.endSession('session-5');
    expect(moderator.getSession('session-5')).toBeUndefined();
  });
});
