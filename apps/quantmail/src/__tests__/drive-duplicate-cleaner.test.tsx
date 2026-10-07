import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AIDuplicateCleanerModal,
  DuplicateCleanerManager,
  designateOriginalAndDuplicates,
  type DuplicateFileItem,
  type DuplicateGroup,
  type AIDuplicateCleanerModalProps,
  type DuplicateCleanerState,
} from '../components/drive/AIDuplicateCleanerModal';

describe('QuantDrive AI Duplicate Cleaner Test Suite', () => {
  const sampleGroup1Files: Array<
    Omit<DuplicateFileItem, 'isOriginal' | 'selectedForDeletion'> & Partial<DuplicateFileItem>
  > = [
    {
      id: 'file-copy-1',
      name: 'Design_System copy.fig',
      size: 5242880, // 5 MB
      modifiedAt: '2026-09-15T10:00:00Z',
      path: '/Projects/Backups/Design_System copy.fig',
      contentHash: 'hash-abc123456789',
    },
    {
      id: 'file-orig-1',
      name: 'Design_System.fig',
      size: 5242880,
      modifiedAt: '2026-09-22T14:30:00Z',
      path: '/Projects/Design_System.fig',
      contentHash: 'hash-abc123456789',
    },
    {
      id: 'file-copy-2',
      name: 'Design_System (1).fig',
      size: 5242880,
      modifiedAt: '2026-09-18T08:00:00Z',
      path: '/Downloads/Design_System (1).fig',
      contentHash: 'hash-abc123456789',
    },
  ];

  const sampleGroup2Files: Array<
    Omit<DuplicateFileItem, 'isOriginal' | 'selectedForDeletion'> & Partial<DuplicateFileItem>
  > = [
    {
      id: 'file-data-dup',
      name: 'Financial_Ledger_duplicate.xlsx',
      size: 2097152, // 2 MB
      modifiedAt: '2026-09-10T12:00:00Z',
      path: '/Finance/Archive/Financial_Ledger_duplicate.xlsx',
      contentHash: 'hash-xyz987654321',
    },
    {
      id: 'file-data-orig',
      name: 'Financial_Ledger.xlsx',
      size: 2097152,
      modifiedAt: '2026-09-24T09:00:00Z',
      path: '/Finance/Financial_Ledger.xlsx',
      contentHash: 'hash-xyz987654321',
    },
  ];

  const sampleGroups: DuplicateGroup[] = [
    {
      hash: 'hash-abc123456789',
      files: designateOriginalAndDuplicates(sampleGroup1Files, 'hash-abc123456789'),
      potentialSavings: 10485760, // 2 copies * 5MB
    },
    {
      hash: 'hash-xyz987654321',
      files: designateOriginalAndDuplicates(sampleGroup2Files, 'hash-xyz987654321'),
      potentialSavings: 2097152, // 1 copy * 2MB
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. designateOriginalAndDuplicates Unit Tests
  // ==========================================================================
  describe('designateOriginalAndDuplicates', () => {
    it('returns empty array when provided input files array is empty', () => {
      const result = designateOriginalAndDuplicates([], 'dummy-hash');
      expect(result).toEqual([]);
    });

    it('auto-designates the root-most/cleanest file as isOriginal: true and duplicates as selectedForDeletion: true', () => {
      const files = [
        {
          id: 'f-deep',
          name: 'presentation.pptx',
          size: 1024,
          path: '/work/projects/2026/archive/presentation.pptx',
          modifiedAt: '2026-09-20T00:00:00Z',
        },
        {
          id: 'f-root',
          name: 'presentation.pptx',
          size: 1024,
          path: '/work/presentation.pptx',
          modifiedAt: '2026-09-20T00:00:00Z',
        },
      ];

      const result = designateOriginalAndDuplicates(files, 'hash-ppt');
      expect(result).toHaveLength(2);

      const rootFile = result.find((f) => f.id === 'f-root');
      const deepFile = result.find((f) => f.id === 'f-deep');

      expect(rootFile?.isOriginal).toBe(true);
      expect(rootFile?.selectedForDeletion).toBe(false);

      expect(deepFile?.isOriginal).toBe(false);
      expect(deepFile?.selectedForDeletion).toBe(true);
    });

    it('prioritizes files without "copy", "duplicate", or "(1)" in their names', () => {
      const files = [
        {
          id: 'f-copy',
          name: 'Avatar copy.png',
          size: 4096,
          path: '/assets/Avatar copy.png',
          modifiedAt: '2026-09-24T00:00:00Z',
        },
        {
          id: 'f-num',
          name: 'Avatar (1).png',
          size: 4096,
          path: '/assets/Avatar (1).png',
          modifiedAt: '2026-09-24T00:00:00Z',
        },
        {
          id: 'f-dup',
          name: 'Avatar duplicate.png',
          size: 4096,
          path: '/assets/Avatar duplicate.png',
          modifiedAt: '2026-09-24T00:00:00Z',
        },
        {
          id: 'f-clean',
          name: 'Avatar.png',
          size: 4096,
          path: '/assets/Avatar.png',
          modifiedAt: '2026-09-20T00:00:00Z', // Even if older, clean name at same path depth wins
        },
      ];

      const result = designateOriginalAndDuplicates(files, 'hash-avatar');
      const cleanFile = result.find((f) => f.id === 'f-clean');
      const copyFile = result.find((f) => f.id === 'f-copy');
      const numFile = result.find((f) => f.id === 'f-num');
      const dupFile = result.find((f) => f.id === 'f-dup');

      expect(cleanFile?.isOriginal).toBe(true);
      expect(cleanFile?.selectedForDeletion).toBe(false);

      expect(copyFile?.isOriginal).toBe(false);
      expect(copyFile?.selectedForDeletion).toBe(true);

      expect(numFile?.isOriginal).toBe(false);
      expect(numFile?.selectedForDeletion).toBe(true);

      expect(dupFile?.isOriginal).toBe(false);
      expect(dupFile?.selectedForDeletion).toBe(true);
    });

    it('breaks ties using newest modifiedAt date when path depth and copy penalty are identical', () => {
      const files = [
        {
          id: 'f-old',
          name: 'report.pdf',
          size: 5000,
          path: '/docs/report.pdf',
          modifiedAt: '2026-09-01T10:00:00Z',
        },
        {
          id: 'f-new',
          name: 'report.pdf',
          size: 5000,
          path: '/team/report.pdf',
          modifiedAt: '2026-09-24T10:00:00Z',
        },
      ];

      const result = designateOriginalAndDuplicates(files, 'hash-report');
      const newFile = result.find((f) => f.id === 'f-new');
      const oldFile = result.find((f) => f.id === 'f-old');

      expect(newFile?.isOriginal).toBe(true);
      expect(newFile?.selectedForDeletion).toBe(false);
      expect(oldFile?.isOriginal).toBe(false);
      expect(oldFile?.selectedForDeletion).toBe(true);
    });

    it('preserves pre-designated files when isOriginal boolean is already provided', () => {
      const filesWithPredefined: Array<{ id: string; name: string } & Partial<DuplicateFileItem>> =
        [
          {
            id: 'f-explicit-orig',
            name: 'manual_keep (1).txt', // name contains (1) but explicitly flagged as original
            size: 100,
            path: '/deep/path/to/manual_keep (1).txt',
            isOriginal: true,
            selectedForDeletion: false,
          },
          {
            id: 'f-explicit-dup',
            name: 'manual_clean.txt',
            size: 100,
            path: '/manual_clean.txt',
            isOriginal: false,
            selectedForDeletion: true,
          },
        ];

      const result = designateOriginalAndDuplicates(filesWithPredefined, 'hash-manual');
      expect(result[0].id).toBe('f-explicit-orig');
      expect(result[0].isOriginal).toBe(true);
      expect(result[0].selectedForDeletion).toBe(false);

      expect(result[1].id).toBe('f-explicit-dup');
      expect(result[1].isOriginal).toBe(false);
      expect(result[1].selectedForDeletion).toBe(true);
    });

    it('provides sensible fallback values for missing path, modifiedAt, contentHash, and size', () => {
      const minimalFiles = [
        { id: 'f-1', name: 'readme.md' },
        { id: 'f-2', name: 'readme_copy.md' },
      ];

      const result = designateOriginalAndDuplicates(minimalFiles, 'hash-fallback');
      expect(result[0].path).toBe('/readme.md');
      expect(result[0].size).toBe(0);
      expect(result[0].contentHash).toBe('hash-fallback');
      expect(typeof result[0].modifiedAt).toBe('string');
      expect(result[0].isOriginal).toBe(true);
      expect(result[0].selectedForDeletion).toBe(false);

      expect(result[1].isOriginal).toBe(false);
      expect(result[1].selectedForDeletion).toBe(true);
    });
  });

  // ==========================================================================
  // 2. DuplicateCleanerManager Headless Class Unit Tests
  // ==========================================================================
  describe('DuplicateCleanerManager', () => {
    it('initializes with default empty state when no options are provided', () => {
      const manager = new DuplicateCleanerManager();
      const state = manager.getState();

      expect(state.groups).toEqual([]);
      expect(state.isScanning).toBe(false);
      expect(state.isCleaning).toBe(false);
      expect(state.error).toBeNull();
      expect(state.lastCleanedResult).toBeNull();
      expect(manager.getTotalDuplicatesCount()).toBe(0);
      expect(manager.getSelectedDuplicatesCount()).toBe(0);
      expect(manager.calculateTotalSavings()).toBe(0);
      expect(manager.calculateSelectedSavings()).toBe(0);
      expect(manager.getSelectedFileIds()).toEqual([]);
    });

    it('initializes with provided initialGroups, auto-designating and calculating potential savings', () => {
      const rawGroups: DuplicateGroup[] = [
        {
          hash: 'hash-init',
          files: [
            {
              id: 'init-1',
              name: 'document.pdf',
              size: 1000,
              path: '/docs/document.pdf',
              modifiedAt: '2026-09-20T00:00:00Z',
              contentHash: 'hash-init',
            } as any,
            {
              id: 'init-2',
              name: 'document (1).pdf',
              size: 1000,
              path: '/docs/document (1).pdf',
              modifiedAt: '2026-09-18T00:00:00Z',
              contentHash: 'hash-init',
            } as any,
          ],
          potentialSavings: undefined as any, // Auto-calculated from duplicates
        },
      ];

      const manager = new DuplicateCleanerManager({ initialGroups: rawGroups });
      const state = manager.getState();

      expect(state.groups).toHaveLength(1);
      expect(manager.getTotalDuplicatesCount()).toBe(1);
      // init-1 is designated original, init-2 is duplicate marked for deletion
      expect(state.groups[0].files[0].id).toBe('init-1');
      expect(state.groups[0].files[0].isOriginal).toBe(true);
      expect(state.groups[0].files[1].id).toBe('init-2');
      expect(state.groups[0].files[1].selectedForDeletion).toBe(true);
      expect(state.groups[0].potentialSavings).toBe(1000);
    });

    it('supports subscribe and unsubscribe for state mutations', () => {
      const manager = new DuplicateCleanerManager();
      const listener = vi.fn();
      const unsubscribe = manager.subscribe(listener);

      manager.setGroups(sampleGroups);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(manager.getState());

      unsubscribe();
      manager.selectAllDuplicates();
      expect(listener).toHaveBeenCalledTimes(1); // Not called after unsubscribe
    });

    it('scans duplicates via custom apiFetch mock and updates groups state', async () => {
      const mockScanApiResponse = {
        groups: [
          {
            hash: 'hash-scanned-1',
            files: [
              {
                id: 'scanned-orig',
                name: 'contract.pdf',
                size: 2048,
                modifiedAt: '2026-09-21T00:00:00Z',
                path: '/contracts/contract.pdf',
              },
              {
                id: 'scanned-dup',
                name: 'contract copy.pdf',
                size: 2048,
                modifiedAt: '2026-09-19T00:00:00Z',
                path: '/contracts/archive/contract copy.pdf',
              },
            ],
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockScanApiResponse,
      });

      const manager = new DuplicateCleanerManager({ apiFetch: mockFetch as any });
      const listener = vi.fn();
      manager.subscribe(listener);

      const promise = manager.scanDuplicates();
      // Verify isScanning was set to true
      expect(manager.getState().isScanning).toBe(true);

      const result = await promise;
      expect(mockFetch).toHaveBeenCalledWith('/api/drive/ai/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(result).toHaveLength(1);
      expect(manager.getState().isScanning).toBe(false);
      expect(manager.getState().error).toBeNull();
      expect(manager.getState().groups).toHaveLength(1);
      expect(manager.getTotalDuplicatesCount()).toBe(1);
      expect(manager.getSelectedDuplicatesCount()).toBe(1);
      expect(manager.calculateSelectedSavings()).toBe(2048);
    });

    it('handles apiFetch error during scanDuplicates', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'AI Duplicate Scan Indexer unavailable' }),
      });

      const manager = new DuplicateCleanerManager({ apiFetch: mockFetch as any });

      await expect(manager.scanDuplicates()).rejects.toThrow(
        'AI Duplicate Scan Indexer unavailable',
      );
      expect(manager.getState().isScanning).toBe(false);
      expect(manager.getState().error).toBe('AI Duplicate Scan Indexer unavailable');
    });

    it('toggles file selection properly and forbids toggling original files', () => {
      const manager = new DuplicateCleanerManager({ initialGroups: sampleGroups });
      const originalGroup = manager.getState().groups[0];
      const origFile = originalGroup.files.find((f) => f.isOriginal)!;
      const dupFile = originalGroup.files.find((f) => !f.isOriginal)!;

      expect(origFile.selectedForDeletion).toBe(false);
      expect(dupFile.selectedForDeletion).toBe(true);

      // Attempt to toggle the original file - should be ignored
      manager.toggleSelectFile(origFile.id);
      let updatedOrig = manager.getState().groups[0].files.find((f) => f.id === origFile.id)!;
      expect(updatedOrig.selectedForDeletion).toBe(false);

      // Toggle duplicate file to false (deselected)
      manager.toggleSelectFile(dupFile.id);
      let updatedDup = manager.getState().groups[0].files.find((f) => f.id === dupFile.id)!;
      expect(updatedDup.selectedForDeletion).toBe(false);

      // Toggle duplicate file back to true (selected)
      manager.toggleSelectFile(dupFile.id);
      updatedDup = manager.getState().groups[0].files.find((f) => f.id === dupFile.id)!;
      expect(updatedDup.selectedForDeletion).toBe(true);

      // Test dual-signature toggleSelectFile(groupId, fileId)
      manager.toggleSelectFile(originalGroup.hash, dupFile.id);
      updatedDup = manager.getState().groups[0].files.find((f) => f.id === dupFile.id)!;
      expect(updatedDup.selectedForDeletion).toBe(false);
    });

    it('selectAllDuplicates and deselectAllDuplicates set non-original files accordingly', () => {
      const manager = new DuplicateCleanerManager({ initialGroups: sampleGroups });

      // Initially all duplicates are selected
      expect(manager.getSelectedDuplicatesCount()).toBe(3); // 2 in group 1 + 1 in group 2

      // Deselect all
      manager.deselectAllDuplicates();
      expect(manager.getSelectedDuplicatesCount()).toBe(0);
      expect(manager.calculateSelectedSavings()).toBe(0);
      expect(manager.getSelectedFileIds()).toEqual([]);

      // Select all again
      manager.selectAllDuplicates();
      expect(manager.getSelectedDuplicatesCount()).toBe(3);
      expect(manager.calculateSelectedSavings()).toBe(12582912); // 10MB + 2MB
      expect(manager.getSelectedFileIds()).toHaveLength(3);

      // Also test alias deselectAll()
      manager.deselectAll();
      expect(manager.getSelectedDuplicatesCount()).toBe(0);
    });

    it('calculateSelectedSavings and calculateTotalSavings correctly compute byte sums', () => {
      const manager = new DuplicateCleanerManager({ initialGroups: sampleGroups });

      // Total savings across all duplicates (3 duplicates: 5MB + 5MB + 2MB = 12582912)
      expect(manager.calculateTotalSavings()).toBe(12582912);
      expect(manager.calculateSelectedSavings()).toBe(12582912);

      // Deselect one 5MB file
      const dup1 = sampleGroups[0].files.find((f) => !f.isOriginal)!;
      manager.toggleSelectFile(dup1.id);

      // Total savings remains unchanged, selected savings decreases by 5MB
      expect(manager.calculateTotalSavings()).toBe(12582912);
      expect(manager.calculateSelectedSavings()).toBe(12582912 - 5242880);
    });

    it('executeCleanup returns zero result immediately if no files are selected', async () => {
      const mockFetch = vi.fn();
      const manager = new DuplicateCleanerManager({
        initialGroups: sampleGroups,
        apiFetch: mockFetch as any,
      });
      manager.deselectAll();

      const result = await manager.executeCleanup();
      expect(result).toEqual({ removedCount: 0, savedBytes: 0 });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(manager.getState().isCleaning).toBe(false);
    });

    it('executeCleanup posts to /api/drive/files/trash, updates lastCleanedResult, and prunes cleaned files', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, trashed: 3 }),
      });

      const manager = new DuplicateCleanerManager({
        initialGroups: sampleGroups,
        apiFetch: mockFetch as any,
      });
      const totalSelectedBytes = manager.calculateSelectedSavings();
      const selectedIds = manager.getSelectedFileIds();

      const promise = manager.executeCleanup();
      expect(manager.getState().isCleaning).toBe(true);

      const result = await promise;
      expect(mockFetch).toHaveBeenCalledWith('/api/drive/files/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds: selectedIds }),
      });

      expect(result).toEqual({
        removedCount: 3,
        savedBytes: totalSelectedBytes,
      });

      expect(manager.getState().isCleaning).toBe(false);
      expect(manager.getState().lastCleanedResult).toEqual({
        removedCount: 3,
        savedBytes: totalSelectedBytes,
      });

      // Since all duplicates were trashed, groups with only 1 remaining original are purged from state
      expect(manager.getState().groups).toHaveLength(0);
      expect(manager.getTotalDuplicatesCount()).toBe(0);
    });

    it('executeCleanup preserves groups that still retain duplicates after partial cleanup', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      // Group 1 has 1 original and 2 duplicates
      const manager = new DuplicateCleanerManager({
        initialGroups: [sampleGroups[0]],
        apiFetch: mockFetch as any,
      });

      // Deselect one duplicate so only 1 duplicate is deleted, leaving 1 original and 1 duplicate
      const dup1 = sampleGroups[0].files.filter((f) => !f.isOriginal)[0];
      const dup2 = sampleGroups[0].files.filter((f) => !f.isOriginal)[1];

      manager.toggleSelectFile(dup2.id); // dup2 deselected, dup1 stays selected
      expect(manager.getSelectedFileIds()).toEqual([dup1.id]);

      const result = await manager.executeCleanup();
      expect(result.removedCount).toBe(1);

      // Remaining group should still exist because 1 original and 1 duplicate remain
      const remainingGroups = manager.getState().groups;
      expect(remainingGroups).toHaveLength(1);
      expect(remainingGroups[0].files).toHaveLength(2);
      expect(remainingGroups[0].files.map((f) => f.id)).toContain(dup2.id);
      expect(remainingGroups[0].potentialSavings).toBe(dup2.size);
    });

    it('handles apiFetch rejection in executeCleanup', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Storage trash service failure' }),
      });

      const manager = new DuplicateCleanerManager({
        initialGroups: sampleGroups,
        apiFetch: mockFetch as any,
      });

      await expect(manager.executeCleanup()).rejects.toThrow('Storage trash service failure');
      expect(manager.getState().isCleaning).toBe(false);
      expect(manager.getState().error).toBe('Storage trash service failure');
    });
  });

  // ==========================================================================
  // 3. AIDuplicateCleanerModal Component Static HTML Rendering Tests
  // ==========================================================================
  describe('AIDuplicateCleanerModal Static HTML Rendering', () => {
    it('renders empty markup (null) when isOpen={false}', () => {
      const html = renderToStaticMarkup(
        <AIDuplicateCleanerModal isOpen={false} onClose={vi.fn()} />,
      );
      expect(html).toBe('');
    });

    it('renders modal dialog container and title when isOpen={true}', () => {
      const manager = new DuplicateCleanerManager({ initialGroups: sampleGroups });
      const html = renderToStaticMarkup(
        <AIDuplicateCleanerModal isOpen={true} onClose={vi.fn()} manager={manager} />,
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-label="AI Duplicate Cleaner"');
      expect(html).toContain('id="ai-duplicate-cleaner-title"');
      expect(html).toContain('AI Duplicate Cleaner');
      expect(html).toContain(
        'Quant AI scanned storage and identified identical duplicate files by hash.',
      );
      expect(html).toContain('aria-label="Close dialog"');
    });

    it('renders potential savings summary banner with Select All and Deselect All buttons', () => {
      const manager = new DuplicateCleanerManager({ initialGroups: sampleGroups });
      const html = renderToStaticMarkup(
        <AIDuplicateCleanerModal isOpen={true} onClose={vi.fn()} manager={manager} />,
      );

      expect(html).toContain('data-testid="duplicate-summary-banner"');
      expect(html).toContain('data-testid="select-all-duplicates-button"');
      expect(html).toContain('data-testid="deselect-all-duplicates-button"');
      expect(html).toContain('Select All');
      expect(html).toContain('Deselect All');
      expect(html).toContain('Reclaim');
      expect(html).toContain('3 duplicates');
    });

    it('renders duplicate groups, SHA-256 header, original locks, badges, and checkboxes', () => {
      const manager = new DuplicateCleanerManager({ initialGroups: sampleGroups });
      const html = renderToStaticMarkup(
        <AIDuplicateCleanerModal isOpen={true} onClose={vi.fn()} manager={manager} />,
      );

      // Groups
      expect(html).toContain('data-testid="duplicate-group-hash-abc123456789"');
      expect(html).toContain('data-testid="duplicate-group-hash-xyz987654321"');
      expect(html).toContain('SHA-256: hash-abc1234...');
      expect(html).toContain('3 identical copies');

      // Original badges & locks
      expect(html).toContain('data-testid="original-badge-file-orig-1"');
      expect(html).toContain('Original (Keep)');
      expect(html).toContain('data-testid="original-lock-file-orig-1"');

      // Duplicate badges & checkboxes
      expect(html).toContain('data-testid="duplicate-badge-file-copy-1"');
      expect(html).toContain('Duplicate (Reclaim)');
      expect(html).toContain('data-testid="duplicate-checkbox-file-copy-1"');
      expect(html).toContain('aria-label="Select duplicate Design_System copy.fig for deletion"');
    });

    it('renders no duplicates empty state when group list is empty and not scanning', () => {
      const manager = new DuplicateCleanerManager({ initialGroups: [] });
      const html = renderToStaticMarkup(
        <AIDuplicateCleanerModal isOpen={true} onClose={vi.fn()} manager={manager} />,
      );

      expect(html).toContain('data-testid="no-duplicates-empty-state"');
      expect(html).toContain('No Duplicate Files Detected');
      expect(html).toContain(
        'Your QuantDrive storage is fully optimized. Every file in your account is unique.',
      );
    });

    it('renders error banner when manager has error message', () => {
      const manager = new DuplicateCleanerManager();
      // Inject error in manager state
      (manager as any).updateState({ error: 'Storage hash scanner timeout' });

      const html = renderToStaticMarkup(
        <AIDuplicateCleanerModal isOpen={true} onClose={vi.fn()} manager={manager} />,
      );

      expect(html).toContain('data-testid="cleaner-error-banner"');
      expect(html).toContain('Storage hash scanner timeout');
      expect(html).toContain('Retry Scan');
    });

    it('renders cleaned success banner when lastCleanedResult is present', () => {
      const manager = new DuplicateCleanerManager();
      (manager as any).updateState({
        lastCleanedResult: { removedCount: 4, savedBytes: 15728640 }, // 15 MB
      });

      const html = renderToStaticMarkup(
        <AIDuplicateCleanerModal isOpen={true} onClose={vi.fn()} manager={manager} />,
      );

      expect(html).toContain('data-testid="cleaned-success-banner"');
      expect(html).toContain('Successfully moved 4 files to Trash');
    });

    it('renders footer with cancel button and Clean Selected Duplicates button', () => {
      const manager = new DuplicateCleanerManager({ initialGroups: sampleGroups });
      const html = renderToStaticMarkup(
        <AIDuplicateCleanerModal isOpen={true} onClose={vi.fn()} manager={manager} />,
      );

      expect(html).toContain('data-testid="cleaner-cancel-button"');
      expect(html).toContain('data-testid="clean-duplicates-button"');
      expect(html).toContain('Clean Selected Duplicates (3)');
      expect(html).toContain('Cancel');
    });

    it('disables Clean button when no duplicates are selected', () => {
      const manager = new DuplicateCleanerManager({ initialGroups: sampleGroups });
      manager.deselectAll();

      const html = renderToStaticMarkup(
        <AIDuplicateCleanerModal isOpen={true} onClose={vi.fn()} manager={manager} />,
      );

      expect(html).toContain('data-testid="clean-duplicates-button"');
      expect(html).toContain('disabled=""');
      expect(html).toContain('No duplicates selected');
    });
  });
});
