// @vitest-environment jsdom
// ============================================================================
// Shared UI - useFocusTrap Hook Tests
//
// Covers the behaviour eight `aria-modal` surfaces now depend on: where initial
// focus lands, which controls count as focusable, how Tab wraps and re-enters,
// where focus goes on close, and who owns Escape.
//
// jsdom has no layout, so `offsetParent` is null, `getClientRects()` is empty
// and `getComputedStyle(el).position` is `''` for *every* element — which makes
// the hook's visibility filter reject the whole document and would leave these
// tests asserting on an empty focusable set. The stub below stands in for layout
// with the one rule that matters here: an element inside a `display: none`
// subtree has no client rects, everything else has one. That keeps the filter
// under test rather than quietly bypassed.
// ============================================================================

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { useFocusTrap, type UseFocusTrapOptions } from '../useFocusTrap';

const originalGetClientRects = HTMLElement.prototype.getClientRects;

beforeAll(() => {
  HTMLElement.prototype.getClientRects = function getClientRects(this: HTMLElement) {
    for (let node: HTMLElement | null = this; node; node = node.parentElement) {
      if (window.getComputedStyle(node).display === 'none') {
        return [] as unknown as DOMRectList;
      }
    }
    return [{ width: 10, height: 10, top: 0, left: 0 }] as unknown as DOMRectList;
  };
});

afterAll(() => {
  HTMLElement.prototype.getClientRects = originalGetClientRects;
});

afterEach(() => {
  // Testing Library removes its own container; the openers below are appended
  // straight to `body` and would otherwise leak into the next test's queries.
  document.querySelectorAll('body > button').forEach((node) => node.remove());
});

/** A dialog whose trap is driven by the props, standing in for any real surface. */
function Harness({ children, ...options }: UseFocusTrapOptions & { children?: ReactNode }) {
  const ref = useFocusTrap<HTMLDivElement>(options);
  return (
    <div ref={ref} role="dialog" aria-modal="true">
      {children}
    </div>
  );
}

/** The control that "opened" the dialog, so focus restore has a target to prove. */
function mountOpener(): HTMLButtonElement {
  const opener = document.createElement('button');
  opener.textContent = 'Open dialog';
  document.body.appendChild(opener);
  opener.focus();
  return opener;
}

/**
 * Mirrors `Modal` and `CreateGroupModal`: the dialog's DOM only exists while it is
 * open, so anything the trap remembered about the inside of it is gone by the time
 * focus needs restoring.
 */
function UnmountingHarness({
  children,
  ...options
}: UseFocusTrapOptions & { children?: ReactNode }) {
  const ref = useFocusTrap<HTMLDivElement>(options);
  if (!options.active) return null;
  return (
    <div ref={ref} role="dialog" aria-modal="true">
      {children}
    </div>
  );
}

/**
 * The trap listens on `document` in the capture phase, so a key dispatched at any
 * attached node reaches it. The event is returned because `defaultPrevented` is
 * the only observable signal for "the trap claimed this Tab" — jsdom does not
 * implement Tab's native focus move, so an *un*claimed Tab changes nothing.
 */
function press(key: string, options: { shiftKey?: boolean; target?: Element } = {}) {
  const target = options.target ?? document.activeElement ?? document.body;
  const event = new KeyboardEvent('keydown', {
    key,
    shiftKey: options.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

const button = (name: string) => screen.getByRole('button', { name });

describe('useFocusTrap — initial focus', () => {
  it('moves focus to the first focusable child on activate', () => {
    render(
      <Harness active>
        <button>Close</button>
        <input aria-label="Name" />
      </Harness>,
    );

    expect(document.activeElement).toBe(button('Close'));
  });

  it('prefers a `data-autofocus` descendant over DOM order', () => {
    render(
      <Harness active>
        <button>Close</button>
        <input aria-label="Workspace name" data-autofocus />
      </Harness>,
    );

    // The whole point of the marker: a titled dialog's first focusable child is
    // its close button, which is never what the user came here to use.
    expect(document.activeElement).toBe(screen.getByLabelText('Workspace name'));
  });

  it('skips disabled, hidden and non-tabbable controls', () => {
    render(
      <Harness active>
        <button disabled>Disabled</button>
        <input type="hidden" defaultValue="csrf" />
        <div tabIndex={-1}>Programmatic only</div>
        <button tabIndex={-1}>Roving row</button>
        <div style={{ display: 'none' }}>
          <button>Collapsed</button>
        </div>
        <button>Real</button>
      </Harness>,
    );

    expect(document.activeElement).toBe(button('Real'));
  });

  it('parks focus on the container when nothing inside is focusable yet', () => {
    render(
      <Harness active>
        <p>Loading…</p>
      </Harness>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(dialog);
  });

  it('leaves focus alone when autoFocus is false', () => {
    const opener = mountOpener();
    render(
      <Harness active autoFocus={false}>
        <button>Close</button>
      </Harness>,
    );

    expect(document.activeElement).toBe(opener);
  });
});

describe('useFocusTrap — Tab containment', () => {
  it('wraps Tab from the last focusable back to the first', () => {
    render(
      <Harness active>
        <button>First</button>
        <button>Last</button>
      </Harness>,
    );
    button('Last').focus();

    const event = press('Tab');

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button('First'));
  });

  it('wraps Shift+Tab from the first focusable back to the last', () => {
    render(
      <Harness active>
        <button>First</button>
        <button>Last</button>
      </Harness>,
    );

    const event = press('Tab', { shiftKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button('Last'));
  });

  it('leaves Tab alone between two interior controls', () => {
    render(
      <Harness active>
        <button>First</button>
        <button>Middle</button>
        <button>Last</button>
      </Harness>,
    );
    button('Middle').focus();

    // Not preventing default is the assertion — the browser's own Tab handling
    // is what should move focus here, and jsdom has none to observe.
    expect(press('Tab').defaultPrevented).toBe(false);
  });

  it('wraps past rows that have opted out of the tab order', () => {
    // The command palette's shape: a query input plus a listbox whose rows are
    // buttons excluded from the tab order, announced through
    // `aria-activedescendant` instead. They match `button:not([disabled])`, so a
    // selector-only check made the *last row* the wrap target — an element Tab can
    // never reach, so the wrap never fired and Tab left the dialog.
    render(
      <Harness active>
        <input aria-label="Search commands" data-autofocus />
        <button tabIndex={-1}>Row one</button>
        <button tabIndex={-1}>Row two</button>
      </Harness>,
    );
    const input = screen.getByLabelText('Search commands');
    expect(document.activeElement).toBe(input);

    const forward = press('Tab');
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);

    const backward = press('Tab', { shiftKey: true });
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it('re-enters the trap when focus has been parked outside it', () => {
    const opener = mountOpener();
    render(
      <Harness active autoFocus={false}>
        <button>First</button>
        <button>Last</button>
      </Harness>,
    );

    const forward = press('Tab', { target: opener });
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button('First'));

    opener.focus();
    const backward = press('Tab', { shiftKey: true, target: opener });
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button('Last'));
  });
});

describe('useFocusTrap — a changing DOM', () => {
  it('swallows Tab when there is nothing to cycle through', () => {
    render(
      <Harness active>
        <p>Loading…</p>
      </Harness>,
    );

    // Letting this through would walk the page behind an `aria-modal` surface.
    expect(press('Tab').defaultPrevented).toBe(true);
  });

  it('re-reads focusable children on every Tab, not once at activation', () => {
    const { rerender } = render(
      <Harness active>
        <button>First</button>
      </Harness>,
    );
    rerender(
      <Harness active>
        <button>First</button>
        <button>Late</button>
      </Harness>,
    );
    button('Late').focus();

    // Against a set cached at activation, `Late` is neither first nor last, so
    // the wrap would not fire and Tab would leave the dialog.
    const event = press('Tab');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button('First'));
  });
});

describe('useFocusTrap — focus restore', () => {
  it('hands focus back to the opener when the trap deactivates', () => {
    const opener = mountOpener();
    const { rerender } = render(
      <Harness active>
        <button>Close</button>
      </Harness>,
    );
    expect(document.activeElement).toBe(button('Close'));

    rerender(
      <Harness active={false}>
        <button>Close</button>
      </Harness>,
    );

    expect(document.activeElement).toBe(opener);
  });

  it('leaves focus in place when restoreFocus is false', () => {
    mountOpener();
    const { rerender } = render(
      <Harness active restoreFocus={false}>
        <button>Close</button>
      </Harness>,
    );
    const close = button('Close');

    rerender(
      <Harness active={false} restoreFocus={false}>
        <button>Close</button>
      </Harness>,
    );

    expect(document.activeElement).toBe(close);
  });

  it('restores to the opener even when a child claimed focus with React autoFocus', () => {
    const opener = mountOpener();
    const dialog = (active: boolean) => (
      <UnmountingHarness active={active}>
        <button>Close</button>
        <input aria-label="Name" autoFocus data-autofocus />
      </UnmountingHarness>
    );
    const { rerender } = render(dialog(true));
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));

    rerender(dialog(false));

    // React applies `autoFocus` during the commit, so focus was already inside the
    // dialog by the time this hook's effect ran. Reading `document.activeElement`
    // there captured the dialog's own field as the "return here" target — a node
    // that no longer exists on close, so the restore silently did nothing and focus
    // fell to `<body>`. Measured on /workspaces before this was fixed.
    expect(document.activeElement).toBe(opener);
  });

  it('does not chase an opener that has left the DOM', () => {
    const opener = mountOpener();
    const { rerender } = render(
      <Harness active>
        <button>Close</button>
      </Harness>,
    );
    opener.remove();

    expect(() =>
      rerender(
        <Harness active={false}>
          <button>Close</button>
        </Harness>,
      ),
    ).not.toThrow();
    expect(document.activeElement).not.toBe(opener);
  });
});

describe('useFocusTrap — Escape', () => {
  it('calls onEscape and stops the key reaching anything below', () => {
    const onEscape = vi.fn();
    const belowTheTrap = vi.fn();
    render(
      <Harness active onEscape={onEscape}>
        <button>Close</button>
      </Harness>,
    );
    const close = button('Close');
    close.addEventListener('keydown', belowTheTrap);

    press('Escape', { target: close });

    expect(onEscape).toHaveBeenCalledTimes(1);
    // Stopping propagation is what keeps a confirmation dialog from also
    // dismissing the dialog underneath it on one press.
    expect(belowTheTrap).not.toHaveBeenCalled();
  });

  it('leaves Escape to the surface when no onEscape is given', () => {
    const belowTheTrap = vi.fn();
    render(
      <Harness active>
        <button>Close</button>
      </Harness>,
    );
    const close = button('Close');
    close.addEventListener('keydown', belowTheTrap);

    press('Escape', { target: close });

    expect(belowTheTrap).toHaveBeenCalledTimes(1);
  });

  it('takes a new onEscape identity without losing the restore target', () => {
    const opener = mountOpener();
    const stale = vi.fn();
    const fresh = vi.fn();
    const { rerender } = render(
      <Harness active onEscape={stale}>
        <button>Close</button>
      </Harness>,
    );
    rerender(
      <Harness active onEscape={fresh}>
        <button>Close</button>
      </Harness>,
    );

    press('Escape');
    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);

    // The regression this guards: an effect that depended on `onEscape` re-ran on
    // the rerender above and re-captured the "return here" element as the Close
    // button *inside* the dialog, so closing dropped focus into a detached node.
    rerender(
      <Harness active={false} onEscape={fresh}>
        <button>Close</button>
      </Harness>,
    );
    expect(document.activeElement).toBe(opener);
  });
});
