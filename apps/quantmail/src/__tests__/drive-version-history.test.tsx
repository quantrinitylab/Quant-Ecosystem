import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FileVersionHistoryModal,
  VersionHistoryManager,
  type FileVersionItem,
  type FileVersionHistoryModalProps,
} from '../components/drive/FileVersionHistoryModal';

describe('QuantDrive File Version History & 1-Click Rollback Test Suite', () => {
  const sampleVersions: FileVersionItem[] = [
    {
      id: 'ver-3',
      versionNumber: 3,
      size: 15699, // 20000 - 4301 -> -4.2 KB relative to ver-2
      createdAt: '2026-09-25T14:30:00Z',
      author: { name: 'Elena Rostova', email: 'elena@quantmail.in' },
      contentHash: 'hash-abc123456789',
    },
    {
      id: 'ver-2',
      versionNumber: 2,
      size: 20000, // 7302 + 12698 -> +12.4 KB relative to ver-1
      createdAt: '2026-09-24T10:15:00Z',
      author: { name: 'Dev Lead', email: 'dev@quantmail.in' },
      contentHash: 'hash-def987654321',
    },
    {
      id: 'ver-1',
      versionNumber: 1,
      size: 7302,
      createdAt: '2026-09-20T08:00:00Z',
      author: { name: 'Elena Rostova', email: 'elena@quantmail.in' },
      contentHash: 'hash-ghi555444333',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. Headless VersionHistoryManager Unit Tests
  // --------------------------------------------------------------------------
  describe('VersionHistoryManager', () => {
    it('initializes with default state or provided initial versions', () => {
      const emptyManager = new VersionHistoryManager('file-101');
      expect(emptyManager.fileId).toBe('file-101');
      expect(emptyManager.getState().versions).toEqual([]);
      expect(emptyManager.getState().isLoading).toBe(false);
      expect(emptyManager.getState().isRestoring).toBe(false);
      expect(emptyManager.getState().error).toBeNull();

      const populatedManager = new VersionHistoryManager('file-102', {
        initialVersions: sampleVersions,
      });
      expect(populatedManager.getVersions()).toHaveLength(3);
      // Versions must be sorted descending by versionNumber
      expect(populatedManager.getVersions()[0].versionNumber).toBe(3);
      expect(populatedManager.getVersions()[1].versionNumber).toBe(2);
      expect(populatedManager.getVersions()[2].versionNumber).toBe(1);
    });

    it('loads versions from API endpoint and sorts descending', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          versions: [
            sampleVersions[2], // v1
            sampleVersions[0], // v3
            sampleVersions[1], // v2
          ],
        }),
      });

      const manager = new VersionHistoryManager('file-test', {
        apiFetch: mockFetch as unknown as typeof fetch,
      });

      const subscriber = vi.fn();
      manager.subscribe(subscriber);

      const result = await manager.loadVersions();

      expect(mockFetch).toHaveBeenCalledWith('/api/drive/files/file-test/versions');
      expect(result).toHaveLength(3);
      expect(result[0].versionNumber).toBe(3);
      expect(result[1].versionNumber).toBe(2);
      expect(result[2].versionNumber).toBe(1);

      expect(manager.getState().isLoading).toBe(false);
      expect(manager.getState().error).toBeNull();
      expect(subscriber).toHaveBeenCalled();
    });

    it('supports direct array response from API endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => sampleVersions,
      });

      const manager = new VersionHistoryManager('file-arr', {
        apiFetch: mockFetch as unknown as typeof fetch,
      });

      const versions = await manager.loadVersions();
      expect(versions).toHaveLength(3);
      expect(versions[0].versionNumber).toBe(3);
    });

    it('calculates size deltas correctly (+12.4 KB, -4.2 KB, 0 B)', () => {
      const manager = new VersionHistoryManager('file-delta', {
        initialVersions: sampleVersions,
      });

      // v2 (20000) vs v1 (7302): +12698 bytes -> +12.4 KB
      const deltaV2 = manager.calculateDelta(sampleVersions[1], sampleVersions[2]);
      expect(deltaV2).toBe('+12.4 KB');

      // v3 (15699) vs v2 (20000): -4301 bytes -> -4.2 KB
      const deltaV3 = manager.calculateDelta(sampleVersions[0], sampleVersions[1]);
      expect(deltaV3).toBe('-4.2 KB');

      // Identical size -> 0 B
      const deltaZero = manager.calculateDelta(5000, 5000);
      expect(deltaZero).toBe('0 B');

      // Delta using internal lookup when previous is omitted:
      // In sorted array [v3, v2, v1]:
      // v3's consecutive previous is v2 -> -4.2 KB
      expect(manager.calculateDelta(sampleVersions[0])).toBe('-4.2 KB');
      // v2's consecutive previous is v1 -> +12.4 KB
      expect(manager.calculateDelta(sampleVersions[1])).toBe('+12.4 KB');
      // v1 is the oldest baseline version with no predecessor -> 0 B
      expect(manager.calculateDelta(sampleVersions[2])).toBe('0 B');
    });

    it('handles numeric direct arguments for calculateDelta', () => {
      const manager = new VersionHistoryManager('file-num');

      // 12698 bytes increase
      expect(manager.calculateDelta(20000, 7302)).toBe('+12.4 KB');
      // 4301 bytes decrease
      expect(manager.calculateDelta(15699, 20000)).toBe('-4.2 KB');
      // Zero difference
      expect(manager.calculateDelta(1024, 1024)).toBe('0 B');
      // Omitted previous without versions in manager
      expect(manager.calculateDelta(1024)).toBe('0 B');
    });

    it('restores version via POST to restore endpoint and updates state', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          version: sampleVersions[1],
        }),
      });

      const manager = new VersionHistoryManager('file-restore', {
        initialVersions: sampleVersions,
        apiFetch: mockFetch as unknown as typeof fetch,
      });

      const subscriber = vi.fn();
      manager.subscribe(subscriber);

      const restored = await manager.restoreVersion('ver-2');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/drive/files/file-restore/versions/ver-2/restore',
        { method: 'POST' },
      );
      expect(restored.id).toBe('ver-2');
      expect(manager.getState().isRestoring).toBe(false);
      expect(manager.getState().restoringVersionId).toBeNull();
      expect(manager.getState().lastRestoredVersion?.id).toBe('ver-2');
      expect(subscriber).toHaveBeenCalled();
    });

    it('handles API failure during version loading', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Database connection failed' }),
      });

      const manager = new VersionHistoryManager('file-err', {
        apiFetch: mockFetch as unknown as typeof fetch,
      });

      await expect(manager.loadVersions()).rejects.toThrow('Database connection failed');
      expect(manager.getState().isLoading).toBe(false);
      expect(manager.getState().error).toBe('Database connection failed');
    });

    it('handles API failure during version restore', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Insufficient permissions to restore version' }),
      });

      const manager = new VersionHistoryManager('file-restore-err', {
        initialVersions: sampleVersions,
        apiFetch: mockFetch as unknown as typeof fetch,
      });

      await expect(manager.restoreVersion('ver-2')).rejects.toThrow(
        'Insufficient permissions to restore version',
      );
      expect(manager.getState().isRestoring).toBe(false);
      expect(manager.getState().restoringVersionId).toBeNull();
      expect(manager.getState().error).toBe('Insufficient permissions to restore version');
    });

    it('allows unsubscribing from state updates', () => {
      const manager = new VersionHistoryManager('file-unsub');
      const subscriber = vi.fn();
      const unsubscribe = manager.subscribe(subscriber);

      manager.setVersions(sampleVersions);
      expect(subscriber).toHaveBeenCalledTimes(1);

      unsubscribe();
      manager.setVersions([]);
      expect(subscriber).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // 2. FileVersionHistoryModal Static HTML Rendering Tests
  // --------------------------------------------------------------------------
  describe('FileVersionHistoryModal Rendering', () => {
    it('renders empty string when isOpen is false', () => {
      const html = renderToStaticMarkup(
        <FileVersionHistoryModal
          isOpen={false}
          onClose={vi.fn()}
          fileId="file-01"
          fileName="Quarterly-Report.pdf"
          initialVersions={sampleVersions}
        />,
      );

      expect(html).toBe('');
    });

    it('renders accessible dialog container when isOpen is true', () => {
      const html = renderToStaticMarkup(
        <FileVersionHistoryModal
          isOpen={true}
          onClose={vi.fn()}
          fileId="file-01"
          fileName="Quarterly-Report.pdf"
          initialVersions={sampleVersions}
        />,
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-label="Version history for Quarterly-Report.pdf"');
      expect(html).toContain('Quarterly-Report.pdf');
      expect(html).toContain('Version History');
    });

    it('renders version badges and Current pill on the latest version', () => {
      const html = renderToStaticMarkup(
        <FileVersionHistoryModal
          isOpen={true}
          onClose={vi.fn()}
          fileId="file-01"
          fileName="Quarterly-Report.pdf"
          initialVersions={sampleVersions}
        />,
      );

      // Version badges
      expect(html).toContain('v3');
      expect(html).toContain('v2');
      expect(html).toContain('v1');

      // Latest version (v3) has the Current pill
      expect(html).toContain('Current');
      expect(html).toContain('data-testid="current-version-pill"');
    });

    it('renders explicit currentVersionNumber when provided', () => {
      // Set v2 as current version instead of default v3
      const html = renderToStaticMarkup(
        <FileVersionHistoryModal
          isOpen={true}
          onClose={vi.fn()}
          fileId="file-01"
          fileName="Quarterly-Report.pdf"
          currentVersionNumber={2}
          initialVersions={sampleVersions}
        />,
      );

      expect(html).toContain('data-testid="current-version-pill"');
      // Restore button must exist for v3 and v1, but not for current v2
      expect(html).toContain('data-testid="restore-button-ver-3"');
      expect(html).toContain('data-testid="restore-button-ver-1"');
      expect(html).not.toContain('data-testid="restore-button-ver-2"');
    });

    it('renders "Restore this version" action buttons on non-current versions only', () => {
      const html = renderToStaticMarkup(
        <FileVersionHistoryModal
          isOpen={true}
          onClose={vi.fn()}
          fileId="file-01"
          fileName="Quarterly-Report.pdf"
          initialVersions={sampleVersions}
        />,
      );

      // v3 is current -> no restore button
      expect(html).not.toContain('data-testid="restore-button-ver-3"');

      // v2 and v1 are older -> have "Restore this version" button
      expect(html).toContain('data-testid="restore-button-ver-2"');
      expect(html).toContain('data-testid="restore-button-ver-1"');
      expect(html).toContain('Restore this version');
    });

    it('renders calculated size deltas (+12.4 KB, -4.2 KB, 0 B)', () => {
      const html = renderToStaticMarkup(
        <FileVersionHistoryModal
          isOpen={true}
          onClose={vi.fn()}
          fileId="file-01"
          fileName="Quarterly-Report.pdf"
          initialVersions={sampleVersions}
        />,
      );

      // Verifies consecutive size deltas
      expect(html).toContain('-4.2 KB');
      expect(html).toContain('+12.4 KB');
      expect(html).toContain('0 B');
    });

    it('renders human-readable sizes and author metadata', () => {
      const html = renderToStaticMarkup(
        <FileVersionHistoryModal
          isOpen={true}
          onClose={vi.fn()}
          fileId="file-01"
          fileName="Quarterly-Report.pdf"
          initialVersions={sampleVersions}
        />,
      );

      // Human-readable sizes (formatBytes)
      expect(html).toContain('15.3 KB'); // 15699 bytes
      expect(html).toContain('19.5 KB'); // 20000 bytes
      expect(html).toContain('7.1 KB'); // 7302 bytes

      // Author names
      expect(html).toContain('Elena Rostova');
      expect(html).toContain('Dev Lead');
    });

    it('renders empty state when no versions exist', () => {
      const html = renderToStaticMarkup(
        <FileVersionHistoryModal
          isOpen={true}
          onClose={vi.fn()}
          fileId="file-empty"
          fileName="Empty.txt"
          initialVersions={[]}
        />,
      );

      expect(html).toContain('data-testid="version-history-empty"');
      expect(html).toContain('No previous versions recorded for this file.');
    });

    it('renders Quant Studio token styles (#16181D, #282C35, #FF8C42, #F5F5F5)', () => {
      const html = renderToStaticMarkup(
        <FileVersionHistoryModal
          isOpen={true}
          onClose={vi.fn()}
          fileId="file-01"
          fileName="Quarterly-Report.pdf"
          initialVersions={sampleVersions}
        />,
      );

      expect(html).toContain('#16181D');
      expect(html).toContain('#282C35');
      expect(html).toContain('#FF8C42');
      expect(html).toContain('#F5F5F5');
    });
  });
});
