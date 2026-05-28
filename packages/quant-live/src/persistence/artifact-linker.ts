import type { ArtifactType, SessionArtifact } from '../types.js';
import type { SessionStore } from './session-store.js';

export class ArtifactLinker {
  constructor(private store: SessionStore) {}

  async link(
    sessionId: string,
    artifact: Omit<SessionArtifact, 'sessionId'>,
  ): Promise<SessionArtifact> {
    const session = await this.store.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    const full: SessionArtifact = { ...artifact, sessionId };
    await this.store.update(sessionId, { artifacts: [...session.artifacts, full] });
    return full;
  }

  async getBySession(sessionId: string): Promise<SessionArtifact[]> {
    const session = await this.store.get(sessionId);
    return session?.artifacts ?? [];
  }

  async getByType(sessionId: string, type: ArtifactType): Promise<SessionArtifact[]> {
    const artifacts = await this.getBySession(sessionId);
    return artifacts.filter((a) => a.type === type);
  }
}
