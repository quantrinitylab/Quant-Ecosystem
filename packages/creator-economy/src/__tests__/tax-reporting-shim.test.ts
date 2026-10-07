// K11 consolidation: guards the deprecated re-export shim at
// `src/payouts/tax-reporting.ts`. The shim must keep exporting the exact same
// class the canonical `@quant/payments` package owns, so existing consumers of
// `@quant/creator-economy` do not break while the migration proceeds.
import { describe, it, expect } from 'vitest';
import { TaxReportingService as ShimService } from '../payouts/tax-reporting.js';
import type { Tax1099, WithholdingStatus } from '../payouts/tax-reporting.js';
import { TaxReportingService as CanonicalService } from '@quant/payments';

describe('tax-reporting deprecated shim', () => {
  it('re-exports the canonical @quant/payments TaxReportingService', () => {
    expect(ShimService).toBe(CanonicalService);
  });

  it('behaves identically through the shim', () => {
    const service = new ShimService();
    service.addEvent({ creatorId: 'c1', amount: 1000, timestamp: new Date('2026-04-01') });
    const doc: Tax1099 = service.generate1099('c1', 2026);
    expect(doc.totalEarnings).toBe(1000);
    expect(doc.withheld).toBeCloseTo(240, 10);

    const status: WithholdingStatus = service.getWithholdingStatus('c1');
    expect(status.rate).toBe(0.24);
  });
});
