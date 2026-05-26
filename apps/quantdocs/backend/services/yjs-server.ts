import * as Y from 'yjs';

export class YjsServer {
  private readonly docs: Map<string, Y.Doc> = new Map();
  private readonly connections: Map<string, Set<string>> = new Map();
  private readonly lastActivity: Map<string, number> = new Map();
  private readonly evictionTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  getOrCreateDoc(docId: string): Y.Doc {
    let doc = this.docs.get(docId);
    if (!doc) {
      doc = new Y.Doc();
      this.docs.set(docId, doc);
    }
    this.lastActivity.set(docId, Date.now());
    return doc;
  }

  applyUpdate(docId: string, update: Uint8Array): void {
    const doc = this.getOrCreateDoc(docId);
    Y.applyUpdate(doc, update);
    this.lastActivity.set(docId, Date.now());
  }

  getStateVector(docId: string): Uint8Array {
    const doc = this.getOrCreateDoc(docId);
    return Y.encodeStateVector(doc);
  }

  encodeState(docId: string): Uint8Array {
    const doc = this.getOrCreateDoc(docId);
    return Y.encodeStateAsUpdate(doc);
  }

  handleConnection(docId: string, clientId: string): void {
    let clients = this.connections.get(docId);
    if (!clients) {
      clients = new Set();
      this.connections.set(docId, clients);
    }
    clients.add(clientId);
    this.lastActivity.set(docId, Date.now());

    // Cancel any pending eviction since a client connected
    const timer = this.evictionTimers.get(docId);
    if (timer) {
      clearTimeout(timer);
      this.evictionTimers.delete(docId);
    }
  }

  removeConnection(docId: string, clientId: string): void {
    const clients = this.connections.get(docId);
    if (clients) {
      clients.delete(clientId);
      if (clients.size === 0) {
        this.connections.delete(docId);
        this.scheduleEviction(docId);
      }
    }
  }

  getConnectedClients(docId: string): string[] {
    const clients = this.connections.get(docId);
    return clients ? Array.from(clients) : [];
  }

  /**
   * Evict documents that have been idle (no connected clients) for longer than maxIdleMs.
   * Returns the list of evicted document IDs.
   */
  evictIdleDocs(maxIdleMs: number): string[] {
    const now = Date.now();
    const evicted: string[] = [];

    for (const [docId, lastTime] of this.lastActivity.entries()) {
      const clients = this.connections.get(docId);
      const hasClients = clients && clients.size > 0;

      if (!hasClients && now - lastTime >= maxIdleMs) {
        this.docs.get(docId)?.destroy();
        this.docs.delete(docId);
        this.lastActivity.delete(docId);
        const timer = this.evictionTimers.get(docId);
        if (timer) {
          clearTimeout(timer);
          this.evictionTimers.delete(docId);
        }
        evicted.push(docId);
      }
    }

    return evicted;
  }

  /**
   * Shut down the server by clearing all pending eviction timers.
   * This allows the Node.js process to exit gracefully.
   */
  shutdown(): void {
    for (const timer of this.evictionTimers.values()) {
      clearTimeout(timer);
    }
    this.evictionTimers.clear();
  }

  private scheduleEviction(docId: string, delayMs = 300000): void {
    const timer = setTimeout(() => {
      this.evictionTimers.delete(docId);
      const clients = this.connections.get(docId);
      if (!clients || clients.size === 0) {
        this.docs.get(docId)?.destroy();
        this.docs.delete(docId);
        this.lastActivity.delete(docId);
      }
    }, delayMs);
    timer.unref();
    this.evictionTimers.set(docId, timer);
  }
}
