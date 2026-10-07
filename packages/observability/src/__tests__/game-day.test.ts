import { describe, it, expect } from 'vitest';
import { GameDayRunner } from '../game-day.js';

describe('GameDayRunner', () => {
  it('plans a game day with scenarios and team', () => {
    const runner = new GameDayRunner();
    const plan = runner.planGameDay(
      [
        {
          name: 'network-delay',
          description: 'Inject 500ms latency',
          targetService: 'quantmail',
          faultType: 'latency',
          duration: 60000,
          expectedImpact: 'Increased response times',
        },
      ],
      ['alice', 'bob'],
    );

    expect(plan.scenarios).toHaveLength(1);
    expect(plan.team).toEqual(['alice', 'bob']);
    expect(plan.status).toBe('planned');
    expect(plan.id).toContain('gameday_');
  });

  it('executes a latency scenario', () => {
    const runner = new GameDayRunner();
    const result = runner.executeScenario({
      name: 'network-delay',
      description: 'Inject 500ms latency',
      targetService: 'quantchat',
      faultType: 'latency',
      duration: 30000,
      expectedImpact: 'Slower responses',
    });

    expect(result.scenarioName).toBe('network-delay');
    expect(result.success).toBe(true);
    expect(result.observations.length).toBeGreaterThan(0);
    expect(result.metrics['duration']).toBeDefined();
  });

  it('executes a pod kill scenario', () => {
    const runner = new GameDayRunner();
    const result = runner.executeScenario({
      name: 'pod-kill',
      description: 'Kill a pod',
      targetService: 'quantsync',
      faultType: 'kill',
      duration: 5000,
      expectedImpact: 'Service disruption',
    });

    expect(result.success).toBe(true);
    expect(result.observations).toContain('Injected kill fault on quantsync');
  });

  it('executes a resource stress scenario', () => {
    const runner = new GameDayRunner();
    const result = runner.executeScenario({
      name: 'cpu-stress',
      description: 'CPU stress test',
      targetService: 'quantai',
      faultType: 'resource',
      duration: 60000,
      expectedImpact: 'Degraded performance',
    });

    expect(result.success).toBe(true);
  });

  it('generates a postmortem from results', () => {
    const runner = new GameDayRunner();

    const result1 = runner.executeScenario({
      name: 'scenario-1',
      description: 'Test 1',
      targetService: 'quantmail',
      faultType: 'latency',
      duration: 10000,
      expectedImpact: 'Slow',
    });

    const result2 = runner.executeScenario({
      name: 'scenario-2',
      description: 'Test 2',
      targetService: 'quantchat',
      faultType: 'kill',
      duration: 5000,
      expectedImpact: 'Down',
    });

    const postmortem = runner.generatePostmortem([result1, result2]);

    expect(postmortem.title).toContain('Game Day Postmortem');
    expect(postmortem.timeline).toHaveLength(2);
    expect(postmortem.impact).toContain('passed successfully');
    expect(postmortem.lessonsLearned.length).toBeGreaterThan(0);
  });

  it('generates postmortem with action items for failed scenarios', () => {
    const runner = new GameDayRunner();
    const failedResult = {
      scenarioName: 'failed-test',
      success: false,
      startTime: Date.now(),
      endTime: Date.now() + 5000,
      observations: ['Service did not recover'],
      metrics: { duration: 5000 },
    };

    const postmortem = runner.generatePostmortem([failedResult]);

    expect(postmortem.impact).toContain('1 scenario(s) failed');
    expect(postmortem.actionItems).toHaveLength(1);
    expect(postmortem.actionItems[0]!.description).toContain('failed-test');
  });

  it('tracks all results', () => {
    const runner = new GameDayRunner();
    runner.executeScenario({
      name: 's1',
      description: 'Test',
      targetService: 'quantmail',
      faultType: 'latency',
      duration: 1000,
      expectedImpact: 'Slow',
    });
    runner.executeScenario({
      name: 's2',
      description: 'Test',
      targetService: 'quantchat',
      faultType: 'kill',
      duration: 1000,
      expectedImpact: 'Down',
    });

    expect(runner.getResults()).toHaveLength(2);
  });

  it('provides access to the chaos runner', () => {
    const runner = new GameDayRunner();
    expect(runner.getChaosRunner()).toBeDefined();
  });
});
