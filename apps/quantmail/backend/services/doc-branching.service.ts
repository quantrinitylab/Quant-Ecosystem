import { prisma as defaultPrisma } from '@quant/database';
import { createAppError } from '@quant/server-core';
import * as Y from 'yjs';
import { collabPersistence, type PersistenceAdapter } from './collab-persistence';
import { getLiveDoc } from './yjs-server';

const BRANCH_PREFIX = '__branch__:';
const PAYLOAD_KIND = 'quantmail-yjs-branch-v1';

export interface BranchingPrismaClient {
  document: {
    findUnique(args: any): Promise<any>;
    findFirst(args: any): Promise<any>;
    create(args: any): Promise<any>;
    update(args: any): Promise<any>;
  };
  documentVersion: {
    findMany(args: any): Promise<any>;
    create(args: any): Promise<any>;
    findUnique(args: any): Promise<any>;
    update(args: any): Promise<any>;
  };
}

interface StoredBranch {
  kind: typeof PAYLOAD_KIND;
  branchName: string;
  userId: string;
  baseState: string;
  state: string;
  status: 'open' | 'merged';
  mergedAt?: string;
}

export interface DocBranch {
  id: string;
  docId: string;
  branchName: string;
  userId: string;
  state: Uint8Array;
  createdAt: Date;
  status: 'open' | 'merged';
}

export interface MergeConflict {
  path: string;
  resolution: 'yjs-crdt';
  description: string;
}

export interface MergeResult {
  state: Uint8Array;
  conflicts: MergeConflict[];
}

function toBase64(state: Uint8Array): string {
  return Buffer.from(state).toString('base64');
}
function fromBase64(state: string): Uint8Array {
  return new Uint8Array(Buffer.from(state, 'base64'));
}
function parseBranch(content: string): StoredBranch | null {
  try {
    const parsed = JSON.parse(content) as Partial<StoredBranch>;
    return parsed.kind === PAYLOAD_KIND && typeof parsed.branchName === 'string' &&
      typeof parsed.userId === 'string' && typeof parsed.baseState === 'string' &&
      typeof parsed.state === 'string' && (parsed.status === 'open' || parsed.status === 'merged')
      ? parsed as StoredBranch : null;
  } catch {
    return null;
  }
}
function changed(update: Uint8Array): boolean {
  return update.byteLength > 2;
}

/** Durable document branches stored as typed Prisma DocumentVersion rows. */
export class DocBranchingService {
  constructor(
    private readonly db: BranchingPrismaClient = defaultPrisma,
    private readonly persistence: PersistenceAdapter = collabPersistence,
  ) {}

  async createBranch(
    docId: string,
    branchName: string,
    userId: string,
    source: Y.Doc | Uint8Array,
  ): Promise<DocBranch> {
    const normalized = branchName.trim();
    if (!normalized) throw createAppError('Branch name is required', 400, 'INVALID_BRANCH_NAME');
    const exists = await this.db.document.findUnique({ where: { id: docId }, select: { id: true } });
    if (!exists) throw createAppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    const state = source instanceof Uint8Array ? source : Y.encodeStateAsUpdate(source);
    const payload: StoredBranch = {
      kind: PAYLOAD_KIND,
      branchName: normalized,
      userId,
      baseState: toBase64(state),
      state: toBase64(state),
      status: 'open',
    };
    const row = await this.db.documentVersion.create({
      data: { docId, title: `${BRANCH_PREFIX}${normalized}`, content: JSON.stringify(payload) },
      select: { id: true, docId: true, createdAt: true },
    });
    return { ...row, branchName: normalized, userId, state: new Uint8Array(state), status: 'open' };
  }

  async listBranches(docId: string): Promise<Array<Omit<DocBranch, 'state'>>> {
    const rows = await this.db.documentVersion.findMany({
      where: { docId, title: { startsWith: BRANCH_PREFIX } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, docId: true, content: true, createdAt: true },
    });
    return rows.flatMap((row: any) => {
      const branch = parseBranch(row.content);
      return branch ? [{ id: row.id, docId: row.docId, branchName: branch.branchName,
        userId: branch.userId, createdAt: row.createdAt, status: branch.status }] : [];
    });
  }

  async updateBranchState(branchId: string, source: Y.Doc | Uint8Array): Promise<void> {
    const row = await this.db.documentVersion.findUnique({ where: { id: branchId }, select: { content: true } });
    const branch = row && parseBranch(row.content);
    if (!branch || branch.status !== 'open') throw createAppError('Open branch not found', 404, 'BRANCH_NOT_FOUND');
    branch.state = toBase64(source instanceof Uint8Array ? source : Y.encodeStateAsUpdate(source));
    await this.db.documentVersion.update({ where: { id: branchId }, data: { content: JSON.stringify(branch) } });
  }

  async mergeBranchIntoTrunk(branchId: string, trunk: Y.Doc | Uint8Array): Promise<MergeResult> {
    const row = await this.db.documentVersion.findUnique({
      where: { id: branchId }, select: { docId: true, content: true },
    });
    const branch = row && parseBranch(row.content);
    if (!row || !branch || branch.status !== 'open') throw createAppError('Open branch not found', 404, 'BRANCH_NOT_FOUND');

    const baseDoc = new Y.Doc();
    const branchDoc = new Y.Doc();
    const trunkDoc = new Y.Doc();
    const mergedDoc = new Y.Doc();
    try {
      Y.applyUpdate(baseDoc, fromBase64(branch.baseState));
      Y.applyUpdate(branchDoc, fromBase64(branch.state));
      Y.applyUpdate(trunkDoc, trunk instanceof Uint8Array ? trunk : Y.encodeStateAsUpdate(trunk));
      Y.applyUpdate(mergedDoc, Y.encodeStateAsUpdate(baseDoc));
      const baseVector = Y.encodeStateVector(baseDoc);
      const branchDelta = Y.encodeStateAsUpdate(branchDoc, baseVector);
      const trunkDelta = Y.encodeStateAsUpdate(trunkDoc, baseVector);
      Y.applyUpdate(mergedDoc, trunkDelta, 'trunk');
      Y.applyUpdate(mergedDoc, branchDelta, 'branch');
      const mergedUpdate = Y.encodeStateAsUpdate(mergedDoc);
      const conflicts = changed(branchDelta) && changed(trunkDelta) ? [{
        path: 'document', resolution: 'yjs-crdt' as const,
        description: 'Concurrent branch and trunk operations were deterministically merged by Yjs.',
      }] : [];
      const trunkDocId = row.docId;
      await this.persistence.saveDoc(trunkDocId, mergedUpdate);
      branch.status = 'merged';
      branch.mergedAt = new Date().toISOString();
      await this.db.documentVersion.update({ where: { id: branchId }, data: { content: JSON.stringify(branch) } });
      const liveDoc = getLiveDoc(trunkDocId);
      if (liveDoc) {
        Y.applyUpdate(liveDoc, mergedUpdate, 'branch-merge');
      }
      return { state: mergedUpdate, conflicts };
    } finally {
      baseDoc.destroy(); branchDoc.destroy(); trunkDoc.destroy(); mergedDoc.destroy();
    }
  }
}

export const docBranchingService = new DocBranchingService();
