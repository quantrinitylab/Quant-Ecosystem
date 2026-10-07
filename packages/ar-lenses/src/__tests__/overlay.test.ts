import { describe, it, expect } from 'vitest';
import { Overlay2DEngine } from '../overlay/overlay-2d.js';
import { Overlay3DEngine } from '../overlay/overlay-3d.js';
import { ParticleSystem } from '../overlay/particles.js';
import { LightingEffects } from '../overlay/effects.js';
import type { FaceDetection, Overlay2DConfig, Overlay3DConfig, ParticleConfig } from '../types.js';

function makeFace(): FaceDetection {
  return {
    id: 'f1',
    confidence: 0.95,
    landmarks: Array.from({ length: 468 }, (_, i) => ({
      index: i,
      position: { x: i * 0.01, y: i * 0.01, z: 0 },
      confidence: 0.9,
    })),
    expressions: [{ type: 'smile', intensity: 0.8 }],
    boundingBox: { x: 100, y: 100, width: 200, height: 200 },
  };
}

describe('Overlay2DEngine', () => {
  it('renders overlays anchored to face landmarks', () => {
    const engine = new Overlay2DEngine();
    const overlay: Overlay2DConfig = {
      id: 'sticker1',
      type: 'sticker',
      anchorLandmark: 0,
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      scale: 1,
      opacity: 1,
      zOrder: 1,
    };
    engine.addOverlay(overlay);
    const results = engine.render([makeFace()], 0);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('sticker1:f1');
  });

  it('sorts by z-order', () => {
    const engine = new Overlay2DEngine();
    engine.addOverlay({
      id: 'back',
      type: 'filter',
      anchorLandmark: 0,
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      scale: 1,
      opacity: 1,
      zOrder: 0,
    });
    engine.addOverlay({
      id: 'front',
      type: 'sticker',
      anchorLandmark: 0,
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      scale: 1,
      opacity: 1,
      zOrder: 10,
    });
    const results = engine.render([makeFace()], 0);
    expect(results[0]!.id).toBe('back:f1');
    expect(results[1]!.id).toBe('front:f1');
  });

  it('applies animation keyframes', () => {
    const engine = new Overlay2DEngine();
    engine.addOverlay({
      id: 'animated',
      type: 'sticker',
      anchorLandmark: 0,
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      scale: 1,
      opacity: 1,
      zOrder: 1,
      animation: [
        { time: 0, opacity: 0, scale: 0.5, rotation: 0, position: { x: 0, y: 0, z: 0 } },
        { time: 1, opacity: 1, scale: 1.5, rotation: 180, position: { x: 1, y: 1, z: 0 } },
      ],
    });
    const results = engine.render([makeFace()], 0.5);
    expect(results).toHaveLength(1);
    expect(results[0]!.opacity).toBeGreaterThan(0);
  });

  it('removes overlays', () => {
    const engine = new Overlay2DEngine();
    engine.addOverlay({
      id: 'tmp',
      type: 'text',
      anchorLandmark: 0,
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      scale: 1,
      opacity: 1,
      zOrder: 1,
    });
    expect(engine.getOverlayCount()).toBe(1);
    engine.removeOverlay('tmp');
    expect(engine.getOverlayCount()).toBe(0);
  });
});

describe('Overlay3DEngine', () => {
  it('renders 3D overlays with world transform', () => {
    const engine = new Overlay3DEngine();
    const overlay: Overlay3DConfig = {
      id: 'hat1',
      type: 'accessory',
      anchorLandmarks: [0, 1, 2],
      transform: {
        position: { x: 0, y: 0.1, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    };
    engine.addOverlay(overlay);
    const results = engine.render([makeFace()]);
    expect(results).toHaveLength(1);
    expect(results[0]!.type).toBe('accessory');
  });

  it('deforms mesh based on face landmarks', () => {
    const engine = new Overlay3DEngine();
    const meshData = new Float32Array(12);
    const overlay: Overlay3DConfig = {
      id: 'mask1',
      type: 'mesh_deform',
      anchorLandmarks: [0],
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      meshData,
    };
    const deformed = engine.deformMesh(makeFace(), overlay);
    expect(deformed).not.toBeNull();
    expect(deformed!.length).toBe(12);
  });

  it('returns null for non-mesh_deform overlays', () => {
    const engine = new Overlay3DEngine();
    const overlay: Overlay3DConfig = {
      id: 'acc1',
      type: 'accessory',
      anchorLandmarks: [0],
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    };
    const result = engine.deformMesh(makeFace(), overlay);
    expect(result).toBeNull();
  });
});

describe('ParticleSystem', () => {
  const baseConfig: ParticleConfig = {
    id: 'sparks',
    mode: 'continuous',
    maxParticles: 100,
    emitRate: 10,
    lifetime: 2,
    gravity: -9.8,
    wind: { x: 0, y: 0, z: 0 },
    initialVelocity: { x: 0, y: 5, z: 0 },
    size: 1,
    color: '#ffffff',
  };

  it('emits particles', () => {
    const ps = new ParticleSystem(baseConfig);
    ps.emit(5);
    expect(ps.getParticleCount()).toBe(5);
  });

  it('updates particle positions with physics', () => {
    const ps = new ParticleSystem(baseConfig);
    ps.emit(1);
    const before = ps.render()[0]!;
    const startY = before.position.y;
    ps.update(100);
    const after = ps.render()[0]!;
    expect(after.position.y).not.toBe(startY);
  });

  it('removes particles past lifetime', () => {
    const shortLife: ParticleConfig = { ...baseConfig, lifetime: 0.1 };
    const ps = new ParticleSystem(shortLife);
    ps.emit(5);
    expect(ps.getParticleCount()).toBe(5);
    ps.update(200);
    expect(ps.getParticleCount()).toBe(0);
  });

  it('burst mode emits all at once', () => {
    const burstConfig: ParticleConfig = { ...baseConfig, mode: 'burst', maxParticles: 50 };
    const ps = new ParticleSystem(burstConfig);
    ps.update(16);
    expect(ps.getParticleCount()).toBe(50);
  });

  it('continuous mode emits over time', () => {
    const ps = new ParticleSystem(baseConfig);
    ps.update(1000);
    expect(ps.getParticleCount()).toBeGreaterThan(0);
  });

  it('respects maxParticles', () => {
    const small: ParticleConfig = { ...baseConfig, maxParticles: 3 };
    const ps = new ParticleSystem(small);
    ps.emit(10);
    expect(ps.getParticleCount()).toBe(3);
  });
});

describe('LightingEffects', () => {
  it('applies color grading', () => {
    const effects = new LightingEffects();
    effects.addEffect({
      type: 'color_grade',
      intensity: 0.5,
      parameters: { warmth: 0.3, saturation: 1.2 },
    });
    const results = effects.apply();
    expect(results).toHaveLength(1);
    expect(results[0]!.type).toBe('color_grade');
    expect(results[0]!.applied).toBe(true);
  });

  it('applies vignette effect', () => {
    const effects = new LightingEffects();
    effects.addEffect({
      type: 'vignette',
      intensity: 0.8,
      parameters: { radius: 0.6 },
    });
    const results = effects.apply();
    expect(results[0]!.parameters['radius']).toBe(0.6);
  });

  it('applies bloom effect', () => {
    const effects = new LightingEffects();
    effects.addEffect({
      type: 'bloom',
      intensity: 0.7,
      parameters: { threshold: 0.9 },
    });
    const results = effects.apply();
    expect(results[0]!.type).toBe('bloom');
    expect(results[0]!.applied).toBe(true);
  });

  it('removes effects by type', () => {
    const effects = new LightingEffects();
    effects.addEffect({ type: 'bloom', intensity: 0.5, parameters: {} });
    effects.addEffect({ type: 'vignette', intensity: 0.5, parameters: {} });
    effects.removeEffect('bloom');
    expect(effects.getEffectCount()).toBe(1);
  });
});
