import type { MarketingSite } from '../types.js';

export class MarketingIntegration {
  private sites = new Map<string, MarketingSite>();

  createVariant(name: string, variant: string): MarketingSite {
    const site: MarketingSite = {
      id: crypto.randomUUID(),
      name,
      variant,
      visits: 0,
      conversions: 0,
    };
    this.sites.set(site.id, site);
    return site;
  }

  recordVisit(siteId: string): boolean {
    const site = this.sites.get(siteId);
    if (!site) return false;
    site.visits++;
    return true;
  }

  recordConversion(siteId: string): boolean {
    const site = this.sites.get(siteId);
    if (!site) return false;
    site.conversions++;
    return true;
  }

  getConversionRate(siteId: string): number {
    const site = this.sites.get(siteId);
    if (!site || site.visits === 0) return 0;
    return site.conversions / site.visits;
  }

  compareVariants(nameFilter: string): { winner: string | null; variants: MarketingSite[] } {
    const variants = [...this.sites.values()].filter((s) => s.name === nameFilter);
    if (variants.length === 0) return { winner: null, variants: [] };
    let best: MarketingSite | null = null;
    let bestRate = -1;
    for (const v of variants) {
      const rate = v.visits > 0 ? v.conversions / v.visits : 0;
      if (rate > bestRate) {
        bestRate = rate;
        best = v;
      }
    }
    return { winner: best?.variant ?? null, variants };
  }

  getSite(id: string): MarketingSite | null {
    return this.sites.get(id) ?? null;
  }
}
