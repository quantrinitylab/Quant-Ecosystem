import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuantDriveAgent } from '../agents/quantdrive.agent.js';
import { HttpClient } from '../clients/http-client.js';

describe('QuantDriveAgent - real HTTP calls', () => {
  let mockClient: HttpClient;
  let agent: QuantDriveAgent;

  beforeEach(() => {
    mockClient = {
      post: vi.fn(),
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      setAuthToken: vi.fn(),
      getBaseUrl: vi.fn().mockReturnValue('http://localhost:3003'),
    } as unknown as HttpClient;

    agent = new QuantDriveAgent(mockClient);
  });

  describe('quantdrive_upload', () => {
    it('calls POST /api/files/upload with correct parameters', async () => {
      (mockClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 201,
        data: { id: 'file-001', url: 'https://cdn.quant/file-001', size: 1024 },
      });

      const tool = (agent as any).tools.get('quantdrive_upload');
      const result = await tool.execute({
        filename: 'report.pdf',
        content: 'base64data...',
        folder: '/documents',
      });

      expect(mockClient.post).toHaveBeenCalledWith('/api/files/upload', {
        filename: 'report.pdf',
        content: 'base64data...',
        folder: '/documents',
      });
      expect(result.success).toBe(true);
      expect(result.fileId).toBe('file-001');
      expect(result.url).toBe('https://cdn.quant/file-001');
      expect(result.size).toBe(1024);
    });

    it('returns error object on failure without crashing', async () => {
      (mockClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 413,
        data: null,
        error: 'File too large',
      });

      const tool = (agent as any).tools.get('quantdrive_upload');
      const result = await tool.execute({
        filename: 'big.zip',
        content: 'data',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('File too large');
    });
  });

  describe('quantdrive_organize', () => {
    it('calls POST /api/files/organize and returns result', async () => {
      (mockClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        data: { foldersCreated: 5, filesMoved: 23 },
      });

      const tool = (agent as any).tools.get('quantdrive_organize');
      const result = await tool.execute({
        folderId: 'folder-root',
        strategy: 'by-type',
      });

      expect(mockClient.post).toHaveBeenCalledWith('/api/files/organize', {
        folderId: 'folder-root',
        strategy: 'by-type',
      });
      expect(result.organized).toBe(true);
      expect(result.foldersCreated).toBe(5);
      expect(result.filesMoved).toBe(23);
    });

    it('returns error on failure', async () => {
      (mockClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        data: null,
        error: 'Organize failed',
      });

      const tool = (agent as any).tools.get('quantdrive_organize');
      const result = await tool.execute({ folderId: 'f1', strategy: 'auto' });

      expect(result.organized).toBe(false);
      expect(result.error).toBe('Organize failed');
    });
  });
});
