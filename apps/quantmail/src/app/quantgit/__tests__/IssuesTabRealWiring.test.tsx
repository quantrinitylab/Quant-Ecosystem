// @vitest-environment jsdom
// QM-FIX (fix/qm-issues-alert-stubs): the IssuesTab "Comment" and "Create
// issue" buttons were native alert() stubs that discarded user input. They now
// post through the real backend handlers injected as props. These tests pin:
//   1. both buttons call the injected real handlers with (id, body) / (title, body)
//   2. success clears the draft; failure NEVER clears the draft and shows an
//      honest inline error (no alert(), no data loss)
//   3. no alert() call exists anywhere in the component source (regression)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { IssuesTab } from '../components/IssuesTab';
import type { IssueItem } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sampleIssue: IssueItem = {
  id: 42,
  title: 'Login button does nothing',
  state: 'open',
  author: 'qa-bot',
  labels: [{ name: 'bug', color: '#D73A4A' }],
  commentsCount: 3,
  createdAt: '2 days ago',
  body: 'Real issue body from the API.',
  assignee: 'dev-1',
};

const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    issueSearchQuery: '',
    setIssueSearchQuery: vi.fn(),
    filteredIssues: [sampleIssue],
    openIssuesCount: 1,
    closedIssuesCount: 0,
    setModalState: vi.fn(),
    openIssueDetail: vi.fn(),
    handleToggleIssue: vi.fn(),
    onCreateIssue: vi.fn().mockResolvedValue({ ok: true }),
    onPostIssueComment: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

function renderTab(props: Record<string, unknown>) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(<IssuesTab {...(props as never)} />);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  act(() => {
    // React 19 controlled inputs only fire onChange through the native setter.
    const proto =
      el instanceof HTMLInputElement
        ? window.HTMLInputElement.prototype
        : window.HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
}

// Fires a click and lets async submit handlers settle inside one act() scope.
async function clickAndFlush(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function byTestId(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el as HTMLElement;
}

afterEach(() => {
  alertSpy.mockClear();
});

describe('IssuesTab real backend wiring (no alert stubs)', () => {
  it('the two data-loss alert() stubs are gone — typed input can no longer be wiped by a native dialog', () => {
    const src = readFileSync(
      path.resolve(process.cwd(), 'src/app/quantgit/components/IssuesTab.tsx'),
      'utf8',
    );
    // The comment-posting stub.
    expect(src).not.toContain("alert('Comment posted!')");
    // The create-issue stub.
    expect(src).not.toContain('alert(`Issue created:');
    // UPDATE (fix/qm-issues-filters): the filter-dropdown stub that used to live
    // at IssuesTab.tsx:478 (`Filter by ${flt}...`) is now real client-side
    // filtering (Author/Label/Assignee/Sort) plus honest disabled
    // Projects/Milestones buttons. Pinned by IssuesTabFilters.test.tsx.
  });

  describe('comment flow', () => {
    it('posts the typed comment through onPostIssueComment with (issueId, body) and clears the draft on success', async () => {
      const onPostIssueComment = vi.fn().mockResolvedValue({ ok: true });
      const { container, unmount } = renderTab(baseProps({ onPostIssueComment }));
      try {
        // Open the inline issue detail.
        click(byTestId(container, 'issue-row-42'));

        const textarea = byTestId(container, 'issue-comment-textarea') as HTMLTextAreaElement;
        setInputValue(textarea, 'This reproduces on the login page too.');
        expect(textarea.value).toBe('This reproduces on the login page too.');

        await clickAndFlush(byTestId(container, 'issue-comment-submit'));

        expect(onPostIssueComment).toHaveBeenCalledTimes(1);
        expect(onPostIssueComment).toHaveBeenCalledWith(42, 'This reproduces on the login page too.');
        expect(alertSpy).not.toHaveBeenCalled();
        // Draft cleared only because the backend confirmed success.
        expect((byTestId(container, 'issue-comment-textarea') as HTMLTextAreaElement).value).toBe(
          '',
        );
        expect(container.querySelector('[data-testid="issue-comment-error"]')).toBeNull();
      } finally {
        unmount();
      }
    });

    it('NEVER wipes the typed comment on failure — shows an honest inline error instead', async () => {
      const onPostIssueComment = vi
        .fn()
        .mockResolvedValue({ ok: false, error: 'Issue not found (410)' });
      const { container, unmount } = renderTab(baseProps({ onPostIssueComment }));
      try {
        click(byTestId(container, 'issue-row-42'));
        const textarea = byTestId(container, 'issue-comment-textarea') as HTMLTextAreaElement;
        setInputValue(textarea, 'Do not lose my words.');
        await clickAndFlush(byTestId(container, 'issue-comment-submit'));

        expect(onPostIssueComment).toHaveBeenCalledTimes(1);
        expect(alertSpy).not.toHaveBeenCalled();
        // The user's text is preserved — the regression was wiping it.
        expect((byTestId(container, 'issue-comment-textarea') as HTMLTextAreaElement).value).toBe(
          'Do not lose my words.',
        );
        // Honest error surfaced inline, no native dialog.
        const err = container.querySelector('[data-testid="issue-comment-error"]');
        expect(err).not.toBeNull();
        expect(err!.textContent).toContain('Issue not found (410)');
      } finally {
        unmount();
      }
    });

    it('does not call the backend for an empty comment', async () => {
      const onPostIssueComment = vi.fn().mockResolvedValue({ ok: true });
      const { container, unmount } = renderTab(baseProps({ onPostIssueComment }));
      try {
        click(byTestId(container, 'issue-row-42'));
        const submit = byTestId(container, 'issue-comment-submit') as HTMLButtonElement;
        // Empty draft keeps the button disabled (nothing to lose).
        expect(submit.disabled).toBe(true);
        await clickAndFlush(submit);
        expect(onPostIssueComment).not.toHaveBeenCalled();
        expect(alertSpy).not.toHaveBeenCalled();
      } finally {
        unmount();
      }
    });
  });
});

describe('IssuesTab create-issue flow (no alert stubs)', () => {
  beforeEach(() => {
    alertSpy.mockClear();
  });

  function openCreateComposer(container: HTMLElement) {
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'New issue',
    );
    if (!btn) throw new Error('missing "New issue" button');
    click(btn);
  }

  it('creates the issue through onCreateIssue with (title, body) and closes the composer on success', async () => {
    const onCreateIssue = vi.fn().mockResolvedValue({ ok: true });
    const { container, unmount } = renderTab(baseProps({ onCreateIssue }));
    try {
      openCreateComposer(container);

      const title = byTestId(container, 'issue-create-title') as HTMLInputElement;
      const body = byTestId(container, 'issue-create-body') as HTMLTextAreaElement;
      setInputValue(title, 'API returns 500 on empty repo');
      setInputValue(body, 'Steps to reproduce: ...');

      await clickAndFlush(byTestId(container, 'issue-create-submit'));

      expect(onCreateIssue).toHaveBeenCalledTimes(1);
      expect(onCreateIssue).toHaveBeenCalledWith('API returns 500 on empty repo', 'Steps to reproduce: ...');
      expect(alertSpy).not.toHaveBeenCalled();
      // Composer closed on success.
      expect(container.querySelector('[data-testid="issue-create-title"]')).toBeNull();
      expect(container.querySelector('[data-testid="issue-create-error"]')).toBeNull();
    } finally {
      unmount();
    }
  });

  it('NEVER wipes the typed title/body on failure — shows an honest inline error instead', async () => {
    const onCreateIssue = vi.fn().mockResolvedValue({ ok: false, error: 'Rate limited, try later' });
    const { container, unmount } = renderTab(baseProps({ onCreateIssue }));
    try {
      openCreateComposer(container);

      const title = byTestId(container, 'issue-create-title') as HTMLInputElement;
      const body = byTestId(container, 'issue-create-body') as HTMLTextAreaElement;
      setInputValue(title, 'My precious title');
      setInputValue(body, 'My precious body');

      await clickAndFlush(byTestId(container, 'issue-create-submit'));

      expect(onCreateIssue).toHaveBeenCalledTimes(1);
      expect(alertSpy).not.toHaveBeenCalled();
      // Composer still open with the user's text intact — the regression wiped it.
      expect((byTestId(container, 'issue-create-title') as HTMLInputElement).value).toBe(
        'My precious title',
      );
      expect((byTestId(container, 'issue-create-body') as HTMLTextAreaElement).value).toBe(
        'My precious body',
      );
      const err = container.querySelector('[data-testid="issue-create-error"]');
      expect(err).not.toBeNull();
      expect(err!.textContent).toContain('Rate limited, try later');
    } finally {
      unmount();
    }
  });

  it('requires a title without calling the backend', async () => {
    const onCreateIssue = vi.fn().mockResolvedValue({ ok: true });
    const { container, unmount } = renderTab(baseProps({ onCreateIssue }));
    try {
      openCreateComposer(container);
      const submit = byTestId(container, 'issue-create-submit') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      await clickAndFlush(submit);
      expect(onCreateIssue).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });
});
