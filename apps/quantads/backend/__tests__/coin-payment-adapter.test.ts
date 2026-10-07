import { describe, it, expect } from 'vitest';
import { createCoinPaymentAdapter } from '../services/coin-payment-adapter';

describe('createCoinPaymentAdapter (real, fail-closed)', () => {
  it('creates an order with a non-empty orderId', async () => {
    const adapter = createCoinPaymentAdapter();
    const order = await adapter.createOrder(500, 'INR');
    expect(typeof order.orderId).toBe('string');
    expect(order.orderId.length).toBeGreaterThan(0);
  });

  it('fails closed when no signature is supplied (no free coins)', async () => {
    const adapter = createCoinPaymentAdapter();
    const order = await adapter.createOrder(500, 'INR');
    const verified = await adapter.verifyPayment(order.orderId, 'pay-ref-1');
    expect(verified).toBe(false);
  });

  it('fails closed with a signature but no live Razorpay credentials', async () => {
    const adapter = createCoinPaymentAdapter({ paymentId: 'pay_123', signature: 'deadbeef' });
    const order = await adapter.createOrder(500, 'INR');
    const verified = await adapter.verifyPayment(order.orderId, 'pay-ref-1');
    // Without RAZORPAY_KEY_ID/SECRET the gateway cannot trust the signature.
    expect(verified).toBe(false);
  });
});
