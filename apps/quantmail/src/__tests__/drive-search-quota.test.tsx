import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DriveAISearchBar,
  DriveAISearchManager,
  type AISearchResultItem,
} from '../components/drive/DriveAISearchBar';
import {
  StorageQuotaBar,
  StorageQuotaManager,
  type StorageQuotaData,
} from '../components/drive/StorageQuotaBar';
import { formatBytes } from '../lib/format-bytes';

describe('DriveAISearch & StorageQuota Architect Test Suite', () => {
  const sampleSearchResults: AISearchResultItem[] = [
    {
      fileId: 'file-101',
      fileName: 'Architecture_RFC_2026.pdf',
      mimeType: 'application/pdf',
      score: 0.96,
      snippet: 'QuantDrive adopts FastCDC 64KB content-defined chunking for zero-egress sync.',
      matchedLine: 42,
    },
    {
      fileId: 'file-102',
      fileName: 'Financial_Ledger_Q3.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      score: 0.88,
      snippet: 'EKS cluster cloud egress budget reduced to zero with BLAKE3 CAS deduplication.',
      matchedLine: 115,
    },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. DriveAISearchManager Unit Tests
  // ==========================================================================
  describe('DriveAISearchManager Headless Controller', () => {
    it('initializes with default state', () => {
      const manager = new DriveAISearchManager();
      const state = manager.getState();

      expect(state.query).toBe('');
      expect(state.isSemantic).toBe(true);
      expect(state.results).toEqual([]);
      expect(state.isSearching).toBe(false);
      expect(state.selectedIndex).toBe(-1);
      expect(state.error).toBeNull();
    });

    it('initializes with custom initial query and mode', () => {
      const manager = new DriveAISearchManager({
        initialQuery: 'fastcdc chunking',
        initialSemantic: false,
        debounceMs: 100,
      });
      const state = manager.getState();

      expect(state.query).toBe('fastcdc chunking');
      expect(state.isSemantic).toBe(false);
    });

    it('updates query and clears results when input is emptied', () => {
      const manager = new DriveAISearchManager({ debounceMs: 0 });
      manager.setResults(sampleSearchResults);
      expect(manager.getState().results.length).toBe(2);

      manager.setQuery('');
      const state = manager.getState();
      expect(state.query).toBe('');
      expect(state.results).toEqual([]);
      expect(state.selectedIndex).toBe(-1);
      expect(state.isSearching).toBe(false);
    });

    it('toggles semantic mode and re-triggers search if query is non-empty', async () => {
      const mockApiFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: sampleSearchResults }),
      });

      const manager = new DriveAISearchManager({
        apiFetch: mockApiFetch as any,
        initialQuery: 'fastcdc',
        initialSemantic: true,
        debounceMs: 0,
      });

      expect(manager.getState().isSemantic).toBe(true);

      manager.toggleSemantic();
      expect(manager.getState().isSemantic).toBe(false);

      // Called apiFetch for new search mode
      expect(mockApiFetch).toHaveBeenCalled();
    });

    it('performs debounced search in semantic mode via POST /api/drive/ai/search', async () => {
      const mockApiFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              fileId: 'f-1',
              fileName: 'Deep_Specs.md',
              mimeType: 'text/markdown',
              score: 0.95,
              snippet: 'Matched semantic query token in section 4',
              matchedLine: 12,
            },
          ],
        }),
      });

      const manager = new DriveAISearchManager({
        apiFetch: mockApiFetch as any,
        debounceMs: 200,
      });

      manager.setQuery('quantum encryption');
      expect(manager.getState().isSearching).toBe(false);

      // Advance debounce timer
      await vi.advanceTimersByTimeAsync(200);

      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/drive/ai/search',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ query: 'quantum encryption', limit: 10 }),
        }),
      );

      const state = manager.getState();
      expect(state.results.length).toBe(1);
      expect(state.results[0].fileName).toBe('Deep_Specs.md');
      expect(state.results[0].score).toBe(0.95);
      expect(state.selectedIndex).toBe(0);
      expect(state.isSearching).toBe(false);
      expect(state.error).toBeNull();
    });

    it('falls back to /api/drive/search when semantic mode is disabled', async () => {
      const mockApiFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          files: [{ id: 'f-plain', name: 'Contract_Report.pdf', mimeType: 'application/pdf' }],
        }),
      });

      const manager = new DriveAISearchManager({
        apiFetch: mockApiFetch as any,
        initialSemantic: false,
        debounceMs: 0,
      });

      await manager.search('Contract');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/drive/search?q=Contract');
      const state = manager.getState();
      expect(state.results.length).toBe(1);
      expect(state.results[0].fileName).toBe('Contract_Report.pdf');
      expect(state.results[0].score).toBe(1.0);
    });

    it('handles search API failure gracefully', async () => {
      const mockApiFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      });

      const manager = new DriveAISearchManager({
        apiFetch: mockApiFetch as any,
        debounceMs: 0,
      });

      await manager.search('test query');

      const state = manager.getState();
      expect(state.error).toContain('AI search failed with status 503');
      expect(state.results).toEqual([]);
      expect(state.selectedIndex).toBe(-1);
      expect(state.isSearching).toBe(false);
    });

    it('manages keyboard navigation selection index and wrapping', () => {
      const manager = new DriveAISearchManager();
      manager.setResults(sampleSearchResults);

      expect(manager.getState().selectedIndex).toBe(0);
      expect(manager.getSelectedResult()?.fileId).toBe('file-101');

      // Move down
      manager.selectIndex(1);
      expect(manager.getState().selectedIndex).toBe(1);
      expect(manager.getSelectedResult()?.fileId).toBe('file-102');

      // Wrap to beginning when exceeding length
      manager.selectIndex(2);
      expect(manager.getState().selectedIndex).toBe(0);

      // Wrap to end when navigating up past 0
      manager.selectIndex(-1);
      expect(manager.getState().selectedIndex).toBe(1);
    });

    it('notifies subscribers on state updates and allows unsubscription', () => {
      const manager = new DriveAISearchManager();
      const subscriber = vi.fn();
      const unsubscribe = manager.subscribe(subscriber);

      manager.setResults(sampleSearchResults);
      expect(subscriber).toHaveBeenCalled();

      subscriber.mockClear();
      unsubscribe();

      manager.selectIndex(1);
      expect(subscriber).not.toHaveBeenCalled();
    });

    it('cleans up resources upon destroy', () => {
      const manager = new DriveAISearchManager({ debounceMs: 500 });
      manager.setQuery('pending query');
      manager.destroy();

      // Ensure no exceptions thrown when timers flush
      vi.runAllTimers();
    });
  });

  // ==========================================================================
  // 2. StorageQuotaManager Unit Tests
  // ==========================================================================
  describe('StorageQuotaManager Headless Controller', () => {
    it('initializes with default 15 GB Free quota', () => {
      const manager = new StorageQuotaManager();
      const state = manager.getState();

      expect(state.quota.tier).toBe('FREE');
      expect(state.quota.limitBytes).toBe(15 * 1024 ** 3);
      expect(state.quota.usedBytes).toBe(0);
      expect(state.quota.percentUsed).toBe(0);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('calculates percentUsed correctly from bytes', () => {
      const total = 100 * 1024 ** 3; // 100 GB
      const used = 45 * 1024 ** 3; // 45 GB

      const manager = new StorageQuotaManager({
        initialQuota: {
          usedBytes: used,
          limitBytes: total,
          tier: 'STANDARD',
        },
      });

      expect(manager.getState().quota.percentUsed).toBe(45);
      expect(manager.getState().quota.tier).toBe('STANDARD');
    });

    it('computes warning threshold status correctly for <80%, 85%, and 95%', () => {
      const limit = 100 * 1024 ** 3;

      // < 80%: Normal
      const normalManager = new StorageQuotaManager({
        initialQuota: {
          usedBytes: 50 * 1024 ** 3,
          limitBytes: limit,
          percentUsed: 50,
        },
      });
      expect(normalManager.getWarningStatus()).toBe('normal');

      const seventyNineManager = new StorageQuotaManager({
        initialQuota: {
          usedBytes: 79 * 1024 ** 3,
          limitBytes: limit,
          percentUsed: 79,
        },
      });
      expect(seventyNineManager.getWarningStatus()).toBe('normal');

      // 80% to 90%: Warning (tested with exact 80%, 85%, 90%)
      const eightyManager = new StorageQuotaManager({
        initialQuota: {
          usedBytes: 80 * 1024 ** 3,
          limitBytes: limit,
          percentUsed: 80,
        },
      });
      expect(eightyManager.getWarningStatus()).toBe('warning');

      const eightyFiveManager = new StorageQuotaManager({
        initialQuota: {
          usedBytes: 85 * 1024 ** 3,
          limitBytes: limit,
          percentUsed: 85,
        },
      });
      expect(eightyFiveManager.getWarningStatus()).toBe('warning');

      const ninetyManager = new StorageQuotaManager({
        initialQuota: {
          usedBytes: 90 * 1024 ** 3,
          limitBytes: limit,
          percentUsed: 90,
        },
      });
      expect(ninetyManager.getWarningStatus()).toBe('warning');

      // > 90%: Critical (tested with 91%, 95%, 100%)
      const ninetyOneManager = new StorageQuotaManager({
        initialQuota: {
          usedBytes: 91 * 1024 ** 3,
          limitBytes: limit,
          percentUsed: 91,
        },
      });
      expect(ninetyOneManager.getWarningStatus()).toBe('critical');

      const ninetyFiveManager = new StorageQuotaManager({
        initialQuota: {
          usedBytes: 95 * 1024 ** 3,
          limitBytes: limit,
          percentUsed: 95,
        },
      });
      expect(ninetyFiveManager.getWarningStatus()).toBe('critical');
    });

    it('formats byte strings and human-readable usage summary', () => {
      const used = 1.5 * 1024 ** 3; // 1.5 GB
      const total = 15 * 1024 ** 3; // 15 GB

      const manager = new StorageQuotaManager({
        initialQuota: {
          usedBytes: used,
          limitBytes: total,
          percentUsed: 10,
        },
      });

      const formatted = manager.getFormattedUsage();
      expect(formatted).toBe('1.5 GB of 15 GB (10%) used');
      expect(formatBytes(used)).toBe('1.5 GB');
      expect(formatBytes(total)).toBe('15 GB');
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(512 * 1024)).toBe('512 KB');
      expect(formatBytes(20 * 1024 ** 2)).toBe('20 MB');
    });

    it('fetches quota from /api/drive/quota via loadQuota()', async () => {
      const mockQuotaPayload = {
        used: 12 * 1024 ** 3,
        total: 15 * 1024 ** 3,
        tier: 'FREE',
        percentUsed: 80,
        breakdown: {
          documents: 5 * 1024 ** 3,
          media: 5 * 1024 ** 3,
          other: 2 * 1024 ** 3,
        },
      };

      const mockApiFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockQuotaPayload,
      });

      const manager = new StorageQuotaManager({
        apiFetch: mockApiFetch as any,
        autoLoad: false,
      });

      const quota = await manager.loadQuota();

      expect(mockApiFetch).toHaveBeenCalledWith('/api/drive/quota');
      expect(quota.usedBytes).toBe(12 * 1024 ** 3);
      expect(quota.limitBytes).toBe(15 * 1024 ** 3);
      expect(quota.percentUsed).toBe(80);
      expect(quota.breakdown?.documents).toBe(5 * 1024 ** 3);
      expect(manager.getWarningStatus()).toBe('warning');
    });

    it('handles loadQuota failure gracefully without unhandled crash', async () => {
      const mockApiFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const manager = new StorageQuotaManager({
        apiFetch: mockApiFetch as any,
      });

      await manager.loadQuota();
      expect(manager.getState().error).toContain('HTTP 500');
    });

    it('updates quota state via setQuota and notifies listeners', () => {
      const manager = new StorageQuotaManager();
      const listener = vi.fn();
      manager.subscribe(listener);

      manager.setQuota({
        usedBytes: 8.5 * 1024 ** 3,
        limitBytes: 10 * 1024 ** 3,
      });

      expect(listener).toHaveBeenCalled();
      expect(manager.getState().quota.percentUsed).toBe(85);
      expect(manager.getWarningStatus()).toBe('warning');
    });
  });

  // ==========================================================================
  // 3. DriveAISearchBar Static HTML Rendering Tests
  // ==========================================================================
  describe('DriveAISearchBar Component Static Rendering', () => {
    it('renders search input with placeholder and semantic toggle pill', () => {
      const onSelectFile = vi.fn();
      const html = renderToStaticMarkup(
        <DriveAISearchBar
          onSelectFile={onSelectFile}
          placeholder="Ask Quanty AI to find file contents..."
        />,
      );

      expect(html).toContain('data-testid="drive-ai-search-container"');
      expect(html).toContain('data-testid="drive-ai-search-input"');
      expect(html).toContain('placeholder="Ask Quanty AI to find file contents..."');
      expect(html).toContain('data-testid="semantic-toggle-pill"');
      expect(html).toContain('AI Content Search');
    });

    it('renders File Name mode when semantic is disabled', () => {
      const manager = new DriveAISearchManager({ initialSemantic: false });
      const html = renderToStaticMarkup(
        <DriveAISearchBar onSelectFile={vi.fn()} manager={manager} />,
      );

      expect(html).toContain('data-testid="semantic-toggle-pill"');
      expect(html).toContain('File Name');
      expect(html).toContain('placeholder="Search files by name..."');
    });

    it('renders popover results with badge, file name, line number, and snippet when populated', () => {
      const manager = new DriveAISearchManager({ initialQuery: 'FastCDC' });
      manager.setResults(sampleSearchResults);

      const html = renderToStaticMarkup(
        <DriveAISearchBar onSelectFile={vi.fn()} manager={manager} />,
      );

      expect(html).toContain('data-testid="drive-ai-search-input"');
      expect(html).toContain('value="FastCDC"');
      expect(html).toContain('data-testid="clear-search-button"');
    });

    it('renders spinner when isSearching is active', () => {
      const manager = new DriveAISearchManager({ initialQuery: 'dedup' });
      // Trigger search which sets isSearching
      void manager.search('dedup');

      const html = renderToStaticMarkup(
        <DriveAISearchBar onSelectFile={vi.fn()} manager={manager} />,
      );

      expect(html).toContain('data-testid="search-spinner"');
    });
  });

  // ==========================================================================
  // 4. StorageQuotaBar Static HTML Rendering Tests
  // ==========================================================================
  describe('StorageQuotaBar Component Static Rendering', () => {
    it('renders normal status (<80%) with segmented progress bar and legend', () => {
      const normalQuota: StorageQuotaData = {
        usedBytes: 1.5 * 1024 ** 3,
        limitBytes: 15 * 1024 ** 3,
        tier: 'FREE',
        percentUsed: 10,
        breakdown: {
          documents: 0.8 * 1024 ** 3,
          media: 0.5 * 1024 ** 3,
          other: 0.2 * 1024 ** 3,
        },
      };

      const html = renderToStaticMarkup(
        <StorageQuotaBar initialQuota={normalQuota} onUpgradeClick={vi.fn()} />,
      );

      expect(html).toContain('data-testid="storage-quota-bar-container"');
      expect(html).toContain('data-testid="quota-text-indicator"');
      expect(html).toContain('1.5 GB of 15 GB (10%) used');
      expect(html).toContain('data-testid="quota-warning-badge"');
      expect(html).toContain('normal');
      expect(html).toContain('data-testid="upgrade-storage-button"');
      expect(html).toContain('data-testid="segmented-progress-bar"');
      expect(html).toContain('data-testid="segment-documents"');
      expect(html).toContain('data-testid="segment-media"');
      expect(html).toContain('data-testid="segment-other"');
      expect(html).toContain('data-testid="quota-breakdown-legend"');
      expect(html).toContain('data-testid="legend-documents-size"');
      expect(html).toContain('data-testid="legend-media-size"');
      expect(html).toContain('data-testid="legend-other-size"');
    });

    it('renders warning banner when quota usage is 85%', () => {
      const warningQuota: StorageQuotaData = {
        usedBytes: 12.75 * 1024 ** 3,
        limitBytes: 15 * 1024 ** 3,
        tier: 'FREE',
        percentUsed: 85,
        breakdown: {
          documents: 6 * 1024 ** 3,
          media: 5 * 1024 ** 3,
          other: 1.75 * 1024 ** 3,
        },
      };

      const html = renderToStaticMarkup(
        <StorageQuotaBar initialQuota={warningQuota} onUpgradeClick={vi.fn()} />,
      );

      expect(html).toContain('12.8 GB of 15 GB (85%) used');
      expect(html).toContain('warning');
      expect(html).toContain('data-testid="warning-threshold-banner"');
      expect(html).toContain('Storage is almost full (85%)');
      expect(html).not.toContain('data-testid="critical-threshold-banner"');
    });

    it('renders critical alert banner when quota usage is 95%', () => {
      const criticalQuota: StorageQuotaData = {
        usedBytes: 14.25 * 1024 ** 3,
        limitBytes: 15 * 1024 ** 3,
        tier: 'STANDARD',
        percentUsed: 95,
        breakdown: {
          documents: 8 * 1024 ** 3,
          media: 5 * 1024 ** 3,
          other: 1.25 * 1024 ** 3,
        },
      };

      const html = renderToStaticMarkup(
        <StorageQuotaBar initialQuota={criticalQuota} onUpgradeClick={vi.fn()} />,
      );

      expect(html).toContain('14.3 GB of 15 GB (95%) used');
      expect(html).toContain('critical');
      expect(html).toContain('data-testid="critical-threshold-banner"');
      expect(html).toContain('Critical: Over 90% of storage used');
      expect(html).not.toContain('data-testid="warning-threshold-banner"');
    });

    it('renders fallback progress segment when breakdown is empty but usage > 0', () => {
      const quotaNoBreakdown: StorageQuotaData = {
        usedBytes: 7.5 * 1024 ** 3,
        limitBytes: 15 * 1024 ** 3,
        tier: 'FREE',
        percentUsed: 50,
        breakdown: { documents: 0, media: 0, other: 0 },
      };

      const html = renderToStaticMarkup(<StorageQuotaBar initialQuota={quotaNoBreakdown} />);

      expect(html).toContain('data-testid="segment-used"');
      expect(html).toContain('width:50%');
    });
  });
});
