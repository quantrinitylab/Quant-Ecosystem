import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  WorkCanvasPanel,
  type WorkCanvasDocument,
  type WorkspaceMode,
} from '../components/WorkCanvasPanel';

describe('WorkCanvasPanel (Task W39-A01 Parity Suite)', () => {
  const sampleDocument: WorkCanvasDocument = {
    id: 'test-doc-1',
    title: 'Q1 AI Architecture Blueprint',
    type: 'doc',
    content: `# Q1 Architecture Blueprint\n\n## Sovereign QuantAI OS\n- Sub-5ms search\n- Sandboxed execution`,
    language: 'markdown',
    slides: [
      {
        id: 'slide-1',
        title: 'Executive Vision',
        subtitle: '10 Apps in One Unified Account',
        bullets: ['Unified QuantMail Auth', 'QuantAI Control Plane', 'Zero-Fee Economy'],
        notes: 'Speaker notes for executive review.',
        theme: 'dark',
      },
      {
        id: 'slide-2',
        title: 'Performance Benchmarks',
        subtitle: 'Sub-5ms FTS5 and Zero-Egress Storage',
        bullets: ['OPFS Wasm SQLite', 'FastCDC 64KB deduplication', 'gVisor sandbox'],
        notes: 'Compare against Google and Meta.',
        theme: 'neon',
      },
    ],
    sheetData: {
      columns: ['App', 'Parity Score', 'Status'],
      rows: [
        ['QuantMail', '92.0%', 'Active'],
        ['QuantChat', '88.5%', 'Active'],
        ['QuantAI', '95.0%', 'Active'],
      ],
    },
    lastModified: new Date().toISOString(),
    version: 3,
  };

  describe('1. Dual-Mode Workspace Toggle', () => {
    it('renders workspace mode switcher buttons for Chat Mode and Work Mode', () => {
      const onModeChange = vi.fn();
      const html = renderToStaticMarkup(
        React.createElement(WorkCanvasPanel, {
          workspaceMode: 'work',
          onWorkspaceModeChange: onModeChange,
          activeDocument: sampleDocument,
        }),
      );

      expect(html).toContain('Chat Mode');
      expect(html).toContain('Work Mode (Canvas)');
      expect(html).toContain('Workspace Mode Switcher');
    });

    it('renders quick floating Open Work Canvas button in Chat Mode', () => {
      const html = renderToStaticMarkup(
        React.createElement(WorkCanvasPanel, {
          workspaceMode: 'chat',
          onWorkspaceModeChange: vi.fn(),
          activeDocument: sampleDocument,
          children: React.createElement('div', { id: 'chat-body' }, 'Conversational Messages'),
        }),
      );

      expect(html).toContain('Open Work Canvas');
      expect(html).toContain('Conversational Messages');
    });
  });

  describe('2. Split-Screen Resizable Layout & Drag Divider', () => {
    it('renders resizable drag divider with proper ARIA attributes in Work Mode', () => {
      const html = renderToStaticMarkup(
        React.createElement(WorkCanvasPanel, {
          workspaceMode: 'work',
          onWorkspaceModeChange: vi.fn(),
          activeDocument: sampleDocument,
          initialSplitRatio: 45,
        }),
      );

      expect(html).toContain('role="separator"');
      expect(html).toContain('aria-orientation="vertical"');
      expect(html).toContain('aria-label="Resize workspace panes"');
      expect(html).toContain('aria-valuenow="45"');
      expect(html).toContain('cursor-col-resize');
    });

    it('renders quick split ratio presets (Canvas focus, Equal split, Chat focus)', () => {
      const html = renderToStaticMarkup(
        React.createElement(WorkCanvasPanel, {
          workspaceMode: 'work',
          onWorkspaceModeChange: vi.fn(),
          activeDocument: sampleDocument,
        }),
      );

      expect(html).toContain('Canvas focus');
      expect(html).toContain('Equal split');
      expect(html).toContain('Chat focus');
    });
  });

  describe('3. Markdown/Slide/Sheet/Code Live Rendering & Triggers', () => {
    it('renders document markdown content with stats (words, characters, reading time)', () => {
      const html = renderToStaticMarkup(
        React.createElement(WorkCanvasPanel, {
          workspaceMode: 'work',
          onWorkspaceModeChange: vi.fn(),
          activeDocument: sampleDocument,
        }),
      );

      expect(html).toContain('Q1 Architecture Blueprint');
      expect(html).toContain('Sovereign QuantAI OS');
      expect(html).toContain('Words:');
      expect(html).toContain('Characters:');
      expect(html).toContain('Read: ~');
    });

    it('renders the 4 synthesis tabs: Doc, Slide, Sheet, Code', () => {
      const html = renderToStaticMarkup(
        React.createElement(WorkCanvasPanel, {
          workspaceMode: 'work',
          onWorkspaceModeChange: vi.fn(),
          activeDocument: sampleDocument,
        }),
      );

      expect(html).toContain('Doc');
      expect(html).toContain('Slide');
      expect(html).toContain('Sheet');
      expect(html).toContain('Code');
    });

    it('renders Copy, Export, and Run in Sandbox action triggers', () => {
      const html = renderToStaticMarkup(
        React.createElement(WorkCanvasPanel, {
          workspaceMode: 'work',
          onWorkspaceModeChange: vi.fn(),
          activeDocument: sampleDocument,
        }),
      );

      expect(html).toContain('Copy');
      expect(html).toContain('Export');
      expect(html).toContain('Run in Sandbox');
    });

    it('renders slide deck when document type is slide', () => {
      const slideDoc: WorkCanvasDocument = {
        ...sampleDocument,
        type: 'slide',
      };

      const html = renderToStaticMarkup(
        React.createElement(WorkCanvasPanel, {
          workspaceMode: 'work',
          onWorkspaceModeChange: vi.fn(),
          activeDocument: slideDoc,
        }),
      );

      expect(html).toContain('Slide 1 of 2');
      expect(html).toContain('Executive Vision');
      expect(html).toContain('10 Apps in One Unified Account');
      expect(html).toContain('Unified QuantMail Auth');
      expect(html).toContain('Notes');
      expect(html).toContain('Present');
    });

    it('renders interactive spreadsheet table when document type is sheet', () => {
      const sheetDoc: WorkCanvasDocument = {
        ...sampleDocument,
        type: 'sheet',
      };

      const html = renderToStaticMarkup(
        React.createElement(WorkCanvasPanel, {
          workspaceMode: 'work',
          onWorkspaceModeChange: vi.fn(),
          activeDocument: sheetDoc,
        }),
      );

      expect(html).toContain('Parity Score');
      expect(html).toContain('QuantMail');
      expect(html).toContain('QuantChat');
      expect(html).toContain('fx');
      expect(html).toContain('Cell:');
    });
  });

  describe('4. Bi-Directional Assistant Synchronization', () => {
    it('displays animated assistant streaming state when isStreaming is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(WorkCanvasPanel, {
          workspaceMode: 'work',
          onWorkspaceModeChange: vi.fn(),
          activeDocument: sampleDocument,
          isStreaming: true,
        }),
      );

      expect(html).toContain('Assistant Streaming...');
    });

    it('displays synced status badge when not streaming', () => {
      const html = renderToStaticMarkup(
        React.createElement(WorkCanvasPanel, {
          workspaceMode: 'work',
          onWorkspaceModeChange: vi.fn(),
          activeDocument: sampleDocument,
          isStreaming: false,
          syncStatus: 'synced',
        }),
      );

      expect(html).toContain('Synced with Assistant');
    });

    it('renders Push to Chat and Refine with AI bi-directional controls', () => {
      const html = renderToStaticMarkup(
        React.createElement(WorkCanvasPanel, {
          workspaceMode: 'work',
          onWorkspaceModeChange: vi.fn(),
          activeDocument: sampleDocument,
          onSendToChat: vi.fn(),
        }),
      );

      expect(html).toContain('Push to Chat');
      expect(html).toContain('Refine with AI');
    });
  });

  describe('5. WCAG AAA Compliance & Dark Mode Tokens', () => {
    it('applies dark mode background tokens (#0D1117, #161B22) and accessible borders (#30363D)', () => {
      const html = renderToStaticMarkup(
        React.createElement(WorkCanvasPanel, {
          workspaceMode: 'work',
          onWorkspaceModeChange: vi.fn(),
          activeDocument: sampleDocument,
        }),
      );

      // Verify token presence in inline classes or style attributes
      expect(html).toContain('bg-[#0D1117]');
      expect(html).toContain('bg-[#161B22]');
      expect(html).toContain('border-[#30363D]');
      expect(html).toContain('text-[#F0F6FC]');
    });
  });
});
