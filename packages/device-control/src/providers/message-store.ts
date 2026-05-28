import type { MessageStatus, MessageThread, SMSMessage } from './types.js';

export class MessageStore {
  private messages = new Map<string, SMSMessage>();

  store(msg: SMSMessage): void {
    this.messages.set(msg.id, msg);
  }

  get(id: string): SMSMessage | undefined {
    return this.messages.get(id);
  }

  list(filter?: {
    from?: string;
    to?: string;
    since?: number;
    status?: MessageStatus;
  }): SMSMessage[] {
    let results = [...this.messages.values()];
    if (filter?.from) results = results.filter((m) => m.from === filter.from);
    if (filter?.to) results = results.filter((m) => m.to === filter.to);
    if (filter?.since) results = results.filter((m) => m.timestamp >= filter.since!);
    if (filter?.status) results = results.filter((m) => m.status === filter.status);
    return results;
  }

  getThread(contactNumber: string): MessageThread {
    const msgs = [...this.messages.values()].filter(
      (m) => m.from === contactNumber || m.to === contactNumber,
    );
    return { contactNumber, messages: msgs };
  }

  updateStatus(id: string, status: MessageStatus): void {
    const msg = this.messages.get(id);
    if (msg) msg.status = status;
  }

  search(query: string): SMSMessage[] {
    const lower = query.toLowerCase();
    return [...this.messages.values()].filter((m) => m.body.toLowerCase().includes(lower));
  }
}
