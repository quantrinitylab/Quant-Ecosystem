import type { SessionArtifact, TranscriptSegment } from '../types.js';
import type { SessionStore } from './session-store.js';

export class SessionResume {
  private maxSegments: number;

  constructor(
    private store: SessionStore,
    opts?: { maxSegments?: number },
  ) {
    this.maxSegments = opts?.maxSegments ?? 50;
  }

  async loadContext(
    sessionId: string,
  ): Promise<{
    transcript: TranscriptSegment[];
    artifacts: SessionArtifact[];
    metadata: Record<string, unknown>;
  }> {
    const session = await this.store.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    const transcript = session.transcript.slice(-this.maxSegments);
    return { transcript, artifacts: session.artifacts, metadata: session.metadata ?? {} };
  }

  async buildConversationHistory(
    sessionId: string,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const session = await this.store.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    return session.transcript.slice(-this.maxSegments).map((seg) => ({
      role: seg.speaker,
      content: seg.text,
    }));
  }
}
