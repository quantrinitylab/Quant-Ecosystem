import { describe, it, expect } from 'vitest';
import { RunbookGenerator } from '../runbook-generator.js';

describe('RunbookGenerator', () => {
  const generator = new RunbookGenerator();

  it('generates runbook with required sections', () => {
    const runbook = generator.generateRunbook('quantmail', 'high-error-rate');

    expect(runbook).toContain('## Description');
    expect(runbook).toContain('## Impact');
    expect(runbook).toContain('## Detection');
    expect(runbook).toContain('## Investigation Steps');
    expect(runbook).toContain('## Remediation Steps');
    expect(runbook).toContain('## Escalation Path');
  });

  it('generateAllRunbooks covers all services and alert types', () => {
    const services = ['quantmail', 'quantube', 'quantsync'];
    const runbooks = generator.generateAllRunbooks(services);

    // 3 services x 5 alert types = 15 runbooks
    expect(runbooks.size).toBe(15);

    for (const service of services) {
      expect(runbooks.has(`${service}-high-error-rate`)).toBe(true);
      expect(runbooks.has(`${service}-high-latency`)).toBe(true);
      expect(runbooks.has(`${service}-budget-exhaustion`)).toBe(true);
      expect(runbooks.has(`${service}-pod-crash-loop`)).toBe(true);
      expect(runbooks.has(`${service}-memory-pressure`)).toBe(true);
    }
  });

  it('different alert types produce different content', () => {
    const errorRunbook = generator.generateRunbook('quantmail', 'high-error-rate');
    const latencyRunbook = generator.generateRunbook('quantmail', 'high-latency');
    const budgetRunbook = generator.generateRunbook('quantmail', 'budget-exhaustion');

    expect(errorRunbook).not.toBe(latencyRunbook);
    expect(errorRunbook).not.toBe(budgetRunbook);
    expect(latencyRunbook).not.toBe(budgetRunbook);

    // Verify they mention the correct alert type
    expect(errorRunbook).toContain('Error Rate');
    expect(latencyRunbook).toContain('Latency');
    expect(budgetRunbook).toContain('Error Budget');
  });
});
