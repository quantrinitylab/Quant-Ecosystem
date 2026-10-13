// @vitest-environment jsdom
// QM-FIX (fix/qm-quantgit-copilot-fake-ai): the Copilot sub-tab chat was
// canned — handleSend answered ANY query with a fabricated
// "Analyzed workspace query..." reply and the "Generate Test" chip printed a
// fake "// 100% green coverage" snippet, with zero backend calls. Both now go
// through the real POST /api/ai/chat (Fastify /ai/chat); failures produce
// honest errors instead of fabricated analysis. These tests pin:
//   1. Send POSTs {messages, intent, context} to /api/ai/chat
//   2. success renders the backend's message, never the canned reply
//   3. failure renders an honest error, never a fabricated analysis
//   4. the "Generate Test" chip POSTs to the backend (no fake snippet)
//   5. the other chips give honest unavailable replies without backend calls
//   6. source regression: the canned-reply strings are gone from the component
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

function setInputValue(el: HTMLInputElement, value: string) {
  act(() => {
    // React 19 controlled inputs only fire onChange through the native setter.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    setter.call(el, value);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

// Fires a form submit and lets async submit handlers settle inside one act() scope.
async function submitAndFlush(form: HTMLElement) {
  await act(async () => {
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

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

function jsonResponse(payload: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => payload };
}

beforeEach(() => {
  authenticatedFetchMock.mockReset();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('QuantGitCopilotSubView — real /api/ai/chat wiring', () => {
  it('send POSTs {messages, intent, context} to /api/ai/chat', async () => {
    authenticatedFetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: { message: 'Real answer from the model.' } }),
    );
    const { container, unmount } = renderCopilot();
    try {
      const input = container.querySelector(
        'input[aria-label="Ask Quanty"]',
      ) as HTMLInputElement;
      expect(input).toBeTruthy();
      setInputValue(input, 'Explain the repo layout');
      const form = container.querySelector('form');
      expect(form).toBeTruthy();
      await submitAndFlush(form!);

      expect(authenticatedFetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = authenticatedFetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/ai/chat');
      expect(init.method).toBe('POST');
      const body = JSON.parse(String(init.body));
      expect(body.intent).toBe('auto');
      expect(body.context.app).toBe('quantgit');
      const contents = body.messages.map((m: { content: string }) => m.content);
      expect(contents).toContain('Explain the repo layout');
    } finally {
      unmount();
    }
  });

  it('renders the backend answer on success — never the canned reply', async () => {
    authenticatedFetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: { message: 'Real answer from the model.' } }),
    );
    const { container, unmount } = renderCopilot();
    try {
      const input = container.querySelector(
        'input[aria-label="Ask Quanty"]',
      ) as HTMLInputElement;
      setInputValue(input, 'What CI pipelines exist?');
      await submitAndFlush(container.querySelector('form')!);

      const text = container.textContent ?? '';
      expect(text).toContain('Real answer from the model.');
      expect(text).not.toContain('Analyzed workspace query');
      expect(text).not.toContain('monorepo AST nodes');
    } finally {
      unmount();
    }
  });

  it('backend failure shows an honest error — never a fabricated analysis', async () => {
    authenticatedFetchMock.mockResolvedValue(
      jsonResponse(
        {
          success: false,
          error: { message: 'QuantAI is not configured on this environment' },
        },
        false,
        503,
      ),
    );
    const { container, unmount } = renderCopilot();
    try {
      const input = container.querySelector(
        'input[aria-label="Ask Quanty"]',
      ) as HTMLInputElement;
      setInputValue(input, 'Summarize open PRs');
      await submitAndFlush(container.querySelector('form')!);

      const text = container.textContent ?? '';
      expect(text).toContain("Couldn't reach Quanty");
      expect(text).toContain('QuantAI is not configured on this environment');
      expect(text).not.toContain('Analyzed workspace query');
      expect(text).not.toContain('synchronized');
    } finally {
      unmount();
    }
  });

  it('"Generate Test" chip calls the real endpoint — no fake coverage snippet', async () => {
    authenticatedFetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: { message: 'Here is a real test suite.' } }),
    );
    const { container, unmount } = renderCopilot();
    try {
      await clickAndFlush(byTestId(container, 'prompt-chip-Generate-Test'));

      expect(authenticatedFetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(String(authenticatedFetchMock.mock.calls[0][1].body));
      const contents = body.messages.map((m: { content: string }) => m.content);
      expect(contents).toContain(
        'Generate Vitest test suite for ContextBottomNavBar sub-tabs',
      );
      const text = container.textContent ?? '';
      expect(text).toContain('Here is a real test suite.');
      expect(text).not.toContain('100% green coverage');
    } finally {
      unmount();
    }
  });

  it('"Explain a PR" and "Security Audit" chips are honest about being unwired', async () => {
    const { container, unmount } = renderCopilot();
    try {
      await clickAndFlush(byTestId(container, 'prompt-chip-Explain-a-PR'));
      let text = container.textContent ?? '';
      expect(authenticatedFetchMock).not.toHaveBeenCalled();
      expect(text).toContain("isn't wired to a backend");
      expect(text).not.toContain('Analyzed');

      await clickAndFlush(byTestId(container, 'prompt-chip-Security-Audit'));
      text = container.textContent ?? '';
      expect(authenticatedFetchMock).not.toHaveBeenCalled();
      expect(text).toContain("isn't wired to a live scanner");
      expect(text).not.toContain('Analyzed');
    } finally {
      unmount();
    }
  });

  it('source regression: canned replies are gone from the component', () => {
    const src = readFileSync(
      path.resolve(__dirname, '../components/QuantGitSubViews.tsx'),
      'utf8',
    );
    expect(src).not.toContain('Analyzed workspace query');
    expect(src).not.toContain('monorepo AST nodes');
    expect(src).not.toContain('100% green coverage');
    expect(src).not.toContain('context loaded into reasoning buffer');
  });
});
