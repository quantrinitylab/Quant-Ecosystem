import { describe, it, expect, vi } from 'vitest';
import {
  AgentTraining,
  type TrainingBackend,
  type TrainingExample,
} from '../training/agent-training.js';

const examples: TrainingExample[] = [{ input: 'hi', expectedOutput: 'hello', agentId: 'a-1' }];

describe('AgentTraining.startTraining - dual mode', () => {
  describe('real backend path (injected)', () => {
    it('completes the session with the accuracy reported by the backend', async () => {
      const backend: TrainingBackend = {
        train: vi.fn().mockResolvedValue({ accuracy: 0.93 }),
      };
      const training = new AgentTraining(backend);

      expect(training.isBackendConfigured()).toBe(true);
      const session = await training.startTraining('a-1', examples);

      expect(session.status).toBe('completed');
      expect(session.accuracy).toBe(0.93);
      expect(session.completedAt).toBeInstanceOf(Date);
      expect(backend.train).toHaveBeenCalledWith({ agentId: 'a-1', examples });
    });

    it('falls back to simulated training (and warns) when the backend throws', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const backend: TrainingBackend = {
        train: vi.fn().mockRejectedValue(new Error('trainer down')),
      };
      const training = new AgentTraining(backend);

      const session = await training.startTraining('a-1', examples);
      // On backend failure the session was already marked 'training'; the
      // simulated fallback then schedules async transitions, so it is not yet
      // 'completed' and has no accuracy.
      expect(session.status).toBe('training');
      expect(session.accuracy).toBeUndefined();
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
    });
  });

  describe('fallback path', () => {
    it('uses simulated training when no backend is configured', async () => {
      const training = new AgentTraining(); // no backend, no env

      expect(training.isBackendConfigured()).toBe(false);
      const session = await training.startTraining('a-1', examples);

      expect(session.status).toBe('pending');
      expect(training.getSession(session.id)).toBe(session);
      expect(training.getAgentSessions('a-1')).toContain(session);
    });
  });
});
