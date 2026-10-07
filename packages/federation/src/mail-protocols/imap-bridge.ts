import { z } from 'zod';

export const IMAPConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
  tls: z.boolean().default(true),
  username: z.string(),
  password: z.string(),
});

export type IMAPConfig = z.infer<typeof IMAPConfigSchema>;

export const BridgeMailboxSchema = z.object({
  name: z.string(),
  delimiter: z.string(),
  flags: z.array(z.string()),
  exists: z.number(),
  recent: z.number(),
});

export type BridgeMailbox = z.infer<typeof BridgeMailboxSchema>;

export const BridgeMessageSchema = z.object({
  uid: z.number(),
  flags: z.array(z.string()),
  subject: z.string(),
  from: z.string(),
  to: z.string(),
  date: z.string(),
  body: z.string().optional(),
  size: z.number(),
});

export type BridgeMessage = z.infer<typeof BridgeMessageSchema>;

export interface MessageRange {
  start: number;
  end: number;
}

export interface IMAPSearchCriteria {
  from?: string;
  to?: string;
  subject?: string;
  since?: string;
  before?: string;
  unseen?: boolean;
  flagged?: boolean;
  keyword?: string;
}

export type IdleCallback = (event: { type: string; data: unknown }) => void;

export class IMAPBridge {
  private connected = false;
  private mailboxes: Map<string, BridgeMailbox> = new Map();
  private messages: Map<string, BridgeMessage[]> = new Map();
  private idleCallbacks: Map<string, IdleCallback> = new Map();

  connect(config: IMAPConfig): boolean {
    const parsed = IMAPConfigSchema.safeParse(config);
    if (!parsed.success) return false;

    this.connected = true;

    // Initialize default mailboxes
    const defaults: Array<[string, number]> = [
      ['INBOX', 0],
      ['Sent', 0],
      ['Drafts', 0],
      ['Trash', 0],
      ['Spam', 0],
    ];

    for (const [name, count] of defaults) {
      this.mailboxes.set(name, {
        name,
        delimiter: '/',
        flags: ['\\HasNoChildren'],
        exists: count,
        recent: 0,
      });
      this.messages.set(name, []);
    }

    return true;
  }

  listMailboxes(): BridgeMailbox[] {
    if (!this.connected) return [];
    return [...this.mailboxes.values()];
  }

  fetchMessages(mailbox: string, range: MessageRange): BridgeMessage[] {
    if (!this.connected) return [];

    const msgs = this.messages.get(mailbox);
    if (!msgs) return [];

    return msgs.filter((m) => m.uid >= range.start && m.uid <= range.end);
  }

  search(criteria: IMAPSearchCriteria): number[] {
    if (!this.connected) return [];

    const allMsgs: BridgeMessage[] = [];
    for (const msgs of this.messages.values()) {
      allMsgs.push(...msgs);
    }

    return allMsgs
      .filter((msg) => {
        if (criteria.from && !msg.from.toLowerCase().includes(criteria.from.toLowerCase()))
          return false;
        if (criteria.to && !msg.to.toLowerCase().includes(criteria.to.toLowerCase())) return false;
        if (criteria.subject && !msg.subject.toLowerCase().includes(criteria.subject.toLowerCase()))
          return false;
        if (criteria.unseen && msg.flags.includes('\\Seen')) return false;
        if (criteria.flagged && !msg.flags.includes('\\Flagged')) return false;
        if (criteria.since && msg.date < criteria.since) return false;
        if (criteria.before && msg.date >= criteria.before) return false;
        return true;
      })
      .map((msg) => msg.uid);
  }

  moveMessage(uid: number, destination: string): boolean {
    if (!this.connected) return false;
    if (!this.mailboxes.has(destination)) return false;

    for (const [mailboxName, msgs] of this.messages) {
      const idx = msgs.findIndex((m) => m.uid === uid);
      if (idx !== -1) {
        const [msg] = msgs.splice(idx, 1);
        const destMsgs = this.messages.get(destination)!;
        destMsgs.push(msg!);

        // Update counts
        const srcMailbox = this.mailboxes.get(mailboxName)!;
        srcMailbox.exists--;
        const destMailbox = this.mailboxes.get(destination)!;
        destMailbox.exists++;

        return true;
      }
    }

    return false;
  }

  setFlags(uid: number, flags: string[]): boolean {
    if (!this.connected) return false;

    for (const msgs of this.messages.values()) {
      const msg = msgs.find((m) => m.uid === uid);
      if (msg) {
        msg.flags = flags;
        return true;
      }
    }

    return false;
  }

  idle(mailbox: string, callback: IdleCallback): boolean {
    if (!this.connected) return false;
    if (!this.mailboxes.has(mailbox)) return false;

    this.idleCallbacks.set(mailbox, callback);
    return true;
  }

  // Internal method to add messages for testing
  addMessage(mailbox: string, message: BridgeMessage): boolean {
    const msgs = this.messages.get(mailbox);
    if (!msgs) return false;

    msgs.push(message);
    const mb = this.mailboxes.get(mailbox)!;
    mb.exists++;

    // Trigger idle callback if registered
    const cb = this.idleCallbacks.get(mailbox);
    if (cb) {
      cb({ type: 'exists', data: { uid: message.uid } });
    }

    return true;
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    this.connected = false;
    this.idleCallbacks.clear();
  }
}
