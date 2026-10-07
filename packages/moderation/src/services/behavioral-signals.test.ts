import { describe, it, expect, beforeEach } from 'vitest';
import { BehavioralSignalAnalyzer } from './behavioral-signals';
import type { BehavioralSignals } from '../types';

describe('BehavioralSignalAnalyzer', () => {
  let analyzer: BehavioralSignalAnalyzer;

  beforeEach(() => {
    analyzer = new BehavioralSignalAnalyzer();
  });

  describe('account age scoring', () => {
    it('should score new accounts (< 7 days) as higher risk', () => {
      const newAccount: BehavioralSignals = {
        accountAgeDays: 2,
        sessionCount: 5,
      };
      const established: BehavioralSignals = {
        accountAgeDays: 365,
        sessionCount: 5,
      };

      const newResult = analyzer.analyzeAccount('new-user', newAccount);
      const oldResult = analyzer.analyzeAccount('old-user', established);

      expect(newResult.score).toBeGreaterThan(oldResult.score);
    });

    it('should score 0-day accounts as critical risk', () => {
      const signals: BehavioralSignals = {
        accountAgeDays: 0,
        sessionCount: 1,
      };
      const result = analyzer.analyzeAccount('brand-new', signals);
      expect(result.classification).toBe('high');
    });

    it('should score old accounts as low risk', () => {
      const signals: BehavioralSignals = {
        accountAgeDays: 365,
        sessionCount: 100,
        typingSpeedWpm: 60,
        mouseEntropy: 0.5,
      };
      const result = analyzer.analyzeAccount('veteran', signals);
      expect(result.classification).toBe('low');
    });
  });

  describe('typing speed scoring', () => {
    it('should flag typing speed above 200 WPM as suspicious', () => {
      const signals: BehavioralSignals = {
        accountAgeDays: 30,
        typingSpeedWpm: 250,
        sessionCount: 10,
      };
      const result = analyzer.analyzeAccount('fast-typer', signals);
      const typingFactor = result.factors.find((f) => f.name === 'typing_speed');
      expect(typingFactor).toBeDefined();
      expect(typingFactor!.score).toBeGreaterThan(50);
    });

    it('should not flag normal typing speed', () => {
      const signals: BehavioralSignals = {
        accountAgeDays: 30,
        typingSpeedWpm: 80,
        sessionCount: 10,
      };
      const result = analyzer.analyzeAccount('normal-typer', signals);
      const typingFactor = result.factors.find((f) => f.name === 'typing_speed');
      expect(typingFactor).toBeDefined();
      expect(typingFactor!.score).toBeLessThan(20);
    });

    it('should flag extremely fast typing (> 400 WPM) as very suspicious', () => {
      const signals: BehavioralSignals = {
        accountAgeDays: 30,
        typingSpeedWpm: 500,
        sessionCount: 10,
      };
      const result = analyzer.analyzeAccount('bot-typer', signals);
      const typingFactor = result.factors.find((f) => f.name === 'typing_speed');
      expect(typingFactor!.score).toBeGreaterThan(80);
    });
  });

  describe('mouse entropy scoring', () => {
    it('should flag too-uniform mouse movement (low entropy)', () => {
      const signals: BehavioralSignals = {
        accountAgeDays: 30,
        mouseEntropy: 0.05,
        sessionCount: 10,
      };
      const result = analyzer.analyzeAccount('bot-mouse', signals);
      const mouseFactor = result.factors.find((f) => f.name === 'mouse_entropy');
      expect(mouseFactor).toBeDefined();
      expect(mouseFactor!.score).toBeGreaterThan(50);
    });

    it('should accept normal mouse entropy', () => {
      const signals: BehavioralSignals = {
        accountAgeDays: 30,
        mouseEntropy: 0.6,
        sessionCount: 10,
      };
      const result = analyzer.analyzeAccount('human-mouse', signals);
      const mouseFactor = result.factors.find((f) => f.name === 'mouse_entropy');
      expect(mouseFactor).toBeDefined();
      expect(mouseFactor!.score).toBeLessThan(20);
    });

    it('should flag too-random mouse movement (high entropy)', () => {
      const signals: BehavioralSignals = {
        accountAgeDays: 30,
        mouseEntropy: 0.99,
        sessionCount: 10,
      };
      const result = analyzer.analyzeAccount('noise-mouse', signals);
      const mouseFactor = result.factors.find((f) => f.name === 'mouse_entropy');
      expect(mouseFactor!.score).toBeGreaterThan(40);
    });
  });

  describe('session count scoring', () => {
    it('should flag very low session counts', () => {
      const signals: BehavioralSignals = {
        accountAgeDays: 30,
        sessionCount: 1,
      };
      const result = analyzer.analyzeAccount('one-session', signals);
      const sessionFactor = result.factors.find((f) => f.name === 'session_count');
      expect(sessionFactor!.score).toBeGreaterThan(40);
    });

    it('should accept high session counts', () => {
      const signals: BehavioralSignals = {
        accountAgeDays: 30,
        sessionCount: 50,
      };
      const result = analyzer.analyzeAccount('many-sessions', signals);
      const sessionFactor = result.factors.find((f) => f.name === 'session_count');
      expect(sessionFactor!.score).toBeLessThan(20);
    });
  });

  describe('overall classification', () => {
    it('should classify healthy accounts as low risk', () => {
      const signals: BehavioralSignals = {
        accountAgeDays: 180,
        typingSpeedWpm: 70,
        mouseEntropy: 0.55,
        sessionCount: 50,
      };
      const result = analyzer.analyzeAccount('healthy', signals);
      expect(result.classification).toBe('low');
      expect(result.score).toBeLessThanOrEqual(25);
    });

    it('should classify suspicious accounts as high risk', () => {
      const signals: BehavioralSignals = {
        accountAgeDays: 1,
        typingSpeedWpm: 300,
        mouseEntropy: 0.05,
        sessionCount: 1,
      };
      const result = analyzer.analyzeAccount('suspicious', signals);
      expect(['high', 'critical']).toContain(result.classification);
      expect(result.score).toBeGreaterThan(50);
    });
  });

  describe('isHumanLike', () => {
    it('should return high confidence for human-like signals', () => {
      const signals: BehavioralSignals = {
        accountAgeDays: 90,
        typingSpeedWpm: 65,
        mouseEntropy: 0.5,
        sessionCount: 20,
      };
      const result = analyzer.isHumanLike(signals);
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
      expect(result.factors.every((f) => f.passed)).toBe(true);
    });

    it('should return low confidence for bot-like signals', () => {
      const signals: BehavioralSignals = {
        accountAgeDays: 1,
        typingSpeedWpm: 500,
        mouseEntropy: 0.01,
        sessionCount: 1,
      };
      const result = analyzer.isHumanLike(signals);
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.factors.some((f) => !f.passed)).toBe(true);
    });
  });
});
