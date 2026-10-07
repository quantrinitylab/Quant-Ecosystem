// ============================================================================
// QuantChat - Message Edit Service
// Message editing with history tracking and time-window restrictions
// ============================================================================

export interface EditHistoryEntry {
  content: string;
  editedAt: number;
  editedBy: string;
}

export interface EditableMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: number;
  editedAt?: number;
  isEdited: boolean;
  editHistory: EditHistoryEntry[];
}

export class MessageEditService {
  private messages: Map<string, EditableMessage> = new Map();
  private editWindowMs: number;
  private maxEdits: number;

  constructor(options?: { editWindowMs?: number; maxEdits?: number }) {
    this.editWindowMs = options?.editWindowMs ?? 900000;
    this.maxEdits = options?.maxEdits ?? 10;
  }

  registerMessage(
    id: string,
    conversationId: string,
    senderId: string,
    content: string,
  ): EditableMessage {
    const message: EditableMessage = {
      id,
      conversationId,
      senderId,
      content,
      createdAt: Date.now(),
      isEdited: false,
      editHistory: [],
    };

    this.messages.set(id, message);
    return message;
  }

  editMessage(messageId: string, newContent: string, editedBy: string): EditableMessage {
    const message = this.messages.get(messageId);
    if (!message) {
      throw new Error(`Message "${messageId}" not found`);
    }

    if (message.senderId !== editedBy) {
      throw new Error('Only the sender can edit their message');
    }

    if (!this.isWithinEditWindow(message)) {
      throw new Error('Edit window has expired');
    }

    if (message.editHistory.length >= this.maxEdits) {
      throw new Error(`Maximum of ${this.maxEdits} edits allowed`);
    }

    if (!newContent.trim()) {
      throw new Error('Message content cannot be empty');
    }

    if (newContent.trim() === message.content) {
      return message;
    }

    message.editHistory.push({
      content: message.content,
      editedAt: Date.now(),
      editedBy,
    });

    message.content = newContent.trim();
    message.editedAt = Date.now();
    message.isEdited = true;

    return message;
  }

  isEditable(messageId: string): boolean {
    const message = this.messages.get(messageId);
    if (!message) return false;
    if (!this.isWithinEditWindow(message)) return false;
    if (message.editHistory.length >= this.maxEdits) return false;
    return true;
  }

  isWithinEditWindow(message: EditableMessage): boolean {
    return Date.now() - message.createdAt <= this.editWindowMs;
  }

  getEditHistory(messageId: string): EditHistoryEntry[] {
    const message = this.messages.get(messageId);
    if (!message) return [];
    return [...message.editHistory];
  }

  getOriginalContent(messageId: string): string | null {
    const message = this.messages.get(messageId);
    if (!message) return null;
    if (message.editHistory.length === 0) return message.content;
    return message.editHistory[0]?.content ?? message.content;
  }

  getEditCount(messageId: string): number {
    const message = this.messages.get(messageId);
    if (!message) return 0;
    return message.editHistory.length;
  }

  getMessage(messageId: string): EditableMessage | null {
    return this.messages.get(messageId) ?? null;
  }

  getEditedMessages(conversationId: string): EditableMessage[] {
    const results: EditableMessage[] = [];
    for (const message of this.messages.values()) {
      if (message.conversationId === conversationId && message.isEdited) {
        results.push(message);
      }
    }
    return results.sort((a, b) => (b.editedAt ?? 0) - (a.editedAt ?? 0));
  }

  getEditWindowMs(): number {
    return this.editWindowMs;
  }

  getMaxEdits(): number {
    return this.maxEdits;
  }
}
