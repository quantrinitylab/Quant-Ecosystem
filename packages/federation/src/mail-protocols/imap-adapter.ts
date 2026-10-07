import { z } from 'zod';

export const MailboxSchema = z.object({
  name: z.string(),
  exists: z.number(),
  recent: z.number(),
  unseen: z.number(),
  uidNext: z.number(),
  uidValidity: z.number(),
  flags: z.array(z.string()),
});

export type Mailbox = z.infer<typeof MailboxSchema>;

export const MessageSchema = z.object({
  uid: z.number(),
  seqNum: z.number(),
  flags: z.array(z.string()),
  subject: z.string(),
  from: z.string(),
  to: z.string(),
  date: z.string(),
  body: z.string().optional(),
  size: z.number(),
});

export type Message = z.infer<typeof MessageSchema>;

export interface IMAPResponse {
  tag: string;
  status: 'OK' | 'NO' | 'BAD';
  data?: unknown;
  message?: string;
}

export interface SearchCriteria {
  from?: string;
  to?: string;
  subject?: string;
  since?: string;
  before?: string;
  flagged?: boolean;
  unseen?: boolean;
}

/** Authentication delegate for verifying credentials */
export type AuthenticationDelegate = (username: string, password: string) => boolean;

export class IMAPAdapter {
  private mailboxes: Map<string, Mailbox> = new Map();
  private messages: Map<string, Message[]> = new Map();
  private selectedMailbox: string | null = null;
  private authenticated = false;
  private tagCounter = 0;
  private authDelegate: AuthenticationDelegate | null;

  constructor(authDelegate?: AuthenticationDelegate) {
    this.authDelegate = authDelegate ?? null;
    this.initDefaultMailboxes();
  }

  private initDefaultMailboxes(): void {
    const defaults = ['INBOX', 'Sent', 'Drafts', 'Trash', 'Spam'];
    for (const name of defaults) {
      this.mailboxes.set(name, {
        name,
        exists: 0,
        recent: 0,
        unseen: 0,
        uidNext: 1,
        uidValidity: Date.now(),
        flags: ['\\Seen', '\\Answered', '\\Flagged', '\\Deleted', '\\Draft'],
      });
      this.messages.set(name, []);
    }
  }

  authenticate(username: string, password: string): IMAPResponse {
    if (this.authDelegate) {
      const valid = this.authDelegate(username, password);
      if (!valid) {
        return this.no('LOGIN failed: invalid credentials');
      }
    }
    this.authenticated = true;
    return this.ok('LOGIN completed');
  }

  select(mailboxName: string): IMAPResponse {
    if (!this.authenticated) {
      return this.no('Not authenticated');
    }

    const mailbox = this.mailboxes.get(mailboxName);
    if (!mailbox) {
      return this.no(`Mailbox ${mailboxName} not found`);
    }

    this.selectedMailbox = mailboxName;
    return this.ok('SELECT completed', mailbox);
  }

  fetch(sequenceSet: string, items: string[]): IMAPResponse {
    if (!this.selectedMailbox) {
      return this.no('No mailbox selected');
    }

    const msgs = this.messages.get(this.selectedMailbox) ?? [];
    const range = this.parseSequenceSet(sequenceSet, msgs.length);
    const results = range
      .map((idx) => msgs[idx - 1])
      .filter((m): m is Message => m !== undefined)
      .map((msg) => this.extractFields(msg, items));

    return this.ok('FETCH completed', results);
  }

  search(criteria: SearchCriteria): IMAPResponse {
    if (!this.selectedMailbox) {
      return this.no('No mailbox selected');
    }

    const msgs = this.messages.get(this.selectedMailbox) ?? [];
    const uids = msgs.filter((msg) => this.matchesCriteria(msg, criteria)).map((msg) => msg.uid);

    return this.ok('SEARCH completed', uids);
  }

  store(sequenceSet: string, flags: string[], action: '+FLAGS' | '-FLAGS' | 'FLAGS'): IMAPResponse {
    if (!this.selectedMailbox) {
      return this.no('No mailbox selected');
    }

    const msgs = this.messages.get(this.selectedMailbox) ?? [];
    const range = this.parseSequenceSet(sequenceSet, msgs.length);

    for (const idx of range) {
      const msg = msgs[idx - 1];
      if (!msg) continue;

      if (action === 'FLAGS') {
        msg.flags = [...flags];
      } else if (action === '+FLAGS') {
        for (const flag of flags) {
          if (!msg.flags.includes(flag)) {
            msg.flags.push(flag);
          }
        }
      } else if (action === '-FLAGS') {
        msg.flags = msg.flags.filter((f) => !flags.includes(f));
      }
    }

    return this.ok('STORE completed');
  }

  copy(sequenceSet: string, destination: string): IMAPResponse {
    if (!this.selectedMailbox) {
      return this.no('No mailbox selected');
    }

    const destMsgs = this.messages.get(destination);
    if (!destMsgs) {
      return this.no(`Destination mailbox ${destination} not found`);
    }

    const srcMsgs = this.messages.get(this.selectedMailbox) ?? [];
    const range = this.parseSequenceSet(sequenceSet, srcMsgs.length);
    const destMailbox = this.mailboxes.get(destination)!;

    for (const idx of range) {
      const msg = srcMsgs[idx - 1];
      if (!msg) continue;

      const copy: Message = {
        ...msg,
        uid: destMailbox.uidNext++,
        seqNum: destMsgs.length + 1,
      };
      destMsgs.push(copy);
      destMailbox.exists++;
    }

    return this.ok('COPY completed');
  }

  appendMessage(mailboxName: string, message: Omit<Message, 'uid' | 'seqNum'>): IMAPResponse {
    const mailbox = this.mailboxes.get(mailboxName);
    if (!mailbox) {
      return this.no(`Mailbox ${mailboxName} not found`);
    }

    const msgs = this.messages.get(mailboxName)!;
    const newMsg: Message = {
      ...message,
      uid: mailbox.uidNext++,
      seqNum: msgs.length + 1,
    };
    msgs.push(newMsg);
    mailbox.exists++;
    if (!newMsg.flags.includes('\\Seen')) {
      mailbox.unseen++;
    }

    return this.ok('APPEND completed');
  }

  getMailboxes(): Mailbox[] {
    return [...this.mailboxes.values()];
  }

  private matchesCriteria(msg: Message, criteria: SearchCriteria): boolean {
    if (criteria.from && !msg.from.toLowerCase().includes(criteria.from.toLowerCase())) {
      return false;
    }
    if (criteria.to && !msg.to.toLowerCase().includes(criteria.to.toLowerCase())) {
      return false;
    }
    if (criteria.subject && !msg.subject.toLowerCase().includes(criteria.subject.toLowerCase())) {
      return false;
    }
    if (criteria.unseen && msg.flags.includes('\\Seen')) {
      return false;
    }
    if (criteria.flagged && !msg.flags.includes('\\Flagged')) {
      return false;
    }
    if (criteria.since && msg.date < criteria.since) {
      return false;
    }
    if (criteria.before && msg.date >= criteria.before) {
      return false;
    }
    return true;
  }

  private parseSequenceSet(set: string, total: number): number[] {
    const results: number[] = [];
    const parts = set.split(',');

    for (const part of parts) {
      if (part.includes(':')) {
        const [startStr, endStr] = part.split(':');
        const start = startStr === '*' ? total : parseInt(startStr!, 10);
        const end = endStr === '*' ? total : parseInt(endStr!, 10);
        for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
          if (i >= 1 && i <= total) results.push(i);
        }
      } else {
        const num = part === '*' ? total : parseInt(part, 10);
        if (num >= 1 && num <= total) results.push(num);
      }
    }

    return results;
  }

  private extractFields(msg: Message, items: string[]): Partial<Message> {
    const result: Partial<Message> = {};
    for (const item of items) {
      const normalized = item.toUpperCase();
      if (normalized === 'UID') result.uid = msg.uid;
      if (normalized === 'FLAGS') result.flags = msg.flags;
      if (normalized === 'SUBJECT' || normalized === 'ENVELOPE') result.subject = msg.subject;
      if (normalized === 'FROM') result.from = msg.from;
      if (normalized === 'TO') result.to = msg.to;
      if (normalized === 'BODY' || normalized === 'BODY[]') result.body = msg.body;
      if (normalized === 'RFC822.SIZE') result.size = msg.size;
    }
    return result;
  }

  private ok(message: string, data?: unknown): IMAPResponse {
    return { tag: `A${++this.tagCounter}`, status: 'OK', message, data };
  }

  private no(message: string): IMAPResponse {
    return { tag: `A${++this.tagCounter}`, status: 'NO', message };
  }
}
