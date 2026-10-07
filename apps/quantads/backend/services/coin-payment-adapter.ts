// ============================================================================
// QuantAds - Coin purchase payment adapter (real, fail-closed)
// ============================================================================
//
// Replaces the route-level DEV `mockAdapter` whose `verifyPayment` returned
// `true` unconditionally — a payment bypass that granted coins for ANY paymentRef
// without a real payment. This adapter delegates verification to the real
// @quant/payments RazorpayGateway, which performs HMAC-SHA256 signature
// verification when RAZORPAY_KEY_ID/SECRET are configured and FAILS CLOSED
// (verified = false) otherwise.
//
// Contract note: trustworthy verification needs the Razorpay callback fields
// (paymentId + signature). The legacy buy contract carried only a single
// `paymentRef`, so when no signature is supplied verification fails closed (no
// coins). The live, signed flow is exercised in staging with real credentials.

import { RazorpayGateway } from '@quant/payments';
import type { PaymentGatewayAdapter } from '@quant/quant-economy';

/** The Razorpay callback fields needed to verify a real payment. */
export interface CoinPaymentVerification {
  /** Razorpay payment id from the checkout callback. */
  paymentId?: string;
  /** HMAC signature from the checkout callback. */
  signature?: string;
}

/**
 * Build a real, fail-closed PaymentGatewayAdapter for a coin purchase. The same
 * gateway instance backs createOrder + verifyPayment so the order created here
 * is the one verified. Without a signature (or without live credentials) the
 * verification fails closed — no coins are granted.
 */
export function createCoinPaymentAdapter(
  verification: CoinPaymentVerification = {},
): PaymentGatewayAdapter {
  const gateway = new RazorpayGateway();
  return {
    createOrder: async (amount: number) => {
      const order = await gateway.createOrder(amount);
      return { orderId: order.id };
    },
    verifyPayment: async (orderId: string, paymentRef: string) => {
      // FAIL CLOSED: a real payment is confirmed only by a valid signature over
      // (orderId, paymentId). No signature => we cannot trust that money was
      // received, so we never grant coins.
      const signature = verification.signature;
      if (!signature) return false;
      const paymentId = verification.paymentId ?? paymentRef;
      const result = await gateway.verifyPayment(orderId, paymentId, signature);
      return result.verified;
    },
  };
}
