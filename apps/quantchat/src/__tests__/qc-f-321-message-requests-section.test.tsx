// @vitest-environment jsdom
// ============================================================================
// QC-F-321 — MessageRequestsSection (chat-list Requests surface)
// ============================================================================
// Canned-props suite: the component is presentational by contract, so
// every case renders it directly. Pins: real rows render with the real
// sender + first message; an empty list renders NOTHING; an error renders
// an honest strip (never a fake empty state); Accept fires once per
// click; Decline/Block are two-step; Block runs before Decline and a
// failed block suppresses the decline entirely.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import MessageRequestsSection from '../components/MessageRequestsSection';
import type { MessageRequestInboxView } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REQ_1: MessageRequestInboxView = {
  id: 'req_1',
  sender: { id: 'user_s', username: 'stranger', displayName: 'Real Stranger', avatarUrl: null },
  firstMessage: 'salaam, pehla message',
  createdAt: new Date().toISOString(),
};
const REQ_2: MessageRequestInboxView = {
  id: 'req_2',
  sender: { id: 'user_u', username: 'uma', displayName: 'Uma Third', avatarUrl: null },
  firstMessage: 'dusra parichay',
  createdAt: new Date().toISOString(),
};

function makeProps(overrides: Partial<React.ComponentProps<typeof MessageRequestsSection>> = {}) {
  return {
    requests: [REQ_1, REQ_2],
    isLoading: false,
    error: null,
    onAccept: vi.fn(),
    onDecline: vi.fn(),
    onBlock: vi.fn(),
    onRetry: vi.fn(),
    acceptingId: null,
    decliningId: null,
    ...overrides,
  };
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').includes(text),
  ) as HTMLButtonElement | undefined;
}

async function click(el: HTMLButtonElement) {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
}

describe('QC-F-321 MessageRequestsSection', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  async function render(props: ReturnType<typeof makeProps>) {
    await act(async () => {
      root.render(<MessageRequestsSection {...props} />);
    });
  }

  it('U1. rows render the real sender + first message; an empty list renders nothing', async () => {
    await render(makeProps());
    expect(container.textContent).toContain('Real Stranger');
    expect(container.textContent).toContain('salaam, pehla message');
    expect(container.textContent).toContain('Uma Third');
    expect(container.textContent).toContain('dusra parichay');

    await render(makeProps({ requests: [] }));
    expect(container.innerHTML).toBe('');
  });

  it('U2. Accept calls onAccept(id) once; the component itself invents no conversation', async () => {
    const props = makeProps();
    await render(props);
    await click(buttonByText(container, 'Accept')!);
    expect(props.onAccept).toHaveBeenCalledTimes(1);
    expect(props.onAccept).toHaveBeenCalledWith('req_1');
    // No navigation / fabricated conversation UI appears in the section.
    expect(container.textContent).not.toContain('/chat/');
  });

  it('U3. Decline is two-step: Cancel sends nothing, Confirm sends onDecline', async () => {
    const props = makeProps();
    await render(props);
    await click(buttonByText(container, 'Decline')!);
    expect(container.textContent).toContain('Decline this request?');
    expect(props.onDecline).not.toHaveBeenCalled();
    await click(buttonByText(container, 'Cancel')!);
    expect(props.onDecline).not.toHaveBeenCalled();

    await click(buttonByText(container, 'Decline')!);
    await click(buttonByText(container, 'Confirm decline')!);
    expect(props.onDecline).toHaveBeenCalledTimes(1);
    expect(props.onDecline).toHaveBeenCalledWith('req_1');
  });

  it('U4. Block runs FIRST; on its failure onDecline is NOT called and the row shows the error', async () => {
    const order: string[] = [];
    const props = makeProps({
      onBlock: vi.fn(async () => {
        order.push('block');
        throw new Error('blocked endpoint down');
      }),
      onDecline: vi.fn(async () => {
        order.push('decline');
      }),
    });
    await render(props);
    await click(buttonByText(container, 'Block')!);
    await click(buttonByText(container, 'Confirm block')!);
    expect(order).toEqual(['block']);
    expect(props.onDecline).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Could not block this user');

    // Success path: block first, then decline.
    const order2: string[] = [];
    const props2 = makeProps({
      onBlock: vi.fn(async () => {
        order2.push('block');
      }),
      onDecline: vi.fn(async () => {
        order2.push('decline');
      }),
    });
    await render(props2);
    await click(buttonByText(container, 'Block')!);
    await click(buttonByText(container, 'Confirm block')!);
    expect(order2).toEqual(['block', 'decline']);
  });

  it('U5. an error renders the honest strip with Retry — never rows, never a fake empty state', async () => {
    const props = makeProps({ error: new Error('network down') });
    await render(props);
    expect(container.textContent).toContain("Message requests couldn’t load");
    expect(container.textContent).not.toContain('Real Stranger');
    await click(buttonByText(container, 'Retry')!);
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it("U6. while one row's action is in flight, only that row's buttons are disabled", async () => {
    const props = makeProps({ acceptingId: 'req_1' });
    await render(props);
    const rows = container.querySelectorAll('section > div > div');
    expect(rows.length).toBeGreaterThan(0);
    const allButtons = [...container.querySelectorAll('button')];
    const acceptButtons = allButtons.filter((b) => (b.textContent ?? '').trim() === 'Accept');
    expect(acceptButtons).toHaveLength(2);
    expect(acceptButtons[0]!.disabled).toBe(true);
    expect(acceptButtons[1]!.disabled).toBe(false);
  });
});
