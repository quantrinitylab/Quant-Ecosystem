// @vitest-environment jsdom
//
// LevelProgress NaN guard — the profile page rendered "LevelNaN" / "NaN/1000XP"
// when the userinfo fallback identity omitted xpPoints/level (undefined).
// These tests lock in the sanitization: undefined/NaN/Infinity xp falls back
// to 0 XP / Level 1 instead of rendering NaN anywhere.
//
import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LevelProgress } from '../components/profile/LevelProgress';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(ui: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(ui);
  });
  return container.innerHTML;
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

describe('LevelProgress NaN guard', () => {
  it('renders Level 1 / 0 XP when xp is undefined (fallback identity)', () => {
    const html = render(<LevelProgress xp={undefined as unknown as number} />);
    expect(html).not.toContain('NaN');
    expect(html).toContain('Level 1');
    expect(html).toContain('0 / 1000 XP');
  });

  it('renders Level 1 / 0 XP when xp is NaN', () => {
    const html = render(<LevelProgress xp={NaN} />);
    expect(html).not.toContain('NaN');
    expect(html).toContain('Level 1');
  });

  it('ignores a NaN external level and derives it from xp', () => {
    const html = render(<LevelProgress xp={2500} level={NaN} />);
    expect(html).not.toContain('NaN');
    expect(html).toContain('Level 3');
  });

  it('still renders real values for a normal user (2500 XP -> Level 3)', () => {
    const html = render(<LevelProgress xp={2500} level={3} />);
    expect(html).toContain('Level 3');
    expect(html).toContain('500 / 1000 XP');
  });

  it('clamps negative xp to 0 instead of rendering weird progress', () => {
    const html = render(<LevelProgress xp={-50} />);
    expect(html).not.toContain('NaN');
    expect(html).toContain('0 / 1000 XP');
  });
});
