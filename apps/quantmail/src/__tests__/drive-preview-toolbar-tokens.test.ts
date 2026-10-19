import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// QM-FIX-LOOP — Drive preview toolbar action buttons must use app tokens
// (fix/qm-drive-preview-toolbar-tokens).
//
// The preview lightbox's Copy button rendered one-off off-black surfaces
// (bg-[#1D2027] / hover:bg-[#252A33] / border-[#323642]) instead of the app
// tokens (bg-[var(--quant-surface-elevated)] / border-[var(--quant-border)]),
// and the sibling Details button in the same preview header used
// border-[#232938] / text-[#94A3B8] / hover:text-[#F8FAFC].
// These were replaced with the --quant-* tokens the rest of the Drive
// preview surface already uses (pure-black elevation, hairline border,
// foreground/muted tokens).
//
// Scope note: this suite asserts on the preview-modal region only (from the
// "File Preview Lightbox Modal" comment to EOF). Other Drive surfaces such as
// the Shared-tab sub-filter keep their own styling and are intentionally not
// covered here.

const PAGE_PATH = path.resolve(
  __dirname,
  '../app/drive/page.tsx',
);
const MARKER = 'File Preview Lightbox Modal';

function previewRegion(): string {
  const src = fs.readFileSync(PAGE_PATH, 'utf8');
  const idx = src.indexOf(MARKER);
  expect(idx).toBeGreaterThanOrEqual(0);
  return src.slice(idx);
}

describe('drive preview toolbar token surfaces', () => {
  it('the preview Copy toolbar button uses token surfaces and border', () => {
    const region = previewRegion();
    // handleCopyTextPreview wires the button; its className must be tokenized.
    const buttonIdx = region.indexOf('handleCopyTextPreview');
    expect(buttonIdx).toBeGreaterThanOrEqual(0);
    const window = region.slice(
      Math.max(0, buttonIdx - 800),
      buttonIdx + 800,
    );
    expect(window).toContain('bg-[var(--quant-surface-elevated)]');
    expect(window).toContain('border-[var(--quant-border)]');
    expect(window).toContain('text-[var(--quant-foreground)]');
    expect(window).toContain('hover:bg-[var(--quant-surface-hover)]');
  });

  it('no preview toolbar button keeps the one-off #1D2027 / #252A33 / #323642 hexes', () => {
    const region = previewRegion();
    expect(region).not.toContain('bg-[#1D2027]');
    expect(region).not.toContain('hover:bg-[#252A33]');
    expect(region).not.toContain('border-[#323642]');
  });

  it('the preview Details button uses token border and text colors', () => {
    const region = previewRegion();
    const btnIdx = region.indexOf('setDetailsTarget(previewItem)');
    expect(btnIdx).toBeGreaterThanOrEqual(0);
    const window = region.slice(
      Math.max(0, btnIdx - 800),
      btnIdx + 800,
    );
    expect(window).toContain('bg-[var(--quant-surface-elevated)]');
    expect(window).toContain('border-[var(--quant-border)]');
    expect(window).toContain('text-[var(--quant-muted-foreground)]');
    expect(window).toContain('hover:text-[var(--quant-foreground)]');
    // Sibling one-off hexes the fix removed from the preview header:
    expect(window).not.toContain('border-[#232938]');
    expect(window).not.toContain('text-[#94A3B8]');
    expect(window).not.toContain('hover:text-[#F8FAFC]');
  });
});
