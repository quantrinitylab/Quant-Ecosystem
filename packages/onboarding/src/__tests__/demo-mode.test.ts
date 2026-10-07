import { describe, expect, it } from 'vitest';
import { createDemoMode, generateSampleData, getSampleDataSets } from '../demo-mode.js';
import type { OnboardingRole } from '../types.js';

describe('Demo Mode', () => {
  describe('createDemoMode', () => {
    it('creates a demo config with defaults', () => {
      const config = createDemoMode();
      expect(config.enabled).toBe(true);
      expect(config.sampleDataSets).toEqual([]);
      expect(config.expiresAt).toBeDefined();
    });

    it('sets expiry to approximately 72 hours in the future', () => {
      const before = Date.now();
      const config = createDemoMode();
      const after = Date.now();

      const expectedMin = before + 72 * 60 * 60 * 1000 - 1000;
      const expectedMax = after + 72 * 60 * 60 * 1000 + 1000;

      expect(config.expiresAt!.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(config.expiresAt!.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('accepts custom config', () => {
      const customExpiry = new Date('2025-12-31');
      const config = createDemoMode({
        enabled: false,
        expiresAt: customExpiry,
      });

      expect(config.enabled).toBe(false);
      expect(config.expiresAt).toEqual(customExpiry);
    });
  });

  describe('generateSampleData', () => {
    const roles: OnboardingRole[] = [
      'personal',
      'team-admin',
      'creator',
      'advertiser',
      'developer',
    ];

    it.each(roles)('generates sample data for role: %s', (role) => {
      const data = generateSampleData(role);
      expect(data.length).toBeGreaterThan(0);
      for (const dataset of data) {
        expect(dataset.name).toBeTruthy();
        expect(dataset.description).toBeTruthy();
        expect(dataset.items.length).toBeGreaterThan(0);
      }
    });

    it('returns different data sets for different roles', () => {
      const personalData = generateSampleData('personal');
      const teamData = generateSampleData('team-admin');

      const personalNames = personalData.map((d) => d.name).sort();
      const teamNames = teamData.map((d) => d.name).sort();

      expect(personalNames).not.toEqual(teamNames);
    });

    it('team-admin includes more data sets than creator', () => {
      const teamData = generateSampleData('team-admin');
      const creatorData = generateSampleData('creator');
      expect(teamData.length).toBeGreaterThan(creatorData.length);
    });
  });

  describe('getSampleDataSets', () => {
    it('returns all available sample data categories', () => {
      const sets = getSampleDataSets();
      const names = sets.map((s) => s.name);

      expect(names).toContain('emails');
      expect(names).toContain('docs');
      expect(names).toContain('chats');
      expect(names).toContain('files');
      expect(names).toContain('meetings');
      expect(names).toContain('tasks');
    });

    it('returns 6 total categories', () => {
      const sets = getSampleDataSets();
      expect(sets).toHaveLength(6);
    });

    it('each category has items', () => {
      const sets = getSampleDataSets();
      for (const set of sets) {
        expect(set.items.length).toBeGreaterThan(0);
      }
    });
  });
});
