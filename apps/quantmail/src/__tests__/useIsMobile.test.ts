// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { MOBILE_BREAKPOINT_PX, mobileMediaQuery } from '../hooks/useIsMobile';

/**
 * Mobile single-pane inbox: the JS breakpoint must agree with the CSS
 * breakpoint in shell.css (`@media (max-width: 899px)`).
 *
 * Below 900px CSS hides the reading pane and JS navigates taps to the
 * full-screen `/thread/:id` route. If the two drift, taps either open an
 * invisible pane or navigate away while the two-pane layout is visible.
 */
describe('mobile breakpoint contract', () => {
  it('MOBILE_BREAKPOINT_PX is 900', () => {
    expect(MOBILE_BREAKPOINT_PX).toBe(900);
  });

  it('mobileMediaQuery() builds (max-width: 899px) by default', () => {
    expect(mobileMediaQuery()).toBe('(max-width: 899px)');
  });

  it('mobileMediaQuery() honours a custom breakpoint', () => {
    expect(mobileMediaQuery(640)).toBe('(max-width: 639px)');
    expect(mobileMediaQuery(768)).toBe('(max-width: 767px)');
  });

  it('the query is one pixel below the breakpoint, mirroring the CSS rule', () => {
    // CSS: @media (max-width: 899px)  ⟺  JS: (max-width: 899px)
    // i.e. everything BELOW 900px is "mobile" in both worlds.
    const cssMaxWidth = 899;
    expect(MOBILE_BREAKPOINT_PX - 1).toBe(cssMaxWidth);
    expect(mobileMediaQuery()).toBe(`(max-width: ${cssMaxWidth}px)`);
  });
});
