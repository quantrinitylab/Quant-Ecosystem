// ============================================================================
// QuantEdits - Collaboration Service
// Real-time editing: CRDT operations, presence, conflict resolution
// ============================================================================

interface Operation {
  id: string;
  userId: string;
  type: 'insert' | 'delete' | 'update' | 'move' | 'transform';
  target: string;
  data: Record<string, unknown>;
  timestamp: number;
  vectorClock: Record<string, number>;
  causalDependencies: string[];
}

interface Presence {
  userId: string;
  userName: string;
  cursor: { x: number; y: number } | null;
  selection: string[];
  color: string;
  lastSeen: number;
  isActive: boolean;
}

interface DocumentState {
  projectId: string;
  version: number;
  operations: Operation[];
  presence: Map<string, Presence>;
  conflictLog: ConflictEntry[];
}

interface ConflictEntry {
  id: string;
  operations: [Operation, Operation];
  resolution: 'first-wins' | 'last-wins' | 'merge' | 'manual';
  resolvedAt: number;
}

interface Session {
  sessionId: string;
  userId: string;
  projectId: string;
  connectedAt: number;
  lastHeartbeat: number;
  permissions: 'view' | 'comment' | 'edit';
}

class CollaborationService {
  private documents: Map<string, DocumentState> = new Map();
  private sessions: Map<string, Session> = new Map();
  private vectorClocks: Map<string, Record<string, number>> = new Map();
  private operationBuffer: Map<string, Operation[]> = new Map();
  private undoStacks: Map<string, Operation[]> = new Map();
  private presenceTimeout = 30000;
  private maxBufferSize = 100;

  async joinSession(projectId: string, userId: string, userName: string, permissions: Session['permissions']): Promise<{ sessionId: string; state: DocumentState; peers: Presence[] }> {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const session: Session = { sessionId, userId, projectId, connectedAt: Date.now(), lastHeartbeat: Date.now(), permissions };
    this.sessions.set(sessionId, session);
    let doc = this.documents.get(projectId);
    if (!doc) {
      doc = { projectId, version: 0, operations: [], presence: new Map(), conflictLog: [] };
      this.documents.set(projectId, doc);
    }
    const presence: Presence = { userId, userName, cursor: null, selection: [], color: this.generateColor(userId), lastSeen: Date.now(), isActive: true };
    doc.presence.set(userId, presence);
    if (!this.vectorClocks.has(projectId)) this.vectorClocks.set(projectId, {});
    const clock = this.vectorClocks.get(projectId)!;
    if (!clock[userId]) clock[userId] = 0;
    const peers = Array.from(doc.presence.values()).filter(p => p.userId !== userId);
    return { sessionId, state: doc, peers };
  }

  async leaveSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const doc = this.documents.get(session.projectId);
    if (doc) {
      doc.presence.delete(session.userId);
    }
    this.sessions.delete(sessionId);
  }

  async applyOperation(sessionId: string, operation: Omit<Operation, 'id' | 'vectorClock'>): Promise<{ success: boolean; conflicts: ConflictEntry[]; version: number }> {
    const session = this.sessions.get(sessionId);
    if (!session || session.permissions === 'view') return { success: false, conflicts: [], version: 0 };
    const doc = this.documents.get(session.projectId);
    if (!doc) return { success: false, conflicts: [], version: 0 };
    const clock = this.vectorClocks.get(session.projectId)!;
    clock[session.userId] = (clock[session.userId] || 0) + 1;
    const op: Operation = { ...operation, id: `op-${Date.now()}-${Math.random().toString(36).slice(2)}`, vectorClock: { ...clock }, causalDependencies: this.getCausalDeps(doc, session.userId) };
    const conflicts = this.detectConflicts(doc, op);
    if (conflicts.length > 0) {
      const resolved = conflicts.map(conflict => this.resolveConflict(conflict, op));
      doc.conflictLog.push(...resolved);
    }
    const transformed = this.transformOperation(doc, op);
    doc.operations.push(transformed);
    doc.version++;
    this.addToUndoStack(session.userId, transformed);
    this.broadcastToSession(session.projectId, session.userId, { type: 'operation', operation: transformed });
    return { success: true, conflicts, version: doc.version };
  }

  async updatePresence(sessionId: string, updates: Partial<Presence>): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const doc = this.documents.get(session.projectId);
    if (!doc) return;
    const presence = doc.presence.get(session.userId);
    if (presence) {
      Object.assign(presence, updates, { lastSeen: Date.now() });
      this.broadcastToSession(session.projectId, session.userId, { type: 'presence', userId: session.userId, ...updates });
    }
  }

  async undoLastOperation(sessionId: string): Promise<Operation | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const stack = this.undoStacks.get(session.userId);
    if (!stack || stack.length === 0) return null;
    const lastOp = stack.pop()!;
    const inverseOp = this.invertOperation(lastOp);
    await this.applyOperation(sessionId, inverseOp);
    return inverseOp;
  }

  async getOperationsSince(projectId: string, version: number): Promise<Operation[]> {
    const doc = this.documents.get(projectId);
    if (!doc) return [];
    return doc.operations.filter((_, i) => i >= version);
  }

  async getPresence(projectId: string): Promise<Presence[]> {
    const doc = this.documents.get(projectId);
    if (!doc) return [];
    const now = Date.now();
    const active: Presence[] = [];
    doc.presence.forEach(p => {
      if (now - p.lastSeen < this.presenceTimeout) active.push({ ...p, isActive: true });
      else active.push({ ...p, isActive: false });
    });
    return active;
  }

  async heartbeat(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) session.lastHeartbeat = Date.now();
  }

  private detectConflicts(doc: DocumentState, newOp: Operation): ConflictEntry[] {
    const conflicts: ConflictEntry[] = [];
    const recentOps = doc.operations.slice(-20);
    for (const existing of recentOps) {
      if (existing.userId === newOp.userId) continue;
      if (existing.target === newOp.target && this.isConcurrent(existing, newOp)) {
        conflicts.push({ id: `conflict-${Date.now()}`, operations: [existing, newOp], resolution: 'last-wins', resolvedAt: 0 });
      }
    }
    return conflicts;
  }

  private isConcurrent(op1: Operation, op2: Operation): boolean {
    const clock1 = op1.vectorClock;
    const clock2 = op2.vectorClock;
    let op1Before = false;
    let op2Before = false;
    for (const userId of new Set([...Object.keys(clock1), ...Object.keys(clock2)])) {
      const v1 = clock1[userId] || 0;
      const v2 = clock2[userId] || 0;
      if (v1 < v2) op1Before = true;
      if (v2 < v1) op2Before = true;
    }
    return op1Before && op2Before;
  }

  private resolveConflict(conflict: ConflictEntry, newOp: Operation): ConflictEntry {
    const [existing] = conflict.operations;
    if (existing.type === 'update' && newOp.type === 'update') {
      const existingKeys = Object.keys(existing.data);
      const newKeys = Object.keys(newOp.data);
      const overlapping = existingKeys.filter(k => newKeys.includes(k));
      if (overlapping.length === 0) return { ...conflict, resolution: 'merge', resolvedAt: Date.now() };
    }
    return { ...conflict, resolution: 'last-wins', resolvedAt: Date.now() };
  }

  private transformOperation(doc: DocumentState, op: Operation): Operation {
    const concurrentOps = doc.operations.filter(existing => this.isConcurrent(existing, op) && existing.target === op.target);
    if (concurrentOps.length === 0) return op;
    let transformed = { ...op };
    for (const concurrent of concurrentOps) {
      if (concurrent.type === 'move' && transformed.type === 'move') {
        const concurrentPos = concurrent.data as { x?: number; y?: number };
        const transformedPos = transformed.data as { x?: number; y?: number };
        if (concurrentPos.x !== undefined && transformedPos.x !== undefined) {
          transformed = { ...transformed, data: { ...transformed.data, x: transformedPos.x } };
        }
      }
    }
    return transformed;
  }

  private invertOperation(op: Operation): Omit<Operation, 'id' | 'vectorClock'> {
    switch (op.type) {
      case 'insert': return { ...op, type: 'delete' };
      case 'delete': return { ...op, type: 'insert' };
      case 'update': return { ...op, data: { ...op.data, _inverse: true } };
      case 'move': return { ...op, data: { x: -(op.data.x as number || 0), y: -(op.data.y as number || 0) } };
      default: return { ...op, data: { ...op.data, _inverse: true } };
    }
  }

  private getCausalDeps(doc: DocumentState, userId: string): string[] {
    return doc.operations.slice(-5).filter(op => op.userId !== userId).map(op => op.id);
  }

  private addToUndoStack(userId: string, op: Operation): void {
    if (!this.undoStacks.has(userId)) this.undoStacks.set(userId, []);
    const stack = this.undoStacks.get(userId)!;
    stack.push(op);
    if (stack.length > 50) stack.shift();
  }

  private broadcastToSession(projectId: string, excludeUserId: string, message: unknown): void {
    const doc = this.documents.get(projectId);
    if (!doc) return;
    doc.presence.forEach((presence, userId) => {
      if (userId !== excludeUserId && presence.isActive) {
        console.log(`[WS] Broadcasting to ${userId}:`, JSON.stringify(message).slice(0, 100));
      }
    });
  }

  private generateColor(userId: string): string {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    return colors[Math.abs(hash) % colors.length];
  }

  async cleanupInactiveSessions(): Promise<number> {
    let cleaned = 0;
    const now = Date.now();
    this.sessions.forEach((session, sessionId) => {
      if (now - session.lastHeartbeat > this.presenceTimeout * 2) {
        this.leaveSession(sessionId);
        cleaned++;
      }
    });
    return cleaned;
  }
}

export const collaborationService = new CollaborationService();
export default CollaborationService;
