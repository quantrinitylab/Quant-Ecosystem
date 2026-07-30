import {
  createEndorsedProductLockup,
  generateFoundationThemeDeclarations,
  type FoundationMode,
} from './foundation';

const previewModes: ReadonlyArray<{ mode: FoundationMode; label: string }> = [
  { mode: 'dark', label: 'Dark foundation' },
  { mode: 'light', label: 'Light foundation' },
  { mode: 'highContrast', label: 'High contrast' },
];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderThemeContract(): string {
  return previewModes
    .map(
      ({ mode }) => `[data-quant-theme="${mode}"] {\n${generateFoundationThemeDeclarations(
        mode,
      )}\n}`,
    )
    .join('\n\n');
}

function renderPreviewPanel(
  mode: FoundationMode,
  label: string,
  productName: string,
  accessibleName: string,
): string {
  return `<section class="preview-panel" data-quant-theme="${mode}" aria-label="${escapeHtml(
    `${label}: ${accessibleName}`,
  )}">
  <div class="panel-kicker">${escapeHtml(label)}</div>
  <div class="lockup" role="img" aria-label="${escapeHtml(accessibleName)}">
    <div class="product-name">${escapeHtml(productName)}</div>
    <div class="endorsement"><span>by</span> <strong>QUANTRINITY</strong></div>
  </div>

  <div class="surface-stack" aria-label="Surface hierarchy">
    <div class="surface surface-one">Surface 1</div>
    <div class="surface surface-two">Surface 2</div>
    <div class="surface surface-three">Surface 3</div>
  </div>

  <div class="type-sample">
    <h2>Make complex work feel inevitable.</h2>
    <p>Strong hierarchy, quiet confidence and semantic colour roles that remain legible.</p>
    <small>Muted metadata · 12 minutes ago</small>
  </div>

  <div class="actions" aria-label="Action states">
    <button type="button">Primary action</button>
    <a href="#preview-note">Keyboard focus</a>
  </div>

  <div class="signals" aria-label="Semantic status colours">
    <span class="signal success">Success</span>
    <span class="signal warning">Warning</span>
    <span class="signal danger">Danger</span>
    <span class="signal info">Information</span>
    <span class="signal ai">AI context</span>
  </div>
</section>`;
}

/**
 * Build a dependency-free visual verification document for the foundation.
 * It intentionally renders no logo SVG while mastermark geometry awaits review.
 */
export function generateFoundationPreviewDocument(productName = 'QuantMail'): string {
  const lockup = createEndorsedProductLockup(productName);
  const panels = previewModes
    .map(({ mode, label }) =>
      renderPreviewPanel(mode, label, lockup.productName, lockup.accessibleName),
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(lockup.accessibleName)} · Foundation preview</title>
<style>
${renderThemeContract()}

* { box-sizing: border-box; }
body {
  margin: 0;
  padding: clamp(24px, 5vw, 72px);
  background: #050708;
  color: #f7f8f4;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.preview-header { max-width: 760px; margin: 0 auto 36px; }
.preview-header p { color: #a7aca2; line-height: 1.65; }
.preview-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 20px; }
.preview-panel {
  min-width: 0;
  padding: clamp(24px, 4vw, 40px);
  border: 1px solid var(--qt-border-default);
  border-radius: 28px;
  background: var(--qt-canvas);
  color: var(--qt-text-default);
  box-shadow: 0 28px 80px rgb(0 0 0 / 22%);
}
.panel-kicker {
  margin-bottom: 30px;
  color: var(--qt-text-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.lockup { margin-bottom: 32px; }
.product-name {
  color: var(--qt-text-strong);
  font-size: clamp(2.4rem, 7vw, 4.5rem);
  font-weight: 720;
  letter-spacing: -0.055em;
  line-height: 0.95;
}
.endorsement { margin-top: 11px; color: var(--qt-text-muted); font-size: 0.78rem; }
.endorsement strong { color: var(--qt-text-default); font-size: 0.45em; letter-spacing: 0.14em; }
.surface-stack { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 28px; }
.surface { min-height: 70px; padding: 12px; border: 1px solid var(--qt-border-subtle); border-radius: 14px; font-size: 0.7rem; }
.surface-one { background: var(--qt-surface-1); }
.surface-two { background: var(--qt-surface-2); }
.surface-three { background: var(--qt-surface-3); }
.type-sample h2 { margin: 0 0 10px; color: var(--qt-text-strong); font-size: 1.2rem; line-height: 1.2; }
.type-sample p { margin: 0 0 10px; line-height: 1.55; }
.type-sample small { color: var(--qt-text-muted); }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 26px 0; }
.actions button,
.actions a { border-radius: 999px; padding: 11px 16px; font: inherit; font-size: 0.82rem; font-weight: 700; }
.actions button { border: 0; background: var(--qt-action-primary); color: var(--qt-action-primary-foreground); }
.actions button:hover { background: var(--qt-action-primary-hover); }
.actions a { border: 1px solid var(--qt-border-default); color: var(--qt-text-default); text-decoration: none; }
.actions :focus-visible { outline: 3px solid var(--qt-focus-ring); outline-offset: 3px; }
.signals { display: flex; flex-wrap: wrap; gap: 8px; }
.signal { padding: 6px 9px; border: 1px solid currentColor; border-radius: 999px; font-size: 0.68rem; font-weight: 700; }
.success { color: var(--qt-success); }
.warning { color: var(--qt-warning); }
.danger { color: var(--qt-danger); }
.info { color: var(--qt-info); }
.ai { color: var(--qt-ai-context); }
.preview-note { max-width: 760px; margin: 32px auto 0; color: #a7aca2; line-height: 1.6; }
</style>
</head>
<body>
<header class="preview-header">
  <div class="panel-kicker">Quant Design OS · Verification surface</div>
  <h1>${escapeHtml(lockup.productName)} foundation preview</h1>
  <p>One isolated document for evaluating semantic tokens, endorsed-brand hierarchy, interaction states and accessibility before production migration.</p>
</header>
<main class="preview-grid">
${panels}
</main>
<p class="preview-note" id="preview-note">The parent mastermark is intentionally absent. This surface validates the system contract without presenting unreviewed geometry as final brand artwork.</p>
</body>
</html>`;
}
