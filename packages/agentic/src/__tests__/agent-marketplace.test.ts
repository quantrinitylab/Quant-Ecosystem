import { describe, it, expect, vi } from 'vitest';
import { AgentMarketplace, type MarketplaceBackend } from '../marketplace/agent-marketplace.js';

describe('AgentMarketplace.installAgent - dual mode', () => {
  describe('real backend path (injected)', () => {
    it('delegates installation to the backend', async () => {
      const backend: MarketplaceBackend = {
        install: vi.fn().mockResolvedValue(true),
      };
      const market = new AgentMarketplace(backend);

      expect(market.isBackendConfigured()).toBe(true);
      const ok = await market.installAgent('user-1', 'research-agent');

      expect(ok).toBe(true);
      expect(backend.install).toHaveBeenCalledWith('user-1', 'research-agent');
      // Backend path does not touch the in-process fallback record.
      expect(market.getInstalledAgents('user-1')).toEqual([]);
    });

    it('falls back to local install (and warns) when the backend throws', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const backend: MarketplaceBackend = {
        install: vi.fn().mockRejectedValue(new Error('marketplace down')),
      };
      const market = new AgentMarketplace(backend);

      const ok = await market.installAgent('user-2', 'social-agent');
      expect(ok).toBe(true);
      expect(market.getInstalledAgents('user-2')).toContain('social-agent');
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
    });
  });

  describe('fallback path', () => {
    it('records the install in-process when no backend is configured', async () => {
      const market = new AgentMarketplace(); // no backend, no env

      expect(market.isBackendConfigured()).toBe(false);
      const ok = await market.installAgent('user-3', 'productivity-agent');

      expect(ok).toBe(true);
      expect(market.getInstalledAgents('user-3')).toEqual(['productivity-agent']);
    });

    it('still serves the read-only catalogue methods', async () => {
      const market = new AgentMarketplace();
      const all = await market.getAllAgents();
      expect(all.length).toBeGreaterThan(0);
      const found = await market.searchAgents('research');
      expect(found.some((a) => a.id === 'research-agent')).toBe(true);
    });
  });
});
