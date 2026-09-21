import type { Config } from 'tailwindcss';

/**
 * Tailwind configuration for QuantWave (`@quant/quantwave`).
 *
 * This file and `postcss.config.js` were missing even though `src/app/globals.css` starts
 * with `@tailwind base/components/utilities` and `tailwindcss`/`postcss`/`autoprefixer` are
 * devDependencies. Without a PostCSS config Next never runs the Tailwind plugin, so those
 * directives were emitted unprocessed and **no utility classes were generated** — every
 * Tailwind class in the app was inert.
 *
 * `darkMode: 'class'` matches `globals.css`, which styles a `.dark` selector rather than
 * relying on `prefers-color-scheme`.
 *
 * The app deliberately has no custom theme tokens: components use standard utilities plus
 * arbitrary values that read the CSS custom properties declared in `globals.css`
 * (e.g. `dark:bg-[var(--quant-card)]`), so the brand palette stays defined in one place.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
