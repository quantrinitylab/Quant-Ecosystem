'use client';

/**
 * Moved to `@quant/shared-ui`.
 *
 * This primitive was born here, then `SearchInput` in `@quant/shared-ui` turned
 * out to be a fourth hand-drawn copy of the same ✕ — and a package this app
 * depends on cannot import upward. So the component now lives in
 * `packages/shared-ui/src/components/Form/SearchClearButton.tsx`, where both
 * halves can share it, and this file stays as its address.
 *
 * It stays because eight call sites in this app import from here, and rewriting
 * eight imports to prove a point about where a file lives is churn, not a fix.
 * `optimizePackageImports: ['@quant/shared-ui']` in `next.config.js` rewrites
 * this barrel import down to the single module at build time, so re-exporting
 * costs nothing — `AppShell` does not start pulling 500 lines of barrel on
 * every route.
 */
export { SearchClearButton } from '@quant/shared-ui';
