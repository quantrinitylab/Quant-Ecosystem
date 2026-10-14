// ============================================================================
// QC-F-340 — text-entry fields below 16px trigger iOS Safari focus auto-zoom
// ============================================================================
//
// iOS Safari zooms the viewport in whenever a focused text-entry field's
// font-size is below 16px, and does not zoom back out on blur — every
// message/search on a 390px layout starts with a pinch-out. The app does
// NOT disable zoom (that would be the QC-F-318 accessibility defect), so
// the fix has to live on the fields themselves: every shipped text-entry
// field must carry an explicit font-size of at least 16px.
//
// Scan rule (pinned here so the defect class cannot ship again):
// a text-entry element is <input> whose type is text/search/email/
// password/tel/url/number/date/time or absent (the HTML default),
// <textarea>, or <select>. Its font size may arrive three ways, and the
// scan follows all three — a className-only grep is blind to the other
// two (that blindness is how the settings const and the globals.css
// rules escaped the original audit census):
//   1. a size token in its own className (text-xs / text-sm / text-[Npx]
//      with N < 16 are sub-16; text-base and larger are fine);
//   2. a same-file const referenced from its className (e.g.
//      settings.tsx's `selectClassName`), resolved from the const
//      declaration in that file;
//   3. a globals.css rule for CSS-classed fields (DisappearingTimer and
//      StoryCreator entry fields carry no size class at all) — pinned
//      separately in T5 by selector.
// Non-entry types (checkbox/radio/file/hidden/range/color/…) carry no
// meaningful font size and are out of the scan, as are non-field
// elements (span/button/label) whose small text is legitimate.
//
// Explicit exemption list (T2): the three <input>s in
// src/components/chat/ChatInterface.tsx. That component has NO
// production importer (only its own test file imports it), so its
// shipped status is unverified; the exemption is named here, with this
// reason, on purpose — adding any other name to this list is itself a
// review event, and T2 asserts the list stays exactly this.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Resolve a source file regardless of whether the suite runs with the
// cwd at the quantchat app or at the monorepo root (qc-f-044 pattern).
function readAppSource(relFromApp: string): string {
  const candidates = [
    resolve(process.cwd(), relFromApp),
    resolve(process.cwd(), 'apps/quantchat', relFromApp),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Could not locate source file: ${relFromApp}`);
  return readFileSync(found, 'utf8');
}

function appSrcDir(): string {
  const candidates = [
    resolve(process.cwd(), 'src'),
    resolve(process.cwd(), 'apps/quantchat', 'src'),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Could not locate quantchat src directory');
  return found;
}

// packages/shared-ui sits outside the app: from the app cwd it is
// ../../packages/…, from the monorepo root it is packages/….
function readRepoSource(relFromRoot: string): string {
  const candidates = [
    resolve(process.cwd(), relFromRoot),
    resolve(process.cwd(), '..', '..', relFromRoot),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Could not locate repo file: ${relFromRoot}`);
  return readFileSync(found, 'utf8');
}

const ENTRY_TYPES = new Set([
  'text',
  'search',
  'email',
  'password',
  'tel',
  'url',
  'number',
  'date',
  'time',
]);

/** Same-file `const name = '…'` / "…" / `…` declarations (no ${} inside). */
function constDeclarations(source: string): Map<string, string> {
  const consts = new Map<string, string>();
  for (const m of source.matchAll(
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/g,
  )) {
    consts.set(m[1], m[2] ?? m[3] ?? m[4] ?? '');
  }
  return consts;
}

interface TagBlock {
  tag: string;
  block: string;
  index: number;
}

/** Every <input>/<textarea>/<select> opening tag, honouring quotes and
 *  {…} nesting so a `>` inside an expression never ends the tag early. */
function tagBlocks(source: string): TagBlock[] {
  const out: TagBlock[] = [];
  const re = /<(input|textarea|select)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    let i = m.index + m[0].length;
    let depth = 0;
    let quote: string | null = null;
    while (i < source.length) {
      const c = source[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === '`') {
        quote = c;
      } else if (c === '{') {
        depth += 1;
      } else if (c === '}') {
        depth -= 1;
      } else if (c === '>' && depth === 0) {
        break;
      }
      i += 1;
    }
    out.push({ tag: m[1], block: source.slice(m.index, i + 1), index: m.index });
  }
  return out;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

/** Declared type of an <input>: literal type="…", type={'…'}, or the
 *  first literal of a type={cond ? '…' : '…'} expression. */
function inputType(block: string): string | null {
  const lit = block.match(/type\s*=\s*"([^"]*)"/);
  if (lit) return lit[1];
  const expr = block.match(/type\s*=\s*\{[^}]*?'([^']*)'/);
  if (expr) return expr[1];
  return null;
}

function isEntryField(tb: TagBlock): boolean {
  if (tb.tag === 'textarea' || tb.tag === 'select') return true;
  const t = inputType(tb.block);
  return t === null || ENTRY_TYPES.has(t);
}

/** All class text a tag can end up with: every string literal in the
 *  tag (className strings, ternary branches, template literals with
 *  ${const} substituted from same-file declarations) plus a bare
 *  className={identifier} reference resolved the same way. */
function classText(block: string, consts: Map<string, string>): string {
  const parts: string[] = [];
  for (const m of block.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    parts.push(
      raw.replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (_s, name: string) =>
        consts.has(name) ? ` ${consts.get(name)} ` : ' ',
      ),
    );
  }
  for (const m of block.matchAll(/className\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/g)) {
    if (consts.has(m[1])) parts.push(consts.get(m[1]) as string);
  }
  return parts.join(' ');
}

const SIZE_TOKEN = /text-(xs|sm|base|lg|xl|[2-9]xl|\[(\d+(?:\.\d+)?)px\])/g;

function sizeTokens(text: string): string[] {
  return [...text.matchAll(SIZE_TOKEN)].map((m) => m[0]);
}

function isSub16(token: string): boolean {
  if (token === 'text-xs' || token === 'text-sm') return true;
  const px = token.match(/^text-\[(\d+(?:\.\d+)?)px\]$/);
  return px !== null && parseFloat(px[1]) < 16;
}

/** Sub-16 size tokens carried by one entry field, or [] when it is at
 *  least 16px / carries no size token at all (inherit — not flagged). */
function fieldSub16(source: string, tb: TagBlock): string[] {
  const consts = constDeclarations(source);
  return sizeTokens(classText(tb.block, consts)).filter(isSub16);
}

function entryFields(source: string): TagBlock[] {
  return tagBlocks(source).filter(isEntryField);
}

// The one entry in src/ whose fields currently fail the scan with a
// documented reason (see the header): legacy component, no production
// importer, shipped status unverified.
const T2_EXEMPT_FILES = new Set(['src/components/chat/ChatInterface.tsx']);

describe('QC-F-340: text-entry fields are at least 16px (iOS focus-zoom)', () => {
  it('T1: cited shipped fields are at least 16px', () => {
    // §2A of the build brief: file -> identifying attribute snippet of
    // the field, so each assertion targets the actual cited element.
    const cited: Array<[string, string]> = [
      ['src/app/channels/page.tsx', 'aria-label="Broadcast message"'],
      ['src/app/chat/[id]/page.tsx', 'placeholder="Add a caption... (optional)"'],
      ['src/app/map/page.tsx', 'aria-label="Search friends on the map"'],
      ['src/app/reels/components/CommentSheet.tsx', 'placeholder="Add a comment..."'],
      ['src/app/reels/components/ReelEditor.tsx', 'placeholder="Overlay text"'],
      ['src/pages/discover.tsx', 'aria-label="Search Discover"'],
    ];
    const failures: string[] = [];
    for (const [rel, marker] of cited) {
      const source = readAppSource(rel);
      const field = entryFields(source).find((tb) => tb.block.includes(marker));
      if (!field) {
        failures.push(`${rel}: cited field not found (${marker})`);
        continue;
      }
      const sub = fieldSub16(source, field);
      if (sub.length > 0) {
        failures.push(
          `${rel}:${lineOf(source, field.index)} <${field.tag}> is sub-16 (${sub.join(', ')})`,
        );
      }
    }
    // MemorySearch: all four entry fields (q / location / from / to).
    const msRel = 'src/app/memories/components/MemorySearch.tsx';
    const ms = readAppSource(msRel);
    const msFields = entryFields(ms);
    if (msFields.length !== 4) {
      failures.push(`${msRel}: expected 4 entry fields, found ${msFields.length}`);
    }
    for (const f of msFields) {
      const sub = fieldSub16(ms, f);
      if (sub.length > 0) {
        failures.push(
          `${msRel}:${lineOf(ms, f.index)} <${f.tag}> is sub-16 (${sub.join(', ')})`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it('T2: no text-entry element in quantchat src carries a sub-16 size class', () => {
    const srcDir = appSrcDir();
    const files = readdirSync(srcDir, { recursive: true })
      .map((f) => String(f))
      .filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__') && !/\.test\.tsx?$/.test(f))
      .sort();
    // Guard the guard: the scan really walks the app source tree.
    expect(files.length).toBeGreaterThan(100);
    const failures: string[] = [];
    const exemptSeen = new Set<string>();
    for (const rel of files) {
      const source = readFileSync(join(srcDir, rel), 'utf8');
      const relFromApp = `src/${rel.split('\\').join('/')}`;
      for (const f of entryFields(source)) {
        const sub = fieldSub16(source, f);
        if (sub.length === 0) continue;
        if (T2_EXEMPT_FILES.has(relFromApp)) {
          exemptSeen.add(relFromApp);
          continue;
        }
        failures.push(
          `${relFromApp}:${lineOf(source, f.index)} <${f.tag}> sub-16 (${sub.join(', ')})`,
        );
      }
    }
    // The exemption list must stay exactly the documented set — an
    // exemption whose fields got fixed must be removed, not left stale.
    expect([...T2_EXEMPT_FILES]).toEqual(['src/components/chat/ChatInterface.tsx']);
    expect([...exemptSeen]).toEqual(['src/components/chat/ChatInterface.tsx']);
    expect(failures).toEqual([]);
  });

  it('T3: settings selectClassName resolves to text-base (5 sites, one const)', () => {
    const rel = 'src/pages/settings.tsx';
    const source = readAppSource(rel);
    const consts = constDeclarations(source);
    const cls = consts.get('selectClassName') ?? '';
    expect(cls).not.toBe('');
    expect(sizeTokens(cls).filter(isSub16)).toEqual([]);
    expect(sizeTokens(cls)).toContain('text-base');
    // Every entry field whose class comes from that one const: the
    // SelectRow <select>, the two quiet-hours time inputs, the language
    // <select>, and the delete-confirm text input. The count is pinned:
    // a new site riding the const must be reviewed, not slip in.
    const sites = entryFields(source).filter((tb) =>
      tb.block.includes('selectClassName'),
    );
    expect(sites.length).toBe(5);
    for (const s of sites) {
      expect(fieldSub16(source, s)).toEqual([]);
    }
  });

  it('T4: shared-ui ChatInput textarea is text-base', () => {
    const rel = 'packages/shared-ui/src/components/Chat/ChatInput.tsx';
    const source = readRepoSource(rel);
    const textareas = tagBlocks(source).filter((tb) => tb.tag === 'textarea');
    expect(textareas.length).toBeGreaterThan(0);
    for (const ta of textareas) {
      expect(fieldSub16(source, ta)).toEqual([]);
      expect(sizeTokens(classText(ta.block, constDeclarations(source)))).toContain(
        'text-base',
      );
    }
  });

  it('T5: globals.css entry-field rules are at least 16px', () => {
    const css = readAppSource('src/app/globals.css');
    const selectors = [
      '.disappearing-timer .custom-fields .field input',
      '.story-creator .text-options textarea',
      '.story-creator .text-options select',
      '.story-creator .post-controls select',
    ];
    for (const sel of selectors) {
      const idx = css.indexOf(sel);
      expect(idx, `selector not found: ${sel}`).toBeGreaterThan(-1);
      const open = css.indexOf('{', idx);
      const close = css.indexOf('}', open);
      const body = css.slice(open + 1, close);
      const size = body.match(/font-size:\s*(\d+(?:\.\d+)?)px/);
      expect(size, `no font-size in rule: ${sel}`).not.toBeNull();
      expect(parseFloat((size as RegExpMatchArray)[1])).toBeGreaterThanOrEqual(16);
    }
  });

  it('T6: the app shell does not disable zoom (QC-F-318 guard)', () => {
    // The banned shortcut: fixing focus-zoom by locking the viewport.
    // Only the shells are pinned (games under public/games/** are
    // QC-F-318's own territory and are not app source).
    const shells = ['src/app/layout.tsx', 'src/pages/_app.tsx'];
    for (const rel of shells) {
      const source = readAppSource(rel);
      expect(source).not.toContain('maximum-scale');
      expect(source).not.toContain('user-scalable');
    }
  });
});
