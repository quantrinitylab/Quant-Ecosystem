import { describe, it, expect, vi } from 'vitest';
import { AgentTrainingSystem, type TrainingSystemBackend } from '../training/agent-training-system';
import type { IntelligentOrchestrator } from '../orchestrator/intelligent-orchestrator';

function makeOrchestrator() {
  const runIntelligentTask = vi.fn().mockResolvedValue({ ok: true });
  const orchestrator = { runIntelligentTask } as unknown as IntelligentOrchestrator;
  return { orchestrator, runIntelligentTask };
}

describe('AgentTrainingSystem.startTraining - dual mode', () => {
  describe('real backend path (injected)', () => {
    it('records the improvement reported by the backend without running the local loop', async () => {
      const { orchestrator, runIntelligentTask } = makeOrchestrator();
      const backend: TrainingSystemBackend = {
        runTraining: vi.fn().mockResolvedValue({ improvement: 0.42 }),
      };
      const system = new AgentTrainingSystem(orchestrator, backend);

      expect(system.isBackendConfigured()).toBe(true);
      const session = await system.startTraining('a-1', 'classification', 5);

      expect(session.status).toBe('completed');
      expect(session.improvement).toBe(0.42);
      expect(backend.runTraining).toHaveBeenCalledWith({
        agentId: 'a-1',
        taskType: 'classification',
        iterations: 5,
      });
      expect(runIntelligentTask).not.toHaveBeenCalled();
    });

    it('falls back to the in-process loop (and warns) when the backend throws', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { orchestrator, runIntelligentTask } = makeOrchestrator();
      const backend: TrainingSystemBackend = {
        runTraining: vi.fn().mockRejectedValue(new Error('trainer down')),
      };
      const system = new AgentTrainingSystem(orchestrator, backend);

      const session = await system.startTraining('a-1', 'classification', 4);
      expect(session.status).toBe('completed');
      expect(runIntelligentTask).toHaveBeenCalledTimes(4);
      expect(session.improvement).toBeCloseTo(0.12, 5);
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
    });
  });

  describe('fallback path', () => {
    it('runs the in-process orchestrator loop when no backend is configured', async () => {
      const { orchestrator, runIntelligentTask } = makeOrchestrator();
      const system = new AgentTrainingSystem(orchestrator); // no backend, no env

      expect(system.isBackendConfigured()).toBe(false);
      const session = await system.startTraining('a-1', 'summarization', 3);

      expect(session.status).toBe('completed');
      expect(runIntelligentTask).toHaveBeenCalledTimes(3);
      expect(session.improvement).toBeCloseTo(0.09, 5);

      const report = await system.getTrainingReport('a-1');
      expect(report.totalSessions).toBe(1);
    });
  });
});
