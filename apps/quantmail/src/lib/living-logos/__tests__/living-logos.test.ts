// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LIVING_LOGO_APPS, LOGOS } from '../shapes';
import { VERTEX_SHADER, fragmentShader } from '../shader';
import { EXPRESSION_NAMES, resolveExpression } from '../expressions';

describe('living logos', () => {
  it('defines every app with two eyes and at most four SDF layers (one per RGBA channel)', () => {
    expect([...LIVING_LOGO_APPS].sort()).toEqual(['calendar', 'contacts', 'drive', 'git', 'mail']);
    for (const app of LIVING_LOGO_APPS) {
      const logo = LOGOS[app];
      expect(logo.layers.length).toBeGreaterThan(0);
      expect(logo.layers.length).toBeLessThanOrEqual(4);
      expect(logo.eyes).toHaveLength(2);
      expect(logo.frame.size).toBeGreaterThan(0);
    }
  });

  it('ships GLSL ES 3.00 sources that are pure ASCII', () => {
    expect(VERTEX_SHADER.startsWith('#version 300 es')).toBe(true);
    for (const app of LIVING_LOGO_APPS) {
      const src = fragmentShader(app);
      expect(src.startsWith('#version 300 es')).toBe(true);
      expect(src).toContain('void main');
      expect(/^[\x00-\x7f]*$/.test(src)).toBe(true);
    }
  });

  it('resolves every expression for every logo to finite numbers', () => {
    for (const app of LIVING_LOGO_APPS) {
      for (const eye of LOGOS[app].eyes) {
        for (const name of EXPRESSION_NAMES) {
          const spec = resolveExpression(name, LOGOS[app].eyeStyle, eye, eye.side);
          const values = [spec.type, spec.rot, spec.line, ...spec.P, ...spec.lids, ...spec.xf, ...spec.brow];
          expect(values.every(Number.isFinite)).toBe(true);
        }
      }
    }
  });

  it('can be imported without a DOM (it is loaded with import() on the client)', async () => {
    const engine = await import('../engine');
    expect(engine.livingLogoFailure()).toBeNull();
    expect(engine.isLivingLogoReady('mail')).toBe(false);
  });
});
