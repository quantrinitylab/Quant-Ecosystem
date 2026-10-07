import { describe, it, expect } from 'vitest';
import { CrossAppDistributor } from '../distribution/cross-app.js';
import type { LensDefinition } from '../types.js';

function simpleLens(effects: string[] = ['color_grade']): LensDefinition {
  return {
    id: `lens_${Date.now()}`,
    name: 'Test Lens',
    version: '1.0.0',
    triggers: ['always'],
    effects: effects.map((e, i) => ({ effectType: e, parameters: {}, order: i })),
    parameters: {},
  };
}

describe('CrossAppDistributor', () => {
  it('registers lens for all target apps', () => {
    const dist = new CrossAppDistributor();
    const lens = simpleLens();
    const manifest = dist.register(lens, ['quant_neon', 'quant_chat', 'quant_max', 'quant_meet']);
    expect(manifest.targets).toHaveLength(4);
  });

  it('detects 3D incompatibility with quant_max', () => {
    const dist = new CrossAppDistributor();
    const lens = simpleLens(['overlay_3d']);
    const manifest = dist.register(lens, ['quant_neon', 'quant_max']);
    expect(manifest.compatibility.get('quant_neon')).toBe(true);
    expect(manifest.compatibility.get('quant_max')).toBe(false);
  });

  it('detects particles incompatibility with quant_meet', () => {
    const dist = new CrossAppDistributor();
    const lens = simpleLens(['particles']);
    const manifest = dist.register(lens, ['quant_meet']);
    expect(manifest.compatibility.get('quant_meet')).toBe(false);
    const constraints = manifest.constraints.get('quant_meet');
    expect(constraints).toContain('particles_not_supported');
  });

  it('detects generative incompatibility', () => {
    const dist = new CrossAppDistributor();
    const lens = simpleLens(['style_transfer']);
    const manifest = dist.register(lens, ['quant_neon', 'quant_chat']);
    expect(manifest.compatibility.get('quant_neon')).toBe(true);
    expect(manifest.compatibility.get('quant_chat')).toBe(false);
  });

  it('returns app capabilities', () => {
    const dist = new CrossAppDistributor();
    const caps = dist.getCapabilities('quant_neon');
    expect(caps.maxFaces).toBe(5);
    expect(caps.supports3D).toBe(true);
    expect(caps.supportsGenerative).toBe(true);
  });

  it('checks compatibility for registered lens', () => {
    const dist = new CrossAppDistributor();
    const lens = simpleLens(['color_grade']);
    dist.register(lens, ['quant_neon', 'quant_meet']);
    expect(dist.isCompatible(lens.id, 'quant_neon')).toBe(true);
    expect(dist.isCompatible(lens.id, 'quant_meet')).toBe(true);
  });

  it('returns constraints for incompatible targets', () => {
    const dist = new CrossAppDistributor();
    const lens = simpleLens(['overlay_3d', 'particles']);
    dist.register(lens, ['quant_meet']);
    const constraints = dist.getConstraints(lens.id, 'quant_meet');
    expect(constraints).toContain('3d_not_supported');
    expect(constraints).toContain('particles_not_supported');
  });

  it('returns error for unregistered lens', () => {
    const dist = new CrossAppDistributor();
    expect(dist.isCompatible('unknown', 'quant_neon')).toBe(false);
    expect(dist.getConstraints('unknown', 'quant_neon')).toContain('lens_not_registered');
  });

  it('lists registered lenses', () => {
    const dist = new CrossAppDistributor();
    const lens1 = simpleLens();
    const lens2 = { ...simpleLens(), id: 'lens_2' };
    dist.register(lens1, ['quant_neon']);
    dist.register(lens2, ['quant_chat']);
    expect(dist.getRegisteredLenses()).toHaveLength(2);
  });

  it('detects maxFaces incompatibility', () => {
    const dist = new CrossAppDistributor();
    const lens: LensDefinition = {
      id: 'multi_face_lens',
      name: 'Multi Face',
      version: '1.0.0',
      triggers: ['always'],
      effects: [{ effectType: 'color_grade', parameters: {}, order: 0 }],
      parameters: {
        maxFaces: { min: 1, max: 10, default: 5 },
      },
    };
    const manifest = dist.register(lens, ['quant_neon', 'quant_meet']);
    // quant_neon supports 5 faces, quant_meet only 1
    expect(manifest.compatibility.get('quant_neon')).toBe(true);
    expect(manifest.compatibility.get('quant_meet')).toBe(false);
    expect(manifest.constraints.get('quant_meet')).toContain('max_faces_exceeded');
  });

  it('detects maxResolution incompatibility', () => {
    const dist = new CrossAppDistributor();
    const lens: LensDefinition = {
      id: 'hd_lens',
      name: 'HD Lens',
      version: '1.0.0',
      triggers: ['always'],
      effects: [{ effectType: 'color_grade', parameters: {}, order: 0 }],
      parameters: {
        maxResolution: { min: 720, max: 4096, default: 1920 },
      },
    };
    const manifest = dist.register(lens, ['quant_neon', 'quant_max']);
    // quant_neon supports 1920, quant_max only 720
    expect(manifest.compatibility.get('quant_neon')).toBe(true);
    expect(manifest.compatibility.get('quant_max')).toBe(false);
    expect(manifest.constraints.get('quant_max')).toContain('max_resolution_exceeded');
  });
});
