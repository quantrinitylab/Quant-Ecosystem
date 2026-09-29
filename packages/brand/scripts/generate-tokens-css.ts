/**
 * Codegen for `packages/brand/generated/quant-tokens.css` (design-system token
 * unification, spec §6.2). Writes the ONE canonical `--quant-*` stylesheet — base
 * primitive scales, all 6 theme blocks, and the back-compat alias block — that each
 * app imports once at the top of `globals.css`
 * (`@import '@quant/brand/generated/quant-tokens.css';`), replacing the runtime
 * `<style dangerouslySetInnerHTML>` BrandProviders (no FOUC).
 *
 * Run: `pnpm --filter @quant/brand generate:tokens`
 * The output is committed and guarded by `src/__tests__/quant-tokens-css.test.ts`;
 * never hand-edit the generated file — edit the source tokens and regenerate.
 *
 * TRUST BOUNDARY (preserved from the deleted BrandProviders): this stylesheet is
 * built entirely from static @quant/brand tokens — no user input — so it is safe
 * to import and is cacheable.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { generateTokensCssFile } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../generated');
const outFile = resolve(outDir, 'quant-tokens.css');

// The provenance header + full token document live in `src/theme-css.ts`
// (`generateTokensCssFile`) — the single source of truth the drift guard asserts
// against. This script is only the thin fs wrapper that writes it to disk.
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, generateTokensCssFile(), 'utf8');

// eslint-disable-next-line no-console -- codegen CLI progress (script is outside src/, rule does not apply)
console.log(`Wrote ${outFile}`);
