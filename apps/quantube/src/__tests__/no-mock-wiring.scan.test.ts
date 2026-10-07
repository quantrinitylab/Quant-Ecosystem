// @vitest-environment node
// ============================================================================
// quantube — no-mock / no-inline-fetch / no-loader static scan (Task 12)
// ============================================================================
//
// Feature: quantube-real-data-wiring, Property 9 & 10: in-scope pages reference
// no MOCK_ constant, no data-loading setTimeout, and no inline fetch.
//
// Validates: Requirements 9.1, 9.2, 9.3, 9.5, 9.6.
//
// This is a STATIC scan: it reads exactly the two in-scope files from disk and
// asserts source-level invariants. It boots nothing and imports no product
// code, so it is purely a function of the bytes on disk — two independent
// reviewers running it obtain identical results (Req 9.6, deterministic).
//
// In-scope files (Req 9.1) — and ONLY these two:
//   • src/pages/library.tsx          (History, Playlists, Watch Later tabs)
//   • src/pages/playlist/[id].tsx    (playlist detail)
// No other page (music.tsx, live.tsx, podcasts.tsx, the deferred Downloads
// tab) is in scope and none is read here.
//
// ---------------------------------------------------------------------------
// Why the scan is mechanically reliable (read before editing the regexes):
//
// Naively grepping raw source for `MOCK_`, `fetch(`, or `setTimeout` produces
// false positives from COMMENTS (e.g. "// Replaces the setTimeout + MOCK_*
// loader") and from STRING/TEMPLATE literals. To make the result a function of
// the *code* only, we first run `toCodeOnly()`, a small deterministic state
// machine that:
//   • removes `//` line comments and block comments,
//   • blanks the *contents* of '...' , "..." and `...` literals (the quote
//     delimiters are kept so token boundaries are preserved),
//   • preserves newlines so any reported context still lines up.
// Every assertion below runs against this comment/string-free projection, so a
// `MOCK_` or `setTimeout` mentioned only in prose can never trip the scan, and
// a real identifier in code can never hide.
//
// The two ALLOWED-by-spec timers are distinguished from forbidden ones not by
// guessing intent but by a concrete rule: a `setTimeout` is forbidden ONLY when
// its (balanced) call text touches an in-scope DATA token (a forbidden MOCK_
// name or an in-scope state setter). The Downloads-only loader
// (`setTimeout(() => setDownloads(MOCK_DOWNLOADS), 400)`, deferred domain) and
// the share "Copied!" reset timer in the detail page touch no in-scope data
// token, so they pass — exactly as Req 9.4 permits.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIBRARY_PATH = resolve(HERE, '../pages/library.tsx');
const DETAIL_PATH = resolve(HERE, '../pages/playlist/[id].tsx');

/**
 * Deterministic projection of TS/TSX source onto "code only": strips `//` and
 * `/* *\/` comments and blanks the contents of single/double/template string
 * literals, preserving newlines. No randomness, no parser version sensitivity.
 */
function toCodeOnly(src: string): string {
  type Mode = 'code' | 'line' | 'block' | 'single' | 'double' | 'template';
  let mode: Mode = 'code';
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    switch (mode) {
      case 'code':
        if (c === '/' && n === '/') {
          mode = 'line';
          i++;
        } else if (c === '/' && n === '*') {
          mode = 'block';
          i++;
        } else if (c === "'") {
          mode = 'single';
          out += c;
        } else if (c === '"') {
          mode = 'double';
          out += c;
        } else if (c === '`') {
          mode = 'template';
          out += c;
        } else out += c;
        break;
      case 'line':
        if (c === '\n') {
          mode = 'code';
          out += c;
        }
        break;
      case 'block':
        if (c === '*' && n === '/') {
          mode = 'code';
          i++;
        } else if (c === '\n') out += c;
        break;
      case 'single':
        if (c === '\\') {
          i++;
        } else if (c === "'") {
          mode = 'code';
          out += c;
        } else if (c === '\n') out += c;
        break;
      case 'double':
        if (c === '\\') {
          i++;
        } else if (c === '"') {
          mode = 'code';
          out += c;
        } else if (c === '\n') out += c;
        break;
      case 'template':
        if (c === '\\') {
          i++;
        } else if (c === '`') {
          mode = 'code';
          out += c;
        } else if (c === '\n') out += c;
        break;
    }
  }
  return out;
}

/** All `MOCK_FOO` style identifiers present in code-only text (whole-word). */
function findMockIdentifiers(code: string): string[] {
  return [...code.matchAll(/\bMOCK_[A-Z0-9_]+\b/g)].map((m) => m[0]);
}

/**
 * Returns the full, paren-balanced call text for every `fnName(` occurrence in
 * `code` (e.g. the entire `setTimeout(...)` expression). Lets us inspect what a
 * timer actually touches rather than guessing from a fixed character window.
 */
function extractBalancedCalls(code: string, fnName: string): string[] {
  const calls: string[] = [];
  const opener = new RegExp(`\\b${fnName}\\s*\\(`, 'g');
  let m: RegExpExecArray | null;
  while ((m = opener.exec(code)) !== null) {
    const start = m.index;
    let i = code.indexOf('(', start);
    let depth = 0;
    for (; i < code.length; i++) {
      if (code[i] === '(') depth++;
      else if (code[i] === ')') {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    calls.push(code.slice(start, i));
  }
  return calls;
}

const LIBRARY_RAW = readFileSync(LIBRARY_PATH, 'utf8');
const DETAIL_RAW = readFileSync(DETAIL_PATH, 'utf8');
const LIBRARY_CODE = toCodeOnly(LIBRARY_RAW);
const DETAIL_CODE = toCodeOnly(DETAIL_RAW);

// `toCodeOnly` blanks string *contents*, which is correct for forbidden-token
// scanning but erases import-path literals. The positive wiring checks below
// therefore match the import statement against RAW source (an `import ... from
// '<path>'` cannot appear in a stripped comment and is unambiguous in code).

// In-scope forbidden MOCK_ constants per file (Req 9.2). MOCK_DOWNLOADS is the
// deferred Downloads domain and is explicitly ALLOWED in library.tsx.
const LIBRARY_FORBIDDEN_MOCKS = ['MOCK_HISTORY', 'MOCK_PLAYLISTS', 'MOCK_WATCH_LATER'];
const LIBRARY_ALLOWED_MOCKS = ['MOCK_DOWNLOADS'];
const DETAIL_FORBIDDEN_MOCKS = ['MOCK_PLAYLIST', 'MOCK_VIDEOS'];

// Tokens that mark a timer as an in-scope DATA loader (forbidden inside any
// setTimeout). These are the forbidden MOCK_ names plus the in-scope state
// setters the page used before it was wired to the hooks.
const LIBRARY_DATA_TOKENS = [
  ...LIBRARY_FORBIDDEN_MOCKS,
  'setHistory',
  'setPlaylists',
  'setWatchLater',
];
const DETAIL_DATA_TOKENS = [...DETAIL_FORBIDDEN_MOCKS, 'setPlaylist', 'setVideos'];

describe('Property 9 — in-scope pages reference no in-scope MOCK_ constant (Req 9.2)', () => {
  it('library.tsx references none of MOCK_HISTORY / MOCK_PLAYLISTS / MOCK_WATCH_LATER', () => {
    const mocks = findMockIdentifiers(LIBRARY_CODE);
    for (const forbidden of LIBRARY_FORBIDDEN_MOCKS) {
      expect(mocks, `library.tsx must not reference ${forbidden}`).not.toContain(forbidden);
    }
    // Any MOCK_ that is not on the allowlist is a violation; MOCK_DOWNLOADS is
    // the only permitted one (deferred domain, Req 9.2).
    const disallowed = mocks.filter((id) => !LIBRARY_ALLOWED_MOCKS.includes(id));
    expect(
      disallowed,
      `unexpected in-scope MOCK_ identifiers in library.tsx: ${disallowed.join(', ')}`,
    ).toEqual([]);
  });

  it('playlist/[id].tsx references none of MOCK_PLAYLIST / MOCK_VIDEOS (no allowed mocks here)', () => {
    const mocks = findMockIdentifiers(DETAIL_CODE);
    for (const forbidden of DETAIL_FORBIDDEN_MOCKS) {
      expect(mocks, `playlist/[id].tsx must not reference ${forbidden}`).not.toContain(forbidden);
    }
    expect(
      mocks,
      `playlist/[id].tsx must reference zero MOCK_ constants, found: ${mocks.join(', ')}`,
    ).toEqual([]);
  });

  it('MOCK_DOWNLOADS remains allowed in library.tsx and does not count as a violation', () => {
    // Sanity: the deferred constant is still present (proving the allowlist is
    // actually exercised, not vacuous) yet the scan above passed.
    expect(findMockIdentifiers(LIBRARY_CODE)).toContain('MOCK_DOWNLOADS');
  });
});

describe('Property 9 — no data-loading setTimeout in either in-scope page (Req 9.3, 9.4)', () => {
  it('every setTimeout in library.tsx is a non-data timer (touches no in-scope data token)', () => {
    const calls = extractBalancedCalls(LIBRARY_CODE, 'setTimeout');
    for (const call of calls) {
      for (const token of LIBRARY_DATA_TOKENS) {
        expect(
          call.includes(token),
          `a setTimeout in library.tsx loads in-scope data via "${token}": ${call}`,
        ).toBe(false);
      }
    }
  });

  it('every setTimeout in playlist/[id].tsx is a non-data timer (touches no in-scope data token)', () => {
    const calls = extractBalancedCalls(DETAIL_CODE, 'setTimeout');
    for (const call of calls) {
      for (const token of DETAIL_DATA_TOKENS) {
        expect(
          call.includes(token),
          `a setTimeout in playlist/[id].tsx loads in-scope data via "${token}": ${call}`,
        ).toBe(false);
      }
    }
  });

  it('the old in-scope mock state setters are gone from both pages', () => {
    for (const token of ['setHistory', 'setPlaylists', 'setWatchLater']) {
      expect(LIBRARY_CODE.includes(`${token}(`), `library.tsx still calls ${token}(`).toBe(false);
    }
    for (const token of ['setVideos']) {
      expect(DETAIL_CODE.includes(`${token}(`), `playlist/[id].tsx still calls ${token}(`).toBe(
        false,
      );
    }
  });
});

describe('Property 10 — in-scope pages contain no direct fetch( call (Req 9.5)', () => {
  it('library.tsx makes no inline fetch( call', () => {
    expect(/\bfetch\s*\(/.test(LIBRARY_CODE), 'library.tsx must not call fetch( directly').toBe(
      false,
    );
  });

  it('playlist/[id].tsx makes no inline fetch( call', () => {
    expect(
      /\bfetch\s*\(/.test(DETAIL_CODE),
      'playlist/[id].tsx must not call fetch( directly',
    ).toBe(false);
  });
});

describe('Wiring confirmation — in-scope data now comes from the Task-8 hooks (Req 9.5 positive)', () => {
  it('library.tsx imports the library feature hooks and references them', () => {
    expect(LIBRARY_RAW).toMatch(/from\s+['"]\.\.\/features\/library\/useLibrary['"]/);
    for (const hook of ['useWatchHistory', 'usePlaylists', 'useWatchLater']) {
      expect(LIBRARY_CODE.includes(`${hook}(`), `library.tsx must invoke ${hook}()`).toBe(true);
    }
  });

  it('playlist/[id].tsx imports the playlist feature hook and references it', () => {
    expect(DETAIL_RAW).toMatch(/from\s+['"]\.\.\/\.\.\/features\/playlist\/usePlaylist['"]/);
    expect(
      DETAIL_CODE.includes('usePlaylist('),
      'playlist/[id].tsx must invoke usePlaylist()',
    ).toBe(true);
  });
});
