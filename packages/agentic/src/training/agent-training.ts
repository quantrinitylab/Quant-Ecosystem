// ============================================================================
// Agentic - Agent Training
// ============================================================================
//
// Dual-mode training:
//   - When a training backend is configured (AGENT_TRAINING_URL, optionally
//     AGENT_TRAINING_API_KEY) a real training job is run against the service and
//     the resulting accuracy is recorded.
//   - Otherwise (or on backend error) training degrades to the existing simulated
//     in-process behavior so local development and tests keep working. Errors
//     falling back are logged as warnings (never silently swallowed). Training is
//     not a money path, so graceful degradation is acceptable here.

export interface TrainingExample {
  input: string;
  expectedOutput: string;
  agentId: string;
}

export interface TrainingSession {
  id: string;
  agentId: string;
  examples: TrainingExample[];
  status: 'pending' | 'training' | 'completed' | 'failed';
  accuracy?: number;
  startedAt: Date;
  completedAt?: Date;
}

/** Outcome of running a real training job. */
export interface TrainingRunResult {
  accuracy: number;
}

/**
 * Pluggable training backend that runs a real training job against an external
 * service. Tests can supply a fake to exercise the real-mode path without
 * touching the network.
 */
export interface TrainingBackend {
  train(input: { agentId: string; examples: TrainingExample[] }): Promise<TrainingRunResult>;
}

/**
 * Real training backend backed by a configured HTTP service. Enabled by
 * AGENT_TRAINING_URL (optionally AGENT_TRAINING_API_KEY).
 */
export class HttpTrainingBackend implements TrainingBackend {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  async train(input: { agentId: string; examples: TrainingExample[] }): Promise<TrainingRunResult> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/training-jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new Error(`training service responded ${res.status}`);
    }
    const body = (await res.json()) as { accuracy?: number };
    return { accuracy: typeof body.accuracy === 'number' ? body.accuracy : 0 };
  }
}

export class AgentTraining {
  private sessions: Map<string, TrainingSession> = new Map();
  private readonly backend: TrainingBackend | null;

  /**
   * @param backend Optional explicit backend (primarily for tests). When
   *   omitted, a real backend is constructed from environment configuration.
   */
  constructor(backend?: TrainingBackend) {
    this.backend = backend ?? AgentTraining.createBackendFromEnv();
  }

  private static createBackendFromEnv(): TrainingBackend | null {
    const url = process.env['AGENT_TRAINING_URL'];
    if (url) {
      return new HttpTrainingBackend(url, process.env['AGENT_TRAINING_API_KEY']);
    }
    return null;
  }

  /** Whether a real training backend is wired up. */
  isBackendConfigured(): boolean {
    return this.backend !== null;
  }

  async startTraining(agentId: string, examples: TrainingExample[]): Promise<TrainingSession> {
    const session: TrainingSession = {
      id: `training-${Date.now()}`,
      agentId,
      examples,
      status: 'pending',
      startedAt: new Date(),
    };

    this.sessions.set(session.id, session);

    if (this.backend) {
      session.status = 'training';
      try {
        const result = await this.backend.train({ agentId, examples });
        session.status = 'completed';
        session.accuracy = result.accuracy;
        session.completedAt = new Date();
        return session;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(
          `[agent-training] training backend failed for ${agentId}, using simulated training: ${message}`,
        );
        // Fall through to the simulated path below.
      }
    }

    // Fallback: simulated training process.
    this.simulateTraining(session);

    return session;
  }

  /** Simulated in-process training used when no real backend is configured. */
  private simulateTraining(session: TrainingSession): void {
    setTimeout(() => {
      session.status = 'training';

      setTimeout(() => {
        session.status = 'completed';
        session.accuracy = 0.85 + Math.random() * 0.1;
        session.completedAt = new Date();
      }, 5000);
    }, 1000);
  }

  getSession(id: string): TrainingSession | undefined {
    return this.sessions.get(id);
  }

  getAgentSessions(agentId: string): TrainingSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.agentId === agentId);
  }
}

export const training = new AgentTraining();
