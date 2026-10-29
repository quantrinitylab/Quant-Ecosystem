/**
 * DockedComposer "Writing assist" must use the Mail accent, not QuantGit purple.
 *
 * Regression: the Writing-assist trigger + popup menu were hardcoded to
 * QuantGit-purple (#8B5CF6 / #3B0764 / #130E20) inside the Mail composer,
 * violating the user-locked per-app accent (Mail = #FF6B35; purple is
 * QuantGit's pillar accent per pillar-accents.ts). Every other composer
 * control uses var(--quant-primary), which resolves to Mail orange in this
 * theme — the trigger now mirrors the sibling Templates button exactly, and
 * the menu shell/items use the same variable. The menu is closed by default,
 * so the menu half is pinned via the source contract (same established
 * pattern as ComposerToolbarTouchTargets) while the trigger is pinned via
 * the rendered markup too.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DockedComposer } from '../DockedComposer';
import { PILLAR_ACCENTS } from '../pillar-accents';

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
const source = readFileSync(join(COMPONENTS_DIR, 'DockedComposer.tsx'), 'utf8');

// The trigger button + popup menu block, bounded by its own section comments
// so a purple hex elsewhere in the file can never false-pass or false-fail us.
function writingAssistRegion(): string {
  const start = source.indexOf('{/* Writing-assistant trigger');
  const end = source.indexOf('{/* Saved email templates', start);
  expect(start, 'Writing-assistant trigger section missing').not.toBe(-1);
  expect(end, 'Saved-templates section missing (region end)').not.toBe(-1);
  return source.slice(start, end);
}

const QUANTGIT_PURPLES = ['#8b5cf6', '#3b0764', '#130e20'];

describe('DockedComposer Writing assist uses the Mail accent', () => {
  it('pillar lock: Mail and QuantGit accents are distinct', () => {
    expect(PILLAR_ACCENTS.mail).toBe('#FF6B35');
    expect(PILLAR_ACCENTS.quantgit).toBe('#8B5CF6');
    expect(PILLAR_ACCENTS.mail).not.toBe(PILLAR_ACCENTS.quantgit);
  });

  it('source: no QuantGit-purple hex anywhere in the trigger + menu block', () => {
    const region = writingAssistRegion();
    const lower = region.toLowerCase();
    for (const hex of QUANTGIT_PURPLES) {
      expect(
        lower.includes(hex),
        `QuantGit-purple ${hex} still present in the Writing-assist block`,
      ).toBe(false);
    }
    // And the block is actually accented via the Mail variable, not unstyled.
    expect(region).toContain('var(--quant-primary)');
  });

  it('source: trigger mirrors the sibling Templates button accent classes', () => {
    const region = writingAssistRegion();
    const triggerAt = region.indexOf('Writing assistant — local templates, no AI');
    expect(triggerAt).not.toBe(-1);
    const triggerTag = region.slice(region.lastIndexOf('<button', triggerAt));
    expect(triggerTag).toContain('border-[var(--quant-primary)]/40');
    expect(triggerTag).toContain('bg-[var(--quant-primary)]/10');
    expect(triggerTag).toContain('text-[var(--quant-primary)]');
  });

  it('source: menu shell + items use the Mail accent, on a pure-black shell', () => {
    const region = writingAssistRegion();
    const menuAt = region.indexOf('{/* Writing-assistant menu */}');
    expect(menuAt).not.toBe(-1);
    const menu = region.slice(menuAt);
    expect(menu).toContain('border-[var(--quant-primary)]/40 bg-black');
    expect(menu).toContain('hover:bg-[var(--quant-primary)]/20');
    expect(menu).toContain('text-[var(--quant-primary)]');
  });

  it('rendered: the visible Writing assist trigger carries the Mail accent', () => {
    const html = renderToStaticMarkup(
      <DockedComposer isOpen={true} onClose={() => {}} />,
    );
    const m = html.match(
      /<button\b[^>]*title="Writing assistant[^"]*"[^>]*>/,
    );
    expect(m, 'Writing assist trigger not rendered').not.toBeNull();
    const tag = m![0];
    expect(tag).toContain('var(--quant-primary)');
    expect(tag.toLowerCase()).not.toContain('#8b5cf6');
  });
});
