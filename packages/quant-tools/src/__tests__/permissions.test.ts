import { describe, it, expect } from 'vitest';
import { PermissionEngine } from '../permissions/permission-engine.js';
import { allTools } from '../tools/index.js';
import type { ToolPlan } from '../types.js';

describe('PermissionEngine', () => {
  const engine = new PermissionEngine(allTools);

  it('should allow tier 0 tools for all users', () => {
    const result = engine.evaluate('quantmail.search', 0);
    expect(result.allowed).toBe(true);
    expect(result.confirmationRequired).toBe(false);
  });

  it('should deny higher tier tools for lower tier users', () => {
    // quantads.set-budget is tier 3
    const result = engine.evaluate('quantads.set-budget', 1);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Insufficient permissions');
  });

  it('should require confirmation for tier 2+ tools', () => {
    // quantmeet.record is tier 2
    const result = engine.evaluate('quantmeet.record', 2);
    expect(result.allowed).toBe(true);
    expect(result.confirmationRequired).toBe(true);
  });

  it('should not require confirmation for tier 0 and 1 tools', () => {
    const result = engine.evaluate('quantmail.send', 1);
    expect(result.allowed).toBe(true);
    expect(result.confirmationRequired).toBe(false);
  });

  it('should return error for non-existent tool', () => {
    const result = engine.evaluate('nonexistent.tool', 3);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not found');
  });

  it('should allow admin tier for all tools', () => {
    // tier 3 user can access tier 3 tools
    const result = engine.evaluate('quant-payments.send', 3);
    expect(result.allowed).toBe(true);
  });

  it('should provide cost preview for a plan', () => {
    const plan: ToolPlan = {
      id: 'test-plan',
      steps: [
        { stepId: 's1', toolId: 'quantmail.send', params: {}, dependsOn: [], outputKey: 'o1' },
        { stepId: 's2', toolId: 'quantedits.render', params: {}, dependsOn: [], outputKey: 'o2' },
      ],
      estimatedCost: 'high',
      requiredPermission: 1,
      description: 'test',
    };

    const preview = engine.costPreview(plan);
    expect(preview.breakdown).toHaveLength(2);
    expect(preview.breakdown[0]!.toolId).toBe('quantmail.send');
    expect(preview.breakdown[0]!.cost).toBe('free');
    expect(preview.breakdown[1]!.toolId).toBe('quantedits.render');
    expect(preview.breakdown[1]!.cost).toBe('high');
    expect(preview.totalCost).toBe('high');
  });

  it('should return free cost for empty plan', () => {
    const plan: ToolPlan = {
      id: 'empty',
      steps: [],
      estimatedCost: 'free',
      requiredPermission: 0,
      description: 'empty',
    };
    const preview = engine.costPreview(plan);
    expect(preview.totalCost).toBe('free');
    expect(preview.breakdown).toHaveLength(0);
  });
});
