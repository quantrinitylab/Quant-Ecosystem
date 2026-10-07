import { z } from 'zod';

export const POP3MessageSchema = z.object({
  id: z.number(),
  size: z.number(),
  subject: z.string(),
  from: z.string(),
  body: z.string(),
  deleted: z.boolean().default(false),
});

export type POP3Message = z.infer<typeof POP3MessageSchema>;

export interface POP3Response {
  status: '+OK' | '-ERR';
  message: string;
  data?: unknown;
}

export class POP3Adapter {
  private messages: POP3Message[] = [];
  private authenticated = false;
  private username: string | null = null;

  user(username: string): POP3Response {
    this.username = username;
    return { status: '+OK', message: `User ${username} accepted` };
  }

  pass(_password: string): POP3Response {
    if (!this.username) {
      return { status: '-ERR', message: 'Send USER first' };
    }
    this.authenticated = true;
    return { status: '+OK', message: 'Authentication successful' };
  }

  stat(): POP3Response {
    if (!this.authenticated) {
      return { status: '-ERR', message: 'Not authenticated' };
    }

    const active = this.messages.filter((m) => !m.deleted);
    const totalSize = active.reduce((sum, m) => sum + m.size, 0);
    return {
      status: '+OK',
      message: `${active.length} ${totalSize}`,
      data: { count: active.length, size: totalSize },
    };
  }

  list(msgNum?: number): POP3Response {
    if (!this.authenticated) {
      return { status: '-ERR', message: 'Not authenticated' };
    }

    if (msgNum !== undefined) {
      const msg = this.messages[msgNum - 1];
      if (!msg || msg.deleted) {
        return { status: '-ERR', message: `No such message ${msgNum}` };
      }
      return {
        status: '+OK',
        message: `${msgNum} ${msg.size}`,
        data: { id: msgNum, size: msg.size },
      };
    }

    const listing = this.messages
      .filter((m) => !m.deleted)
      .map((m) => ({ id: m.id, size: m.size }));

    return { status: '+OK', message: `${listing.length} messages`, data: listing };
  }

  retr(msgNum: number): POP3Response {
    if (!this.authenticated) {
      return { status: '-ERR', message: 'Not authenticated' };
    }

    const msg = this.messages[msgNum - 1];
    if (!msg || msg.deleted) {
      return { status: '-ERR', message: `No such message ${msgNum}` };
    }

    return { status: '+OK', message: `${msg.size} octets`, data: msg.body };
  }

  dele(msgNum: number): POP3Response {
    if (!this.authenticated) {
      return { status: '-ERR', message: 'Not authenticated' };
    }

    const msg = this.messages[msgNum - 1];
    if (!msg || msg.deleted) {
      return { status: '-ERR', message: `No such message ${msgNum}` };
    }

    msg.deleted = true;
    return { status: '+OK', message: `Message ${msgNum} deleted` };
  }

  rset(): POP3Response {
    if (!this.authenticated) {
      return { status: '-ERR', message: 'Not authenticated' };
    }

    for (const msg of this.messages) {
      msg.deleted = false;
    }
    return { status: '+OK', message: 'Messages restored' };
  }

  quit(): POP3Response {
    this.messages = this.messages.filter((m) => !m.deleted);
    this.authenticated = false;
    this.username = null;
    return { status: '+OK', message: 'Bye' };
  }

  addMessage(message: Omit<POP3Message, 'id' | 'deleted'>): void {
    this.messages.push({
      ...message,
      id: this.messages.length + 1,
      deleted: false,
    });
  }

  getMessages(): POP3Message[] {
    return this.messages.filter((m) => !m.deleted);
  }
}
