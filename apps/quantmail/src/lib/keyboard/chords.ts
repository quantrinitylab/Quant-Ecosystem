/**
 * Chord parsing and normalisation for the QuantMail keyboard engine.
 *
 * A *chord* is one simultaneous key press, written `mod+shift+k`.
 * A *sequence* is chords separated by spaces, written `g i` (Gmail-style
 * "go to inbox"). Everything downstream speaks in these canonical strings so
 * that comparison is a plain string equality check — no per-keystroke object
 * allocation, no ambiguity between `Cmd` / `Meta` / `⌘`.
 */

/** One simultaneous key press, e.g. `mod+k`. Always lowercase. */
export type Chord = string;

/** An ordered list of chords that must be pressed in turn, e.g. `['g', 'i']`. */
export type Sequence = Chord[];

/** Aliases accepted in authored binding strings, mapped to canonical names. */
const KEY_ALIASES: Record<string, string> = {
  cmd: 'meta',
  command: 'meta',
  win: 'meta',
  super: 'meta',
  control: 'ctrl',
  option: 'alt',
  opt: 'alt',
  esc: 'escape',
  del: 'delete',
  ins: 'insert',
  ret: 'enter',
  return: 'enter',
  spacebar: 'space',
  ' ': 'space',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  pgup: 'pageup',
  pgdn: 'pagedown',
  plus: '+',
};

const MODIFIER_ORDER = ['mod', 'ctrl', 'meta', 'alt', 'shift'] as const;
const MODIFIER_SET = new Set<string>(MODIFIER_ORDER);

let applePlatform: boolean | null = null;

/**
 * True on macOS / iOS, where `mod` means ⌘ rather than Ctrl.
 * Resolved lazily and memoised so this module stays safe to import during SSR.
 */
export function isApplePlatform(): boolean {
  if (applePlatform !== null) return applePlatform;
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent || '';
  applePlatform = /mac|iphone|ipad|ipod/i.test(platform);
  return applePlatform;
}

/** Test seam: force platform detection. Pass `null` to return to auto-detect. */
export function setApplePlatformOverride(value: boolean | null): void {
  applePlatform = value;
}

function canonicalKeyName(raw: string): string {
  const lower = raw.toLowerCase();
  return KEY_ALIASES[lower] ?? lower;
}

/**
 * Shift is only part of a chord's identity when it selects between two
 * meaningfully different bindings. For punctuation the browser already reports
 * the shifted character (`?`, `#`, `*`), so folding Shift in would make the
 * chord unmatchable.
 */
function shiftIsSignificant(key: string): boolean {
  return key.length > 1 || /^[a-z0-9]$/.test(key);
}

/** Parse one authored chord (`'Mod+Shift+K'`) into canonical form (`'mod+shift+k'`). */
export function parseChord(input: string): Chord {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // A lone `+` is a key, not a separator.
  const rawParts = trimmed === '+' ? ['+'] : trimmed.split('+').filter((part) => part !== '');
  if (rawParts.length === 0) return '+';

  const modifiers = new Set<string>();
  let key = '';

  for (const part of rawParts) {
    const name = canonicalKeyName(part);
    if (MODIFIER_SET.has(name)) modifiers.add(name);
    else key = name;
  }

  // `Shift+K` with no other modifier is authored shorthand for "capital K".
  if (!key && modifiers.size > 0) {
    // Binding was modifiers-only (e.g. `'shift'`) — treat the last as the key.
    key = rawParts[rawParts.length - 1].toLowerCase();
    modifiers.delete(key);
  }

  if (modifiers.has('shift') && !shiftIsSignificant(key)) modifiers.delete('shift');

  const ordered = MODIFIER_ORDER.filter((mod) => modifiers.has(mod));
  return [...ordered, key].join('+');
}

/**
 * Parse an authored binding string into a sequence of chords.
 * `'g i'` → `['g', 'i']`; `'mod+k'` → `['mod+k']`.
 */
export function parseSequence(input: string): Sequence {
  return input
    .trim()
    .split(/\s+/)
    .map(parseChord)
    .filter((chord) => chord !== '');
}

/** Serialise a sequence back to its canonical authored form. */
export function sequenceToString(sequence: Sequence): string {
  return sequence.join(' ');
}

/**
 * Derive the canonical chord for a live `KeyboardEvent`.
 *
 * The physical Ctrl and ⌘ keys are both representable: on Apple platforms ⌘ is
 * `mod` and Ctrl stays `ctrl`; elsewhere Ctrl is `mod` and ⌘ becomes `meta`.
 * That keeps `mod+k` portable while leaving genuine `ctrl+…` bindings possible.
 */
export function chordFromEvent(event: KeyboardEvent): Chord {
  const key = canonicalKeyName(event.key);
  const apple = isApplePlatform();
  const modifiers: string[] = [];

  if (apple ? event.metaKey : event.ctrlKey) modifiers.push('mod');
  if (apple ? event.ctrlKey : event.metaKey) modifiers.push(apple ? 'ctrl' : 'meta');
  if (event.altKey) modifiers.push('alt');
  if (event.shiftKey && shiftIsSignificant(key)) modifiers.push('shift');

  const ordered = MODIFIER_ORDER.filter((mod) => modifiers.includes(mod));
  return [...ordered, key].join('+');
}

/**
 * Chords to try for one event, most specific first.
 *
 * Pressing `Shift+E` should fire an explicit `shift+e` binding when one exists
 * and otherwise fall through to `e` — users type capitals without meaning to
 * ask for a different command.
 */
export function candidateChords(event: KeyboardEvent): Chord[] {
  const primary = chordFromEvent(event);
  if (!primary.includes('shift+')) return [primary];
  return [primary, primary.replace('shift+', '')];
}

const SYMBOL_LABELS: Record<string, string> = {
  mod: 'Mod',
  meta: '⊞',
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  escape: 'Esc',
  enter: 'Enter',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  space: 'Space',
  backspace: '⌫',
  delete: 'Del',
  pageup: 'PgUp',
  pagedown: 'PgDn',
  tab: 'Tab',
};

const APPLE_LABELS: Record<string, string> = {
  mod: '⌘',
  meta: '⌘',
  ctrl: '⌃',
  alt: '⌥',
  shift: '⇧',
  enter: '↩',
  backspace: '⌫',
  escape: 'esc',
  tab: '⇥',
};

/**
 * Human-readable pieces for one chord, ready to render as individual `kbd`
 * pills. Apple platforms get the glyph forms users expect there.
 */
export function chordToLabelParts(chord: Chord): string[] {
  const apple = isApplePlatform();
  return chord.split('+').map((part) => {
    if (!part) return '+';
    const label = (apple ? APPLE_LABELS[part] : undefined) ?? SYMBOL_LABELS[part];
    if (label) return label;
    return part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1);
  });
}

/** Flat display string for one binding, e.g. `⌘K` on macOS or `Ctrl K` elsewhere. */
export function formatBinding(input: string): string {
  return parseSequence(input)
    .map((chord) => chordToLabelParts(chord).join(isApplePlatform() ? '' : ' '))
    .join(' then ');
}
