import fs from 'node:fs';
import tseslint from 'typescript-eslint';

/**
 * QM-UIUX-005 — bans rendered text below the 10px floor.
 *
 * - JS/TS rule (`type-scale/no-sub-10px-type`): scans source text for
 *   `text-[<10px]` Tailwind arbitrary values and inline `fontSize` < 10px.
 * - CSS processor (`type-scale/css-type-floor`): parses every rule in
 *   `*.css` and flags `font-size` declarations that compute to < 10px
 *   (px values, and rem values assuming the 16px root).
 */
const TYPE_MIN_PX = 10;

/** Exported for unit-testing the QM-UIUX-005 floor scanner. */
export function findSub10pxTypeViolations(text) {
  const violations = [];
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    // Tailwind arbitrary values: text-[9px], !text-[8px], font-[7px], …
    let m;
    const twRe = /(?:^|[^a-zA-Z-])!?text-\[([0-9]+)px\]|(?:^|[^a-zA-Z-])!?font-\[([0-9]+)px\]/g;
    while ((m = twRe.exec(line)) !== null) {
      const px = Number(m[1] ?? m[2]);
      if (px < TYPE_MIN_PX) {
        violations.push({
          line: lineNo,
          column: m.index + 1,
          message: `QM-UIUX-005: text below the 10px floor (${px}px) — use var(--q-type-xs) or a larger scale step.`,
        });
      }
    }
    // CSS font-size declarations: 8px, 0.5rem, .58rem, …
    const cssRe = /font-size\s*:\s*([0-9]*\.?[0-9]+)\s*(px|rem)\b/gi;
    while ((m = cssRe.exec(line)) !== null) {
      const raw = Number(m[1]);
      const px = m[2].toLowerCase() === 'rem' ? raw * 16 : raw;
      if (px < TYPE_MIN_PX) {
        violations.push({
          line: lineNo,
          column: m.index + 1,
          message: `QM-UIUX-005: font-size ${m[1]}${m[2]} renders below the 10px floor — use var(--q-type-xs) or a larger scale step.`,
        });
      }
    }
    // Inline React styles: fontSize: '9px' / fontSize: 9 / fontSize: '0.5rem'
    const inlineRe = /fontSize\s*[:=]\s*['"]?([0-9]*\.?[0-9]+)(px|rem)?['"]?/g;
    while ((m = inlineRe.exec(line)) !== null) {
      const raw = Number(m[1]);
      const unit = (m[2] || 'px').toLowerCase();
      const px = unit === 'rem' ? raw * 16 : raw;
      if (px < TYPE_MIN_PX) {
        violations.push({
          line: lineNo,
          column: m.index + 1,
          message: `QM-UIUX-005: inline fontSize renders below the 10px floor — use quantMailTypePx('xs') or larger.`,
        });
      }
    }
  });
  return violations;
}

/**
 * QM-UIUX-004 — bans raw surface-hex color literals in QuantMail web source.
 *
 * Every hex that belongs to the --quant-* surface/brand palette has a design
 * token; raw literals are banned so the theme switcher (dark/light) can
 * recolor the whole UI. Hexes inside custom-property *definitions*
 * (`--foo: #hex;`) are the token values themselves and are allowed.
 */
const BANNED_SURFACE_HEX = [
  '000000', '08080a', '090a0c', '090a0e', '0b0d13', '0c0e11', '0d1017',
  '0e1017', '0e1119', '111318', '121316', '12151e', '121622', '141722',
  '141822', '16181d', '161822', '161a26', '161b22', '161b26', '181c26',
  '1c1f26', '1e2128', '1e222a', '1e293b', '1f2430', '22c55e', '25252e',
  '282c35', '3b82f6', 'e8752f', 'ef4444', 'f59e0b', 'ff8c42', 'ff9b5a',
];

/** Exported for unit-testing the QM-UIUX-004 hex scanner. */
export function findRawSurfaceHexViolations(text) {
  const violations = [];
  const lines = text.split('\n');
  const tokenDefRe = /^\s*--[a-zA-Z0-9-]+\s*:\s*#[0-9a-fA-F]{3,8}/;
  lines.forEach((line, idx) => {
    if (tokenDefRe.test(line)) return; // token definitions are the source of truth
    const hexRe = new RegExp('#(?:' + BANNED_SURFACE_HEX.join('|') + ')(?![0-9a-fA-F])', 'gi');
    let m;
    while ((m = hexRe.exec(line)) !== null) {
      violations.push({
        line: idx + 1,
        column: m.index + 1,
        message: `QM-UIUX-004: raw surface hex ${m[0]} — use the matching --quant-* theme token instead.`,
      });
    }
  });
  return violations;
}

const surfaceHexPlugin = {
  rules: {
    'no-raw-surface-hex': {
      meta: { type: 'problem', docs: { description: 'Ban raw surface-hex literals (QM-UIUX-004) — use --quant-* tokens.' } },
      create(context) {
        return {
          Program() {
            const text = context.sourceCode.getText();
            for (const v of findRawSurfaceHexViolations(text)) {
              context.report({ loc: { line: v.line, column: v.column }, message: v.message });
            }
          },
        };
      },
    },
  },
};

const cssCombinedProcessor = {
  preprocess() {
    return [''];
  },
  postprocess(_messages, filename) {
    // Re-read the original file — preprocess handed ESLint an empty program.
    const text = fs.readFileSync(filename, 'utf8');
    return [
      ...findSub10pxTypeViolations(text).map((v) => ({
        ruleId: 'type-scale/no-sub-10px-type',
        severity: 2,
        message: v.message,
        line: v.line,
        column: v.column,
      })),
      ...findRawSurfaceHexViolations(text).map((v) => ({
        ruleId: 'surface-hex/no-raw-surface-hex',
        severity: 2,
        message: v.message,
        line: v.line,
        column: v.column,
      })),
    ];
  },
};

const typeScalePlugin = {  rules: {
    'no-sub-10px-type': {
      meta: { type: 'problem', docs: { description: 'Ban text below the 10px type floor (QM-UIUX-005).' } },
      create(context) {
        return {
          Program() {
            const text = context.sourceCode.getText();
            for (const v of findSub10pxTypeViolations(text)) {
              context.report({ loc: { line: v.line, column: v.column }, message: v.message });
            }
          },
        };
      },
    },
  },
};

const cssTypeFloorProcessor = {
  preprocess(text, filename) {
    return [''];
  },
  postprocess(_messages, filename) {
    // Re-read the original file — preprocess handed ESLint an empty program.
    const text = fs.readFileSync(filename, 'utf8');
    return findSub10pxTypeViolations(text).map((v) => ({
      ruleId: 'type-scale/no-sub-10px-type',
      severity: 2,
      message: v.message,
      line: v.line,
      column: v.column,
    }));
  },
};

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      // Build output. `backend/dist/server.mjs` is a bundle, and ESLint's default
      // config picks up loose `.mjs` files even though this config never asks for
      // them — so anyone who had built the backend locally hit a parse error in
      // generated code that CI (where `dist/` does not exist) never sees.
      '**/dist/**',
      'coverage/**',
      '**/*.d.ts',
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      '**/__tests__/**',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'backend/**/*.ts', '*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      'prefer-const': 'off',
      'no-console': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  // QM-UIUX-005: ban text below the 10px type floor, going forward.
  // QM-UIUX-004: ban raw surface-hex literals, going forward.
  {
    files: ['src/**/*.{ts,tsx}', 'backend/**/*.ts', '*.{ts,tsx}'],
    plugins: { 'type-scale': typeScalePlugin, 'surface-hex': surfaceHexPlugin },
    rules: {
      'type-scale/no-sub-10px-type': 'error',
      'surface-hex/no-raw-surface-hex': 'error',
    },
  },
  {
    files: ['src/**/*.css'],
    plugins: {
      'type-scale': { processors: { 'css-type-floor': cssTypeFloorProcessor } },
      'surface-hex': { processors: { 'css-combined': cssCombinedProcessor } },
    },
    processor: 'surface-hex/css-combined',
  },
);
