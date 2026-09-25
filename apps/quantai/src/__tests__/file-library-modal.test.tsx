// ============================================================================
// QuantAI — Central File Library Modal Component Tests
// Task W39-A05: 'Upload once, use anytime'
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CentralFileLibraryModal,
  DEFAULT_LIBRARY_FILES,
  type LibraryFileItem,
} from '../components/CentralFileLibraryModal';

describe('CentralFileLibraryModal Component Suite', () => {
  const sampleFiles: LibraryFileItem[] = [
    {
      id: 'f-1',
      name: 'Agent-Blueprint.pdf',
      sizeBytes: 2_400_000,
      mimeType: 'application/pdf',
      category: 'DOCUMENTS',
      sourceChatId: 'chat-alpha',
      attachedChatIds: ['chat-alpha'],
      createdAt: '2026-09-24T10:00:00.000Z',
      lastUsedAt: '2026-09-24T12:00:00.000Z',
      usageCount: 3,
      tags: ['blueprint', 'design'],
    },
    {
      id: 'f-2',
      name: 'strategy-executor.ts',
      sizeBytes: 85_000,
      mimeType: 'text/typescript',
      category: 'CODE',
      sourceChatId: 'chat-dev',
      attachedChatIds: ['chat-dev', 'chat-eval'],
      createdAt: '2026-09-23T15:00:00.000Z',
      lastUsedAt: '2026-09-24T18:00:00.000Z',
      usageCount: 5,
      tags: ['typescript', 'core'],
    },
    {
      id: 'f-3',
      name: 'system-diagram.png',
      sizeBytes: 1_800_000,
      mimeType: 'image/png',
      category: 'MEDIA',
      sourceChatId: 'chat-visual',
      attachedChatIds: ['chat-visual'],
      createdAt: '2026-09-22T09:00:00.000Z',
      lastUsedAt: '2026-09-23T11:00:00.000Z',
      usageCount: 2,
    },
    {
      id: 'f-4',
      name: 'trades_ledger.csv',
      sizeBytes: 8_100_000,
      mimeType: 'text/csv',
      category: 'DATA',
      sourceChatId: 'chat-quant',
      attachedChatIds: ['chat-quant'],
      createdAt: '2026-09-24T08:00:00.000Z',
      lastUsedAt: '2026-09-24T20:00:00.000Z',
      usageCount: 4,
      tags: ['data', 'nasdaq'],
    },
  ];

  describe('1. Visibility & Modal Lifecycle', () => {
    it('returns null and does not render DOM when isOpen is false', () => {
      const html = renderToStaticMarkup(
        React.createElement(CentralFileLibraryModal, {
          isOpen: false,
          onClose: vi.fn(),
        }),
      );
      expect(html).toBe('');
    });

    it('renders modal dialog with header and subtitle when isOpen is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(CentralFileLibraryModal, {
          isOpen: true,
          onClose: vi.fn(),
          initialFiles: sampleFiles,
        }),
      );

      expect(html).toContain('Central File Library');
      expect(html).toContain('Upload once, use anytime');
      expect(html).toContain('Access files across past chats');
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
    });
  });

  describe('2. Category Filter Tabs', () => {
    it('renders all 5 category tabs: All, Documents, Code, Images & Media, Data/CSVs', () => {
      const html = renderToStaticMarkup(
        React.createElement(CentralFileLibraryModal, {
          isOpen: true,
          onClose: vi.fn(),
          initialFiles: sampleFiles,
        }),
      );

      expect(html).toContain('All');
      expect(html).toContain('Documents');
      expect(html).toContain('Code');
      expect(html).toContain('Images &amp; Media');
      expect(html).toContain('Data/CSVs');
    });

    it('displays category counts on tabs accurately', () => {
      const html = renderToStaticMarkup(
        React.createElement(CentralFileLibraryModal, {
          isOpen: true,
          onClose: vi.fn(),
          initialFiles: sampleFiles,
        }),
      );

      // Total count 4
      expect(html).toContain('Showing <strong class="text-zinc-200">4</strong> of 4 library items');
    });
  });

  describe('3. Storage Usage Bar & Stats Widget', () => {
    it('renders storage widget with formatted total size and quota', () => {
      const html = renderToStaticMarkup(
        React.createElement(CentralFileLibraryModal, {
          isOpen: true,
          onClose: vi.fn(),
          initialFiles: sampleFiles,
          storageQuotaBytes: 100 * 1024 * 1024, // 100 MB
        }),
      );

      // Total size: 2.4MB + 85KB + 1.8MB + 8.1MB = 12,385,000 bytes => '11.8 MB' (base 1024)
      expect(html).toContain('4 files • 11.8 MB');
      expect(html).toContain('data-testid="storage-stats-widget"');
      expect(html).toContain('Quota: 100.0 MB');
    });
  });

  describe('4. File Presentation & Metadata', () => {
    it('renders filename, category tag, size, and usage count', () => {
      const html = renderToStaticMarkup(
        React.createElement(CentralFileLibraryModal, {
          isOpen: true,
          onClose: vi.fn(),
          initialFiles: sampleFiles,
        }),
      );

      expect(html).toContain('Agent-Blueprint.pdf');
      expect(html).toContain('strategy-executor.ts');
      expect(html).toContain('system-diagram.png');
      expect(html).toContain('trades_ledger.csv');

      expect(html).toContain('DOCUMENTS');
      expect(html).toContain('CODE');
      expect(html).toContain('MEDIA');
      expect(html).toContain('DATA');

      expect(html).toContain('3 chats');
      expect(html).toContain('5 chats');
    });

    it('renders "Add to chat" action button for every file', () => {
      const html = renderToStaticMarkup(
        React.createElement(CentralFileLibraryModal, {
          isOpen: true,
          onClose: vi.fn(),
          initialFiles: sampleFiles,
        }),
      );

      expect(html).toContain('Add to chat');
      expect(html).toContain('aria-label="Add Agent-Blueprint.pdf to current chat"');
    });
  });

  describe('5. Search Bar & Controls', () => {
    it('renders search input with accessible placeholder and label', () => {
      const html = renderToStaticMarkup(
        React.createElement(CentralFileLibraryModal, {
          isOpen: true,
          onClose: vi.fn(),
          initialFiles: sampleFiles,
        }),
      );

      expect(html).toContain('Search files by name, type, or tag...');
      expect(html).toContain('aria-label="Search files"');
    });

    it('renders View Mode switcher with Grid and List options', () => {
      const html = renderToStaticMarkup(
        React.createElement(CentralFileLibraryModal, {
          isOpen: true,
          onClose: vi.fn(),
          initialFiles: sampleFiles,
        }),
      );

      expect(html).toContain('Grid');
      expect(html).toContain('List');
      expect(html).toContain('aria-label="Grid view"');
      expect(html).toContain('aria-label="List view"');
    });
  });

  describe('6. Empty State Handling', () => {
    it('renders informative empty state when initialFiles is empty', () => {
      const html = renderToStaticMarkup(
        React.createElement(CentralFileLibraryModal, {
          isOpen: true,
          onClose: vi.fn(),
          initialFiles: [],
        }),
      );

      expect(html).toContain('No files match your filter');
      expect(html).toContain('Try searching with a different keyword');
    });
  });

  describe('7. Default Demo Library Fallback', () => {
    it('falls back to DEFAULT_LIBRARY_FILES when initialFiles is omitted', () => {
      const html = renderToStaticMarkup(
        React.createElement(CentralFileLibraryModal, {
          isOpen: true,
          onClose: vi.fn(),
        }),
      );

      expect(DEFAULT_LIBRARY_FILES.length).toBe(8);
      expect(html).toContain('QuantAI-Architecture-v3.pdf');
      expect(html).toContain('market-depth-orderbook.ts');
      expect(html).toContain('nasdaq-ticks-2026-09.csv');
    });
  });
});
