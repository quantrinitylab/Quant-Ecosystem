import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OfflineBar } from '../OfflineBar';
import { InboxToastContainer } from '../InboxToast';

/**
 * QM perf finding (2026-10-12): the root layout renders <OfflineBar /> and
 * <InboxToastContainer /> unconditionally on EVERY route — including public
 * /login — and both imported `framer-motion`, dragging the ~114KB animation
 * runtime into the shared layout chunk for all routes.
 *
 * Fix: both components now animate with zero-JS CSS @keyframes. These tests
 * prove the finding stays fixed:
 *  1. Neither component source imports framer-motion (static guarantee that
 *     no framer-motion module is reachable from the root layout through them).
 *  2. The replacement CSS keyframes/classes exist in globals.css.
 *  3. Initial SSR markup carries no framer-motion markers.
 *  4. Both components are still wired into the root layout (the test would be
 *     vacuous if someone moved them out instead of fixing them).
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');

const offlineBarSrc = read('../OfflineBar.tsx');
const inboxToastSrc = read('../InboxToast.tsx');
const globalsCss = read('../../app/globals.css');
const layoutSrc = read('../../app/layout.tsx');

const FRAMER_MOTION_IMPORT = /from\s+['"]framer-motion['"]/;

describe('root-layout shell: zero framer-motion', () => {
  it('OfflineBar.tsx has no framer-motion import', () => {
    expect(offlineBarSrc).not.toMatch(FRAMER_MOTION_IMPORT);
    expect(offlineBarSrc).not.toContain('AnimatePresence');
    // The exit animation is preserved via a leaving class, not a JS runtime.
    expect(offlineBarSrc).toContain('offline-bar--leaving');
  });

  it('InboxToast.tsx has no framer-motion import', () => {
    expect(inboxToastSrc).not.toMatch(FRAMER_MOTION_IMPORT);
    expect(inboxToastSrc).not.toContain('AnimatePresence');
    expect(inboxToastSrc).toContain('inbox-toast--leaving');
  });

  it('globals.css defines the CSS-only replacement keyframes', () => {
    for (const name of [
      'inbox-toast-enter',
      'inbox-toast-exit',
      'offline-bar-enter',
      'offline-bar-exit',
    ]) {
      expect(globalsCss).toContain(`@keyframes ${name}`);
    }
    expect(globalsCss).toContain('.inbox-toast--leaving');
    expect(globalsCss).toContain('.offline-bar--leaving');
  });

  it('both components are still rendered by the root layout', () => {
    // fix/qm-auth-no-framer code-splits both behind LazyChrome (next/dynamic,
    // ssr:false); the layout wires the lazy hosts, which render the real
    // components on the client. Accept either the direct or the lazy tag so
      // the check stays non-vacuous without pinning the loading strategy.
    expect(layoutSrc).toMatch(/<OfflineBar \/>|<LazyOfflineBar \/>/);
    expect(layoutSrc).toMatch(/<InboxToastContainer \/>|<LazyInboxToasts \/>/);
  });

  it('OfflineBar initial SSR markup is empty and framer-motion-free', () => {
    const html = renderToStaticMarkup(React.createElement(OfflineBar));
    expect(html).toBe('');
    expect(html).not.toContain('framer-motion');
  });

  it('InboxToastContainer initial SSR markup has no framer-motion markers', () => {
    const html = renderToStaticMarkup(React.createElement(InboxToastContainer));
    expect(html).toContain('inbox-toast-container');
    expect(html).not.toContain('framer-motion');
    expect(html).not.toContain('inbox-toast ');
  });
});
