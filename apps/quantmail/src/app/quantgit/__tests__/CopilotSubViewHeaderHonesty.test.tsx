// @vitest-environment jsdom
// QM-FIX (fix/qm-quantgit-copilot-fake-copy): the Copilot sub-tab header
// carried fabricated capability copy — a "NODE B AGENT OS" badge (no such
// subsystem exists anywhere in the codebase) and a subtitle advertising
// "Autonomous code intelligence, PR review explanations & automated test
// generation" (no autonomous agent backend exists; PR explanation and
// security audit are honestly unwired per PR #1066). Both are gone: the
// fabricated badge was removed, and the subtitle now claims only what is
// wired (live AI chat) with the honest unwired disclaimer. These tests pin:
//   1. the "NODE B AGENT OS" badge never renders
//   2. the subtitle never advertises autonomous code intelligence /
//      PR review explanations / automated test generation
//   3. the subtitle honestly says PR explanations and security audits
//      aren't wired to a backend yet
//   4. source regression: the fabricated strings are gone from the component
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { QuantGitCopilotSubView } from '../components/QuantGitSubViews';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const authenticatedFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../../../services/browser-auth-session', () => ({
  browserAuthSession: { authenticatedFetch: authenticatedFetchMock },
}));

function renderCopilot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(<QuantGitCopilotSubView />);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('QuantGitCopilotSubView — header copy honesty', () => {
  it('renders the title without the fabricated "NODE B AGENT OS" badge', () => {
    const { container, unmount } = renderCopilot();
    try {
      const header = byTestId(container, 'quantgit-copilot-subview');
      expect(header.textContent).toContain('Quanty AI In-Repo Copilot');
      expect(header.textContent).not.toContain('NODE B AGENT OS');
    } finally {
      unmount();
    }
  });

  it('subtitle claims only wired capabilities — no autonomous-intelligence marketing', () => {
    const { container, unmount } = renderCopilot();
    try {
      const header = byTestId(container, 'quantgit-copilot-subview');
      const text = header.textContent ?? '';
      expect(text).not.toContain('Autonomous code intelligence');
      expect(text).not.toContain('PR review explanations');
      expect(text).not.toContain('automated test generation');
    } finally {
      unmount();
    }
  });

  it('subtitle honestly says PR explanations and security audits are unwired', () => {
    const { container, unmount } = renderCopilot();
    try {
      const header = byTestId(container, 'quantgit-copilot-subview');
      const text = header.textContent ?? '';
      expect(text).toContain("aren't wired to a backend yet");
    } finally {
      unmount();
    }
  });

  it('source regression: fabricated header copy is gone from the component', () => {
    const src = readFileSync(
      path.resolve(__dirname, '../components/QuantGitSubViews.tsx'),
      'utf8',
    );
    expect(src).not.toContain('NODE B AGENT OS');
    expect(src).not.toContain('Autonomous code intelligence');
    expect(src).not.toContain('PR review explanations & automated test generation');
  });
});

function byTestId(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el as HTMLElement;
}
