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

const typeScalePlugin = {
  rules: {
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
  {
    files: ['src/**/*.{ts,tsx}', 'backend/**/*.ts', '*.{ts,tsx}'],
    plugins: { 'type-scale': typeScalePlugin },
    rules: { 'type-scale/no-sub-10px-type': 'error' },
  },
  {
    files: ['src/**/*.css'],
    plugins: {
      'type-scale': { processors: { 'css-type-floor': cssTypeFloorProcessor } },
    },
    processor: 'type-scale/css-type-floor',
  },
);
