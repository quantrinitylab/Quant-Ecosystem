export interface IPCMessage {
  channel: string;
  payload: unknown;
}

export type IPCHandler = (payload: unknown) => void;

const MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB
const MAX_MESSAGES_PER_WINDOW = 100;

export class IPCBridge {
  private readonly handlers = new Map<string, IPCHandler[]>();
  private windowCount = 0;
  private windowStart: number;
  private destroyed = false;

  constructor() {
    this.windowStart = Date.now();
  }

  send(channel: string, payload: unknown): void {
    if (this.destroyed) {
      throw new Error('IPCBridge has been destroyed');
    }

    const serialized = JSON.stringify(payload);
    if (serialized.length > MAX_MESSAGE_SIZE) {
      throw new Error(`Message exceeds maximum size of ${MAX_MESSAGE_SIZE} bytes`);
    }

    this.enforceRateLimit();

    const handlers = this.handlers.get(channel);
    if (handlers) {
      for (const handler of handlers) {
        handler(payload);
      }
    }
  }

  on(channel: string, handler: IPCHandler): void {
    if (this.destroyed) {
      throw new Error('IPCBridge has been destroyed');
    }

    const existing = this.handlers.get(channel) ?? [];
    existing.push(handler);
    this.handlers.set(channel, existing);
  }

  destroy(): void {
    this.destroyed = true;
    this.handlers.clear();
    this.windowCount = 0;
  }

  private enforceRateLimit(): void {
    const now = Date.now();

    // Reset the window if more than 1 second has elapsed
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      this.windowCount = 0;
    }

    this.windowCount++;

    if (this.windowCount > MAX_MESSAGES_PER_WINDOW) {
      throw new Error(
        `Rate limit exceeded: maximum ${MAX_MESSAGES_PER_WINDOW} messages per second`,
      );
    }
  }
}
