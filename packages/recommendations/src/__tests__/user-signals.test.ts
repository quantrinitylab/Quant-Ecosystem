import { describe, it, expect } from 'vitest';
import { UserSignalProcessor } from '../personalization/user-signals';
import type { NegativeSignal } from '../personalization/user-signals';

describe('UserSignalProcessor', () => {
  function createProcessor(): UserSignalProcessor {
    return new UserSignalProcessor();
  }

  describe('processNegativeSignal', () => {
    it('should store a negative signal for the user', () => {
      const processor = createProcessor();
      const signal: NegativeSignal = {
        type: 'show_less',
        topicId: 'topic-123',
        timestamp: Date.now(),
      };

      processor.processNegativeSignal('user1', signal);

      const queue = processor.getRetrainingQueue();
      expect(queue).toContain('user1');
    });

    it('should add user to retraining queue', () => {
      const processor = createProcessor();
      const signal: NegativeSignal = {
        type: 'show_less',
        contentType: 'video',
        timestamp: Date.now(),
      };

      processor.processNegativeSignal('user1', signal);
      processor.processNegativeSignal('user2', {
        type: 'show_less',
        itemId: 'item-456',
        timestamp: Date.now(),
      });

      const queue = processor.getRetrainingQueue();
      expect(queue).toContain('user1');
      expect(queue).toContain('user2');
      expect(queue).toHaveLength(2);
    });
  });

  describe('hideTopics', () => {
    it('should immediately hide topics for a user', () => {
      const processor = createProcessor();

      processor.hideTopics('user1', ['politics', 'sports']);

      const hidden = processor.getActiveHiddenTopics('user1');
      expect(hidden).toContain('politics');
      expect(hidden).toContain('sports');
      expect(hidden).toHaveLength(2);
    });

    it('should accumulate hidden topics across multiple calls', () => {
      const processor = createProcessor();

      processor.hideTopics('user1', ['politics']);
      processor.hideTopics('user1', ['sports']);

      const hidden = processor.getActiveHiddenTopics('user1');
      expect(hidden).toHaveLength(2);
      expect(hidden).toContain('politics');
      expect(hidden).toContain('sports');
    });

    it('should not duplicate already-hidden topics', () => {
      const processor = createProcessor();

      processor.hideTopics('user1', ['politics']);
      processor.hideTopics('user1', ['politics']);

      const hidden = processor.getActiveHiddenTopics('user1');
      expect(hidden).toHaveLength(1);
    });
  });

  describe('unhideTopics', () => {
    it('should remove topics from hidden list', () => {
      const processor = createProcessor();

      processor.hideTopics('user1', ['politics', 'sports', 'tech']);
      processor.unhideTopics('user1', ['sports']);

      const hidden = processor.getActiveHiddenTopics('user1');
      expect(hidden).toContain('politics');
      expect(hidden).toContain('tech');
      expect(hidden).not.toContain('sports');
    });
  });

  describe('resetProfile', () => {
    it('should clear all signals, hidden topics, and retraining queue', () => {
      const processor = createProcessor();

      processor.processNegativeSignal('user1', {
        type: 'show_less',
        topicId: 'topic-1',
        timestamp: Date.now(),
      });
      processor.hideTopics('user1', ['politics']);

      processor.resetProfile('user1');

      expect(processor.getActiveHiddenTopics('user1')).toHaveLength(0);
      expect(processor.getRetrainingQueue()).not.toContain('user1');
    });

    it('should not affect other users', () => {
      const processor = createProcessor();

      processor.hideTopics('user1', ['politics']);
      processor.hideTopics('user2', ['sports']);
      processor.processNegativeSignal('user2', {
        type: 'show_less',
        topicId: 'topic-2',
        timestamp: Date.now(),
      });

      processor.resetProfile('user1');

      expect(processor.getActiveHiddenTopics('user2')).toContain('sports');
      expect(processor.getRetrainingQueue()).toContain('user2');
    });
  });

  describe('getRetrainingQueue', () => {
    it('should return empty array when no users need retraining', () => {
      const processor = createProcessor();
      expect(processor.getRetrainingQueue()).toHaveLength(0);
    });

    it('should not duplicate user IDs', () => {
      const processor = createProcessor();

      processor.processNegativeSignal('user1', {
        type: 'show_less',
        topicId: 'topic-1',
        timestamp: Date.now(),
      });
      processor.processNegativeSignal('user1', {
        type: 'show_less',
        topicId: 'topic-2',
        timestamp: Date.now(),
      });

      expect(processor.getRetrainingQueue()).toHaveLength(1);
    });
  });
});
