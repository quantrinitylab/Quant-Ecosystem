import { describe, it, expect } from 'vitest';
import { MutationGate, generateStrykerConfig, runMutationGate } from '../mutation-gate';

describe('MutationGate', () => {
  describe('generateStrykerConfig', () => {
    it('should return config with mutate array containing auth/payments/security patterns', () => {
      const config = generateStrykerConfig();

      expect(config.mutate).toContain('packages/auth/src/**/*.ts');
      expect(config.mutate).toContain('packages/payments/src/**/*.ts');
      expect(config.mutate).toContain('packages/security/src/**/*.ts');
    });

    it('should exclude test files from mutation', () => {
      const config = generateStrykerConfig();

      expect(config.mutate).toContain('!packages/auth/src/**/*.test.ts');
      expect(config.mutate).toContain('!packages/payments/src/**/*.test.ts');
      expect(config.mutate).toContain('!packages/security/src/**/*.test.ts');
    });

    it('should use vitest as the test runner', () => {
      const config = generateStrykerConfig();

      expect(config.testRunner).toBe('vitest');
    });

    it('should include expected reporters', () => {
      const config = generateStrykerConfig();

      expect(config.reporters).toContain('html');
      expect(config.reporters).toContain('json');
      expect(config.reporters).toContain('clear-text');
      expect(config.reporters).toContain('progress');
    });

    it('should set threshold break at 60', () => {
      const config = generateStrykerConfig();

      expect(config.thresholds.break).toBe(60);
      expect(config.thresholds.low).toBe(60);
      expect(config.thresholds.high).toBe(80);
    });
  });

  describe('MutationGate threshold validation', () => {
    it('should identify mutation score below 60% as failing', () => {
      const gate = new MutationGate();
      const result = gate.run({
        mutationScore: 55,
        killed: 55,
        survived: 40,
        noCoverage: 5,
        totalMutants: 100,
      });

      expect(result.pass).toBe(false);
      expect(result.mutationScore).toBe(55);
      expect(result.threshold).toBe(60);
    });

    it('should identify mutation score at 60% as passing', () => {
      const gate = new MutationGate();
      const result = gate.run({
        mutationScore: 60,
        killed: 60,
        survived: 35,
        noCoverage: 5,
        totalMutants: 100,
      });

      expect(result.pass).toBe(true);
      expect(result.mutationScore).toBe(60);
      expect(result.threshold).toBe(60);
    });

    it('should identify mutation score above 60% as passing', () => {
      const gate = new MutationGate();
      const result = gate.run({
        mutationScore: 75,
        killed: 75,
        survived: 20,
        noCoverage: 5,
        totalMutants: 100,
      });

      expect(result.pass).toBe(true);
      expect(result.mutationScore).toBe(75);
    });

    it('should work with the standalone runMutationGate function', () => {
      const result = runMutationGate({
        mutationScore: 50,
        killed: 50,
        survived: 45,
        noCoverage: 5,
        totalMutants: 100,
      });

      expect(result.pass).toBe(false);
      expect(result.threshold).toBe(60);
    });

    it('should respect custom threshold configuration', () => {
      const result = runMutationGate(
        {
          mutationScore: 75,
          killed: 75,
          survived: 20,
          noCoverage: 5,
          totalMutants: 100,
        },
        { threshold: 80 },
      );

      expect(result.pass).toBe(false);
      expect(result.threshold).toBe(80);
    });
  });

  describe('generateStrykerConfig with custom packages', () => {
    it('should target only specified packages', () => {
      const config = generateStrykerConfig({
        targetPackages: ['auth', 'security'],
      });

      expect(config.mutate).toContain('packages/auth/src/**/*.ts');
      expect(config.mutate).toContain('packages/security/src/**/*.ts');
      expect(config.mutate).not.toContain('packages/payments/src/**/*.ts');
    });
  });
});
