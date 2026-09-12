import { prisma as defaultPrisma } from '@quant/database';
import { createAppError } from '@quant/server-core';
import * as Y from 'yjs';

const YJS_STATE_PREFIX = 'yjs:v1:';

export interface CollabPrismaClient {
  document: {
    findUnique(args: any): Promise<any>;
    update(args: any): Promise<any>;
    create?(args: any): Promise<any>;
  };
  documentVersion?: {
    findMany(args: any): Promise<any>;
    create(args: any): Promise<any>;
  };
}

export interface DocumentVersion {
  id: string;
  docId: string;
  name: string;
  createdAt: Date;
}

function encodeUpdate(update: Uint8Array): string {
  return `${YJS_STATE_PREFIX}${Buffer.from(update).toString('base64')}`;
}

function decodeUpdate(content: string): Uint8Array | null {
  if (!content.startsWith(YJS_STATE_PREFIX)) return null;
  return new Uint8Array(Buffer.from(content.slice(YJS_STATE_PREFIX.length), 'base64'));
}

function toUpdate(source: Y.Doc | Uint8Array): Uint8Array {
  return source instanceof Uint8Array ? source : Y.encodeStateAsUpdate(source);
}

/** Prisma-backed Yjs document persistence using the existing Document models. */
export class PersistenceAdapter {
  constructor(private readonly db: CollabPrismaClient = defaultPrisma) {}

  async saveDoc(docId: string, source: Y.Doc | Uint8Array): Promise<void> {
    const update = toUpdate(source);
    try {
      await this.db.document.update({
        where: { id: docId },
        data: { content: encodeUpdate(update) },
        select: { id: true },
      });
    } catch {
      throw createAppError('Collaborative document not found', 404, 'DOCUMENT_NOT_FOUND');
    }
  }

  async loadUpdate(docId: string): Promise<Uint8Array | null> {
    const row = await this.db.document.findUnique({
      where: { id: docId },
      select: { content: true, isDeleted: true },
    });
    if (!row || row.isDeleted) {
      throw createAppError('Collaborative document not found', 404, 'DOCUMENT_NOT_FOUND');
    }
    return decodeUpdate(row.content);
  }

  async loadDoc(docId: string): Promise<Y.Doc> {
    const row = await this.db.document.findUnique({
      where: { id: docId },
      select: { content: true, isDeleted: true },
    });
    if (!row || row.isDeleted) {
      throw createAppError('Collaborative document not found', 404, 'DOCUMENT_NOT_FOUND');
    }

    const doc = new Y.Doc();
    const update = decodeUpdate(row.content);
    if (update) {
      Y.applyUpdate(doc, update, 'prisma-load');
    } else if (row.content) {
      doc.getText('content').insert(0, row.content);
    }
    return doc;
  }

  async listVersions(docId: string): Promise<DocumentVersion[]> {
    const versions = await this.db.documentVersion!.findMany({
      where: { docId, title: { not: { startsWith: '__branch__:' } } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, docId: true, title: true, createdAt: true },
    });
    return versions.map(({ title, ...version }: any) => ({ ...version, name: title }));
  }

  async createCheckpoint(
    docId: string,
    name: string,
    source: Y.Doc | Uint8Array,
  ): Promise<DocumentVersion> {
    const version = await this.db.documentVersion!.create({
      data: { docId, title: name, content: encodeUpdate(toUpdate(source)) },
      select: { id: true, docId: true, title: true, createdAt: true },
    });
    const { title, ...rest } = version;
    return { ...rest, name: title };
  }
}

export const collabPersistence = new PersistenceAdapter();
