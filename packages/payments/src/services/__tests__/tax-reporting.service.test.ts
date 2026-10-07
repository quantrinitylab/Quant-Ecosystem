// K11 consolidation: TaxReportingService moved here from @quant/creator-economy.
// Behavior-preserving coverage in its canonical home (@quant/payments).
import { describe, it, expect, beforeEach } from 'vitest';
import { TaxReportingService } from '../tax-reporting.service';

describe('TaxReportingService', () => {
  let service: TaxReportingService;

  beforeEach(() => {
    service = new TaxReportingService();
  });

  it('generates a 1099 with withholding applied', () => {
    service.addEvent({ creatorId: 'c1', amount: 1000, timestamp: new Date('2026-03-01') });
    service.addEvent({ creatorId: 'c1', amount: 500, timestamp: new Date('2026-06-15') });
    service.setWithholdingStatus({
      creatorId: 'c1',
      rate: 0.24,
      w9OnFile: true,
      lastUpdated: new Date(),
    });

    const doc = service.generate1099('c1', 2026);
    expect(doc.creatorId).toBe('c1');
    expect(doc.year).toBe(2026);
    expect(doc.totalEarnings).toBe(1500);
    expect(doc.withheld).toBeCloseTo(360, 10);
    expect(doc.netPayable).toBeCloseTo(1140, 10);
    expect(doc.generatedAt).toBeInstanceOf(Date);
  });

  it('sums yearly earnings only for the requested creator and year', () => {
    service.addEvent({ creatorId: 'c1', amount: 100, timestamp: new Date('2026-01-10') });
    service.addEvent({ creatorId: 'c1', amount: 200, timestamp: new Date('2025-12-31') });
    service.addEvent({ creatorId: 'c2', amount: 999, timestamp: new Date('2026-02-01') });

    expect(service.getYearlyEarnings('c1', 2026)).toBe(100);
    expect(service.getYearlyEarnings('c1', 2025)).toBe(200);
    expect(service.getYearlyEarnings('c2', 2026)).toBe(999);
    expect(service.getYearlyEarnings('nobody', 2026)).toBe(0);
  });

  it('falls back to the default 24% withholding status when none is set', () => {
    const status = service.getWithholdingStatus('unknown-creator');
    expect(status.rate).toBe(0.24);
    expect(status.w9OnFile).toBe(false);
  });

  it('persists a custom withholding status', () => {
    service.setWithholdingStatus({
      creatorId: 'c1',
      rate: 0.1,
      w9OnFile: true,
      lastUpdated: new Date('2026-01-01'),
    });
    expect(service.getWithholdingStatus('c1').rate).toBe(0.1);
  });
});
