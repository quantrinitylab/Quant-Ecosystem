// QM-M39-011 — unit tests for the real Quanty drive tools.
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { AISearchContentService } from '../services/ai-search-content.service';
import { AIOrganizeService } from '../services/ai-organize.service';
import { AISummarizeFileService } from '../services/ai-summarize-file.service';
import { checkedPlaintext } from '../services/drive-storage.service';
import {
  buildDriveTools,
  resolveDriveFile,
} from '../services/quanty-agent/tools/drive-tools';
import type { QuantyToolContext } from '../services/quanty-agent/types';

vi.mock('../services/ai-search-content.service', () => ({
  AISearchContentService: vi.fn(),
}));
vi.mock('../services/ai-organize.service', () => ({
  AIOrganizeService: vi.fn(),
}));
vi.mock('../services/ai-summarize-file.service', () => ({
  AISummarizeFileService: vi.fn(),
}));
vi.mock('../services/drive-storage.service', () => ({
  checkedPlaintext: vi.fn(),
}));

const USER = 'user-1';

function ctx(): QuantyToolContext {
  return {
    userId: USER,
    taskId: 'task-1',
    prisma: {},
    signal: new AbortController().signal,
    audit: () => undefined,
  } as unknown as QuantyToolContext;
}

function fileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-1',
    userId: USER,
    name: 'notes.txt',
    mimeType: 'text/plain',
    isDeleted: false,
    folderId: 'folder-root',
    encryptedContent: 'k',
    encryptionIV: 'iv',
    encryptionAuthTag: 'tag',
    encryptionKey: 'key',
    ...overrides,
  };
}

function mockPrisma(row: Record<string, unknown> | null, many: Record<string, unknown>[] = []) {
  return {
    file: {
      findUnique: vi.fn().mockResolvedValue(row),
      findMany: vi.fn().mockResolvedValue(many),
    },
  };
}

function deps(prisma: unknown) {
  return { prisma: prisma as never, aiEngine: { infer: vi.fn() } as never };
}

describe('quanty drive tools (QM-M39-011)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkedPlaintext as unknown as Mock).mockResolvedValue(Buffer.from('file content here'));
  });

  it('builds the five real drive tools', () => {
    const tools = buildDriveTools(deps({}));
    expect(tools.map((t) => t.name).sort()).toEqual([
      'drive.organizeFile',
      'drive.readFile',
      'drive.searchFiles',
      'drive.suggestDestination',
      'drive.summarizeFile',
    ]);
    for (const t of tools) {
      expect(t.app).toBe('drive');
      expect(t.description.length).toBeGreaterThan(0);
      expect(typeof t.handler).toBe('function');
    }
    expect(tools.find((t) => t.name === 'drive.organizeFile')?.destructive).toBe(true);
    expect(
      tools
        .filter((t) => t.name !== 'drive.organizeFile')
        .every((t) => t.destructive === false),
    ).toBe(true);
  });

  it('drive.searchFiles returns real results', async () => {
    const searchContent = vi.fn().mockResolvedValue([
      { fileId: 'f1', fileName: 'report.pdf', snippet: 'quarterly…', relevanceScore: 0.9 },
    ]);
    (AISearchContentService as unknown as Mock).mockImplementation(function (this: unknown) { return { searchContent }; });
    const [tool] = buildDriveTools(deps({})).filter((t) => t.name === 'drive.searchFiles');
    const result = await tool!.handler({ query: 'quarterly' }, ctx());
    expect(searchContent).toHaveBeenCalledWith('quarterly', USER, { limit: 10 });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      results: [{ fileId: 'f1', fileName: 'report.pdf', snippet: 'quarterly…', relevanceScore: 0.9 }],
    });
    expect(result.summary).toContain('1 file');
  });

  it('drive.searchFiles reports honestly when nothing matches', async () => {
    (AISearchContentService as unknown as Mock).mockImplementation(function (this: unknown) {
      return { searchContent: vi.fn().mockResolvedValue([]) };
    });
    const [tool] = buildDriveTools(deps({})).filter((t) => t.name === 'drive.searchFiles');
    const result = await tool!.handler({ query: 'zzz-no-match' }, ctx());
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('No Drive files matched');
  });

  it('drive.searchFiles refuses an empty query without calling the service', async () => {
    const searchContent = vi.fn();
    (AISearchContentService as unknown as Mock).mockImplementation(function (this: unknown) { return { searchContent }; });
    const [tool] = buildDriveTools(deps({})).filter((t) => t.name === 'drive.searchFiles');
    const result = await tool!.handler({ query: '   ' }, ctx());
    expect(result.ok).toBe(false);
    expect(searchContent).not.toHaveBeenCalled();
  });

  it('drive.readFile returns metadata plus raw content for a text file', async () => {
    const prisma = mockPrisma(fileRow());
    const [tool] = buildDriveTools(deps(prisma)).filter((t) => t.name === 'drive.readFile');
    expect(tool!.destructive).toBe(false);
    const result = await tool!.handler({ fileId: 'file-1' }, ctx());
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      fileId: 'file-1',
      fileName: 'notes.txt',
      mimeType: 'text/plain',
      contentLength: 'file content here'.length,
      truncated: false,
      content: 'file content here',
    });
    expect(result.summary).toContain('notes.txt');
  });

  it('drive.readFile resolves by fileName and honours maxChars', async () => {
    const longContent = 'x'.repeat(500);
    (checkedPlaintext as unknown as Mock).mockResolvedValueOnce(Buffer.from(longContent));
    const row = fileRow();
    const prisma = mockPrisma(row, [row]);
    const [tool] = buildDriveTools(deps(prisma)).filter((t) => t.name === 'drive.readFile');
    const result = await tool!.handler({ fileName: 'notes.txt', maxChars: 200 }, ctx());
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      fileId: 'file-1',
      fileName: 'notes.txt',
      contentLength: 500,
      truncated: true,
    });
    expect((result.data as { content: string }).content).toHaveLength(200);
    expect(result.summary).toContain('notes.txt');
  });

  it('drive.readFile returns an honest not-text-readable message for binary files (never fabricated content)', async () => {
    const prisma = mockPrisma(fileRow({ mimeType: 'image/png', name: 'photo.png' }));
    const [tool] = buildDriveTools(deps(prisma)).filter((t) => t.name === 'drive.readFile');
    const result = await tool!.handler({ fileId: 'file-1' }, ctx());
    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.summary).toMatch(/not a text-readable file/i);
    expect(result.summary).toContain('photo.png');
    // The storage layer must never be touched for binary files.
    expect(checkedPlaintext).not.toHaveBeenCalled();
  });

  it('drive.readFile refuses to guess without a file reference', async () => {
    const prisma = mockPrisma(fileRow());
    const [tool] = buildDriveTools(deps(prisma)).filter((t) => t.name === 'drive.readFile');
    const result = await tool!.handler({}, ctx());
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('fileId or fileName');
  });

  it('drive.readFile rejects cross-user access with 403', async () => {
    const prisma = mockPrisma(fileRow({ userId: 'someone-else' }));
    const [tool] = buildDriveTools(deps(prisma)).filter((t) => t.name === 'drive.readFile');
    await expect(tool!.handler({ fileId: 'file-1' }, ctx())).rejects.toThrow(/not authorized/i);
  });

  it('drive.suggestDestination suggests without moving', async () => {
    const categorizeFile = vi.fn().mockResolvedValue({
      suggestedFolder: '/Documents',
      category: 'Documents',
      confidence: 0.85,
    });
    (AIOrganizeService as unknown as Mock).mockImplementation(function (this: unknown) { return { categorizeFile }; });
    const prisma = mockPrisma(fileRow());
    const [tool] = buildDriveTools(deps(prisma)).filter(
      (t) => t.name === 'drive.suggestDestination',
    );
    const result = await tool!.handler({ fileId: 'file-1' }, ctx());
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      fileId: 'file-1',
      suggestedFolder: '/Documents',
      category: 'Documents',
      confidence: 0.85,
    });
    expect(categorizeFile).toHaveBeenCalledWith('notes.txt', 'text/plain', 'file content here', USER);
  });

  it('drive.summarizeFile returns the real summary', async () => {
    const summarizeFile = vi.fn().mockResolvedValue({
      summary: 'Meeting notes about Q3.',
      keyPoints: ['Revenue up', 'Hiring freeze'],
      fileType: 'text',
      wordCount: 42,
    });
    (AISummarizeFileService as unknown as Mock).mockImplementation(function (this: unknown) { return { summarizeFile }; });
    const row = fileRow();
    const prisma = mockPrisma(row, [row]);
    const [tool] = buildDriveTools(deps(prisma)).filter((t) => t.name === 'drive.summarizeFile');
    const result = await tool!.handler({ fileName: 'notes.txt' }, ctx());
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('Meeting notes about Q3.');
  });

  it('drive.summarizeFile rejects non-text files honestly', async () => {
    const prisma = mockPrisma(fileRow({ mimeType: 'image/png', name: 'photo.png' }));
    const [tool] = buildDriveTools(deps(prisma)).filter((t) => t.name === 'drive.summarizeFile');
    await expect(tool!.handler({ fileId: 'file-1' }, ctx())).rejects.toThrow(
      /text-based file/,
    );
  });

  it('drive.organizeFile moves for real and reports the previous folder in the undo token', async () => {
    const autoOrganize = vi.fn().mockResolvedValue({
      fileId: 'file-1',
      suggestedFolder: '/Documents',
      category: 'Documents',
      confidence: 0.9,
      folderId: 'folder-docs',
      applied: true,
    });
    (AIOrganizeService as unknown as Mock).mockImplementation(function (this: unknown) {
      return { categorizeFile: vi.fn(), autoOrganize };
    });
    const prisma = mockPrisma(fileRow({ folderId: 'folder-root' }));
    const [tool] = buildDriveTools(deps(prisma)).filter((t) => t.name === 'drive.organizeFile');
    const result = await tool!.handler({ fileId: 'file-1' }, ctx());
    expect(autoOrganize).toHaveBeenCalledWith('file-1', USER, 'file content here', true);
    expect(result.ok).toBe(true);
    expect(result.reversible).toBe(true);
    expect(result.undoToken).toEqual({ fileId: 'file-1', previousFolderId: 'folder-root' });
    expect(result.summary).toContain('/Documents');
  });

  describe('resolveDriveFile', () => {
    it('throws 404 for a missing file', async () => {
      await expect(
        resolveDriveFile({ file: { findUnique: vi.fn().mockResolvedValue(null) } } as never, USER, {
          fileId: 'nope',
        }),
      ).rejects.toThrow(/not found/i);
    });

    it('throws 403 for another user\u2019s file', async () => {
      const prisma = {
        file: { findUnique: vi.fn().mockResolvedValue(fileRow({ userId: 'someone-else' })) },
      };
      await expect(
        resolveDriveFile(prisma as never, USER, { fileId: 'file-1' }),
      ).rejects.toThrow(/not authorized/i);
    });

    it('throws 404 when no file matches the name', async () => {
      const prisma = { file: { findMany: vi.fn().mockResolvedValue([]) } };
      await expect(
        resolveDriveFile(prisma as never, USER, { fileName: 'missing.txt' }),
      ).rejects.toThrow(/No file named like/);
    });

    it('throws 409 listing candidates when the name is ambiguous', async () => {
      const prisma = {
        file: {
          findMany: vi.fn().mockResolvedValue([fileRow({ name: 'a.txt' }), fileRow({ name: 'b.txt', id: 'file-2' })]),
        },
      };
      await expect(
        resolveDriveFile(prisma as never, USER, { fileName: '.txt' }),
      ).rejects.toThrow(/Multiple files match/);
    });

    it('resolves a unique name match', async () => {
      const row = fileRow();
      const prisma = { file: { findMany: vi.fn().mockResolvedValue([row]) } };
      await expect(
        resolveDriveFile(prisma as never, USER, { fileName: 'notes' }),
      ).resolves.toEqual(row);
    });
  });
});
