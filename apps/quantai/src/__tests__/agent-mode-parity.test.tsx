import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TOOL_ICONS } from '../types/tool-calls';
import type { CanvasArtifact } from '../types/agent-mode';
import { parseMarkdownTable, splitMarkdownSlides } from '../lib/workspace-artifacts';

// Mock framer-motion for SSR rendering
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
    span: ({ children, ...props }: any) => React.createElement('span', props, children),
    svg: ({ children, ...props }: any) => React.createElement('svg', props, children),
    p: ({ children, ...props }: any) => React.createElement('p', props, children),
  },
  AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
  useReducedMotion: () => false,
}));

const { OnboardingHero } = await import('../components/OnboardingHero');
const { AgentCodeTerminal } = await import('../components/AgentCodeTerminal');
const { CanvasArtifactsPanel } = await import('../components/CanvasArtifactsPanel');
const { WorkCanvasPanel } = await import('../components/WorkCanvasPanel');

describe('QuantAI Claude Code + Codex + ChatGPT Parity Suites', () => {
  describe('OnboardingHero', () => {
    it('renders onboarding hero with Quant branding and feature grid', () => {
      const onSSO = vi.fn();
      const onGuest = vi.fn();

      const html = renderToStaticMarkup(
        React.createElement(OnboardingHero, {
          onContinueQuantSSO: onSSO,
          onContinueAsGuest: onGuest,
        }),
      );

      expect(html).toContain('QUANT INTELLIGENCE CONTROL PLANE');
      expect(html).toContain('Meet');
      expect(html).toContain('Quanty');
      expect(html).toContain('Continue with Quant Account');
      expect(html).toContain('Continue as Guest');
      expect(html).toContain('Chat Mode');
      expect(html).toContain('Agent &amp; Code Mode');
      expect(html).toContain('Split-Screen Canvas');
      expect(html).toContain('Cross-App MCP Bridge');
    });
  });

  describe('AgentCodeTerminal', () => {
    it('renders interactive dark terminal with prompt quanty@agent:~$', () => {
      const html = renderToStaticMarkup(
        React.createElement(AgentCodeTerminal, {
          currentModelName: 'Claude 3.5 Sonnet / Codex',
        }),
      );

      expect(html).toContain('quanty@agent:~$');
      expect(html).toContain('Claude 3.5 Sonnet / Codex');
      expect(html).toContain('QUANTY AUTONOMOUS AGENTIC OS');
      expect(html).toContain('/run');
      expect(html).toContain('/build');
      expect(html).toContain('/test');
      expect(html).toContain('/git');
    });

    it('renders multi-step execution tree with tools and reasoning', () => {
      const html = renderToStaticMarkup(
        React.createElement(AgentCodeTerminal, {
          currentModelName: 'GPT-4o',
        }),
      );

      expect(html).toContain('Real-Time Reasoning &amp; Architecture Plan');
      expect(html).toContain('Goal:');
      expect(html).toContain('read_file');
      expect(html).toContain('bash');
    });
  });

  describe('CanvasArtifactsPanel', () => {
    const sampleArtifact: CanvasArtifact = {
      id: 'art-1',
      title: 'Counter Component',
      type: 'component',
      language: 'typescript',
      code: 'export function Counter() { return <button>Click me</button>; }',
      previewHtml: '<div><h1>Preview</h1></div>',
      markdown: '# Counter Component\nInteractive counter widget',
      createdAt: new Date().toISOString(),
    };

    it('renders tabs: Preview, Code, and Markdown', () => {
      const html = renderToStaticMarkup(
        React.createElement(CanvasArtifactsPanel, {
          artifact: sampleArtifact,
          onClose: vi.fn(),
        }),
      );

      expect(html).toContain('Counter Component');
      expect(html).toContain('Preview');
      expect(html).toContain('Code');
      expect(html).toContain('Markdown');
      expect(html).toContain('Viewport:');
      expect(html).toContain('Desktop');
      expect(html).toContain('Tablet');
      expect(html).toContain('Mobile');
    });

    it('renders empty state when no artifact is provided', () => {
      const html = renderToStaticMarkup(
        React.createElement(CanvasArtifactsPanel, {
          artifact: null,
          onClose: vi.fn(),
        }),
      );

      expect(html).toContain('No Artifact Selected');
    });
  });

  describe('WorkCanvasPanel', () => {
    it('renders the document, slides, and sheet format controls', () => {
      const html = renderToStaticMarkup(
        React.createElement(WorkCanvasPanel, {
          content: '## Slide 1 — Overview\n\n- First point\n- Second point',
          title: 'Product overview',
          format: 'slides',
          isGenerating: false,
          onFormatChange: vi.fn(),
          onClose: vi.fn(),
        }),
      );

      expect(html).toContain('Work canvas');
      expect(html).toContain('Document');
      expect(html).toContain('Slides');
      expect(html).toContain('Sheet');
      expect(html).toContain('Slide 1 — Overview');
      expect(html).toContain('First point');
    });

    it('shows a useful empty state before the first Work response', () => {
      const html = renderToStaticMarkup(
        React.createElement(WorkCanvasPanel, {
          content: null,
          title: null,
          format: 'document',
          isGenerating: false,
          onFormatChange: vi.fn(),
          onClose: vi.fn(),
        }),
      );

      expect(html).toContain('Your document will appear here');
      expect(html).toContain('conversation stays beside it');
    });
  });

  describe('Work artifact parsers', () => {
    it('parses Markdown tables without rendering assistant text as HTML', () => {
      expect(parseMarkdownTable('| Item | Count |\n| --- | --- |\n| A | 2 |')).toEqual({
        headers: ['Item', 'Count'],
        rows: [['A', '2']],
      });
    });

    it('splits slide output on Markdown headings', () => {
      expect(
        splitMarkdownSlides('## Slide 1 — Intro\n\nHello\n\n## Slide 2 — Plan\n\nNext'),
      ).toEqual([
        { title: 'Slide 1 — Intro', content: 'Hello' },
        { title: 'Slide 2 — Plan', content: 'Next' },
      ]);
    });
  });

  describe('TOOL_ICONS Cross-App MCP Registration', () => {
    it('registers all required cross-app and agentic coding tools', () => {
      expect(TOOL_ICONS.read_file).toBe('📄');
      expect(TOOL_ICONS.write_file).toBe('✏️');
      expect(TOOL_ICONS.bash).toBe('💻');
      expect(TOOL_ICONS.diff).toBe('🔀');
      expect(TOOL_ICONS.git).toBe('🌿');
      expect(TOOL_ICONS.test).toBe('🧪');
      expect(TOOL_ICONS.quantmail_search).toBe('📧');
      expect(TOOL_ICONS.quantdrive_upload).toBe('📁');
      expect(TOOL_ICONS.quantcalendar_event).toBe('📅');
      expect(TOOL_ICONS.quantchat_message).toBe('💬');
      expect(TOOL_ICONS.mcp).toBe('🔌');
    });
  });
});
