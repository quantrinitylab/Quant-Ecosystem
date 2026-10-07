import { describe, it, expect } from 'vitest';
import {
  PermissionLevel,
  PermissionLevelSchema,
  canAct,
  canExecuteHighRisk,
  isFullAuto,
  PermissionGuard,
} from '../permissions.js';

describe('PermissionLevel', () => {
  it('has 5 levels', () => {
    expect(Object.values(PermissionLevel)).toHaveLength(5);
    expect(PermissionLevel.OBSERVE).toBe('OBSERVE');
    expect(PermissionLevel.SUGGEST).toBe('SUGGEST');
    expect(PermissionLevel.ACT_LOW).toBe('ACT_LOW');
    expect(PermissionLevel.ACT_HIGH).toBe('ACT_HIGH');
    expect(PermissionLevel.FULL_AUTO).toBe('FULL_AUTO');
  });

  it('validates with Zod schema', () => {
    expect(PermissionLevelSchema.parse('OBSERVE')).toBe(PermissionLevel.OBSERVE);
    expect(() => PermissionLevelSchema.parse('INVALID')).toThrow();
  });
});

describe('canAct', () => {
  it('allows same level', () => {
    expect(canAct(PermissionLevel.OBSERVE, PermissionLevel.OBSERVE)).toBe(true);
    expect(canAct(PermissionLevel.ACT_HIGH, PermissionLevel.ACT_HIGH)).toBe(true);
  });

  it('allows higher level to do lower actions', () => {
    expect(canAct(PermissionLevel.FULL_AUTO, PermissionLevel.OBSERVE)).toBe(true);
    expect(canAct(PermissionLevel.ACT_HIGH, PermissionLevel.ACT_LOW)).toBe(true);
    expect(canAct(PermissionLevel.ACT_LOW, PermissionLevel.SUGGEST)).toBe(true);
  });

  it('blocks lower level from higher actions', () => {
    expect(canAct(PermissionLevel.OBSERVE, PermissionLevel.SUGGEST)).toBe(false);
    expect(canAct(PermissionLevel.SUGGEST, PermissionLevel.ACT_LOW)).toBe(false);
    expect(canAct(PermissionLevel.ACT_LOW, PermissionLevel.ACT_HIGH)).toBe(false);
    expect(canAct(PermissionLevel.ACT_HIGH, PermissionLevel.FULL_AUTO)).toBe(false);
  });
});

describe('canExecuteHighRisk', () => {
  it('allows ACT_HIGH and FULL_AUTO', () => {
    expect(canExecuteHighRisk(PermissionLevel.ACT_HIGH)).toBe(true);
    expect(canExecuteHighRisk(PermissionLevel.FULL_AUTO)).toBe(true);
  });

  it('blocks lower levels', () => {
    expect(canExecuteHighRisk(PermissionLevel.OBSERVE)).toBe(false);
    expect(canExecuteHighRisk(PermissionLevel.SUGGEST)).toBe(false);
    expect(canExecuteHighRisk(PermissionLevel.ACT_LOW)).toBe(false);
  });
});

describe('isFullAuto', () => {
  it('only true for FULL_AUTO', () => {
    expect(isFullAuto(PermissionLevel.FULL_AUTO)).toBe(true);
    expect(isFullAuto(PermissionLevel.ACT_HIGH)).toBe(false);
    expect(isFullAuto(PermissionLevel.OBSERVE)).toBe(false);
  });
});

describe('PermissionGuard', () => {
  it('validates actions against agent permission level', () => {
    const guard = new PermissionGuard();
    guard.setPermission('agent-1', PermissionLevel.ACT_LOW);

    expect(
      guard.validate({
        action: 'read-file',
        requiredPermission: PermissionLevel.OBSERVE,
        agentId: 'agent-1',
      }),
    ).toBe(true);

    expect(
      guard.validate({
        action: 'delete-account',
        requiredPermission: PermissionLevel.ACT_HIGH,
        agentId: 'agent-1',
      }),
    ).toBe(false);
  });

  it('returns false for unknown agents', () => {
    const guard = new PermissionGuard();
    expect(
      guard.validate({
        action: 'anything',
        requiredPermission: PermissionLevel.OBSERVE,
        agentId: 'unknown',
      }),
    ).toBe(false);
  });

  it('can remove agents', () => {
    const guard = new PermissionGuard();
    guard.setPermission('agent-1', PermissionLevel.FULL_AUTO);
    guard.removeAgent('agent-1');
    expect(guard.getPermission('agent-1')).toBeUndefined();
  });
});
