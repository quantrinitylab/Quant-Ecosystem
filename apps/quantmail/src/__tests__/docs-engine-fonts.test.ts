// Quant Docs engines — the font files the worker hands to the slides engine (engines/web/fonts.js)
// and the served font list they come from (engines/fonts/fonts.txt, built into <bundle>/fonts/).
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Plain ES module shared with the engine worker (no TypeScript build step on that side).
import { familyFor, fontFilesFor } from '../../../../engines/web/fonts.js';

const ENGINES_DIR = resolve(__dirname, '../../../../engines');
const FONTS_TXT = readFileSync(resolve(ENGINES_DIR, 'fonts/fonts.txt'), 'utf8');
const FONT_LINES = FONTS_TXT.split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#') && l.includes(' | '))
  .map((l) => l.split(' | ').map((f) => f.trim()));

/** fonts/index.json as build.sh writes it: { family, style, file } per line, file under fonts/. */
const INDEX = FONT_LINES.map(([family, style, file]) => ({ family, style, file: file.replace(/^fonts\//, '') }));

const files = (used: Array<{ family: string; bold?: boolean; italic?: boolean }>) =>
  fontFilesFor(
    used.map((u) => ({ bold: false, italic: false, ...u })),
    INDEX,
  );

describe('fontFilesFor (which files a deck needs)', () => {
  it('draws Calibri in Carlito, with Inter Regular first for symbols', () => {
    expect(files([{ family: 'Calibri' }, { family: 'Calibri Light' }])).toEqual(['inter/Inter-Regular.ttf', 'carlito/Carlito-Regular.ttf']);
  });

  it('fetches bold and italic faces only when runs use them', () => {
    expect(files([{ family: 'Calibri', bold: true }])).toEqual(['inter/Inter-Regular.ttf', 'carlito/Carlito-Bold.ttf']);
    expect(files([{ family: 'Calibri', bold: true, italic: true }])).toEqual(['inter/Inter-Regular.ttf', 'carlito/Carlito-BoldItalic.ttf']);
  });

  it('uses the metric-compatible stand-ins for the Office core fonts', () => {
    expect(files([{ family: 'Arial', bold: true }])).toContain('liberation-sans/LiberationSans-Bold.ttf');
    expect(files([{ family: 'Helvetica' }])).toContain('liberation-sans/LiberationSans-Regular.ttf');
    expect(files([{ family: 'Times New Roman', italic: true }])).toContain('liberation-serif/LiberationSerif-Italic.ttf');
    expect(files([{ family: 'Courier New' }])).toContain('liberation-mono/LiberationMono-Regular.ttf');
    expect(files([{ family: 'Cambria', bold: true, italic: true }])).toContain('caladea/Caladea-BoldItalic.ttf');
    expect(files([{ family: 'Arial CE' }])).toContain('liberation-sans/LiberationSans-Regular.ttf');
  });

  it('draws Office cloud fonts (Aptos…) in Inter', () => {
    expect(files([{ family: 'Aptos' }, { family: 'Aptos Display' }])).toEqual(['inter/Inter-Regular.ttf']);
    expect(files([{ family: 'Aptos', bold: true }])).toEqual(['inter/Inter-Regular.ttf', 'inter/Inter-Bold.ttf']);
  });

  it('loads a served family under its own name (variable fonts as one file)', () => {
    expect(files([{ family: 'Montserrat', bold: true }])).toEqual(['inter/Inter-Regular.ttf', 'montserrat/Montserrat.ttf']);
    expect(files([{ family: 'Montserrat', italic: true }])).toEqual(['inter/Inter-Regular.ttf', 'montserrat/Montserrat-Italic.ttf']);
    expect(files([{ family: 'Lato', bold: true, italic: true }])).toEqual(['inter/Inter-Regular.ttf', 'lato/Lato-Bold.ttf', 'lato/Lato-Italic.ttf']);
  });

  it('draws any other missing family in Carlito, as PowerPoint draws it in Calibri', () => {
    expect(files([{ family: 'Segoe UI' }, { family: 'Some Brand Font' }])).toEqual(['inter/Inter-Regular.ttf', 'carlito/Carlito-Regular.ttf']);
  });

  it('fetches nothing extra for symbol fonts', () => {
    expect(files([{ family: 'Wingdings' }, { family: 'Symbol' }])).toEqual(['inter/Inter-Regular.ttf']);
  });

  it('ignores case and spacing, de-duplicates, and tolerates bad input', () => {
    expect(files([{ family: '  CALIBRI ' }, { family: 'calibri' }, { family: '' }])).toEqual(['inter/Inter-Regular.ttf', 'carlito/Carlito-Regular.ttf']);
    expect(fontFilesFor(null, INDEX)).toEqual(['inter/Inter-Regular.ttf']);
    expect(fontFilesFor([{ family: 'Calibri' }], null)).toEqual([]);
    expect(fontFilesFor([{ nope: 1 }, null, 'x'], INDEX)).toEqual(['inter/Inter-Regular.ttf']);
  });

  it('asks only for families the bundle serves', () => {
    const served = new Map([['inter', 'Inter']]);
    expect(familyFor('Calibri', served)).toBeNull();
    expect(familyFor('Aptos', served)).toBe('Inter');
  });
});

describe('served font list (engines/fonts/fonts.txt)', () => {
  it('pins one craft-fonts commit', () => {
    expect(FONTS_TXT).toMatch(/^rev [0-9a-f]{40}$/m);
  });

  it('has craft-fonts manifest lines with a sha256 and a committed licence text each', () => {
    expect(FONT_LINES.length).toBeGreaterThan(10);
    for (const [family, style, file, scripts, licence, licenceFile, sha256] of FONT_LINES) {
      expect(family && style).toBeTruthy();
      expect(file).toMatch(/^fonts\/[a-z0-9-]+\/[A-Za-z0-9-]+\.ttf$/);
      expect(scripts).toBe('Latn');
      expect(licence).toBe('OFL-1.1');
      expect(sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(existsSync(resolve(ENGINES_DIR, 'fonts/licenses', licenceFile.replace(/^fonts\//, '')))).toBe(true);
    }
  });

  it('leaves out the Adobe-authored families, as DeckCraft does', () => {
    expect(FONT_LINES.some(([family]) => /^Source (Sans|Serif)/.test(family))).toBe(false);
  });

  it('serves every face the stand-in rules can ask for', () => {
    const has = (family: string, style: string) => FONT_LINES.some(([f, s]) => f === family && s === style);
    for (const family of ['Carlito', 'Caladea', 'Liberation Sans', 'Liberation Serif', 'Liberation Mono']) {
      for (const style of ['Regular', 'Bold', 'Italic', 'Bold Italic']) expect(has(family, style)).toBe(true);
    }
    for (const style of ['Regular', 'Bold', 'Italic']) expect(has('Inter', style)).toBe(true);
  });

  it('ships fonts.js with the worker, which loads fonts before answering open', () => {
    const worker = readFileSync(resolve(ENGINES_DIR, 'web/worker.js'), 'utf8');
    const build = readFileSync(resolve(ENGINES_DIR, 'build.sh'), 'utf8');
    expect(worker).toContain("import { fontFilesFor } from './fonts.js';");
    expect(worker).toContain("new URL('fonts/index.json', import.meta.url)");
    expect(build).toContain('cp "$HERE/web/worker.js" "$HERE/web/fonts.js" "$DEST/"');
    expect(build).toContain('fonts/fonts.txt');
  });
});
