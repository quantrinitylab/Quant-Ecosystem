import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  QuantGitSubViews,
  QuantGitReposSubView,
  QuantGitPrsSubView,
  QuantGitIssuesSubView,
  QuantGitActionsSubView,
  QuantGitCopilotSubView,
  DEFAULT_SUBVIEW_REPOS,
  DEFAULT_SUBVIEW_PRS,
  DEFAULT_SUBVIEW_ISSUES,
  DEFAULT_SUBVIEW_WORKFLOWS,
  type ContextSubViewTab,
} from '../app/quantgit/components/QuantGitSubViews';

describe('QuantGit Context Sub-Views — Wave 75 ContextBottomNavBar Parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Repositories Sub-View (`repos`)
  // ==========================================================================
  describe('1. Repositories Sub-View (`repos`)', () => {
    it('renders repository cards for quant-ecosystem, quant-kernel, and quant-ai-engine', () => {
      const html = renderToStaticMarkup(<QuantGitReposSubView repos={DEFAULT_SUBVIEW_REPOS} />);

      expect(html).toContain('quant-ecosystem');
      expect(html).toContain('quant-kernel');
      expect(html).toContain('quant-ai-engine');
    });

    it('renders language colored dots for TypeScript, Rust, and Python', () => {
      const html = renderToStaticMarkup(<QuantGitReposSubView repos={DEFAULT_SUBVIEW_REPOS} />);

      // Language names
      expect(html).toContain('TypeScript');
      expect(html).toContain('Rust');
      expect(html).toContain('Python');

      // Language dot colors (#3178C6 for TS, #DEA584 for Rust, #3572A5 for Python)
      expect(html).toContain('background-color:#3178C6');
      expect(html).toContain('background-color:#DEA584');
      expect(html).toContain('background-color:#3572A5');
    });

    it('renders branch pills with main, feat/sovereign, and protected branch badges', () => {
      const html = renderToStaticMarkup(<QuantGitReposSubView repos={DEFAULT_SUBVIEW_REPOS} />);

      expect(html).toContain('main');
      expect(html).toContain('feat/sovereign');
      expect(html).toContain('feat/simd-v2');
      expect(html).toContain('feat/speculative-decoding');

      // Protected branch badge
      expect(html).toContain('Protected');
      expect(html).toContain('data-testid="protected-branch-badge"');
    });

    it('renders star counts for all repository cards', () => {
      const html = renderToStaticMarkup(<QuantGitReposSubView repos={DEFAULT_SUBVIEW_REPOS} />);

      expect(html).toContain('1,420'); // quant-ecosystem
      expect(html).toContain('890');   // quant-kernel
      expect(html).toContain('2,150'); // quant-ai-engine
    });
  });

  // ==========================================================================
  // 2. Pull Requests Dashboard (`prs`)
  // ==========================================================================
  describe('2. Pull Requests Dashboard (`prs`)', () => {
    it('renders PR #347 with status Approved · Ready to Merge', () => {
      const html = renderToStaticMarkup(<QuantGitPrsSubView prs={DEFAULT_SUBVIEW_PRS} />);

      expect(html).toContain('PR #347: Per-App Platform Presence &amp; Super-App Navigation');
      expect(html).toContain('Approved · Ready to Merge');
      expect(html).toContain('@astra-lead');
      expect(html).toContain('feat/super-app-nav');
    });

    it('renders diff stats pill: +420 / -85 lines · 12 files changed', () => {
      const html = renderToStaticMarkup(<QuantGitPrsSubView prs={DEFAULT_SUBVIEW_PRS} />);

      expect(html).toContain('+420');
      expect(html).toContain('-85 lines');
      expect(html).toContain('12 files changed');
    });

    it('renders the [1-Click 3-Way Merge] button', () => {
      const html = renderToStaticMarkup(<QuantGitPrsSubView prs={DEFAULT_SUBVIEW_PRS} />);

      expect(html).toContain('1-Click 3-Way Merge');
    });

    it('renders filter pills for Open, Merged, and Closed PRs', () => {
      const html = renderToStaticMarkup(<QuantGitPrsSubView prs={DEFAULT_SUBVIEW_PRS} />);

      expect(html).toContain('Open (3)');
      expect(html).toContain('Merged (0)');
      expect(html).toContain('Closed (0)');
    });
  });

  // ==========================================================================
  // 3. Sovereign Issue Tracker (`issues`)
  // ==========================================================================
  describe('3. Sovereign Issue Tracker (`issues`)', () => {
    it('renders Issue #89 with P1 High priority and backend, calendar labels', () => {
      const html = renderToStaticMarkup(<QuantGitIssuesSubView issues={DEFAULT_SUBVIEW_ISSUES} />);

      expect(html).toContain('Issue #89: CalDAV recurrence synchronization optimization');
      expect(html).toContain('P1 High');
      expect(html).toContain('backend');
      expect(html).toContain('calendar');
      expect(html).toContain('@linus-dev');
      expect(html).toContain('6'); // comments count
    });

    it('renders filter pills [Open (14)] and [Closed (82)]', () => {
      const html = renderToStaticMarkup(<QuantGitIssuesSubView issues={DEFAULT_SUBVIEW_ISSUES} />);

      expect(html).toContain('Open (14)');
      expect(html).toContain('Closed (82)');
    });

    it('renders additional critical issues including ONNX runtime leak and FastCDC boundaries', () => {
      const html = renderToStaticMarkup(<QuantGitIssuesSubView issues={DEFAULT_SUBVIEW_ISSUES} />);

      expect(html).toContain('Issue #90: Memory leak in ONNX runtime session cleanup');
      expect(html).toContain('P0 Critical');
      expect(html).toContain('Issue #91: FastCDC chunk boundaries alignment with 64KB target');
      expect(html).toContain('P2 Medium');
    });
  });

  // ==========================================================================
  // 4. CI/CD Pipeline Streaming View (`actions`)
  // ==========================================================================
  describe('4. CI/CD Pipeline Streaming View (`actions`)', () => {
    it('renders Master CI Gate on main with 12m 40s duration and commit d7192416', () => {
      const html = renderToStaticMarkup(<QuantGitActionsSubView workflows={DEFAULT_SUBVIEW_WORKFLOWS} />);

      expect(html).toContain('Master CI Gate on main');
      expect(html).toContain('12m 40s');
      expect(html).toContain('d7192416');
      expect(html).toContain('Passed');
      expect(html).toContain('@dev-sentinel');
    });

    it('renders real-time build jobs breakdown (lint, typecheck, vitest: 317/317 pass, build)', () => {
      const html = renderToStaticMarkup(<QuantGitActionsSubView workflows={DEFAULT_SUBVIEW_WORKFLOWS} />);

      expect(html).toContain('Real-Time Build Jobs Breakdown');
      expect(html).toContain('lint: pass');
      expect(html).toContain('1m 15s');
      expect(html).toContain('typecheck: pass');
      expect(html).toContain('2m 45s');
      expect(html).toContain('vitest: 317/317 pass');
      expect(html).toContain('4m 20s');
      expect(html).toContain('build: pass');
    });

    it('renders secondary pipeline runs for Android APK Native Build and E2E Playwright Gate', () => {
      const html = renderToStaticMarkup(<QuantGitActionsSubView workflows={DEFAULT_SUBVIEW_WORKFLOWS} />);

      expect(html).toContain('Android APK Native Build');
      expect(html).toContain('assembleQuantmailDebug: pass');
      expect(html).toContain('4m 11s');
      expect(html).toContain('E2E Playwright Gate');
      expect(html).toContain('e2e: 48/48 pass');
    });
  });

  // ==========================================================================
  // 5. In-Repo Quanty AI Copilot Interactive Panel (`copilot`)
  // ==========================================================================
  describe('5. In-Repo Quanty AI Copilot Interactive Panel (`copilot`)', () => {
    it('renders prompt chips for [Explain PR #347], [Security Audit], [Generate Test]', () => {
      const html = renderToStaticMarkup(<QuantGitCopilotSubView />);

      expect(html).toContain('[Explain PR #347]');
      expect(html).toContain('[Security Audit]');
      expect(html).toContain('[Generate Test]');
      expect(html).toContain('Quanty AI In-Repo Copilot');
      expect(html).toContain('NODE B AGENT OS');
    });

    it('renders dynamic suggestion bubbles container and prompt input bar', () => {
      const html = renderToStaticMarkup(<QuantGitCopilotSubView />);

      expect(html).toContain('Ask Quanty about repositories, PR #347 diffs, or architecture...');
      expect(html).toContain('Send');
      expect(html).toContain('Quanty Assistant Preview');
    });
  });

  // ==========================================================================
  // 6. Master Context Sub-Views Coordinator Synchronization
  // ==========================================================================
  describe('6. Master Sub-Views Container (`QuantGitSubViews`)', () => {
    const tabs: ContextSubViewTab[] = ['repos', 'prs', 'issues', 'actions', 'copilot'];

    tabs.forEach((tab) => {
      it(`renders correctly when tab="${tab}" is active`, () => {
        const html = renderToStaticMarkup(<QuantGitSubViews activeTab={tab} />);

        expect(html).toContain('data-testid="quantgit-subviews-container"');

        if (tab === 'repos') {
          expect(html).toContain('data-testid="quantgit-repos-subview"');
          expect(html).toContain('quant-ecosystem');
        } else if (tab === 'prs') {
          expect(html).toContain('data-testid="quantgit-prs-subview"');
          expect(html).toContain('PR #347');
        } else if (tab === 'issues') {
          expect(html).toContain('data-testid="quantgit-issues-subview"');
          expect(html).toContain('Issue #89');
        } else if (tab === 'actions') {
          expect(html).toContain('data-testid="quantgit-actions-subview"');
          expect(html).toContain('Master CI Gate on main');
        } else if (tab === 'copilot') {
          expect(html).toContain('data-testid="quantgit-copilot-subview"');
          expect(html).toContain('[Explain PR #347]');
        }
      });
    });

    it('defaults to repos subview when activeTab is unspecified', () => {
      const html = renderToStaticMarkup(<QuantGitSubViews />);

      expect(html).toContain('data-testid="quantgit-repos-subview"');
      expect(html).toContain('quant-ecosystem');
    });
  });
});
