/**
 * QM compose pure-black / no-divider-lines lock.
 *
 * Both composers (DockedComposer + EmailComposer) must render pure-black
 * surfaces with sections separated by SPACING (px/py/gap), never divider
 * lines — the user-locked rule. This pins the invariant two ways:
 *
 *  (a) source: neither .tsx may contain divider class tokens (border-b,
 *      border-t, divide-y/x) or hard-coded GitHub-dark grays (#1E2536,
 *      #232938, #10141E, #141824). EmailComposer's print-block subtree is
 *      exempt by design and is excluded from the scan.
 *  (b) rendered: the static markup of both composers (print block stripped)
 *      contains no divider tokens and no w-px/h-px separator divs.
 *
 * Exempt by design (not divider lines): the send-progress spinner's
 * `border-t-[...]` animation segment, the split-button `border-l` on the
 * accent Send-options chevron, full `border` frame outlines, and the
 * print-block subtree.
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

/**
 * Divider class tokens, with token boundaries so `border-transparent` and
 * friends never match:
 * - `border-b` standalone AND `border-b-<n>` (a real divider such as
 *   `border-b-2` must trip the lock — the print block, the one place that
 *   legitimately uses it, is excluded from the scan by withoutPrintBlock).
 * - `border-t` standalone, but NOT `border-t-[...]` (the spinner's animated
 *   segment, exempt by design).
 * - `divide-x` / `divide-y` standalone (not `divide-x-reverse`).
 */
const DIVIDER_RE =
  /(?<![\w-])border-b(?![\w\[])|(?<![\w-])border-t(?![\w\[-])|(?<![\w-])divide-[xy](?![\w-])/;
/** Hard-coded GitHub-dark grays that must not appear in compose surfaces. */
const HARD_GRAY_RE = /#1E2536|#232938|#10141E|#141824/i;

/**
 * Remove exactly the print-block subtree (and nothing else): find the
 * `hidden print:block` marker, walk back to its opening <div, then count
 * nested <div>...</div> pairs to the matching close. The sections after the
 * print block (schedule modal, drive picker, permission dialog, insert-link
 * modal) stay in the scan — the old slice(0, idx) silently exempted them.
 */
function withoutPrintBlock(html: string): string {
  const marker = 'hidden print:block';
  const idx = html.indexOf(marker);
  expect(idx, 'print-block marker moved — update the exemption').toBeGreaterThan(0);
  const open = html.lastIndexOf('<div', idx);
  expect(open, 'print-block wrapper <div not found').toBeGreaterThanOrEqual(0);
  let depth = 0;
  const re = /<\/?div\b/g;
  re.lastIndex = open;
  let m: RegExpExecArray | null;
  let end = -1;
  while ((m = re.exec(html)) !== null) {
    depth += m[0] === '<div' ? 1 : -1;
    if (depth === 0) {
      end = m.index + m[0].length;
      break;
    }
  }
  expect(end, 'print-block closing </div> not found — update the exemption').toBeGreaterThan(0);
  return html.slice(0, open) + html.slice(end);
}

function composerSource(name: 'DockedComposer.tsx' | 'EmailComposer.tsx'): string {
  const src = read(name);
  if (name === 'EmailComposer.tsx') {
    return withoutPrintBlock(src);
  }
  return src;
}

describe('compose no-divider-lines lock: source pins', () => {
  for (const name of ['DockedComposer.tsx', 'EmailComposer.tsx'] as const) {
    it(`${name} has no divider class tokens (print block exempt)`, () => {
      const src = composerSource(name);
      const m = src.match(DIVIDER_RE);
      expect(m, `${name} regressed: divider token "${m?.[0]}" found`).toBeNull();
    });

    it(`${name} has no hard-coded GitHub-dark grays (print block exempt)`, () => {
      const src = composerSource(name);
      const m = src.match(HARD_GRAY_RE);
      expect(m, `${name} regressed: hard gray "${m?.[0]}" found`).toBeNull();
    });
  }
});

describe('compose no-divider-lines lock: rendered markup', () => {
  it('DockedComposer renders without divider lines', () => {
    const html = renderToStaticMarkup(
      <DockedComposer isOpen={true} onClose={() => {}} />,
    );
    expect(html.length).toBeGreaterThan(0);
    const m = html.match(DIVIDER_RE);
    expect(m, `DockedComposer rendered a divider token "${m?.[0]}"`).toBeNull();
    // No pixel separator divs either — any 1px-wide/tall utility is a line.
    expect(/(?<![\w-])[wh]-px(?![\w-])/.test(html)).toBe(false);
    // Spacing (not lines) separates the header from the body.
    expect(html).toContain('py-2.5');
  });

  it('EmailComposer renders without divider lines', () => {
    const html = withoutPrintBlock(
      renderToStaticMarkup(<EmailComposer onClose={() => {}} />),
    );
    expect(html.length).toBeGreaterThan(0);
    const m = html.match(DIVIDER_RE);
    expect(m, `EmailComposer rendered a divider token "${m?.[0]}"`).toBeNull();
    expect(/(?<![\w-])[wh]-px(?![\w-])/.test(html)).toBe(false);
    // Spacing (not lines) separates the header from the body.
    expect(html).toContain('py-3');
  });
});
