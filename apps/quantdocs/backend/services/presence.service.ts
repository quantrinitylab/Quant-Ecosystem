export interface CursorPosition {
  line: number;
  column: number;
  selection?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

export interface CursorInfo {
  userId: string;
  name?: string;
  color?: string;
  position: CursorPosition;
  lastUpdated: Date;
}

export class PresenceService {
  private readonly cursors: Map<string, Map<string, CursorInfo>> = new Map();

  setCursor(
    docId: string,
    userId: string,
    position: CursorPosition,
    name?: string,
    color?: string,
  ): void {
    let docCursors = this.cursors.get(docId);
    if (!docCursors) {
      docCursors = new Map();
      this.cursors.set(docId, docCursors);
    }

    docCursors.set(userId, {
      userId,
      name,
      color,
      position,
      lastUpdated: new Date(),
    });
  }

  removeCursor(docId: string, userId: string): void {
    const docCursors = this.cursors.get(docId);
    if (docCursors) {
      docCursors.delete(userId);
      if (docCursors.size === 0) {
        this.cursors.delete(docId);
      }
    }
  }

  getCursors(docId: string): CursorInfo[] {
    const docCursors = this.cursors.get(docId);
    if (!docCursors) {
      return [];
    }
    return Array.from(docCursors.values());
  }

  clearDocument(docId: string): void {
    this.cursors.delete(docId);
  }

  /**
   * Remove cursors whose lastUpdated exceeds the given maxAgeMs threshold.
   * Returns the number of stale cursors removed.
   */
  cleanupStaleCursors(maxAgeMs: number): number {
    const now = Date.now();
    let removed = 0;

    for (const [docId, docCursors] of this.cursors.entries()) {
      for (const [userId, cursorInfo] of docCursors.entries()) {
        if (now - cursorInfo.lastUpdated.getTime() >= maxAgeMs) {
          docCursors.delete(userId);
          removed++;
        }
      }
      if (docCursors.size === 0) {
        this.cursors.delete(docId);
      }
    }

    return removed;
  }
}
