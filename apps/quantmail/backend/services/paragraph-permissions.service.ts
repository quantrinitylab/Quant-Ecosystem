import { prisma as defaultPrisma } from '@quant/database';
import { createAppError } from '@quant/server-core';

export type PermissionRole = 'owner' | 'editor' | 'viewer';
export type PermissionAction = 'read' | 'write' | 'delete';
export type PermissionSubject = `user:${string}` | `role:${PermissionRole}`;
export type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

export interface PermissionPrismaClient {
  document: {
    findUnique(args: any): Promise<any>;
    update(args: any): Promise<any>;
    updateMany(args: any): Promise<any>;
  };
}

export interface PermissionActor { userId: string; roles: PermissionRole[]; }
export interface ParagraphPermission {
  docId: string;
  paragraphId: string;
  subject: PermissionSubject;
  actions: PermissionAction[];
}
export interface ParagraphLock {
  docId: string;
  paragraphId: string;
  userId: string;
  role: PermissionRole;
  expiresAt: string;
}

interface CollaborationMetadata {
  paragraphPermissions: Record<string, Record<string, PermissionAction[]>>;
  paragraphLocks: Record<string, Omit<ParagraphLock, 'docId' | 'paragraphId'>>;
}

const ROLE_ACTIONS: Record<PermissionRole, PermissionAction[]> = {
  owner: ['read', 'write', 'delete'], editor: ['read', 'write'], viewer: ['read'],
};

function object(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, JsonValue> : {};
}
function collaboration(metadata: JsonValue): CollaborationMetadata {
  const root = object(metadata);
  const value = object(root.collaboration);
  return {
    paragraphPermissions: object(value.paragraphPermissions) as unknown as CollaborationMetadata['paragraphPermissions'],
    paragraphLocks: object(value.paragraphLocks) as unknown as CollaborationMetadata['paragraphLocks'],
  };
}
function withCollaboration(metadata: JsonValue, state: CollaborationMetadata): any {
  return { ...object(metadata), collaboration: state as any };
}
function strongestRole(actor: PermissionActor): PermissionRole {
  return actor.roles.includes('owner') ? 'owner' : actor.roles.includes('editor') ? 'editor' : 'viewer';
}

/** Prisma-persisted paragraph RBAC and optimistic, expiring write locks. */
export class ParagraphPermissionsService {
  constructor(private readonly db: PermissionPrismaClient = defaultPrisma) {}

  private async read(docId: string) {
    const row = await this.db.document.findUnique({
      where: { id: docId }, select: { metadata: true, updatedAt: true, isDeleted: true },
    });
    if (!row || row.isDeleted) throw createAppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    return row;
  }

  async setPermission(
    docId: string, paragraphId: string, subject: PermissionSubject, actions: PermissionAction[],
  ): Promise<void> {
    const row = await this.read(docId);
    const state = collaboration(row.metadata);
    state.paragraphPermissions[paragraphId] ??= {};
    state.paragraphPermissions[paragraphId][subject] = [...new Set(actions)];
    await this.db.document.update({
      where: { id: docId }, data: { metadata: withCollaboration(row.metadata, state) }, select: { id: true },
    });
  }

  async removePermission(docId: string, paragraphId: string, subject: PermissionSubject): Promise<void> {
    const row = await this.read(docId);
    const state = collaboration(row.metadata);
    delete state.paragraphPermissions[paragraphId]?.[subject];
    await this.db.document.update({
      where: { id: docId }, data: { metadata: withCollaboration(row.metadata, state) }, select: { id: true },
    });
  }

  async checkPermission(
    docId: string, paragraphId: string, actor: PermissionActor, action: PermissionAction,
  ): Promise<boolean> {
    if (actor.roles.includes('owner')) return true;
    const row = await this.read(docId);
    const grants = collaboration(row.metadata).paragraphPermissions[paragraphId];
    if (!grants) return actor.roles.some((role) => ROLE_ACTIONS[role].includes(action));
    const subjects: PermissionSubject[] = [
      `user:${actor.userId}`, ...actor.roles.map((role) => `role:${role}` as PermissionSubject),
    ];
    return subjects.some((subject) => grants[subject]?.includes(action));
  }

  async lockParagraph(
    docId: string, paragraphId: string, actor: PermissionActor, ttlMs = 30_000,
  ): Promise<ParagraphLock> {
    if (!(await this.checkPermission(docId, paragraphId, actor, 'write'))) {
      throw createAppError('Paragraph write permission denied', 403, 'PARAGRAPH_FORBIDDEN');
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const row = await this.read(docId);
      const state = collaboration(row.metadata);
      const current = state.paragraphLocks[paragraphId];
      if (current && Date.parse(current.expiresAt) > Date.now() && current.userId !== actor.userId) {
        throw createAppError('Paragraph is locked by another collaborator', 423, 'PARAGRAPH_LOCKED');
      }
      const lock: ParagraphLock = {
        docId, paragraphId, userId: actor.userId, role: strongestRole(actor),
        expiresAt: new Date(Date.now() + Math.max(1_000, ttlMs)).toISOString(),
      };
      state.paragraphLocks[paragraphId] = { userId: lock.userId, role: lock.role, expiresAt: lock.expiresAt };
      const updated = await this.db.document.updateMany({
        where: { id: docId, updatedAt: row.updatedAt },
        data: { metadata: withCollaboration(row.metadata, state) },
      });
      if (updated.count === 1) return lock;
    }
    throw createAppError('Paragraph lock changed concurrently', 409, 'PARAGRAPH_LOCK_CONFLICT');
  }

  async unlockParagraph(docId: string, paragraphId: string, actor: PermissionActor): Promise<void> {
    const row = await this.read(docId);
    const state = collaboration(row.metadata);
    const lock = state.paragraphLocks[paragraphId];
    if (lock && lock.userId !== actor.userId && !actor.roles.includes('owner')) {
      throw createAppError('Only the lock owner can unlock this paragraph', 403, 'PARAGRAPH_FORBIDDEN');
    }
    delete state.paragraphLocks[paragraphId];
    await this.db.document.update({
      where: { id: docId }, data: { metadata: withCollaboration(row.metadata, state) }, select: { id: true },
    });
  }

  async assertCanWrite(docId: string, paragraphId: string, actor: PermissionActor): Promise<void> {
    if (!(await this.checkPermission(docId, paragraphId, actor, 'write'))) {
      throw createAppError('Paragraph write permission denied', 403, 'PARAGRAPH_FORBIDDEN');
    }
    const row = await this.read(docId);
    const lock = collaboration(row.metadata).paragraphLocks[paragraphId];
    if (lock && Date.parse(lock.expiresAt) > Date.now() && lock.userId !== actor.userId && !actor.roles.includes('owner')) {
      throw createAppError('Paragraph is locked by another collaborator', 423, 'PARAGRAPH_LOCKED');
    }
  }
}

export const paragraphPermissionsService = new ParagraphPermissionsService();
