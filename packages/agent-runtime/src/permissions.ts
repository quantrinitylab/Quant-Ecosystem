import { z } from 'zod';

export enum PermissionLevel {
  OBSERVE = 'OBSERVE',
  SUGGEST = 'SUGGEST',
  ACT_LOW = 'ACT_LOW',
  ACT_HIGH = 'ACT_HIGH',
  FULL_AUTO = 'FULL_AUTO',
}

export const PermissionLevelSchema = z.nativeEnum(PermissionLevel);

const PERMISSION_RANK: Record<PermissionLevel, number> = {
  [PermissionLevel.OBSERVE]: 0,
  [PermissionLevel.SUGGEST]: 1,
  [PermissionLevel.ACT_LOW]: 2,
  [PermissionLevel.ACT_HIGH]: 3,
  [PermissionLevel.FULL_AUTO]: 4,
};

export function canAct(agentLevel: PermissionLevel, requiredLevel: PermissionLevel): boolean {
  return PERMISSION_RANK[agentLevel] >= PERMISSION_RANK[requiredLevel];
}

export function canExecuteHighRisk(agentLevel: PermissionLevel): boolean {
  return canAct(agentLevel, PermissionLevel.ACT_HIGH);
}

export function isFullAuto(agentLevel: PermissionLevel): boolean {
  return agentLevel === PermissionLevel.FULL_AUTO;
}

export interface ActionRequest {
  action: string;
  requiredPermission: PermissionLevel;
  agentId: string;
}

export class PermissionGuard {
  private readonly agentPermissions: Map<string, PermissionLevel> = new Map();

  setPermission(agentId: string, level: PermissionLevel): void {
    this.agentPermissions.set(agentId, level);
  }

  getPermission(agentId: string): PermissionLevel | undefined {
    return this.agentPermissions.get(agentId);
  }

  validate(request: ActionRequest): boolean {
    const agentLevel = this.agentPermissions.get(request.agentId);
    if (agentLevel === undefined) {
      return false;
    }
    return canAct(agentLevel, request.requiredPermission);
  }

  removeAgent(agentId: string): void {
    this.agentPermissions.delete(agentId);
  }
}
