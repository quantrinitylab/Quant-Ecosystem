/**
 * Drive Vault E2EE honesty tests.
 *
 * Regression suite for the false "E2EE / Vault (AES-256 E2EE)" security claims
 * that shipped on Drive Vault surfaces while the codebase itself admitted no
 * client-side encryption exists. Every user-facing Vault/Drive surface must be
 * free of E2EE / AES-256 claims until real client-side encryption ships.
 *
 * Rule: a false security badge is trust-breaking — worse than no badge at all.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// next/navigation is not mounted in the test renderer; the pillar
// top-bar reads it via hooks.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

import { PILLAR_SUB_CONFIGS } from '../components/desktopContextTabs';
import {
  DriveMobileTabStrip,
  DriveVaultSubView,
} from '../app/drive/components';
import { QuantPillarTopBar } from '../components/QuantPillarTopBar';
import { PostcardCanvas } from '../components/postcard/PostcardCanvas';
import { DEFAULT_VINTAGE_PRESETS } from '../types/postcard';

// Strings that must never appear in user-facing copy on the Vault/Drive surface
// while client-side encryption does not exist.
const FORBIDDEN_CLAIMS = ['E2EE', 'AES-256', 'AES 256'];

function assertNoFalseEncryptionClaims(surface: string, html: string) {
  for (const claim of FORBIDDEN_CLAIMS) {
    expect(
      html,
      `${surface} shows a false "${claim}" security claim`,
    ).not.toContain(claim);
  }
}

describe('Drive Vault E2EE honesty', () => {
  it('desktop context tab config: Vault tab has no E2EE/AES badge or label', () => {
    const driveConfig = PILLAR_SUB_CONFIGS.drive;
    expect(driveConfig).toBeDefined();
    for (const tab of driveConfig.tabs) {
      const copy = `${tab.badgeText ?? ''} ${tab.ariaLabel ?? ''} ${tab.label ?? ''}`;
      for (const claim of FORBIDDEN_CLAIMS) {
        expect(
          copy,
          `drive context tab "${tab.id}" carries a false "${claim}" claim`,
        ).not.toContain(claim);
      }
    }
    const vaultTab = driveConfig.tabs.find((t) => t.id === 'vault');
    expect(vaultTab?.badgeText).toBeUndefined();
  });

vi.mock('framer-motion', () => {
  // framer-motion-only props must not reach the DOM as unknown attributes.
  const STRIP = new Set([
    'initial', 'animate', 'exit', 'transition', 'variants', 'layout', 'layoutId',
    'whileHover', 'whileTap', 'whileInView', 'whileFocus', 'whileDrag', 'drag',
    'dragConstraints', 'dragElastic', 'dragMomentum', 'onAnimationStart',
    'onAnimationComplete', 'onHoverStart', 'onHoverEnd', 'onTap', 'onPan',
    'onDragEnd', 'onDragStart', 'onViewportEnter', 'onViewportLeave',
  ]);
  const toPlain =
    (tag: string) =>
    ({ children, ...rest }: { children?: React.ReactNode; [k: string]: unknown }) => {
      const domProps: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (!STRIP.has(k)) domProps[k] = v;
      }
      return React.createElement(tag, domProps, children);
    };
  // The Proxy `get` trap fires on EVERY `motion.div` access — on every
  // render. Without a cache, each access returned a FRESH component
  // function, so React saw a different component identity at the same tree
  // position on every render and entered an unmount/remount loop: the
  // hang+OOM signature of gate job 114188075863 (run 38043411872 — FATAL
  // ERROR at 8 GB, Duration 785.97s, tests 0ms). Cache per tag so the
  // identity is stable across renders, exactly like real `motion.div`.
  const tagCache = new Map<string, ReturnType<typeof toPlain>>();
  const motionProxy = new Proxy(
    {},
    {
      get: (_t, tag) => {
        if (typeof tag !== 'string') return undefined;
        let Comp = tagCache.get(tag);
        if (!Comp) {
          Comp = toPlain(tag);
          tagCache.set(tag, Comp);
        }
        return Comp;
      },
    },
  );
  const noopMotionValue = (v: unknown) => ({
    get: () => v,
    set: () => {},
    on: () => () => {},
  });
  return {
    motion: motionProxy,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useReducedMotion: () => true,
    useAnimation: () => ({
      start: () => Promise.resolve(),
      stop: () => {},
      set: () => {},
    }),
    useMotionValue: noopMotionValue,
    useTransform: () => noopMotionValue(0),
    useSpring: (v: unknown) => v,
    animate: () => ({ stop: () => {} }),
  };
});


  it('DriveMobileTabStrip: vault pill shows no security badge', () => {
    const html = renderToStaticMarkup(
      <DriveMobileTabStrip activeTab="vault" onTabChange={() => {}} />,
    );
    assertNoFalseEncryptionClaims('DriveMobileTabStrip', html);
    expect(html).toContain('Vault');
  });

  it('QuantPillarTopBar drive lenses: no E2EE/AES badge on the Vault lens', () => {
    const html = renderToStaticMarkup(
      <QuantPillarTopBar activePillarOverride="drive" hideLensStrip={false} />,
    );
    assertNoFalseEncryptionClaims('QuantPillarTopBar (drive)', html);
    expect(html).toContain('Vault');
  });

  // NOTE: the QuantMailSuperAppHeader case that used to sit here was removed
  // with the component itself (dead code: no production surface mounted it;
  // the live header is QuantPillarTopBar, covered by the case above).
  it('DriveVaultSubView: honest "not available yet" copy, no encryption claims', () => {
    const html = renderToStaticMarkup(<DriveVaultSubView />);
    assertNoFalseEncryptionClaims('DriveVaultSubView', html);
    expect(html).toContain('Client-side encryption is not available yet');
  });

  it('PostcardCanvas: no "E2EE VERIFIED" security-theater seal', () => {
    const template = DEFAULT_VINTAGE_PRESETS[0];
    expect(template).toBeDefined();
    const html = renderToStaticMarkup(<PostcardCanvas template={template} />);
    assertNoFalseEncryptionClaims('PostcardCanvas', html);
    expect(html).not.toContain('E2EE VERIFIED');
  });
});
