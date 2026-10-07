import { describe, it, expect, vi } from 'vitest';
import { AgentEconomyPayments, type PaymentBackend } from '../payments/agent-economy-payments.js';
import type { AgentEconomy } from '../economy/agent-economy.js';

const fakeEconomy = {} as unknown as AgentEconomy;

describe('AgentEconomyPayments.processPayment - money path (fail closed)', () => {
  describe('real backend path (injected)', () => {
    it('marks the payment completed and credits processed total on charge success', async () => {
      const backend: PaymentBackend = {
        charge: vi.fn().mockResolvedValue({ id: 'pay-real', status: 'completed' }),
      };
      const payments = new AgentEconomyPayments(fakeEconomy, backend);

      expect(payments.isBackendConfigured()).toBe(true);
      const tx = await payments.processPayment('buyer-1', 19.99, 'l-1');

      expect(tx.status).toBe('completed');
      expect(tx.id).toBe('pay-real');
      expect(backend.charge).toHaveBeenCalledWith({
        buyer: 'buyer-1',
        amount: 19.99,
        currency: 'USD',
        listingId: 'l-1',
      });
      expect(payments.getPaymentStats().totalProcessed).toBe(19.99);
    });

    it('records a failed payment (no processed total) when the backend throws', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const backend: PaymentBackend = {
        charge: vi.fn().mockRejectedValue(new Error('processor down')),
      };
      const payments = new AgentEconomyPayments(fakeEconomy, backend);

      const tx = await payments.processPayment('buyer-1', 19.99, 'l-1');
      expect(tx.status).toBe('failed');
      expect(payments.getPaymentStats().totalProcessed).toBe(0);
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
    });
  });

  describe('fail-closed fallback (no backend configured)', () => {
    it('returns a failed payment and credits NO processed total', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const payments = new AgentEconomyPayments(fakeEconomy); // no backend, no env

      expect(payments.isBackendConfigured()).toBe(false);
      const tx = await payments.processPayment('buyer-1', 49.99, 'l-1');

      expect(tx.status).toBe('failed');
      expect(payments.getPaymentStats().totalProcessed).toBe(0);
      expect(payments.getPaymentStats().successRate).toBe(0);
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
    });
  });
});
