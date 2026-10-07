import { describe, it, expect, beforeEach } from 'vitest';
import { CoinWallet } from '../coins/wallet.js';
import { BuyCoinService } from '../coins/buy-coins.js';
import type { PaymentGatewayAdapter } from '../types.js';

function createMockAdapter(shouldVerify = true): PaymentGatewayAdapter {
  return {
    createOrder: async (amount: number, _currency: string) => ({ orderId: `order-${amount}` }),
    verifyPayment: async (_orderId: string, _paymentRef: string) => shouldVerify,
  };
}

describe('BuyCoinService', () => {
  let wallet: CoinWallet;
  let buyCoinService: BuyCoinService;

  beforeEach(() => {
    wallet = new CoinWallet();
    wallet.createWallet('user-1');
    buyCoinService = new BuyCoinService(wallet);
  });

  it('should buy coins via Stripe adapter', async () => {
    const adapter = createMockAdapter();
    const result = await buyCoinService.buyWithStripe('user-1', 500, 'stripe-ref-1', adapter);
    expect(result.success).toBe(true);
    expect(result.coins).toBe(500);
    expect(wallet.getBalance('user-1')).toBe(500);
  });

  it('should buy coins via Razorpay adapter', async () => {
    const adapter = createMockAdapter();
    const result = await buyCoinService.buyWithRazorpay('user-1', 300, 'rp-ref-1', adapter);
    expect(result.success).toBe(true);
    expect(result.coins).toBe(300);
    expect(wallet.getBalance('user-1')).toBe(300);
  });

  it('should buy coins via UPI adapter', async () => {
    const adapter = createMockAdapter();
    const result = await buyCoinService.buyWithUPI('user-1', 200, 'upi-ref-1', adapter);
    expect(result.success).toBe(true);
    expect(result.coins).toBe(200);
    expect(wallet.getBalance('user-1')).toBe(200);
  });

  it('should enforce idempotency - reject duplicate paymentRef', async () => {
    const adapter = createMockAdapter();
    await buyCoinService.buyWithStripe('user-1', 500, 'dup-ref', adapter);
    const result = await buyCoinService.buyWithStripe('user-1', 500, 'dup-ref', adapter);
    expect(result.success).toBe(false);
    expect(result.coins).toBe(0);
    expect(wallet.getBalance('user-1')).toBe(500); // only first purchase counts
  });

  it('should reject payment when verification fails', async () => {
    const adapter = createMockAdapter(false);
    const result = await buyCoinService.buyWithStripe('user-1', 100, 'fail-ref', adapter);
    expect(result.success).toBe(false);
    expect(wallet.getBalance('user-1')).toBe(0);
  });
});
