import { DistributionTarget, Visibility } from '../types.js';

export class DistributionService {
  private targets: Map<string, DistributionTarget> = new Map();

  distribute(appId: string, contexts: string[]): DistributionTarget {
    const existing = this.targets.get(appId);

    if (existing) {
      const merged = new Set([...existing.contexts, ...contexts]);
      const updated: DistributionTarget = { ...existing, contexts: Array.from(merged) };
      this.targets.set(appId, updated);
      return updated;
    }

    const target: DistributionTarget = {
      appId,
      contexts,
      visibility: 'public',
      restrictions: [],
    };
    this.targets.set(appId, target);
    return target;
  }

  retract(appId: string, context: string): boolean {
    const target = this.targets.get(appId);
    if (!target) return false;

    const updated: DistributionTarget = {
      ...target,
      contexts: target.contexts.filter((c) => c !== context),
    };
    this.targets.set(appId, updated);
    return true;
  }

  getTargets(appId: string): DistributionTarget | null {
    return this.targets.get(appId) ?? null;
  }

  getAppsForContext(context: string): DistributionTarget[] {
    return Array.from(this.targets.values()).filter((t) => t.contexts.includes(context));
  }

  syncAvailability(appId: string): DistributionTarget | null {
    const target = this.targets.get(appId);
    if (!target) return null;

    // Remove any empty contexts after sync
    const updated: DistributionTarget = {
      ...target,
      contexts: target.contexts.filter((c) => c.length > 0),
    };
    this.targets.set(appId, updated);
    return updated;
  }

  setVisibility(appId: string, visibility: Visibility): boolean {
    const target = this.targets.get(appId);
    if (!target) return false;
    this.targets.set(appId, { ...target, visibility });
    return true;
  }

  addRestriction(appId: string, restriction: string): boolean {
    const target = this.targets.get(appId);
    if (!target) return false;
    this.targets.set(appId, {
      ...target,
      restrictions: [...target.restrictions, restriction],
    });
    return true;
  }
}
