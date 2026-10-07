import type { ReplayEntry } from '../types.js';

export class ActionReplayRecorder {
  private recordings = new Map<string, ReplayEntry[]>();

  startRecording(sessionId: string): void {
    this.recordings.set(sessionId, []);
  }

  record(sessionId: string, entry: ReplayEntry): void {
    const entries = this.recordings.get(sessionId);
    if (!entries) throw new Error(`No recording started for session: ${sessionId}`);
    entries.push(entry);
  }

  getReplay(sessionId: string): ReplayEntry[] {
    return this.recordings.get(sessionId) ?? [];
  }

  exportAsJSON(sessionId: string): string {
    return JSON.stringify(this.getReplay(sessionId));
  }

  getTimeline(sessionId: string): ReplayEntry[] {
    return [...this.getReplay(sessionId)].sort((a, b) => a.timestamp - b.timestamp);
  }
}
