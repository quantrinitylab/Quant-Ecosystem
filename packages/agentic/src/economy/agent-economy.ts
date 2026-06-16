// ============================================================================
// Agentic - Agent Economy
// ============================================================================
//
// MONEY PATH — fails closed.
//
// Purchasing an agent settles a real transaction, so this service NEVER confirms
// a purchase unless a real economy backend is configured and reports success:
//   - When an economy backend is configured (AGENT_ECONOMY_URL, optionally
//     AGENT_ECONOMY_API_KEY) the purchase is settled against the real service.
//   - When NO backend is configured, `purchaseAgent` FAILS CLOSED by throwing —
//     it does not record a completed transaction or add revenue.
//   - When the backend errors (or reports a non-completed status) the
//     transaction is recorded as `failed` (an explicit failure) and revenue is
//     not credited. Errors are logged as warnings (never silently swallowed).
// This mirrors the fail-closed posture of packages/payments (quant-pro.service).

import { EventEmitter } from 'events';
import { AgentMarketplaceV2 } from '../marketplace/agent-marketplace-v2';
import { IntelligentOrchestrator } from '../orchestrator/intelligent-orchestrator';

export interface AgentTransaction {
  id: string;
  listingId: string;
  buyer: string;
  amount: number;
  timestamp: Date;
  status: 'completed' | 'pending' | 'failed';
}

/** Outcome of settling a purchase against the real economy backend. */
export interface SettlementResult {
  transactionId: string;
  status: 'completed' | 'failed';
}

/**
 * Pluggable economy backend that settles a purchase against a real payment /
 * ledger service. Tests can supply a fake to exercise the real-mode path
 * without touching the network.
 */
export interface AgentEconomyBackend {
  settlePurchase(input: {
    listingId: string;
    buyer: string;
    amount: number;
  }): Promise<SettlementResult>;
}

/**
 * Real economy backend backed by a configured HTTP service. Enabled by
 * AGENT_ECONOMY_URL (optionally AGENT_ECONOMY_API_KEY).
 */
export class HttpAgentEconomyBackend implements AgentEconomyBackend {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  async settlePurchase(input: {
    listingId: string;
    buyer: string;
    amount: number;
  }): Promise<SettlementResult> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/purchases`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new Error(`economy service responded ${res.status}`);
    }
    const body = (await res.json()) as { transactionId?: string; status?: string };
    return {
      transactionId: body.transactionId ?? `tx-${Date.now()}`,
      status: body.status === 'completed' ? 'completed' : 'failed',
    };
  }
}

export class AgentEconomy extends EventEmitter {
  private marketplace: AgentMarketplaceV2;
  private orchestrator: IntelligentOrchestrator;
  private transactions: AgentTransaction[] = [];
  private totalRevenue: number = 0;
  private readonly backend: AgentEconomyBackend | null;

  /**
   * @param backend Optional explicit backend (primarily for tests). When
   *   omitted, a real backend is constructed from environment configuration.
   */
  constructor(
    marketplace: AgentMarketplaceV2,
    orchestrator: IntelligentOrchestrator,
    backend?: AgentEconomyBackend,
  ) {
    super();
    this.marketplace = marketplace;
    this.orchestrator = orchestrator;
    this.backend = backend ?? AgentEconomy.createBackendFromEnv();
  }

  private static createBackendFromEnv(): AgentEconomyBackend | null {
    const url = process.env['AGENT_ECONOMY_URL'];
    if (url) {
      return new HttpAgentEconomyBackend(url, process.env['AGENT_ECONOMY_API_KEY']);
    }
    return null;
  }

  /** Whether a real economy (settlement) backend is wired up. */
  isBackendConfigured(): boolean {
    return this.backend !== null;
  }

  async purchaseAgent(listingId: string, buyer: string): Promise<AgentTransaction> {
    // FAIL CLOSED: without a real settlement backend we MUST NOT confirm a
    // purchase or credit revenue.
    if (!this.backend) {
      // eslint-disable-next-line no-console
      console.warn(
        '[agent-economy] settlement backend not configured (AGENT_ECONOMY_URL) — failing closed',
      );
      throw new Error('Agent economy backend not configured — refusing to confirm purchase');
    }

    const result = await this.marketplace.purchaseAndIntegrate(listingId);
    const amount: number = result.listing.price;

    let settlement: SettlementResult;
    try {
      settlement = await this.backend.settlePurchase({ listingId, buyer, amount });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn(
        `[agent-economy] settlement failed for ${listingId}, recording failed transaction: ${message}`,
      );
      const failed: AgentTransaction = {
        id: `tx-${Date.now()}`,
        listingId,
        buyer,
        amount,
        timestamp: new Date(),
        status: 'failed',
      };
      this.transactions.push(failed);
      this.emit('economy:transaction', failed);
      return failed;
    }

    const transaction: AgentTransaction = {
      id: settlement.transactionId,
      listingId,
      buyer,
      amount,
      timestamp: new Date(),
      status: settlement.status,
    };

    this.transactions.push(transaction);

    if (transaction.status === 'completed') {
      this.totalRevenue += transaction.amount;
    }

    this.emit('economy:transaction', transaction);

    // Use orchestrator for post-purchase optimization (only on success).
    if (transaction.status === 'completed') {
      await this.orchestrator.runIntelligentTask(
        `Optimize newly purchased agent ${listingId} for ${buyer}`,
      );
    }

    return transaction;
  }

  getEconomyStats() {
    return {
      totalTransactions: this.transactions.length,
      totalRevenue: this.totalRevenue,
      avgTransaction: this.totalRevenue / this.transactions.length || 0,
      topAgents: this.transactions.slice(-5),
    };
  }

  async runEconomySimulation() {
    // Simulate market activity
    const listings = await this.marketplace.discoverAgents('ai');
    for (const listing of listings.slice(0, 3)) {
      await this.purchaseAgent(listing.id, 'simulation-user');
    }
    return this.getEconomyStats();
  }
}
