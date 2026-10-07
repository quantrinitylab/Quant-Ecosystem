// ============================================================================
// QuantChat - Thread Service
// Threaded replies with nested conversation support
// ============================================================================

export interface ThreadReply {
  id: string;
  threadId: string;
  parentId: string;
  userId: string;
  content: string;
  timestamp: number;
  editedAt?: number;
  reactions: ThreadReaction[];
}

export interface ThreadReaction {
  userId: string;
  emoji: string;
  timestamp: number;
}

export interface Thread {
  id: string;
  rootMessageId: string;
  conversationId: string;
  replyCount: number;
  lastReplyAt: number;
  participantIds: string[];
  replies: ThreadReply[];
}

export class ThreadService {
  private threads: Map<string, Thread> = new Map();
  private messageToThread: Map<string, string> = new Map();
  private replyCounter: number = 0;

  createThread(rootMessageId: string, conversationId: string): Thread {
    const existing = this.messageToThread.get(rootMessageId);
    if (existing) {
      return this.threads.get(existing)!;
    }

    const id = `thread_${Date.now()}_${this.replyCounter++}`;
    const thread: Thread = {
      id,
      rootMessageId,
      conversationId,
      replyCount: 0,
      lastReplyAt: Date.now(),
      participantIds: [],
      replies: [],
    };

    this.threads.set(id, thread);
    this.messageToThread.set(rootMessageId, id);
    return thread;
  }

  addReply(threadId: string, parentId: string, userId: string, content: string): ThreadReply {
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error(`Thread "${threadId}" not found`);
    }

    if (!content.trim()) {
      throw new Error('Reply content cannot be empty');
    }

    const reply: ThreadReply = {
      id: `reply_${Date.now()}_${this.replyCounter++}`,
      threadId,
      parentId,
      userId,
      content: content.trim(),
      timestamp: Date.now(),
      reactions: [],
    };

    thread.replies.push(reply);
    thread.replyCount = thread.replies.length;
    thread.lastReplyAt = reply.timestamp;

    if (!thread.participantIds.includes(userId)) {
      thread.participantIds.push(userId);
    }

    return reply;
  }

  editReply(threadId: string, replyId: string, newContent: string): ThreadReply {
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error(`Thread "${threadId}" not found`);
    }

    const reply = thread.replies.find((r) => r.id === replyId);
    if (!reply) {
      throw new Error(`Reply "${replyId}" not found`);
    }

    if (!newContent.trim()) {
      throw new Error('Reply content cannot be empty');
    }

    reply.content = newContent.trim();
    reply.editedAt = Date.now();
    return reply;
  }

  deleteReply(threadId: string, replyId: string): boolean {
    const thread = this.threads.get(threadId);
    if (!thread) return false;

    const index = thread.replies.findIndex((r) => r.id === replyId);
    if (index === -1) return false;

    thread.replies.splice(index, 1);
    thread.replyCount = thread.replies.length;
    return true;
  }

  addReactionToReply(threadId: string, replyId: string, userId: string, emoji: string): boolean {
    const thread = this.threads.get(threadId);
    if (!thread) return false;

    const reply = thread.replies.find((r) => r.id === replyId);
    if (!reply) return false;

    const existing = reply.reactions.find((r) => r.userId === userId && r.emoji === emoji);
    if (existing) return false;

    reply.reactions.push({ userId, emoji, timestamp: Date.now() });
    return true;
  }

  removeReactionFromReply(
    threadId: string,
    replyId: string,
    userId: string,
    emoji: string,
  ): boolean {
    const thread = this.threads.get(threadId);
    if (!thread) return false;

    const reply = thread.replies.find((r) => r.id === replyId);
    if (!reply) return false;

    const index = reply.reactions.findIndex((r) => r.userId === userId && r.emoji === emoji);
    if (index === -1) return false;

    reply.reactions.splice(index, 1);
    return true;
  }

  getThread(threadId: string): Thread | null {
    return this.threads.get(threadId) || null;
  }

  getThreadByRootMessage(rootMessageId: string): Thread | null {
    const threadId = this.messageToThread.get(rootMessageId);
    if (!threadId) return null;
    return this.threads.get(threadId) || null;
  }

  getReplies(threadId: string, limit?: number, before?: number): ThreadReply[] {
    const thread = this.threads.get(threadId);
    if (!thread) return [];

    let replies = [...thread.replies];

    if (before !== undefined) {
      replies = replies.filter((r) => r.timestamp < before);
    }

    replies.sort((a, b) => a.timestamp - b.timestamp);

    if (limit !== undefined && limit > 0) {
      replies = replies.slice(0, limit);
    }

    return replies;
  }

  getThreadsForConversation(conversationId: string): Thread[] {
    const results: Thread[] = [];
    for (const thread of this.threads.values()) {
      if (thread.conversationId === conversationId) {
        results.push(thread);
      }
    }
    return results.sort((a, b) => b.lastReplyAt - a.lastReplyAt);
  }

  getThreadCount(conversationId: string): number {
    let count = 0;
    for (const thread of this.threads.values()) {
      if (thread.conversationId === conversationId) count++;
    }
    return count;
  }
}
