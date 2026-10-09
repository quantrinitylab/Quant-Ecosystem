// @vitest-environment jsdom
// ============================================================================
// QM-UIUX-088 — AIAssistant honest error states regression tests
// ============================================================================
//
// On the original code, AIAssistant silently swallowed every AI failure: a
// failed chat left no trace, a failed translation did nothing, and failed
// smart replies left the misleading "No suggestions available" text in
// place. These tests FAIL on the original component and PASS on the fix:
// each surface shows the sanitized real failure with a working Retry, and
// the honest empty state only appears when the call actually succeeded.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  chatWithAI: vi.fn(),
  translateMessage: vi.fn(),
  getSmartReplies: vi.fn(),
}));

vi.mock('../services/api-client', () => ({
  apiClient: {
    chatWithAI: apiMocks.chatWithAI,
    translateMessage: apiMocks.translateMessage,
    getSmartReplies: apiMocks.getSmartReplies,
  },
}));

import { AIAssistant } from '../components/AIAssistant';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flush() {
  await act(async () => {
    await flushPromises();
  });
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function buttonByText(scope: ParentNode, text: string): HTMLButtonElement {
  const btn = Array.from(scope.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(text),
  );
  if (!btn) throw new Error(`button not found: ${text}`);
  return btn as HTMLButtonElement;
}

describe('AIAssistant error honesty (QM-UIUX-088)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    apiMocks.getSmartReplies.mockResolvedValue({ success: true, data: [] });
    apiMocks.chatWithAI.mockResolvedValue({ success: true, data: { response: 'hi there' } });
    apiMocks.translateMessage.mockResolvedValue({
      success: true,
      data: { translatedText: 'hola' },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(props: Partial<React.ComponentProps<typeof AIAssistant>> = {}) {
    act(() => {
      root.render(<AIAssistant isOpen onClose={() => {}} {...props} />);
    });
  }

  it('shows the real chat failure with a Retry that resends the failed prompt', async () => {
    apiMocks.chatWithAI
      .mockResolvedValueOnce({
        success: false,
        error: { code: 'TIMEOUT', message: 'Request timed out. Please try again.', statusCode: 0 },
      })
      .mockResolvedValueOnce({ success: true, data: { response: 'recovered answer' } });
    render();

    const input = container.querySelector<HTMLInputElement>('.ai-input input')!;
    setValue(input, 'hello ai');
    click(buttonByText(container, 'Send'));
    await flush();

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain('timed out');
    // The failed exchange must not fabricate an assistant reply.
    expect(container.textContent).not.toContain('recovered answer');

    click(buttonByText(alert!.parentElement ?? container, 'Retry'));
    await flush();

    expect(apiMocks.chatWithAI).toHaveBeenCalledTimes(2);
    expect(apiMocks.chatWithAI.mock.calls[1]![0]).toBe('hello ai');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('recovered answer');
  });

  it('never leaks URLs/IPs from a failed chat error into the UI', async () => {
    apiMocks.chatWithAI.mockResolvedValue({
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'POST http://10.1.2.3:9000/ai failed: Bearer abcdef1234567890XYZ',
        statusCode: 0,
      },
    });
    render();

    const input = container.querySelector<HTMLInputElement>('.ai-input input')!;
    setValue(input, 'hello ai');
    click(buttonByText(container, 'Send'));
    await flush();

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).not.toContain('10.1.2.3');
    expect(alert!.textContent).not.toContain('http://');
    expect(alert!.textContent).not.toContain('abcdef1234567890XYZ');
  });

  it('shows the real translation failure with a Retry', async () => {
    apiMocks.translateMessage
      .mockResolvedValueOnce({
        success: false,
        error: { code: 'NETWORK_ERROR', message: 'Failed to fetch', statusCode: 0 },
      })
      .mockResolvedValueOnce({ success: true, data: { translatedText: 'hola' } });
    render();

    click(buttonByText(container, 'Translate'));
    const textarea = container.querySelector<HTMLTextAreaElement>('.ai-translate textarea')!;
    setValue(textarea, 'hello');
    click(buttonByText(container.querySelector('.ai-translate')!, 'Translate'));
    await flush();

    const alert = container.querySelector('.ai-translate [role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain('unreachable');

    click(buttonByText(alert!.parentElement ?? container, 'Retry'));
    await flush();
    expect(apiMocks.translateMessage).toHaveBeenCalledTimes(2);
    expect(container.querySelector('.ai-translate [role="alert"]')).toBeNull();
    expect(container.textContent).toContain('hola');
  });

  it('shows the real smart-replies failure instead of the misleading empty text', async () => {
    apiMocks.getSmartReplies.mockResolvedValue({
      success: false,
      error: { code: 'TIMEOUT', message: 'Request timed out. Please try again.', statusCode: 0 },
    });
    render({ contextMessage: 'lunch tomorrow?' });
    await flush();

    click(buttonByText(container, 'Replies'));
    const alert = container.querySelector('.ai-replies [role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain('timed out');
    expect(container.querySelector('.ai-replies')!.textContent).not.toContain(
      'No suggestions available',
    );
  });

  it('keeps the honest empty state when smart replies succeed with none', async () => {
    apiMocks.getSmartReplies.mockResolvedValue({ success: true, data: [] });
    render({ contextMessage: 'lunch tomorrow?' });
    await flush();

    click(buttonByText(container, 'Replies'));
    expect(container.querySelector('.ai-replies [role="alert"]')).toBeNull();
    expect(container.querySelector('.ai-replies')!.textContent).toContain(
      'No suggestions available',
    );
  });
});
