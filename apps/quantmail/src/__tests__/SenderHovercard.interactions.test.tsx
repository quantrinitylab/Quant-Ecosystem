// @vitest-environment jsdom
// fix/qm-contacts-sender-hovercard — mobile / keyboard / retry contract.
//
// These tests drive the REAL SenderHovercard in jsdom (no testing-library:
// apps/quantmail has no @testing-library/react dependency and CI installs
// --frozen-lockfile, so createRoot + act + native DOM events, the pattern
// used by PeopleList.test.tsx). The api-client is mocked at the module
// boundary only; the component, its portal, and its fetch-state machine
// are all real.
//
// Negative control: on the pre-fix component these tests fail at exactly
// the contract defects — tap inside a collapsed-button toggles the message
// instead of opening the card, Tab into the card lets the 150ms blur timer
// close it, Escape from the card strands focus on <body>, a failed lookup
// has no Retry, and a stale in-flight lookup paints the previous sender.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SenderHovercard } from '../components/SenderHovercard';
import type { Contact } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const searchMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());

vi.mock('../services/api-client', () => ({
  apiClient: {
    searchContacts: (...args: unknown[]) => searchMock(...args),
    createContact: (...args: unknown[]) => createMock(...args),
  },
}));

function contact(partial: Partial<Contact>): Contact {
  return {
    id: 'c1',
    userId: 'u1',
    email: 'priya@example.com',
    name: 'Priya Sharma',
    company: 'Acme',
    tags: [],
    isFavorite: false,
    source: 'manual',
    syncedApps: [],
    ...partial,
  } as Contact;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render(ui: React.ReactElement): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(ui);
  });
  return host;
}

function rerender(ui: React.ReactElement) {
  act(() => {
    root!.render(ui);
  });
}

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
  }
  root = null;
  host?.remove();
  host = null;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

beforeEach(() => {
  searchMock.mockResolvedValue({ success: true, data: [] });
  createMock.mockResolvedValue({ success: true, data: contact({}) });
});

function triggerEl(container: ParentNode): HTMLElement {
  const el = Array.from(container.querySelectorAll('span')).find(
    (s) => s.textContent === 'Priya Sharma' || s.textContent === 'Bob Jones',
  );
  if (!el) throw new Error('sender trigger span not found');
  return el as HTMLElement;
}

function dialog(): HTMLElement | null {
  return document.querySelector('[role="dialog"]');
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function keydown(el: Element, key: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

async function flush() {
  await act(async () => {
    await sleep(0);
  });
}

function cardProps(over: Record<string, unknown> = {}) {
  return {
    name: 'Priya Sharma',
    email: 'priya@example.com',
    threadSubject: 'Hello',
    onSchedule: vi.fn(),
    ...over,
  };
}

describe('MOBILE — tap, no hover required', () => {
  it('tap on a sender inside the collapsed expand-button opens the card WITHOUT toggling the message', async () => {
    const toggle = vi.fn();
    const container = render(
      <button type="button" onClick={toggle}>
        <SenderHovercard {...cardProps()} keyboardFocusable={false}>
          Priya Sharma
        </SenderHovercard>
      </button>,
    );
    click(triggerEl(container));
    await flush();
    expect(dialog()).not.toBeNull();
    expect(toggle).not.toHaveBeenCalled();
  });

  it('tap-outside (backdrop) dismisses a tap-opened card', async () => {
    const container = render(
      <SenderHovercard {...cardProps()}>Priya Sharma</SenderHovercard>,
    );
    click(triggerEl(container));
    await flush();
    expect(dialog()).not.toBeNull();
    const backdrop = document.querySelector('[aria-label="Dismiss contact card"]');
    expect(backdrop).not.toBeNull();
    click(backdrop!);
    await flush();
    expect(dialog()).toBeNull();
  });

  it('the close control dismisses the card', async () => {
    const container = render(
      <SenderHovercard {...cardProps()}>Priya Sharma</SenderHovercard>,
    );
    click(triggerEl(container));
    await flush();
    expect(dialog()).not.toBeNull();
    const close = document.querySelector('[aria-label="Close contact card"]');
    expect(close).not.toBeNull();
    click(close!);
    await flush();
    expect(dialog()).toBeNull();
  });

  it('the card never renders off-viewport on a small screen: the portal wrapper scrolls instead of overflowing', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 300, configurable: true });
    const container = render(
      <SenderHovercard {...cardProps()}>Priya Sharma</SenderHovercard>,
    );
    const trigger = triggerEl(container);
    // Sender near the bottom-right of a tiny viewport.
    trigger.getBoundingClientRect = () =>
      ({
        left: 300,
        top: 250,
        bottom: 266,
        right: 316,
        width: 16,
        height: 16,
        x: 300,
        y: 250,
        toJSON: () => ({}),
      }) as DOMRect;
    click(trigger);
    await flush();
    const card = dialog();
    expect(card).not.toBeNull();
    const wrapper = card!.parentElement!;
    // Left is clamped inside the viewport and the wrapper caps its own
    // height to the viewport (with scrolling) instead of painting past it.
    expect(parseFloat(wrapper.style.left)).toBeLessThanOrEqual(16);
    expect(wrapper.style.maxHeight).toBe('calc(100vh - 16px)');
    expect(wrapper.style.overflowY).toBe('auto');
  });
});

describe('KEYBOARD — focus, Tab, Escape, focus return', () => {
  it('focus opens the card and Tab into its actions does NOT close it (blur timer cancelled by card focus)', async () => {
    const container = render(
      <SenderHovercard {...cardProps()}>Priya Sharma</SenderHovercard>,
    );
    const trigger = triggerEl(container);
    act(() => {
      trigger.focus();
    });
    await flush();
    expect(dialog()).not.toBeNull();
    const emailAction = dialog()!.querySelector('a');
    expect(emailAction).not.toBeNull();
    act(() => {
      (emailAction as HTMLElement).focus();
    });
    // Past the old 150ms blur-close timer: the card must still be there.
    await act(async () => {
      await sleep(250);
    });
    expect(dialog()).not.toBeNull();
  });

  it('Escape from inside the card closes it AND returns focus to the sender name', async () => {
    const container = render(
      <SenderHovercard {...cardProps()}>Priya Sharma</SenderHovercard>,
    );
    const trigger = triggerEl(container);
    act(() => {
      trigger.focus();
    });
    await flush();
    expect(dialog()).not.toBeNull();
    const emailAction = dialog()!.querySelector('a') as HTMLElement;
    act(() => {
      emailAction.focus();
    });
    await flush();
    keydown(emailAction, 'Escape');
    await flush();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('Enter and Space open the card from the focused sender name', async () => {
    const container = render(
      <SenderHovercard {...cardProps()}>Priya Sharma</SenderHovercard>,
    );
    const trigger = triggerEl(container);
    act(() => {
      trigger.focus();
    });
    await flush();
    expect(dialog()).not.toBeNull();
    // Escape closes and returns focus (focus-open is suppressed once, so
    // the card stays closed and the next key is a genuine open).
    const emailAction = dialog()!.querySelector('a') as HTMLElement;
    act(() => {
      emailAction.focus();
    });
    keydown(emailAction, 'Escape');
    await flush();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger);
    keydown(trigger, 'Enter');
    await flush();
    expect(dialog()).not.toBeNull();
    // Close again, then Space.
    const emailAction2 = dialog()!.querySelector('a') as HTMLElement;
    act(() => {
      emailAction2.focus();
    });
    keydown(emailAction2, 'Escape');
    await flush();
    expect(dialog()).toBeNull();
    keydown(trigger, ' ');
    await flush();
    expect(dialog()).not.toBeNull();
  });

  it('the card actions are real anchors/buttons in DOM order, never divs with onClick', async () => {
    const container = render(
      <SenderHovercard {...cardProps()}>Priya Sharma</SenderHovercard>,
    );
    click(triggerEl(container));
    await flush();
    const card = dialog()!;
    const interactive = Array.from(card.querySelectorAll('a, button:not([disabled])'));
    const labels = interactive.map((el) => (el.textContent ?? '').trim());
    // Labels carry a leading emoji icon span, so match on inclusion.
    const emailIdx = labels.findIndex((l) => l.includes('Email'));
    const scheduleIdx = labels.findIndex((l) => l.includes('Schedule event'));
    const addIdx = labels.findIndex((l) => l.includes('Add to Contacts'));
    expect(emailIdx).toBeGreaterThanOrEqual(0);
    expect(scheduleIdx).toBeGreaterThan(emailIdx);
    expect(addIdx).toBeGreaterThan(scheduleIdx);
    expect(card.querySelectorAll('div[onClick]').length).toBe(0);
    for (const el of interactive) {
      expect(el.tagName === 'A' || el.tagName === 'BUTTON').toBe(true);
    }
  });
});

describe('RETRY — honest failure states, no stale paint, no fake success', () => {
  it('a failed lookup renders an honest retryable error (never "not saved") and Retry re-fetches successfully', async () => {
    searchMock.mockRejectedValueOnce(new Error('offline'));
    searchMock.mockResolvedValueOnce({ success: true, data: [contact({})] });
    const container = render(
      <SenderHovercard {...cardProps()}>Priya Sharma</SenderHovercard>,
    );
    click(triggerEl(container));
    await flush();
    const card = dialog()!;
    expect(card.textContent).toMatch(/couldn/i);
    expect(card.textContent).not.toContain('In your contacts');
    expect(card.textContent).not.toContain('Not in your contacts');
    const retry = Array.from(card.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'Retry',
    );
    expect(retry).toBeDefined();
    click(retry!);
    await flush();
    const cardAfter = dialog()!;
    expect(cardAfter.textContent).toContain('In your contacts');
    expect(cardAfter.textContent).toContain('Acme');
    expect(searchMock).toHaveBeenCalledTimes(2);
  });

  it('a sender switch mid-flight never paints the previous sender preview', async () => {
    let resolveA: ((v: unknown) => void) | null = null;
    searchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve;
        }),
    );
    searchMock.mockResolvedValue({ success: true, data: [contact({ id: 'cB', email: 'bob@example.com', name: 'Bob Jones', company: 'Beta' })] });
    const container = render(
      <SenderHovercard {...cardProps()}>Priya Sharma</SenderHovercard>,
    );
    click(triggerEl(container));
    await flush();
    expect(searchMock).toHaveBeenCalledTimes(1);
    // Same mounted card instance, sender swapped while A's lookup is in flight.
    rerender(
      <SenderHovercard {...cardProps({ name: 'Bob Jones', email: 'bob@example.com' })}>
        Bob Jones
      </SenderHovercard>,
    );
    await flush();
    expect(searchMock).toHaveBeenCalledTimes(2);
    // The stale A completion arrives late: it must be ignored.
    await act(async () => {
      resolveA!({ success: true, data: [contact({ company: 'Acme' })] });
      await sleep(0);
    });
    const card = dialog()!;
    expect(card.textContent).not.toContain('Acme');
    expect(card.textContent).toContain('Beta');
  });

  it('a failed Add to Contacts shows an honest error, never flips to "In your contacts", never sticks on "Adding…"', async () => {
    createMock.mockRejectedValueOnce(new Error('contacts service down'));
    const container = render(
      <SenderHovercard {...cardProps()}>Priya Sharma</SenderHovercard>,
    );
    click(triggerEl(container));
    await flush();
    const add = Array.from(dialog()!.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').includes('Add to Contacts'),
    );
    expect(add).toBeDefined();
    click(add!);
    await flush();
    const card = dialog()!;
    expect(card.textContent).toMatch(/contacts service down|Couldn/);
    expect(card.textContent).not.toContain('In your contacts');
    expect(card.textContent).toContain('Add to Contacts');
    expect(card.textContent).not.toContain('Adding…');
  });

  it('Email and Schedule actions stay usable when the contact lookup fails', async () => {
    searchMock.mockRejectedValueOnce(new Error('offline'));
    const container = render(
      <SenderHovercard {...cardProps()}>Priya Sharma</SenderHovercard>,
    );
    click(triggerEl(container));
    await flush();
    const card = dialog()!;
    const emailLink = card.querySelector('a[href^="/compose?"]');
    expect(emailLink).not.toBeNull();
    const schedule = Array.from(card.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').includes('Schedule event'),
    );
    expect(schedule).toBeDefined();
    expect((schedule as HTMLButtonElement).disabled).toBe(false);
  });
});
