// ============================================================================
// QC-F-044 — unstyled App Router components (regression net)
// ============================================================================
//
// StoryCreator, GameLauncher, DisappearingTimerPicker and DisappearingMessage
// shipped with custom class names that NO stylesheet defined (the same root
// pattern as QC-F-002's settings/discover): the story creator rendered as raw
// stacked blocks — camera preview unsized, capture controls and tool bars
// unstyled — and the games launcher / timer picker roots had no panel at all.
//
// The fix follows the codebase's own precedent (the DisappearingTimer and
// AIAssistant sections): every class these components use is defined in
// src/app/globals.css, which both router shells import.
//
// This suite makes the defect class unshippable for these components:
//   1. Every class token used in a className is defined in globals.css.
//   2. The load-bearing layout rules actually carry the declarations the
//      components rely on (sized preview, positioned canvas, styled CTA).
//   3. The state modifiers the components toggle ('active', 'is-selected')
//      have scoped rules — a bare class with no rule is the original bug.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Resolve a repo source file regardless of whether the suite runs with the
// cwd at the quantchat app or at the monorepo root (map-no-fabricated-data
// pattern).
function readAppSource(relFromApp: string): string {
  const candidates = [
    resolve(process.cwd(), relFromApp),
    resolve(process.cwd(), 'apps/quantchat', relFromApp),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Could not locate source file: ${relFromApp}`);
  return readFileSync(found, 'utf8');
}

const COMPONENTS: Record<string, string> = {
  StoryCreator: 'src/components/StoryCreator.tsx',
  GameLauncher: 'src/components/games/GameLauncher.tsx',
  DisappearingTimerPicker: 'src/components/chat/DisappearingTimerPicker.tsx',
  DisappearingMessage: 'src/components/chat/DisappearingMessage.tsx',
};

const globalsCss = readAppSource('src/app/globals.css');

/** Every class token a component puts in a className, without false
 *  positives from comparison literals (e.g. `mode === 'camera'`). */
function usedClasses(source: string): Set<string> {
  const classes = new Set<string>();
  const add = (raw: string) =>
    raw.split(/\s+/).forEach((t) => {
      if (t) classes.add(t);
    });
  // className="..."
  for (const m of source.matchAll(/className\s*=\s*"([^"]*)"/g)) add(m[1]);
  // className={`...`} — template literal with ${...} expressions stripped
  for (const m of source.matchAll(/className\s*=\s*\{`([^`]*)`\}/g)) {
    add(m[1].replace(/\$\{[^}]*\}/g, ' '));
  }
  // className={cond ? 'a' : 'b'} — ternary result branches only
  for (const m of source.matchAll(
    /className\s*=\s*\{[^{}]*\?\s*'([^']*)'\s*:\s*'([^']*)'[^{}]*\}/g,
  )) {
    add(m[1]);
    add(m[2]);
  }
  return classes;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `.token` appears as a complete class selector in the CSS
 *  (so `.game-launcher` does not "match" via `.game-launcher__header`). */
function isDefined(token: string): boolean {
  return new RegExp(`\\.${escapeRegExp(token)}(?![\\w-])`).test(globalsCss);
}

/** Body of the first rule whose selector contains the given text. */
function ruleBody(selectorPart: string): string {
  const idx = globalsCss.indexOf(selectorPart);
  if (idx === -1) return '';
  const open = globalsCss.indexOf('{', idx);
  const close = globalsCss.indexOf('}', open);
  if (open === -1 || close === -1) return '';
  return globalsCss.slice(open + 1, close);
}

describe('QC-F-044: component classes are defined in globals.css', () => {
  for (const [name, rel] of Object.entries(COMPONENTS)) {
    it(`${name}: every className token resolves to a globals.css rule`, () => {
      const source = readAppSource(rel);
      const tokens = usedClasses(source);
      // Guard the guard: each component really does use custom classes, so
      // an empty extraction can never make this test vacuously pass.
      expect(tokens.size).toBeGreaterThan(1);
      const undefinedTokens = [...tokens].filter((t) => !isDefined(t));
      expect(undefinedTokens).toEqual([]);
    });

    it(`${name}: does not smuggle styles via a local <style> block`, () => {
      const source = readAppSource(rel);
      expect(source).not.toContain('<style');
    });
  }

  it('StoryCreator preview/canvas/CTA rules carry load-bearing declarations', () => {
    expect(ruleBody('.story-creator .creator-canvas')).toContain('position: relative');
    expect(ruleBody('.story-creator .camera-preview')).toContain('object-fit: cover');
    expect(ruleBody('.story-creator .preview-image')).toContain('object-fit: cover');
    expect(ruleBody('.story-creator .capture-btn')).toContain('border-radius: 999px');
    expect(ruleBody('.story-creator .post-btn')).toContain('background');
    expect(ruleBody('.story-creator')).toContain('display: flex');
  });

  it('panel roots for GameLauncher and DisappearingTimerPicker are real panels', () => {
    expect(ruleBody('.game-launcher')).toContain('display: flex');
    expect(ruleBody('.game-launcher')).toContain('background');
    expect(ruleBody('.disappearing-timer-picker')).toContain('background');
    expect(ruleBody('.disappearing-timer-picker')).toContain('padding');
    expect(ruleBody('.disappearing-timer-picker__title')).toContain('font-weight: 700');
  });

  it('DisappearingMessage countdown badge is sized and layered', () => {
    expect(ruleBody('.disappearing-message__countdown')).toContain('width: 24px');
    expect(ruleBody('.disappearing-message__countdown')).toContain('z-index');
  });

  it("state modifiers toggled by the components have scoped rules ('active', 'is-selected')", () => {
    // StoryCreator toggles a bare 'active' class on mode/tab/tool buttons.
    expect(globalsCss).toContain('.mode-tabs button.active');
    expect(globalsCss).toContain('.tool-bar button.active');
    // DisappearingTimerPicker toggles 'is-selected' on the chosen option.
    expect(globalsCss).toContain('.disappearing-timer-picker__option.is-selected');
  });
});
