/**
 * SIA-P2-4 (WR-E follow-up) — composer toolbar buttons must offer REAL >=44px
 * touch targets, sized in LAYOUT — never via invisible ::after halos.
 *
 * History: #906 shipped halos (`after:-inset-[Npx]`) to fake 44px hit areas on
 * compact desktop buttons. Two defects:
 *   (a) adjacent halos OVERLAPPED (up to ~14px of shared hit area), so taps in
 *       the overlap zone landed on the wrong button (later-DOM ::after wins);
 *   (b) the test accepted ANY `after:-inset-[` class without checking the halo
 *       was actually big enough for the button it sat on.
 * This file pins the replacement invariant instead:
 *   - every composer <button> carries min-h AND min-w >= 44px (or w-full, whose
 *     width is the container's) at EVERY breakpoint — no sm: shrinkers;
 *   - NO ::after hit-area halo anywhere on a composer button;
 *   - NO negative margins on composer buttons (the other way boxes overlap).
 * Because targets are honest layout boxes in normal flow, they cannot overlap
 * by construction. Real geometry (getBoundingClientRect + elementFromPoint hit
 * testing + Tab order) is verified in a real browser on mobile and desktop —
 * see the WR-E verification notes; this suite pins the declared CSS contract
 * that the browser check measures.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DockedComposer } from '../DockedComposer';
import { EmailComposer } from '../EmailComposer';

// ---- module mocks for server-side renders (same harness as the other composer tests) ----
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@quant/shared-ui', () => ({
  nextRovingIndex: () => 0,
  rovingTabIndex: () => 0,
}));
vi.mock('../Quanty', () => ({ Quanty: () => null }));
vi.mock('../../lib/quanty/reactions', () => ({
  quantyReact: vi.fn(),
  useQuantyMood: () => 'neutral',
}));
vi.mock('../InboxToast', () => ({ showToast: vi.fn() }));
vi.mock('../../lib/email-body', () => ({
  composeMessageBodies: (text: string) => ({ bodyText: text, bodyHtml: text }),
  htmlToPlainText: (html: string) => html,
}));
vi.mock('../../lib/email-signature-preference', () => ({
  loadDefaultSignatureHtml: async () => '',
}));
vi.mock('../../lib/safe-html', () => ({ useSafeEmailHtml: (html: string) => html }));
vi.mock('../../providers/auth-provider', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../hooks/useDeferredMount', () => ({ useDeferredMount: () => false }));
vi.mock('../useDraftAutosave', () => ({
  useDraftAutosave: () => ({}),
  draftSaveStateLabel: () => '',
}));
vi.mock('../RecipientChipInput', () => ({
  RecipientChipInput: () => null,
  parseEmailString: (s: string) =>
    String(s).split(/[,;\s]+/).filter(Boolean).map((email) => ({ email })),
}));
vi.mock('../../hooks/useContacts', () => ({ useContacts: () => ({ data: [] }) }));
vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => ({ confirm: vi.fn(), dialog: null }),
}));
vi.mock('../UndoSendCountdownBar', () => ({
  useUndoSend: () => ({ queueSend: vi.fn() }),
}));
vi.mock('../../services/api-client', () => ({ apiClient: {} }));
vi.mock('@quant/api-client', () => ({ apiFetchRaw: vi.fn() }));

const COMPONENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name: string) => readFileSync(join(COMPONENTS_DIR, name), 'utf8');

/** Parse a Tailwind min-h/min-w token to px. Supports arbitrary values
 *  (min-h-[44px]), the spacing scale (min-h-11 -> 44), and the repo's
 *  min-h-touch / min-w-touch 44px utilities. Returns null when absent. */
function parseMinSize(tokens: string[], prefix: 'min-h' | 'min-w'): number | null {
  for (const t of tokens) {
    let m = t.match(new RegExp(`^${prefix}-\\[(\\d+)px\\]$`));
    if (m) return parseInt(m[1], 10);
    m = t.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m && m[1] !== '0') return parseInt(m[1], 10) * 4;
    if (t === `${prefix}-touch`) return 44;
  }
  return null;
}

/**
 * Assert the WR-E invariant on one button's class attribute: a REAL >=44px
 * layout target. Throws a descriptive assertion failure otherwise.
 *
 * This is the anti-#906 check: a bare `after:-inset-[Npx]` class is REJECTED
 * outright (it used to pass), and the 44px floor is measured from the actual
 * min-h/min-w utilities instead of trusted from a halo's presence.
 */
export function assertLayoutTouchTarget(classAttr: string, where: string): void {
  // Strip template-literal interpolations: only the static class list counts.
  const staticPart = classAttr.split('${')[0];
  const tokens = staticPart.split(/\s+/).filter(Boolean);

  // Reject ::after hit-area halos in any variant form: arbitrary-value
  // (after:-inset-[6px]) AND scale-value (after:-inset-2), with or without a
  // responsive/state variant prefix (sm:, hover:, ...).
  expect(
    tokens.some((t) => /(^|[\w-]+:)after:-inset(-\w+)?(-\[[^\]]+\]|-\d+(\.\d+)?)?$/.test(t)),
    `${where}: ::after hit-area halo found — targets must be layout-sized (min-h/min-w 44px), not halos: ${staticPart.slice(0, 140)}`,
  ).toBe(false);

  // Reject ANY breakpoint-prefixed min-h/min-w override: the 44px floor must
  // hold at every breakpoint, so md:min-h-0 or md:min-h-[24px] fail even
  // though the unprefixed min-h-[44px] check below would pass them.
  expect(
    tokens.some((t) => /^[\w-]+:min-[hw]-/.test(t)),
    `${where}: breakpoint-prefixed min-h/min-w override kills the 44px floor at that breakpoint — targets must hold at every breakpoint: ${staticPart.slice(0, 140)}`,
  ).toBe(false);

  // Negative margins let layout boxes overlap — forbidden on touch targets.
  // Variant-prefixed forms (sm:-mt-2) count too.
  expect(
    tokens.some((t) => /^([\w-]+:)?-m[trblxy]?-/.test(t)),
    `${where}: negative margin lets layout boxes overlap — forbidden on touch targets: ${staticPart.slice(0, 140)}`,
  ).toBe(false);

  const minH = parseMinSize(tokens, 'min-h');
  expect(
    minH !== null && minH >= 44,
    `${where}: no min-h >= 44px — measured min-h is ${minH === null ? 'absent' : `${minH}px`}: ${staticPart.slice(0, 140)}`,
  ).toBe(true);

  const minW = parseMinSize(tokens, 'min-w');
  const fullWidth = tokens.includes('w-full');
  expect(
    (minW !== null && minW >= 44) || fullWidth,
    `${where}: no min-w >= 44px (and not w-full) — measured min-w is ${minW === null ? 'absent' : `${minW}px`}: ${staticPart.slice(0, 140)}`,
  ).toBe(true);
}

function renderedButtons(html: string): Array<{ cls: string; label: string; tag: string }> {
  const out: Array<{ cls: string; label: string; tag: string }> = [];
  const re = /<button\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const c = attrs.match(/class="([^"]*)"/);
    const l = attrs.match(/(?:title|aria-label)="([^"]*)"/);
    out.push({ cls: c ? c[1] : '', label: l ? l[1] : '(no label)', tag: m[0] });
  }
  return out;
}

function extractClass(source: string, at: number): string | null {
  const rest = source.slice(at);
  const quoted = rest.match(/^className="([^"]*)"/);
  if (quoted) return quoted[1];
  // JSX expression forms: className={`...`} (possibly multiline — the static
  // prefix before any ${...} is what assertLayoutTouchTarget inspects).
  const expr = rest.match(/^className=\{(`(?:[^`\\]|\\.)*`|"[^"]*")/);
  if (expr) return expr[1];
  return null;
}

/** Index of the '>' that closes the JSX opening tag starting at tagStart.
 *  Tracks {}, (), and quote depth so '>' inside attributes (e.g. `() =>`)
 *  is not mistaken for the tag close. */
function tagCloseIndex(source: string, tagStart: number): number {
  let brace = 0;
  let paren = 0;
  let inSingle = false;
  let inDouble = false;
  let inBack = false;
  for (let k = tagStart; k < source.length; k++) {
    const ch = source[k];
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inBack) {
      if (ch === '`') inBack = false;
      continue;
    }
    if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
    else if (ch === '`') inBack = true;
    else if (ch === '{') brace++;
    else if (ch === '}') brace--;
    else if (ch === '(') paren++;
    else if (ch === ')') paren--;
    else if (ch === '>' && brace === 0 && paren === 0) return k;
  }
  return -1;
}

/** The className of the <button> whose opening tag contains `marker`.
 *  Scoped to that tag so we never grab a child element's (e.g. <svg>) class.
 *  Fails loudly when a marker vanishes or stops being a button attribute. */
function classesNear(source: string, marker: string): string[] {
  const idxs: number[] = [];
  let i = source.indexOf(marker);
  while (i !== -1) {
    idxs.push(i);
    i = source.indexOf(marker, i + 1);
  }
  expect(idxs.length).toBeGreaterThan(0);
  return idxs.map((idx) => {
    const tagStart = source.lastIndexOf('<button', idx);
    expect(tagStart, `marker is not inside a <button> tag: ${marker}`).not.toBe(
      -1,
    );
    const tagClose = tagCloseIndex(source, tagStart);
    expect(tagClose, `unparseable <button> tag for: ${marker}`).not.toBe(-1);
    expect(
      idx,
      `marker is not an attribute of the <button> tag: ${marker}`,
    ).toBeLessThan(tagClose);
    const tag = source.slice(tagStart, tagClose);
    let at = tag.lastIndexOf('className=', idx - tagStart);
    if (at === -1) at = tag.indexOf('className=');
    expect(at, `no className on button for: ${marker}`).not.toBe(-1);
    const cls = extractClass(source, tagStart + at);
    expect(cls, `no parseable className on button for: ${marker}`).not.toBeNull();
    return cls as string;
  });
}

describe('SIA-P2-4 rendered: every default-rendered composer button is a real >=44px layout target', () => {
  it('DockedComposer (header + bottom action bar)', () => {
    const html = renderToStaticMarkup(
      <DockedComposer isOpen={true} onClose={() => {}} />,
    );
    const buttons = renderedButtons(html);
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      assertLayoutTouchTarget(b.cls, `DockedComposer button "${b.label}"`);
      // Keyboard: a native <button> is Tab-focusable unless explicitly removed.
      expect(
        /\stabindex="-1"/.test(b.tag),
        `DockedComposer button "${b.label}" is removed from the Tab order`,
      ).toBe(false);
    }
  });

  it('EmailComposer (header + bottom action bar)', () => {
    const html = renderToStaticMarkup(<EmailComposer onClose={() => {}} />);
    const buttons = renderedButtons(html);
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      assertLayoutTouchTarget(b.cls, `EmailComposer button "${b.label}"`);
      expect(
        /\stabindex="-1"/.test(b.tag),
        `EmailComposer button "${b.label}" is removed from the Tab order`,
      ).toBe(false);
    }
  });
});

describe('SIA-P2-4 source pins: every toolbar button keeps its layout-sized target', () => {
  it('EmailComposer toolbar buttons (44px at every breakpoint, no halos)', () => {
    const src = read('EmailComposer.tsx');
    const markers = [
      'title="Back (1 page)"',
      'title="More options"',
      'onClick={() => setShowCc(true)}',
      'onClick={() => setShowBcc(true)}',
      'setIsTemplateMode((prev) => !prev)',
      'onClick={handleAddDetail}',
      'Font family: ${selectedFont.name}',
      'Font size: ${selectedSize.name}',
      'aria-label="Bold"',
      'aria-label="Italic"',
      'aria-label="Underline"',
      'aria-label="Strikethrough"',
      'Text colour: ${textColor.label}',
      'title={alignment.label}',
      'aria-label="Bulleted list"',
      'aria-label="Numbered list"',
      'aria-label="Insert emoji"',
      'title="Clear formatting"',
      'aria-disabled={busy || sendBlockReason !== null}',
      'Send options (Save draft / Schedule send)',
      'aria-label="Discard draft"',
      'aria-label="Open Quanty AI Copilot"',
      'aria-label={`Remove attachment ${file.name}`}',
    ];
    for (const marker of markers) {
      for (const cls of classesNear(src, marker)) {
        assertLayoutTouchTarget(cls, `EmailComposer "${marker}"`);
      }
    }
  });

  it('DockedComposer toolbar buttons (44px at every breakpoint, no halos)', () => {
    const src = read('DockedComposer.tsx');
    const markers = [
      'aria-label="Restore composer"',
      'aria-label="Close composer"',
      'aria-label="Minimize composer"',
      'setShowCcBcc(true)',
      'title="Bold"',
      'title="Italic"',
      'title="Underline"',
      'title="Bulleted list"',
      'Send email (⌘↵ or Ctrl+Enter)',
      'title="Formatting options"',
      'title="Attach files (25MB limit)"',
      'Writing assistant — local templates',
      'title="Discard draft"',
      'title="Remove attachment"',
      'aria-label="Schedule send"',
    ];
    for (const marker of markers) {
      for (const cls of classesNear(src, marker)) {
        assertLayoutTouchTarget(cls, `DockedComposer "${marker}"`);
      }
    }
  });

  it('ConversationalThreadView quick-reply bar (44px at every breakpoint, no halos)', () => {
    const src = read('ConversationalThreadView.tsx');
    const markers = [
      'aria-label="Cancel quoted reply"',
      'onClick={() => setComposeMode(mode)}',
      'title="Attachments aren\'t supported in quick reply yet"',
      'aria-label="Attachments aren\'t supported in quick reply yet"',
      'aria-label="Ask Quanty AI to write a response"',
      'onClick={handleBarSend}',
      'data-testid="quick-reply-schedule-button"',
    ];
    for (const marker of markers) {
      for (const cls of classesNear(src, marker)) {
        assertLayoutTouchTarget(cls, `quick-reply "${marker}"`);
      }
    }
  });
});
