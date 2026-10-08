import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActionsTab } from '../components/ActionsTab';
import { MCPRegistryTab, OFFICIAL_MCP_CATALOG } from '../components/MCPRegistryTab';
import { formatCommitToast } from '../components/formatCommitToast';

// QM-UIUX-028 — QuantGit must never fabricate repo metadata.
// Regression: empty API data => honest empty states, no invented values.

describe('QM-UIUX-028: QuantGit honesty (no fabricated metadata)', () => {
  describe('ActionsTab with no workflow runs from the API', () => {
    it('renders an honest empty state and invents no runs, SHAs, actors, or timestamps', () => {
      const html = renderToStaticMarkup(
        <ActionsTab actions={[]} handleTriggerWorkflow={vi.fn()} setSelectedActionRun={vi.fn()} />,
      );

      expect(html).toContain('data-testid="workflow-runs-empty"');
      expect(html).toContain('No workflow runs yet');

      // Previously invented sample runs — must never appear from an empty API response.
      expect(html).not.toContain('run-36626');
      expect(html).not.toContain('run-36625');
      expect(html).not.toContain('run-36624');
      expect(html).not.toContain('ai-sdk-factory[bot]');
      expect(html).not.toContain('948e3612');
      expect(html).not.toContain('8910bcae');
      expect(html).not.toContain('417b018e');
      expect(html).not.toContain('3:11 PM');
      // Invented run-count header is gone; real count (0 runs) shown instead.
      expect(html).not.toContain('2,500+');
      expect(html).toContain('(0 runs)');
    });

    it('renders a filter-aware empty state when search excludes all real runs', () => {
      const html = renderToStaticMarkup(
        <ActionsTab
          actions={[
            {
              id: 'run-1',
              name: 'Real CI run',
              workflow: 'CI',
              status: 'success',
              branch: 'main',
              event: 'push',
              commitSha: 'abc12345',
              duration: '30s',
              timeAgo: '5 minutes ago',
              jobs: [],
            },
          ]}
          handleTriggerWorkflow={vi.fn()}
          setSelectedActionRun={vi.fn()}
        />,
      );
      // Sanity: real run renders.
      expect(html).toContain('Real CI run');
      // No invented companions.
      expect(html).not.toContain('run-36626');
      expect(html).not.toContain('ai-sdk-factory[bot]');
    });
    it('commit toast never invents a SHA: shows short SHA only when the backend returned one', () => {
      expect(formatCommitToast('README.md', '948e3612abcdef')).toBe('Committed README.md at 948e3612');
      expect(formatCommitToast('README.md', undefined)).toBe('Committed README.md');
      expect(formatCommitToast('README.md', '')).toBe('Committed README.md');
      expect(formatCommitToast('README.md', null)).toBe('Committed README.md');
    });
  });

  describe('MCP registry honesty', () => {
    it('badge count equals the real catalog length (7) — never a hardcoded 288', () => {
      expect(OFFICIAL_MCP_CATALOG.length).toBe(7);
      const html = renderToStaticMarkup(<MCPRegistryTab />);
      expect(html).toContain('All MCP servers');
      // No inflated count badge anywhere in the tab.
      expect(html).not.toContain('288');
      expect(html).not.toContain('288+');
    });

    it('renders no fabricated install counts', () => {
      const html = renderToStaticMarkup(<MCPRegistryTab />);
      expect(html).not.toContain('installs');
      // Previously hardcoded fake stats — must be gone.
      expect(html).not.toContain('186,715');
      expect(html).not.toContain('52,551');
      expect(html).not.toContain('186715');
    });
  });
});
