import { describe, it, expect } from 'vitest';
import { GroomingPatternDetector } from './grooming-detector';
import type { ConversationMessage } from './grooming-detector';

function createMessage(text: string, senderId: string = 'sender-1'): ConversationMessage {
  return {
    senderId,
    text,
    timestamp: Date.now(),
  };
}

describe('GroomingPatternDetector', () => {
  describe('pattern detection', () => {
    it('should detect age probing questions', () => {
      const detector = new GroomingPatternDetector();
      const messages = [createMessage('how old are you? what school do you go to?')];

      const result = detector.analyze(messages);
      expect(result.risk).toBeGreaterThan(0);
      expect(result.indicators).toContain('Age-related probing questions');
    });

    it('should detect isolation language', () => {
      const detector = new GroomingPatternDetector();
      const messages = [createMessage("don't tell anyone about us, they wouldn't get it")];

      const result = detector.analyze(messages);
      expect(result.risk).toBeGreaterThan(0);
      expect(result.indicators).toContain(
        'Isolation language attempting to separate from support network',
      );
    });

    it('should detect secrecy demands', () => {
      const detector = new GroomingPatternDetector();
      const messages = [createMessage('promise not to tell anyone, delete this message after')];

      const result = detector.analyze(messages);
      expect(result.risk).toBeGreaterThan(0);
      expect(result.indicators).toContain('Demands for secrecy about the relationship');
    });

    it('should detect gift/money offers', () => {
      const detector = new GroomingPatternDetector();
      const messages = [createMessage("i'll buy you a new phone, want me to send you money?")];

      const result = detector.analyze(messages);
      expect(result.risk).toBeGreaterThan(0);
      expect(result.indicators).toContain('Unsolicited offers of gifts or money');
    });

    it('should detect escalating intimacy patterns', () => {
      const detector = new GroomingPatternDetector();
      const messages = [createMessage("you're so mature for your age, send me a picture of you")];

      const result = detector.analyze(messages);
      expect(result.risk).toBeGreaterThan(0);
      expect(result.indicators).toContain('Escalating intimacy and boundary-pushing language');
    });

    it('should identify at least 3 grooming indicators in a grooming conversation', () => {
      const detector = new GroomingPatternDetector();
      const messages = [
        createMessage('how old are you? are you in school?'),
        createMessage("you're so mature for your age, you're not like other kids"),
        createMessage("don't tell anyone about us talking, keep this between us"),
        createMessage("i'll buy you something nice, want me to send you a gift card?"),
        createMessage('promise not to tell your parents'),
      ];

      const result = detector.analyze(messages);
      expect(result.indicators.length).toBeGreaterThanOrEqual(3);
      expect(result.risk).toBeGreaterThan(0.5);
    });

    it('should return zero risk for innocent conversation', () => {
      const detector = new GroomingPatternDetector();
      const messages = [
        createMessage('Hey, did you see the game last night?'),
        createMessage('Yeah it was great, the score was 3-1'),
        createMessage('Want to meet up at the coffee shop?'),
      ];

      const result = detector.analyze(messages);
      expect(result.risk).toBe(0);
      expect(result.indicators).toHaveLength(0);
    });

    it('should return risk between 0 and 1', () => {
      const detector = new GroomingPatternDetector();
      const messages = [
        createMessage('how old are you'),
        createMessage("don't tell anyone"),
        createMessage("i'll buy you"),
        createMessage("you're so mature for your age"),
        createMessage('promise not to tell'),
      ];

      const result = detector.analyze(messages);
      expect(result.risk).toBeGreaterThanOrEqual(0);
      expect(result.risk).toBeLessThanOrEqual(1);
    });
  });

  describe('structural patterns', () => {
    it('should increase risk for persistent contact with pattern matches', () => {
      const detector = new GroomingPatternDetector();
      const messages: ConversationMessage[] = [];

      // Generate 12 messages from same sender with grooming content
      for (let i = 0; i < 12; i++) {
        messages.push(createMessage("how old are you? you're so special", 'predator-1'));
      }

      const result = detector.analyze(messages);
      expect(result.indicators).toContain('Persistent contact pattern');
    });

    it('should not flag persistent contact without grooming indicators', () => {
      const detector = new GroomingPatternDetector();
      const messages: ConversationMessage[] = [];

      for (let i = 0; i < 15; i++) {
        messages.push(createMessage('hello, how are you today?', 'user-1'));
      }

      const result = detector.analyze(messages);
      expect(result.risk).toBe(0);
    });
  });

  describe('single message analysis', () => {
    it('should analyze a single message', () => {
      const detector = new GroomingPatternDetector();
      const result = detector.analyzeMessage(
        createMessage("don't tell anyone, this is our little secret"),
      );

      expect(result.risk).toBeGreaterThan(0);
      expect(result.indicators.length).toBeGreaterThan(0);
    });
  });
});
