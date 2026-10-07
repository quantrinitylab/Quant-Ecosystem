// @vitest-environment jsdom
// ============================================================================
// @quant/shared-ui - BubbleAvatar ("Quanty Ghost") tests
// ============================================================================
//
// These pin the *contract*: the 35-state sheet is complete and derived
// correctly, every QuantSidekick status maps onto a sheet state, and the
// accessible surface (role="img", state-aware label, data-state) renders.
// The ghost is DOM + CSS (no canvas); the mascot img is aria-hidden inside
// the labelled root.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BubbleAvatar, BUBBLE_ORDER, BUBBLE_STATES, STATUS_TO_BUBBLE } from '../BubbleAvatar';

describe('the sheet', () => {
  it('has exactly 35 meaningful states', () => {
    expect(BUBBLE_ORDER).toHaveLength(35);
    expect(new Set(BUBBLE_ORDER).size).toBe(35);
  });

  it('derives its order from the sheet itself (no hand-maintained list)', () => {
    expect(BUBBLE_ORDER).toEqual(Object.keys(BUBBLE_STATES));
  });

  it('gives every state a human label (the accessible-name source)', () => {
    for (const state of BUBBLE_ORDER) {
      expect(BUBBLE_STATES[state].label.length, `${state} label`).toBeGreaterThan(0);
    }
  });

  it('keeps the sheet in the reference order (01 idle … 35 goodbye)', () => {
    expect(BUBBLE_ORDER[0]).toBe('idle');
    expect(BUBBLE_ORDER[34]).toBe('goodbye');
  });
});

describe('the QuantSidekick status mapping', () => {
  it('covers all five canonical statuses', () => {
    expect(Object.keys(STATUS_TO_BUBBLE).sort()).toEqual(
      ['acting', 'idle', 'listening', 'speaking', 'thinking'].sort(),
    );
  });

  it('maps every status onto a real sheet state', () => {
    for (const target of Object.values(STATUS_TO_BUBBLE)) {
      expect(BUBBLE_STATES[target], `target ${target}`).toBeDefined();
    }
  });

  it('does not map distinct statuses onto nothing (no blanks on any mount)', () => {
    const targets = new Set(Object.values(STATUS_TO_BUBBLE));
    expect(targets.size).toBe(Object.keys(STATUS_TO_BUBBLE).length);
  });
});

describe('rendering', () => {
  it('renders an accessible img with a state-aware label and data-state', () => {
    const { rerender } = render(<BubbleAvatar state="idle" />);
    const el = screen.getByTestId('quant-alien-avatar');
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('data-state')).toBe('idle');
    expect(el.getAttribute('aria-label')).toMatch(/idle/i);

    rerender(<BubbleAvatar state="thinking" />);
    expect(el.getAttribute('data-state')).toBe('thinking');
    expect(el.getAttribute('aria-label')).toMatch(/thinking/i);
  });

  it('accepts any of the 35 sheet names as a state', () => {
    for (const state of BUBBLE_ORDER) {
      const { unmount, container } = render(<BubbleAvatar state={state} />);
      expect(container.querySelector('[data-state]')).toBeTruthy();
      unmount();
    }
  });

  it('honours a custom label, tooltip and size', () => {
    render(<BubbleAvatar state="speaking" label="Quant helper" title="Ask Quanty" size={40} />);
    const el = screen.getByLabelText('Quant helper');
    expect(el).toBeTruthy();
    expect(el.getAttribute('title')).toBe('Ask Quanty');
    expect(el.style.width).toBe('40px');
  });

  it('renders the mascot img a11y-hidden inside the labelled root', () => {
    render(<BubbleAvatar state="idle" />);
    const img = document.querySelector('img.qghost-img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('aria-hidden')).toBe('true');
    expect(img?.getAttribute('src')).toMatch(/^data:image\/webp;base64,/);
  });

  it('applies the visual mode class for the state', () => {
    const { container } = render(<BubbleAvatar state="thinking" />);
    expect(container.querySelector('.qghost-mode-thinking')).toBeTruthy();
  });
});
