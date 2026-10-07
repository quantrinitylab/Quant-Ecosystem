import type { BrowserAction, SiteAuth, SpendingCap } from '../types.js';
import { ActionTier } from '../types.js';
import { classifyAction } from '../actions/browser-actions.js';

export class TrustFramework {
  private authorizations = new Map<string, SiteAuth>();
  private caps = new Map<string, SpendingCap>();
  private confirmations = new Map<string, boolean>();

  authorize(sitePattern: string, userId: string): void {
    this.authorizations.set(`${userId}:${sitePattern}`, {
      sitePattern,
      granted: true,
      grantedAt: Date.now(),
      grantedBy: userId,
    });
  }

  isAuthorized(url: string, userId: string): boolean {
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return false;
    }
    for (const [key, auth] of this.authorizations) {
      if (
        key.startsWith(`${userId}:`) &&
        auth.granted &&
        (hostname === auth.sitePattern || hostname.endsWith(`.${auth.sitePattern}`))
      )
        return true;
    }
    return false;
  }

  setSpendingCap(sessionId: string, limit: number, currency: string): void {
    this.caps.set(sessionId, { sessionLimit: limit, currentSpend: 0, currency });
  }

  checkSpendingCap(sessionId: string, amount: number): boolean {
    const cap = this.caps.get(sessionId);
    if (!cap) return true;
    return cap.currentSpend + amount <= cap.sessionLimit;
  }

  debitSpendingCap(sessionId: string, amount: number): void {
    const cap = this.caps.get(sessionId);
    if (!cap) return;
    cap.currentSpend += amount;
  }

  requiresConfirmation(action: BrowserAction): {
    required: boolean;
    reason?: string;
    tier: ActionTier;
  } {
    const tier = classifyAction(action);
    if (tier === ActionTier.purchase) {
      return {
        required: true,
        reason: 'Purchase-tier action requires explicit user confirmation',
        tier,
      };
    }
    return { required: false, tier };
  }

  confirmAction(sessionId: string, actionId: string, confirmed: boolean): void {
    this.confirmations.set(`${sessionId}:${actionId}`, confirmed);
  }

  assertConfirmed(sessionId: string, action: BrowserAction): void {
    const tier = classifyAction(action);
    if (tier !== ActionTier.purchase) return;
    const id = action.id ?? '';
    const key = `${sessionId}:${id}`;
    const confirmed = this.confirmations.get(key);
    if (confirmed !== true) {
      throw new Error('Purchase-tier action requires confirmation before execution');
    }
  }
}
