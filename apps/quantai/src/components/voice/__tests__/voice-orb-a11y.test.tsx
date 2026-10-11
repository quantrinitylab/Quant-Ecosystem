// ============================================================================
// F-050 regression suite: VoiceOrb keyboard operability (a11y)
// The orb is the primary mic/interrupt control — it must be keyboard-operable
// via a native <button> (Tab focus, Enter/Space activation), never a
// mouse-only div with onClick.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
// Enable React 19 act() support in the jsdom test env.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import React from 'react';
import { VoiceOrb } from '../VoiceOrb';
import type { VoiceState } from '../voice-personas';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(props: Partial<React.ComponentProps<typeof VoiceOrb>> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(React.createElement(VoiceOrb, { state: 'idle', ...props }));
  });
  return container;
}

function rerender(props: Partial<React.ComponentProps<typeof VoiceOrb>> = {}) {
  act(() => {
    root!.render(React.createElement(VoiceOrb, { state: 'idle', ...props }));
  });
}

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
});

function getControl(): HTMLButtonElement {
  const el = container!.querySelector('[data-testid="voice-orb-control"]');
  expect(el).not.toBeNull();
  return el as HTMLButtonElement;
}

function getLiveRegion(): HTMLElement {
  const el = container!.querySelector('[data-testid="voice-orb"]');
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

describe('VoiceOrb keyboard operability (F-050)', () => {
  // --------------------------------------------------------------------------
  // 1. Native button semantics (root-cause fix: no mouse-only clickable div)
  // --------------------------------------------------------------------------
  describe('1. Native button semantics', () => {
    it('renders the mic control as a native <button> when onClick is provided', () => {
      mount({ onClick: vi.fn() });
      const control = getControl();
      expect(control.tagName).toBe('BUTTON');
      expect(control.getAttribute('type')).toBe('button');
    });

    it('keeps the click handler off the outer live region', () => {
      mount({ onClick: vi.fn() });
      const region = getLiveRegion();
      expect(region.tagName).toBe('DIV');
      expect(region.getAttribute('role')).toBe('status');
      expect(region.querySelector('button')).not.toBeNull();
    });

    it('is Tab-focusable (default button tab order, no tabindex hacks)', () => {
      mount({ onClick: vi.fn() });
      const control = getControl();
      expect(control.tabIndex).toBe(0);
      control.focus();
      expect(document.activeElement).toBe(control);
    });

    it('does NOT put the outer live region in the tab order (single tab stop)', () => {
      mount({ onClick: vi.fn() });
      const region = getLiveRegion();
      expect(region.tabIndex).toBe(-1);
      expect(region.getAttribute('tabindex')).toBeNull();
    });

    it('exposes a visible focus indicator via focus-visible ring classes', () => {
      mount({ onClick: vi.fn() });
      const cls = getControl().className;
      expect(cls).toContain('focus-visible:ring');
      expect(cls).toContain('focus-visible:outline-none');
    });

    it('falls back to a decorative (non-interactive) orb when no onClick is given', () => {
      mount();
      expect(container!.querySelector('[data-testid="voice-orb-control"]')).toBeNull();
      expect(container!.querySelector('[data-testid="voice-orb-hint"]')).toBeNull();
      const visual = container!.querySelector('[data-testid="voice-orb-visual"]');
      expect(visual).not.toBeNull();
      expect(visual!.tagName).toBe('DIV');
      // live region state announcement still works in decorative mode
      expect(getLiveRegion().getAttribute('role')).toBe('status');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Activation (click + native Enter/Space keyboard activation)
  // --------------------------------------------------------------------------
  describe('2. Activation', () => {
    it('fires onClick on a real DOM click', () => {
      const onClick = vi.fn();
      mount({ onClick });
      getControl().click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('survives rapid toggles: N clicks produce N handler calls', () => {
      const onClick = vi.fn();
      mount({ onClick });
      const control = getControl();
      control.click();
      control.click();
      control.click();
      expect(onClick).toHaveBeenCalledTimes(3);
    });

    it('activates via a bubbling click event (the path native Enter/Space takes)', () => {
      // In a real browser, pressing Enter/Space on a focused native <button>
      // dispatches a click event natively — jsdom does not synthesize that, so
      // we verify the handler is wired to the native click path directly.
      const onClick = vi.fn();
      mount({ onClick });
      const control = getControl();
      control.focus();
      expect(document.activeElement).toBe(control);
      act(() => {
        control.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // 3. State-aware accessible names + keyboard hint (improvement pass)
  // --------------------------------------------------------------------------
  describe('3. Accessible names and keyboard hint', () => {
    const cases: Array<{
      state: VoiceState;
      isMuted?: boolean;
      label: string;
      hint: string;
    }> = [
      { state: 'idle', label: 'Talk to Aura', hint: 'Press Enter or Space to start speaking' },
      {
        state: 'listening',
        label: 'Finish voice turn and send',
        hint: 'Press Enter or Space to finish this voice turn',
      },
      {
        state: 'listening',
        isMuted: true,
        label: 'Stop muted listening session',
        hint: 'Press Enter or Space to finish this voice turn',
      },
      { state: 'thinking', label: 'Talk to Aura', hint: 'Press Enter or Space to start speaking' },
      {
        state: 'speaking',
        label: 'Interrupt Aura',
        hint: 'Press Enter or Space to interrupt Aura immediately',
      },
    ];

    for (const c of cases) {
      it(`names the control "${c.label}" in state=${c.state}${c.isMuted ? ' (muted)' : ''}`, () => {
        mount({ onClick: vi.fn(), state: c.state, isMuted: c.isMuted });
        expect(getControl().getAttribute('aria-label')).toBe(c.label);
      });

      it(`describes keyboard operation for state=${c.state}${c.isMuted ? ' (muted)' : ''}`, () => {
        mount({ onClick: vi.fn(), state: c.state, isMuted: c.isMuted });
        const control = getControl();
        const describedBy = control.getAttribute('aria-describedby');
        expect(describedBy).toBe('voice-orb-hint');
        const hint = container!.querySelector(`#${describedBy}`);
        expect(hint).not.toBeNull();
        expect(hint!.textContent).toContain(c.hint);
        expect(hint!.className).toContain('sr-only');
      });
    }

    it('renames the control when the voice state changes (interrupt while speaking)', () => {
      mount({ onClick: vi.fn(), state: 'idle', personaId: 'vesper' });
      expect(getControl().getAttribute('aria-label')).toBe('Talk to Vesper');
      rerender({ onClick: vi.fn(), state: 'speaking', personaId: 'vesper' });
      expect(getControl().getAttribute('aria-label')).toBe('Interrupt Vesper');
      expect(container!.querySelector('#voice-orb-hint')!.textContent).toContain(
        'interrupt Vesper immediately',
      );
    });
  });

  // --------------------------------------------------------------------------
  // 4. Live region state announcement (unchanged behavior)
  // --------------------------------------------------------------------------
  describe('4. Live region state announcement', () => {
    it('keeps role=status + aria-live=polite and announces state + persona', () => {
      mount({ onClick: vi.fn(), state: 'thinking', personaId: 'zenith' });
      const region = getLiveRegion();
      expect(region.getAttribute('role')).toBe('status');
      expect(region.getAttribute('aria-live')).toBe('polite');
      expect(region.getAttribute('data-state')).toBe('thinking');
      expect(region.getAttribute('data-persona')).toBe('zenith');
      expect(region.getAttribute('aria-label')).toContain('Synthesizing response');
      expect(region.getAttribute('aria-label')).toContain('Persona: Zenith');
    });

    it('updates the live region announcement on state transition', () => {
      mount({ onClick: vi.fn(), state: 'idle' });
      expect(getLiveRegion().getAttribute('aria-label')).toContain('Idle - ready to listen');
      rerender({ onClick: vi.fn(), state: 'listening' });
      expect(getLiveRegion().getAttribute('aria-label')).toContain('Listening to speech');
      expect(getLiveRegion().getAttribute('data-state')).toBe('listening');
    });

    it('announces the muted variant while listening', () => {
      mount({ onClick: vi.fn(), state: 'listening', isMuted: true });
      expect(getLiveRegion().getAttribute('aria-label')).toContain('Muted');
    });
  });
});
