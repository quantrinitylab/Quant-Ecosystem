import type { PaymentGatewayAdapter } from '../types.js';
import type { CoinWallet } from './wallet.js';

export class BuyCoinService {
  private processedRefs = new Set<string>();
  private wallet: CoinWallet;

  constructor(wallet: CoinWallet) {
    this.wallet = wallet;
  }

  async buyWithStripe(
    userId: string,
    amount: number,
    paymentRef: string,
    adapter: PaymentGatewayAdapter,
  ): Promise<{ success: boolean; coins: number }> {
    return this.processPurchase(userId, amount, paymentRef, adapter, 'stripe');
  }

  async buyWithRazorpay(
    userId: string,
    amount: number,
    paymentRef: string,
    adapter: PaymentGatewayAdapter,
  ): Promise<{ success: boolean; coins: number }> {
    return this.processPurchase(userId, amount, paymentRef, adapter, 'razorpay');
  }

  async buyWithUPI(
    userId: string,
    amount: number,
    paymentRef: string,
    adapter: PaymentGatewayAdapter,
  ): Promise<{ success: boolean; coins: number }> {
    return this.processPurchase(userId, amount, paymentRef, adapter, 'upi');
  }

  private async processPurchase(
    userId: string,
    amount: number,
    paymentRef: string,
    adapter: PaymentGatewayAdapter,
    source: string,
  ): Promise<{ success: boolean; coins: number }> {
    if (this.processedRefs.has(paymentRef)) {
      return { success: false, coins: 0 };
    }

    const order = await adapter.createOrder(amount, 'INR');
    const verified = await adapter.verifyPayment(order.orderId, paymentRef);

    if (!verified) {
      return { success: false, coins: 0 };
    }

    this.processedRefs.add(paymentRef);
    this.wallet.creditCoins(userId, amount, `buy-coins:${source}`, `buy-${paymentRef}`);
    return { success: true, coins: amount };
  }
}
