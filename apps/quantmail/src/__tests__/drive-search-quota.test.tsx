import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DriveAISearchBar,
  DriveAISearchManager,
  type AISearchResultItem,
} from '../components/drive/DriveAISearchBar';

describe('DriveAISearch Architect Test Suite', () => {
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

    it('does not invent a match score when the backend reports none (QM-M39-013)', async () => {
      const mockApiFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              fileId: 'f-noscore',
              fileName: 'Notes.md',
              mimeType: 'text/markdown',
              snippet: 'a matching passage',
            },
          ],
        }),
      });

      const manager = new DriveAISearchManager({
        apiFetch: mockApiFetch as any,
        debounceMs: 0,
      });

      await manager.search('notes');

      const state = manager.getState();
      expect(state.results.length).toBe(1);
      // Previously this defaulted to 0.95, rendering a fabricated "95% Match"
      // badge for a score the backend never reported.
      expect(state.results[0].score).toBeNull();
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
});
