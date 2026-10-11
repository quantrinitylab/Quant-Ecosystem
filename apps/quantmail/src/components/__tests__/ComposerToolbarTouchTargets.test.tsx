/**
 * SIA-P2-4 — composer toolbar buttons must offer >=44px touch targets.
 *
 * The composer toolbars are visually compact on desktop (and the DockedComposer
 * everywhere), so each undersized button carries an invisible ::after halo
 * (`after:-inset-[Npx]`, sm-gated where mobile already renders 44px) sized so the
 * HIT TARGET — not the paint box — reaches 44px. Visuals are unchanged.
 *
 * These tests pin that invariant two ways:
 *  (a) rendered: every <button> the composers render by default declares a target;
 *  (b) source: every known toolbar button (including toggle-hidden formatting
 *      toolbars) has a halo or a real 44px min-size near its marker.
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

/** A button declares a >=44px touch target when it has a real 44px min-size at
 *  every breakpoint, or an ::after hit-area halo (sm-gated or not). */
function hasTouchTarget(classAttr: string): boolean {
  const staticPart = classAttr.split('${')[0];
  const real44 =
    staticPart.includes('min-h-[44px]') && !staticPart.includes('sm:min-h-0');
  const halo = /(^|\s)(sm:)?after:-inset-\[/.test(staticPart);
  return real44 || halo;
}

function renderedButtons(html: string): Array<{ cls: string; label: string }> {
  const out: Array<{ cls: string; label: string }> = [];
  const re = /<button\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const c = attrs.match(/class="([^"]*)"/);
    const l = attrs.match(/(?:title|aria-label)="([^"]*)"/);
    out.push({ cls: c ? c[1] : '', label: l ? l[1] : '(no label)' });
  }
  return out;
}

function extractClass(source: string, at: number): string | null {
  const rest = source.slice(at);
  const quoted = rest.match(/^className="([^"]*)"/);
  if (quoted) return quoted[1];
  // JSX expression forms: className={`...`} or className={"..."}.
  // The template-literal static prefix (before any ${...}) is what
  // hasTouchTarget inspects.
  const expr = rest.match(/^className=\{(`[^`]*`|"[^"]*")/);
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

describe('SIA-P2-4 rendered: every default-rendered composer button has a >=44px target', () => {
  it('DockedComposer (header + bottom action bar)', () => {
    const html = renderToStaticMarkup(
      <DockedComposer isOpen={true} onClose={() => {}} />,
    );
    const buttons = renderedButtons(html);
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      expect(
        hasTouchTarget(b.cls),
        `DockedComposer button "${b.label}" lacks a >=44px touch target: ${b.cls.slice(0, 120)}`,
      ).toBe(true);
    }
  });

  it('EmailComposer (header + bottom action bar)', () => {
    const html = renderToStaticMarkup(<EmailComposer onClose={() => {}} />);
    const buttons = renderedButtons(html);
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      expect(
        hasTouchTarget(b.cls),
        `EmailComposer button "${b.label}" lacks a >=44px touch target: ${b.cls.slice(0, 120)}`,
      ).toBe(true);
    }
  });
});

describe('SIA-P2-4 source pins: every toolbar button keeps its halo', () => {
  it('EmailComposer toolbar buttons (sm-gated halos; mobile already 44px)', () => {
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
    ];
    for (const marker of markers) {
      for (const cls of classesNear(src, marker)) {
        expect(
          /(^|\s)sm:after:-inset-\[/.test(cls),
          `EmailComposer "${marker}" lost its sm-gated halo`,
        ).toBe(true);
      }
    }
    // The desktop Quanty copilot trigger (hidden on mobile) carries an ungated
    // halo. The mobile Quanty trigger is sm:hidden with real 44px min-size, so
    // it needs no halo; it is covered by the rendered test above.
    for (const cls of classesNear(src, 'aria-label="Open Quanty AI Copilot"')) {
      expect(/(^|\s)after:-inset-\[/.test(cls)).toBe(true);
    }
  });

  it('DockedComposer toolbar buttons (ungated halos; compact at every breakpoint)', () => {
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
    ];
    for (const marker of markers) {
      for (const cls of classesNear(src, marker)) {
        expect(
          hasTouchTarget(cls),
          `DockedComposer "${marker}" lost its >=44px touch target`,
        ).toBe(true);
      }
    }
    // The attachment remove X is destructive with no undo, so its hit area is a
    // halo (not real padding): the chip must not grow. 12px icon + 16px halo
    // each side = 44px hit target, same pattern as EmailComposer's remove.
    for (const cls of classesNear(src, 'title="Remove attachment"')) {
      expect(
        hasTouchTarget(cls),
        `DockedComposer "Remove attachment" lost its >=44px touch target`,
      ).toBe(true);
    }
  });

  it('ConversationalThreadView quick-reply bar (ungated halos)', () => {
    const src = read('ConversationalThreadView.tsx');
    const markers = [
      'aria-label="Cancel quoted reply"',
      'onClick={() => setComposeMode(mode)}',
      'title="Attachments aren\'t supported in quick reply yet"',
      'aria-label="Attachments aren\'t supported in quick reply yet"',
      'aria-label="Ask Quanty AI to write a response"',
      'onClick={handleBarSend}',
    ];
    for (const marker of markers) {
      for (const cls of classesNear(src, marker)) {
        expect(
          hasTouchTarget(cls),
          `quick-reply "${marker}" lost its >=44px touch target`,
        ).toBe(true);
      }
    }
  });
});
