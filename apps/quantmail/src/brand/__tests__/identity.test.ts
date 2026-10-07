import { describe, expect, it } from 'vitest';
import {
  quantAiBrandLockup,
  quantMailBrandLockup,
  quantMailBrandMetadata,
} from '../identity';

describe('QuantMail product identity', () => {
  it('uses the approved endorsed-product hierarchy', () => {
    expect(quantMailBrandLockup.productName).toBe('QuantMail');
    expect(quantMailBrandLockup.byline).toBe('by QUANTRINITY');
    expect(quantMailBrandLockup.accessibleName).toBe('QuantMail by Quantrinity');
    expect(quantMailBrandMetadata.title).toBe('QuantMail by QUANTRINITY');
  });

  it('keeps company and identity domains distinct', () => {
    expect(quantMailBrandMetadata.companyDomain).toBe('quantrinity.in');
    expect(quantMailBrandMetadata.identityDomain).toBe('quantmail.in');
  });

  it('provides the same endorsement contract to embedded QuantAI', () => {
    expect(quantAiBrandLockup.byline).toBe('by QUANTRINITY');
    expect(quantAiBrandLockup.accessibleName).toBe('QuantAI by Quantrinity');
  });

  it('freezes canonical identity records against runtime mutation', () => {
    expect(Object.isFrozen(quantMailBrandLockup)).toBe(true);
    expect(Object.isFrozen(quantAiBrandLockup)).toBe(true);
    expect(Object.isFrozen(quantMailBrandMetadata)).toBe(true);
  });
});
