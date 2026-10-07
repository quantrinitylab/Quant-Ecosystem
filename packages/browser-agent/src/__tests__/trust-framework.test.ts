import { TrustFramework } from '../trust/trust-framework.js';
import { ActionTier } from '../types.js';

describe('TrustFramework', () => {
  let trust: TrustFramework;
  beforeEach(() => {
    trust = new TrustFramework();
  });

  it('authorize and isAuthorized flow', () => {
    trust.authorize('shop.com', 'u1');
    expect(trust.isAuthorized('https://shop.com/page', 'u1')).toBe(true);
    expect(trust.isAuthorized('https://www.shop.com/page', 'u1')).toBe(true);
    expect(trust.isAuthorized('https://other.com', 'u1')).toBe(false);
  });

  it('isAuthorized rejects substring domain matches', () => {
    trust.authorize('shop.com', 'u1');
    expect(trust.isAuthorized('https://evil-shop.com', 'u1')).toBe(false);
    expect(trust.isAuthorized('https://notshop.com.attacker.io', 'u1')).toBe(false);
  });

  it('isAuthorized returns false for invalid URLs', () => {
    trust.authorize('shop.com', 'u1');
    expect(trust.isAuthorized('not a url', 'u1')).toBe(false);
  });

  it('setSpendingCap and checkSpendingCap enforcement', () => {
    trust.setSpendingCap('s1', 100, 'USD');
    expect(trust.checkSpendingCap('s1', 50)).toBe(true);
    expect(trust.checkSpendingCap('s1', 150)).toBe(false);
  });

  it('debitSpendingCap increments currentSpend', () => {
    trust.setSpendingCap('s1', 100, 'USD');
    trust.debitSpendingCap('s1', 60);
    expect(trust.checkSpendingCap('s1', 50)).toBe(false);
    expect(trust.checkSpendingCap('s1', 40)).toBe(true);
  });

  it('debitSpendingCap is no-op for unknown session', () => {
    expect(() => trust.debitSpendingCap('unknown', 10)).not.toThrow();
  });

  it('requiresConfirmation for read_only returns false', () => {
    const result = trust.requiresConfirmation({ type: 'navigate', url: '/' });
    expect(result.required).toBe(false);
    expect(result.tier).toBe(ActionTier.read_only);
  });

  it('requiresConfirmation for purchase returns true', () => {
    const result = trust.requiresConfirmation({ type: 'click', selector: '#buy-now' });
    expect(result.required).toBe(true);
    expect(result.tier).toBe(ActionTier.purchase);
  });

  it('confirmAction allows confirmed purchase actions', () => {
    trust.confirmAction('s1', 'a1', true);
    expect(() =>
      trust.assertConfirmed('s1', { type: 'click', selector: '#buy-now', id: 'a1' }),
    ).not.toThrow();
  });

  it('throws if purchase action proceeds without confirmation', () => {
    expect(() =>
      trust.assertConfirmed('s1', { type: 'click', selector: '#checkout', id: 'a2' }),
    ).toThrow('confirmation');
  });

  it('does not throw for non-purchase actions without confirmation', () => {
    expect(() => trust.assertConfirmed('s1', { type: 'navigate', url: '/' })).not.toThrow();
  });
});
