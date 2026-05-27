// ============================================================================
// QuantMail - Undo Send Service
// Queue emails with a configurable delay window before actually sending
// ============================================================================

export interface QueuedSend {
  id: string;
  email: { to: string; subject: string; body: string };
  queuedAt: number;
  sendAt: number;
  status: 'queued' | 'sent' | 'cancelled';
}

export class UndoSendService {
  private sendQueue: Map<string, QueuedSend> = new Map();
  private defaultDelay = 10000; // 10 seconds
  private sendCounter = 0;

  queue(email: { to: string; subject: string; body: string }, delayMs?: number): QueuedSend {
    const delay = delayMs ?? this.defaultDelay;
    const now = Date.now();

    this.sendCounter += 1;
    const queued: QueuedSend = {
      id: `send-${this.sendCounter}`,
      email,
      queuedAt: now,
      sendAt: now + delay,
      status: 'queued',
    };

    this.sendQueue.set(queued.id, queued);
    return queued;
  }

  cancel(sendId: string): boolean {
    const entry = this.sendQueue.get(sendId);
    if (!entry) {
      return false;
    }

    if (entry.status === 'sent') {
      return false;
    }

    this.sendQueue.set(sendId, { ...entry, status: 'cancelled' });
    return true;
  }

  getQueued(): QueuedSend[] {
    return Array.from(this.sendQueue.values()).filter((q) => q.status === 'queued');
  }

  getDefaultDelay(): number {
    return this.defaultDelay;
  }

  setDefaultDelay(ms: number): void {
    if (ms < 0) {
      throw new Error('Delay must be non-negative');
    }
    this.defaultDelay = ms;
  }

  checkAndSend(): QueuedSend[] {
    const now = Date.now();
    const sent: QueuedSend[] = [];

    for (const [id, entry] of this.sendQueue.entries()) {
      if (entry.status === 'queued' && entry.sendAt <= now) {
        const updated: QueuedSend = { ...entry, status: 'sent' };
        this.sendQueue.set(id, updated);
        sent.push(updated);
      }
    }

    return sent;
  }
}
