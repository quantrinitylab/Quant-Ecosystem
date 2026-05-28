import type { BetaInvite, InviteTemplate } from '../types.js';

export class InviteSystem {
  private invites = new Map<string, BetaInvite>();
  private templates = new Map<string, InviteTemplate>();
  private waitlist: string[] = [];

  createTemplate(name: string, subject: string, body: string): InviteTemplate {
    const t: InviteTemplate = { id: crypto.randomUUID(), name, subject, body };
    this.templates.set(t.id, t);
    return t;
  }

  generateInvite(email: string, cohort: string, ttlMs: number, referredBy?: string): BetaInvite {
    const now = Date.now();
    const invite: BetaInvite = {
      id: crypto.randomUUID(),
      email,
      cohort,
      sentAt: now,
      expiresAt: now + ttlMs,
      status: 'sent',
      referredBy,
    };
    this.invites.set(invite.id, invite);
    return invite;
  }

  bulkInvite(emails: string[], cohort: string, ttlMs: number): BetaInvite[] {
    return emails.map((e) => this.generateInvite(e, cohort, ttlMs));
  }

  acceptInvite(inviteId: string): boolean {
    const invite = this.invites.get(inviteId);
    if (!invite) return false;
    if (invite.status === 'expired' || Date.now() > invite.expiresAt) {
      invite.status = 'expired';
      return false;
    }
    invite.status = 'accepted';
    invite.acceptedAt = Date.now();
    return true;
  }

  markOpened(inviteId: string): boolean {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.status !== 'sent') return false;
    invite.status = 'opened';
    return true;
  }

  expireStale(): number {
    let count = 0;
    const now = Date.now();
    for (const invite of this.invites.values()) {
      if (invite.status !== 'accepted' && now > invite.expiresAt) {
        invite.status = 'expired';
        count++;
      }
    }
    return count;
  }

  addToWaitlist(email: string): number {
    if (!this.waitlist.includes(email)) {
      this.waitlist.push(email);
    }
    return this.waitlist.indexOf(email) + 1;
  }

  getWaitlistPosition(email: string): number {
    const idx = this.waitlist.indexOf(email);
    return idx === -1 ? -1 : idx + 1;
  }

  getWaitlistSize(): number {
    return this.waitlist.length;
  }

  getReferralCount(referrerId: string): number {
    return [...this.invites.values()].filter(
      (i) => i.referredBy === referrerId && i.status === 'accepted',
    ).length;
  }

  getInvitesByStatus(status: BetaInvite['status']): BetaInvite[] {
    return [...this.invites.values()].filter((i) => i.status === status);
  }

  getInvite(id: string): BetaInvite | null {
    return this.invites.get(id) ?? null;
  }
}
