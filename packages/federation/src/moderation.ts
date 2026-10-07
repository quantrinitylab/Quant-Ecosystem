import { z } from 'zod';

export const BlocklistSchema = z.object({
  blockedDomains: z.array(z.string()),
});

export const AllowlistSchema = z.object({
  allowedDomains: z.array(z.string()),
});

export class FederationModeration {
  private blocklist: Set<string> = new Set();
  private allowlist: Set<string> = new Set();

  blockInstance(domain: string): void {
    this.blocklist.add(domain);
  }

  unblockInstance(domain: string): void {
    this.blocklist.delete(domain);
  }

  allowInstance(domain: string): void {
    this.allowlist.add(domain);
  }

  removeAllowedInstance(domain: string): void {
    this.allowlist.delete(domain);
  }

  isBlocked(domain: string): boolean {
    return this.blocklist.has(domain);
  }

  isAllowed(domain: string): boolean {
    if (this.allowlist.size === 0) {
      return !this.isBlocked(domain);
    }
    return this.allowlist.has(domain) && !this.isBlocked(domain);
  }

  checkActivity(activity: { actor: string | { id: string } }): boolean {
    const actorUrl = typeof activity.actor === 'string' ? activity.actor : activity.actor.id;
    const domain = this.extractDomain(actorUrl);
    return this.isAllowed(domain);
  }

  private extractDomain(actorUrl: string): string {
    const url = new URL(actorUrl);
    return url.hostname;
  }
}
