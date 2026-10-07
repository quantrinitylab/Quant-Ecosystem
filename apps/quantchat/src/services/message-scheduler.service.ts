// ============================================================================
// QuantChat - Message Scheduler Service
// Schedule, cancel, and manage future message delivery
// ============================================================================

export type ScheduledMessageStatus = 'pending' | 'sent' | 'cancelled';

export interface ScheduledMessage {
  id: string;
  conversationId: string;
  content: string;
  scheduledAt: number;
  createdAt: number;
  status: ScheduledMessageStatus;
  userId: string;
}

export class MessageSchedulerService {
  private scheduledMessages: Map<string, ScheduledMessage> = new Map();

  schedule(
    conversationId: string,
    content: string,
    sendAt: number,
    userId: string,
  ): ScheduledMessage {
    if (!content.trim()) {
      throw new Error('Message content cannot be empty');
    }

    if (sendAt <= Date.now()) {
      throw new Error('Scheduled time must be in the future');
    }

    const id = `sched_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const message: ScheduledMessage = {
      id,
      conversationId,
      content: content.trim(),
      scheduledAt: sendAt,
      createdAt: Date.now(),
      status: 'pending',
      userId,
    };

    this.scheduledMessages.set(id, message);
    return message;
  }

  cancel(scheduledId: string): boolean {
    const message = this.scheduledMessages.get(scheduledId);
    if (!message) {
      return false;
    }

    if (message.status !== 'pending') {
      return false;
    }

    message.status = 'cancelled';
    this.scheduledMessages.set(scheduledId, message);
    return true;
  }

  update(
    scheduledId: string,
    changes: Partial<Pick<ScheduledMessage, 'content' | 'scheduledAt'>>,
  ): ScheduledMessage {
    const message = this.scheduledMessages.get(scheduledId);
    if (!message) {
      throw new Error('Scheduled message not found');
    }

    if (message.status !== 'pending') {
      throw new Error('Cannot update a message that is not pending');
    }

    if (changes.content !== undefined) {
      if (!changes.content.trim()) {
        throw new Error('Message content cannot be empty');
      }
      message.content = changes.content.trim();
    }

    if (changes.scheduledAt !== undefined) {
      if (changes.scheduledAt <= Date.now()) {
        throw new Error('Scheduled time must be in the future');
      }
      message.scheduledAt = changes.scheduledAt;
    }

    this.scheduledMessages.set(scheduledId, message);
    return message;
  }

  getScheduled(conversationId: string): ScheduledMessage[] {
    const results: ScheduledMessage[] = [];
    for (const message of this.scheduledMessages.values()) {
      if (message.conversationId === conversationId && message.status === 'pending') {
        results.push(message);
      }
    }
    return results.sort((a, b) => a.scheduledAt - b.scheduledAt);
  }

  getUpcoming(userId: string): ScheduledMessage[] {
    const now = Date.now();
    const results: ScheduledMessage[] = [];
    for (const message of this.scheduledMessages.values()) {
      if (message.userId === userId && message.status === 'pending' && message.scheduledAt > now) {
        results.push(message);
      }
    }
    return results.sort((a, b) => a.scheduledAt - b.scheduledAt);
  }

  markAsSent(scheduledId: string): boolean {
    const message = this.scheduledMessages.get(scheduledId);
    if (!message || message.status !== 'pending') {
      return false;
    }

    message.status = 'sent';
    this.scheduledMessages.set(scheduledId, message);
    return true;
  }
}
