// ============================================================================
// Game Day Runner - Chaos Game Day Planning and Execution
// ============================================================================

import { ChaosExperimentRunner } from './chaos-experiments';
import { GameDayPlan, GameDayScenario, GameDayResult, Postmortem, FaultType } from './types';

export class GameDayRunner {
  private chaosRunner: ChaosExperimentRunner;
  private plans: Map<string, GameDayPlan> = new Map();
  private results: GameDayResult[] = [];

  constructor(chaosRunner?: ChaosExperimentRunner) {
    this.chaosRunner = chaosRunner ?? new ChaosExperimentRunner();
  }

  /**
   * Plan a game day with scenarios and team members.
   */
  planGameDay(scenarios: GameDayScenario[], team: string[]): GameDayPlan {
    const plan: GameDayPlan = {
      id: `gameday_${Date.now()}`,
      name: `Game Day - ${new Date().toISOString().split('T')[0]}`,
      scenarios,
      team,
      scheduledAt: Date.now(),
      status: 'planned',
    };

    this.plans.set(plan.id, plan);
    return plan;
  }

  /**
   * Execute a single chaos scenario.
   */
  executeScenario(scenario: GameDayScenario): GameDayResult {
    const startTime = Date.now();

    // Create the appropriate chaos experiment
    this.createExperiment(scenario);

    const endTime = Date.now();
    const result: GameDayResult = {
      scenarioName: scenario.name,
      success: true,
      startTime,
      endTime,
      observations: [
        `Injected ${scenario.faultType} fault on ${scenario.targetService}`,
        `Duration: ${scenario.duration}ms`,
        `Expected impact: ${scenario.expectedImpact}`,
      ],
      metrics: {
        duration: endTime - startTime,
        faultDuration: scenario.duration,
      },
    };

    this.results.push(result);
    return result;
  }

  /**
   * Generate a postmortem report from game day results.
   */
  generatePostmortem(results: GameDayResult[]): Postmortem {
    const totalDuration = results.reduce((sum, r) => sum + (r.endTime - r.startTime), 0);

    const timeline = results.map((r) => ({
      time: r.startTime,
      event: `${r.scenarioName}: ${r.success ? 'passed' : 'failed'}`,
    }));

    const failedScenarios = results.filter((r) => !r.success);

    return {
      title: `Game Day Postmortem - ${new Date().toISOString().split('T')[0]}`,
      date: Date.now(),
      duration: totalDuration,
      impact:
        failedScenarios.length > 0
          ? `${failedScenarios.length} scenario(s) failed`
          : 'All scenarios passed successfully',
      timeline,
      rootCause:
        failedScenarios.length > 0
          ? 'System resilience gaps identified during chaos injection'
          : 'No issues detected - system resilience verified',
      actionItems: failedScenarios.map((r) => ({
        description: `Investigate failure in ${r.scenarioName}`,
        owner: 'oncall-team',
        dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
      })),
      lessonsLearned: [
        'Regular chaos testing validates system resilience',
        ...results.flatMap((r) => r.observations).slice(0, 5),
      ],
    };
  }

  /**
   * Get all game day plans.
   */
  getPlans(): GameDayPlan[] {
    return Array.from(this.plans.values());
  }

  /**
   * Get all results from executed scenarios.
   */
  getResults(): GameDayResult[] {
    return [...this.results];
  }

  /**
   * Get the chaos runner instance.
   */
  getChaosRunner(): ChaosExperimentRunner {
    return this.chaosRunner;
  }

  private createExperiment(scenario: GameDayScenario): void {
    const faultType: FaultType = scenario.faultType;

    switch (faultType) {
      case 'latency':
        this.chaosRunner.networkDelay(scenario.targetService, 500, scenario.duration);
        break;
      case 'kill':
        this.chaosRunner.podKill(scenario.targetService, scenario.duration);
        break;
      case 'resource':
        this.chaosRunner.cpuStress(scenario.targetService, 80);
        break;
      default:
        this.chaosRunner.networkDelay(scenario.targetService, 200, scenario.duration);
        break;
    }
  }
}
