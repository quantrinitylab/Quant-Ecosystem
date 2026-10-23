// ============================================================================
// Test support — QC-F-573 voice-note media pipeline.
// An in-memory fake Prisma client (media table only) and an in-memory stub
// object storage. The stub stands in for the S3/R2 infrastructure boundary
// (presign + HEAD); every app-level decision (allowlist, fail-closed,
// HEAD-verify, durable row, owner gates) is exercised against the REAL
// MediaService. This module is intentionally NOT a *.test.ts file.
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import type { MediaObjectStorage, ObjectHeadResult } from '../services/media.service';

export interface MediaRow {
  id: string;
  userId: string;
  type: string;
  url: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  duration: number | null;
  createdAt: Date;
}

/** Minimal PrismaClient-typed fake covering exactly the media operations. */
export function createMediaPrismaFake(): { prisma: PrismaClient; rows: Map<string, MediaRow> } {
  const rows = new Map<string, MediaRow>();

  const media = {
    findUnique: async ({ where }: { where: { id: string } }): Promise<MediaRow | null> =>
      rows.get(where.id) ?? null,
    create: async ({
      data,
    }: {
      data: {
        id: string;
        userId: string;
        type: string;
        url: string;
        fileName?: string;
        fileSize?: number;
        mimeType?: string;
        duration?: number;
      };
    }): Promise<MediaRow> => {
      if (rows.has(data.id)) {
        const err = new Error('Unique constraint failed on the fields: (`id`)');
        (err as unknown as { code: string }).code = 'P2002';
        throw err;
      }
      const row: MediaRow = {
        id: data.id,
        userId: data.userId,
        type: data.type,
        url: data.url,
        fileName: data.fileName ?? null,
        fileSize: data.fileSize ?? null,
        mimeType: data.mimeType ?? null,
        duration: data.duration ?? null,
        createdAt: new Date(),
      };
      rows.set(data.id, row);
      return row;
    },
    delete: async ({ where }: { where: { id: string } }): Promise<MediaRow> => {
      const row = rows.get(where.id);
      if (!row) {
        const err = new Error('Record to delete does not exist.');
        (err as unknown as { code: string }).code = 'P2025';
        throw err;
      }
      rows.delete(where.id);
      return row;
    },
  };

  const prisma = { media } as unknown as PrismaClient;
  return { prisma, rows };
}

/** In-memory object storage: real presign structure, HEAD over real bytes. */
export class StubObjectStorage implements MediaObjectStorage {
  private objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  async presignPut(key: string, contentType: string, _expiresSec: number): Promise<string> {
    // A structurally real presigned URL (key-addressable), not a simulation
    // string — the test PUT writes bytes the stub HEAD can later verify.
    return `https://stub-storage.test/${encodeURIComponent(key)}?X-Stub-Expires=3600&Content-Type=${encodeURIComponent(contentType)}`;
  }

  async head(key: string): Promise<ObjectHeadResult> {
    const obj = this.objects.get(key);
    if (!obj) return { exists: false, size: 0 };
    return { exists: true, size: obj.bytes.length, contentType: obj.contentType };
  }

  publicUrl(key: string): string {
    return `https://stub-storage.test/${encodeURIComponent(key)}`;
  }

  /** Simulate the browser PUT of the blob bytes. */
  putObject(key: string, bytes: Uint8Array, contentType: string): void {
    this.objects.set(key, { bytes, contentType });
  }
}
