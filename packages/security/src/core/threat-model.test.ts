import { describe, it, expect } from 'vitest';
import { ThreatModeler } from './threat-model';
import type { ServiceInterface } from '../types';

describe('ThreatModeler', () => {
  const modeler = new ThreatModeler();

  const testInterfaces: ServiceInterface[] = [
    {
      name: 'REST API',
      type: 'api',
      protocol: 'HTTPS',
      authenticated: true,
      encrypted: true,
    },
    {
      name: 'External Gateway',
      type: 'external',
      protocol: 'HTTPS',
      authenticated: false,
      encrypted: true,
    },
  ];

  describe('modelService', () => {
    it('should identify threats per STRIDE category', () => {
      const threats = modeler.modelService(
        'identity',
        ['user-credentials', 'sessions'],
        testInterfaces,
      );
      expect(threats.length).toBeGreaterThan(0);

      const categories = new Set(threats.map((t) => t.category));
      expect(categories.size).toBeGreaterThanOrEqual(3);
    });

    it('should assign unique IDs to each threat', () => {
      const modeler2 = new ThreatModeler();
      const threats = modeler2.modelService('chat', ['messages'], testInterfaces);
      const ids = threats.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should include affected asset and interface in each threat', () => {
      const modeler2 = new ThreatModeler();
      const threats = modeler2.modelService('mail', ['emails'], [testInterfaces[0]!]);
      for (const threat of threats) {
        expect(threat.affectedAsset).toBe('emails');
        expect(threat.affectedInterface).toBe('REST API');
      }
    });

    it('should identify spoofing threats for unauthenticated interfaces', () => {
      const modeler2 = new ThreatModeler();
      const threats = modeler2.modelService(
        'gateway',
        ['routes'],
        [
          {
            name: 'Public API',
            type: 'api',
            protocol: 'HTTP',
            authenticated: false,
            encrypted: false,
          },
        ],
      );
      const spoofing = threats.filter((t) => t.category === 'Spoofing');
      expect(spoofing.length).toBeGreaterThan(0);
    });
  });

  describe('assessRisk', () => {
    it('should return a valid risk assessment', () => {
      const modeler2 = new ThreatModeler();
      const threats = modeler2.modelService('test', ['data'], [testInterfaces[0]!]);
      const threat = threats[0]!;

      const risk = modeler2.assessRisk(threat);
      expect(risk.severity).toMatch(/^(low|medium|high|critical)$/);
      expect(risk.likelihood).toBeGreaterThanOrEqual(1);
      expect(risk.likelihood).toBeLessThanOrEqual(5);
      expect(risk.impact).toBeGreaterThanOrEqual(1);
      expect(risk.impact).toBeLessThanOrEqual(5);
      expect(risk.score).toBe(risk.likelihood * risk.impact);
    });

    it('should rate ElevationOfPrivilege with high impact', () => {
      const modeler2 = new ThreatModeler();
      const threats = modeler2.modelService('auth', ['roles'], [testInterfaces[0]!]);
      const privEsc = threats.find((t) => t.category === 'ElevationOfPrivilege');
      if (privEsc) {
        const risk = modeler2.assessRisk(privEsc);
        expect(risk.impact).toBeGreaterThanOrEqual(4);
      }
    });
  });

  describe('generateMitigations', () => {
    it('should generate mitigations for each threat', () => {
      const modeler2 = new ThreatModeler();
      const threats = modeler2.modelService('api', ['endpoints'], [testInterfaces[0]!]);
      const mitigations = modeler2.generateMitigations(threats);

      expect(mitigations.size).toBe(threats.length);
      for (const [, mits] of mitigations) {
        expect(mits.length).toBeGreaterThan(0);
      }
    });

    it('should include relevant mitigations per category', () => {
      const modeler2 = new ThreatModeler();
      const threats = modeler2.modelService(
        'svc',
        ['data'],
        [
          {
            name: 'Public',
            type: 'external',
            protocol: 'HTTP',
            authenticated: false,
            encrypted: false,
          },
        ],
      );
      const spoofing = threats.find((t) => t.category === 'Spoofing');
      if (spoofing) {
        const mitigations = modeler2.generateMitigations([spoofing]);
        const mits = mitigations.get(spoofing.id)!;
        expect(mits.some((m) => m.toLowerCase().includes('authentication'))).toBe(true);
      }
    });
  });
});
