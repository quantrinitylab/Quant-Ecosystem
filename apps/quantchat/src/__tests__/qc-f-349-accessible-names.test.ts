// ============================================================================
// QC-F-349 — shipped form controls with NO programmatic name (regression net)
// ============================================================================
//
// A slice of shipped form controls had a visible label or placeholder but no
// programmatic name at all: no wrapping <label>, no htmlFor+id pairing and
// no aria-label. A screen reader announces such a field with no name, and
// voice control ("click <name>") can never target it.
//
// Band Slice-1 (brief specialist-qc-f-349-buildprep.md §5/§6): the six
// shipped files below, 16 controls —
//   settings.tsx:        SelectRow component (renders the 3 privacy selects)
//                        + the Language select
//   chat/[id]/page.tsx:  snap caption input
//   CommentSheet.tsx:    comment input
//   ReelEditor.tsx:      overlay-text input (the cover-frame range already
//                        had aria-label="Select cover frame" — it must stay
//                        named and must NOT be "fixed" again)
//   StoryCreator.tsx:    gallery file input, brush-width range, story-text
//                        textarea, font select, text-color input, font-size
//                        range, privacy select
//   bitmoji.tsx:         outfit-color and background-color inputs
//
// Scanner rules (brief §6, band):
//   - Scope is the six files above ONLY — not all of src/. A whole-src scan
//     fails on day one against legacy components that no shipped page
//     imports, which would force this net to be weakened or disabled.
//   - Tag extraction is brace/quote-aware: the tag runs to the first '>'
//     outside any {...} expression and outside quotes/template literals. A
//     naive [^>]* regex cuts tags at the '=>' inside onChange handlers and
//     falsely reports correctly named controls (map search, quiet-hours,
//     the ReelEditor cover frame) as unnamed.
//   - A control is named iff one of: (a) aria-label / aria-labelledby on
//     the tag; (b) an id on the tag paired with htmlFor of the same value
//     (literal or the same {...} expression) in the same file; (c) the tag
//     sits inside a <label>...</label> (wrapping pattern).
//   - Exemptions (only these two): type="hidden"; and type="file" inputs
//     carrying the `hidden` class that are triggered programmatically via
//     a ref (the chat page's snap file input — a screen reader never
//     encounters it; its visible trigger button carries the name).
//     StoryCreator's gallery file input is a VISIBLE picker and is NOT
//     exempt.
//   - type="range" / type="color" are IN scope — they are this finding's
//     actual offenders (a screen reader announces a range as a bare number
//     and a color input with no context at all).
// ============================================================================
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Resolve a repo source file regardless of whether the suite runs with the
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

const FILES: Record<string, string> = {
  settings: 'src/pages/settings.tsx',
  chatPage: 'src/app/chat/[id]/page.tsx',
  commentSheet: 'src/app/reels/components/CommentSheet.tsx',
  reelEditor: 'src/app/reels/components/ReelEditor.tsx',
  storyCreator: 'src/components/StoryCreator.tsx',
  bitmoji: 'src/pages/bitmoji.tsx',
};

const sources: Record<string, string> = Object.fromEntries(
  Object.entries(FILES).map(([k, rel]) => [k, readAppSource(rel)]),
);

interface JsxTag {
  name: string;
  start: number;
  end: number;
  text: string;
}

/** Extract every opening tag of the given kinds, brace/quote-aware. */
function extractTags(source: string, kinds: string[]): JsxTag[] {
  const tags: JsxTag[] = [];
  const re = new RegExp(`<(${kinds.join('|')})(?=[\\s/>])`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const start = m.index;
    let j = start + m[0].length;
    let depth = 0;
    let quote: string | null = null;
    let template = false;
    let escaped = false;
    while (j < source.length) {
      const c = source[j];
      if (escaped) {
        escaped = false;
      } else if (c === '\\') {
        escaped = true;
      } else if (template) {
        if (c === '`') template = false;
      } else if (quote) {
        if (c === quote) quote = null;
      } else if (c === '`') {
        template = true;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '{') {
        depth += 1;
      } else if (c === '}') {
        depth -= 1;
      } else if (c === '>' && depth === 0) {
        break;
      }
      j += 1;
    }
    tags.push({ name: m[1], start, end: j + 1, text: source.slice(start, j + 1) });
  }
  return tags;
}

function labelSpans(source: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const open of extractTags(source, ['label'])) {
    const close = source.indexOf('</label>', open.end);
    if (close !== -1) spans.push([open.start, close + '</label>'.length]);
  }
  return spans;
}

function isNamed(source: string, tag: JsxTag, spans: Array<[number, number]>): boolean {
  if (/aria-label(?:ledby)?\s*=/.test(tag.text)) return true;
  const idMatch =
    tag.text.match(/\bid\s*=\s*"([^"]+)"/) || tag.text.match(/\bid\s*=\s*\{([^}]+)\}/);
  if (idMatch) {
    const val = idMatch[1].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (
      new RegExp(`htmlFor\\s*=\\s*"\\s*${val}\\s*"`).test(source) ||
      new RegExp(`htmlFor\\s*=\\s*\\{\\s*${val}\\s*\\}`).test(source)
    ) {
      return true;
    }
  }
  return spans.some(([s, e]) => s < tag.start && tag.start < e);
}

function isExempt(tag: JsxTag): boolean {
  if (/type\s*=\s*"hidden"/.test(tag.text)) return true;
  if (/type\s*=\s*"file"/.test(tag.text)) {
    const cls =
      tag.text.match(/className\s*=\s*"([^"]*)"/) || tag.text.match(/className\s*=\s*\{`([^`]*)`\}/);
    if (cls && cls[1].split(/\s+/).includes('hidden')) return true;
  }
  return false;
}

/** Every unnamed, non-exempt form control in a source string. */
function findUnnamed(source: string): Array<{ line: number; snippet: string }> {
  const spans = labelSpans(source);
  const bad: Array<{ line: number; snippet: string }> = [];
  for (const tag of extractTags(source, ['input', 'select', 'textarea'])) {
    if (isExempt(tag)) continue;
    if (!isNamed(source, tag, spans)) {
      bad.push({
        line: source.slice(0, tag.start).split('\n').length,
        snippet: tag.text.replace(/\s+/g, ' ').slice(0, 90),
      });
    }
  }
  return bad;
}

/** The (single) form-control tag in `source` whose text contains `needle`. */
function tagContaining(source: string, needle: string): JsxTag {
  const hits = extractTags(source, ['input', 'select', 'textarea']).filter((t) =>
    t.text.includes(needle),
  );
  expect(hits.length, `expected exactly one control containing ${needle}`).toBe(1);
  return hits[0];
}

describe('QC-F-349 accessible names for shipped form controls', () => {
  it('N1 settings SelectRow binds its label to its select (htmlFor + id pair)', () => {
    const src = sources.settings;
    const block = src.slice(src.indexOf('function SelectRow'), src.indexOf('export const SettingsPage'));
    const htmlFor = block.match(/htmlFor\s*=\s*\{([^}]+)\}/);
    const id = block.match(/\bid\s*=\s*\{([^}]+)\}/);
    expect(htmlFor, 'SelectRow label must carry htmlFor={...}').not.toBeNull();
    expect(id, 'SelectRow select must carry id={...}').not.toBeNull();
    expect(htmlFor![1].trim()).toBe(id![1].trim());
    // The component renders the three privacy selects — all three call
    // sites keep their visible label, so all three inherit the binding.
    const callSites = src.match(/<SelectRow/g) ?? [];
    expect(callSites.length).toBe(3);
    for (const label of ['Who can message me', 'Who can see my story', 'Who can see my location']) {
      expect(src).toContain(`label="${label}"`);
    }
  });

  it('N2 settings Language select has the accessible name "Language"', () => {
    const tag = tagContaining(sources.settings, 'value={language}');
    expect(tag.text).toContain('aria-label="Language"');
  });

  it('N3 every form control in the six shipped files has a programmatic name', () => {
    for (const [key, src] of Object.entries(sources)) {
      const bad = findUnnamed(src);
      expect(
        bad,
        `${FILES[key]} has unnamed controls: ${bad.map((b) => `line ${b.line}: ${b.snippet}`).join(' | ')}`,
      ).toEqual([]);
    }
    // Known-good neighbours must PASS (false-positive guard): the
    // ReelEditor cover-frame range, the settings quiet-hours inputs, the
    // delete-confirm htmlFor pair and the wrapped ToggleRow checkbox.
    expect(tagContaining(sources.reelEditor, 'value={coverFrameTimestamp}').text).toContain(
      'aria-label="Select cover frame"',
    );
    expect(sources.settings).toContain('aria-label="Quiet hours start"');
    expect(sources.settings).toContain('aria-label="Quiet hours end"');
    expect(tagContaining(sources.settings, 'id="delete-confirm-input"')).toBeTruthy();
    expect(tagContaining(sources.settings, 'checked={checked}')).toBeTruthy();
  });

  it('N4 snap caption input is named "Add a caption (optional)"', () => {
    const tag = tagContaining(sources.chatPage, 'placeholder="Add a caption... (optional)"');
    expect(tag.text).toContain('aria-label="Add a caption (optional)"');
  });

  it('N5 reels inputs are named (comment, overlay text)', () => {
    const comment = tagContaining(sources.commentSheet, 'placeholder="Add a comment..."');
    expect(comment.text).toContain('aria-label="Add a comment"');
    const overlay = tagContaining(sources.reelEditor, 'placeholder="Overlay text"');
    expect(overlay.text).toContain('aria-label="Overlay text"');
    // The pre-named cover-frame range keeps exactly its one name — the
    // fix must not overwrite or duplicate it.
    expect(sources.reelEditor.match(/aria-label="Select cover frame"/g) ?? []).toHaveLength(1);
  });

  it('N6 StoryCreator tool-panel controls are all named', () => {
    const src = sources.storyCreator;
    const cases: Array<[string, string]> = [
      ['type="file"', 'Select a photo or video from your gallery'],
      ['value={drawWidth}', 'Brush width'],
      ['value={textStyle.content}', 'Story text'],
      ['value={textStyle.fontFamily}', 'Text font'],
      ['value={textStyle.color}', 'Text color'],
      ['value={textStyle.fontSize}', 'Text font size'],
      ['value={privacy}', 'Who can see this story'],
    ];
    for (const [needle, name] of cases) {
      expect(tagContaining(src, needle).text).toContain(`aria-label="${name}"`);
    }
  });

  it('N7 bitmoji color inputs are named', () => {
    expect(tagContaining(sources.bitmoji, 'value={config.outfitColor}').text).toContain(
      'aria-label="Outfit color"',
    );
    expect(tagContaining(sources.bitmoji, 'value={config.background}').text).toContain(
      'aria-label="Background color"',
    );
  });

  it('N8 scanner is not vacuous (synthetic unnamed control is caught)', () => {
    const unnamed = [
      '<input type="text" value={x} onChange={(e) => setX(e.target.value)} />', 
      '<input type="range" min="1" max="9" value={y} />',
    ].join('\n');
    expect(findUnnamed(unnamed)).toHaveLength(2);

    const named = [
      '<input type="text" aria-label="Direct name" value={a} />',
      '<label>Wrapped <input type="text" value={b} /></label>',
      '<label htmlFor="synth-id">Paired</label>',
      '<input id="synth-id" type="text" value={c} />',
      '<label htmlFor={pairId}>Expr</label>',
      '<select id={pairId} value={d}></select>',
      '<input type="hidden" value={e} />',
      '<input type="file" className="hidden" ref={fileRef} />',
    ].join('\n');
    expect(findUnnamed(named)).toEqual([]);
  });
});
