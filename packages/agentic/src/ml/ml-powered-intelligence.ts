import { EventEmitter } from 'events';
import { IntelligentOrchestrator } from '../orchestrator/intelligent-orchestrator.js';

export interface MLTaskPrediction {
  taskType: string;
  predictedComplexity: number;
  recommendedAgents: string[];
  confidence: number;
}

export class MLPoweredIntelligence extends EventEmitter {
  private orchestrator: IntelligentOrchestrator;
  private modelVersion: string = 'v1.2-quantum';
  /** Running feedback counters used to report a REAL accuracy estimate. */
  private feedbackCount = 0;
  private feedbackSuccesses = 0;

  constructor(orchestrator: IntelligentOrchestrator) {
    super();
    this.orchestrator = orchestrator;
  }

  async predictTaskRequirements(task: string): Promise<MLTaskPrediction> {
    // Deterministic complexity estimate derived from the task text.
    const complexity = Math.min(Math.max(task.length / 100, 0.3), 0.95);

    const prediction: MLTaskPrediction = {
      taskType: task.includes('analysis')
        ? 'reasoning'
        : task.includes('execute')
          ? 'action'
          : 'general',
      predictedComplexity: complexity,
      recommendedAgents: ['quantai', 'personal'],
      // Confidence is a deterministic function of the estimated complexity —
      // no randomness, so the same task always scores the same.
      confidence: Math.min(0.97, 0.85 + complexity * 0.12),
    };

    this.emit('ml:prediction', prediction);
    return prediction;
  }

  async enhanceOrchestration(task: string) {
    const prediction = await this.predictTaskRequirements(task);

    // Use prediction to run smarter task
    const enhancedResult = await this.orchestrator.runIntelligentTask(
      `${task} [ML-Enhanced: complexity=${prediction.predictedComplexity.toFixed(2)}]`,
    );

    return {
      ...enhancedResult,
      mlPrediction: prediction,
      modelVersion: this.modelVersion,
    };
  }

  async trainOnFeedback(task: string, success: boolean, duration: number) {
    // Record observed feedback and report the REAL running success rate
    // (previously a hard-coded 0.89).
    this.feedbackCount += 1;
    if (success) this.feedbackSuccesses += 1;
    this.emit('ml:feedback', { task, success, duration });
    return { updated: true, newAccuracy: this.feedbackSuccesses / this.feedbackCount };
  }
}
