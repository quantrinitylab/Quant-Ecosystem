import { describe, it, expect, vi } from 'vitest';
import { AgentEconomy, type AgentEconomyBackend } from '../economy/agent-economy.js';
import type { AgentMarketplaceV2 } from '../marketplace/agent-marketplace-v2.js';
import type { IntelligentOrchestrator } from '../orchestrator/intelligent-orchestrator.js';

function makeDeps(price = 29) {
  const purchaseAndIntegrate = vi
    .fn()
    .mockResolvedValue({ success: true, listing: { id: 'l-1', price }, integration: {} });
  const runIntelligentTask = vi.fn().mockResolvedValue({ ok: true });
  const marketplace = { purchaseAndIntegrate } as unknown as AgentMarketplaceV2;
  const orchestrator = { runIntelligentTask } as unknown as IntelligentOrchestrator;
  return { marketplace, orchestrator, purchaseAndIntegrate, runIntelligentTask };
}

describe('AgentEconomy.purchaseAgent - money path (fail closed)', () => {
  describe('real backend path (injected)', () => {
    it('records a completed transaction and credits revenue on settlement success', async () => {
      const { marketplace, orchestrator, runIntelligentTask } = makeDeps(29);
      const backend: AgentEconomyBackend = {
        settlePurchase: vi
          .fn()
          .mockResolvedValue({ transactionId: 'tx-real', status: 'completed' }),
      };
      const economy = new AgentEconomy(marketplace, orchestrator, backend);

      expect(economy.isBackendConfigured()).toBe(true);
      const tx = await economy.purchaseAgent('l-1', 'buyer-1');

      expect(tx.status).toBe('completed');
      expect(tx.id).toBe('tx-real');
      expect(tx.amount).toBe(29);
      expect(economy.getEconomyStats().totalRevenue).toBe(29);
      expect(runIntelligentTask).toHaveBeenCalledOnce();
    });

    it('records a failed transaction and credits NO revenue when the backend throws', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { marketplace, orchestrator } = makeDeps(29);
      const backend: AgentEconomyBackend = {
        settlePurchase: vi.fn().mockRejectedValue(new Error('ledger down')),
      };
      const economy = new AgentEconomy(marketplace, orchestrator, backend);

      const tx = await economy.purchaseAgent('l-1', 'buyer-1');
      expect(tx.status).toBe('failed');
      expect(economy.getEconomyStats().totalRevenue).toBe(0);
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
    });
  });

  describe('fail-closed fallback (no backend configured)', () => {
    it('throws and credits NO revenue', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { marketplace, orchestrator, purchaseAndIntegrate } = makeDeps(29);
      const economy = new AgentEconomy(marketplace, orchestrator); // no backend, no env

      expect(economy.isBackendConfigured()).toBe(false);
      await expect(economy.purchaseAgent('l-1', 'buyer-1')).rejects.toThrow(/not configured/i);

      // Fail closed: no settlement attempt, no revenue.
      expect(purchaseAndIntegrate).not.toHaveBeenCalled();
      expect(economy.getEconomyStats().totalRevenue).toBe(0);
      expect(economy.getEconomyStats().totalTransactions).toBe(0);
      warn.mockRestore();
    });
  });
});
