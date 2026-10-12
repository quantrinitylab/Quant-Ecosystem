import { describe, expect, it } from 'vitest';
import { CORE_QUANT_APPS } from '../constants';

describe('CORE_QUANT_APPS catalog truth and brand locks', () => {
  it('keeps QuantMail on the locked orange accent', () => {
    expect(CORE_QUANT_APPS.quantmail.accentColor).toBe('#FF8C42');
  });

  it('does not advertise unverified QuantChat latency or E2EE claims in shared catalog copy', () => {
    const copy = `${CORE_QUANT_APPS.quantchat.tagline} ${CORE_QUANT_APPS.quantchat.description}`.toLowerCase();
    expect(copy).not.toContain('sub-millisecond');
    expect(copy).not.toContain('e2ee');
  });
});
