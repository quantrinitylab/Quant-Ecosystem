import { describe, it, expect } from 'vitest';
import { PromptToLens } from '../generative/prompt-to-lens.js';
import { StyleTransfer } from '../generative/style-transfer.js';
import { BackgroundReplacer } from '../generative/background-replace.js';
import type { FaceDetection, BodyDetection } from '../types.js';

function makeFace(): FaceDetection {
  return {
    id: 'f1',
    confidence: 0.95,
    landmarks: Array.from({ length: 468 }, (_, i) => ({
      index: i,
      position: { x: 0, y: 0, z: 0 },
      confidence: 0.9,
    })),
    expressions: [],
    boundingBox: { x: 100, y: 50, width: 200, height: 250 },
  };
}

function makeBody(): BodyDetection {
  return {
    id: 'b1',
    confidence: 0.9,
    mode: 'full',
    landmarks: Array.from({ length: 33 }, (_, i) => ({
      index: i,
      position: { x: i * 10, y: i * 15, z: 0 },
      confidence: 0.9,
    })),
  };
}

describe('PromptToLens', () => {
  const ptl = new PromptToLens();

  it('maps sparkle prompt to particles effect', () => {
    const { lens } = ptl.generate({ prompt: 'add sparkle effects when I smile' });
    expect(lens.effects.some((e) => e.effectType === 'particles')).toBe(true);
    expect(lens.triggers).toContain('smile');
  });

  it('maps background prompt to background_replace', () => {
    const { lens } = ptl.generate({ prompt: 'replace my background with a beach' });
    expect(lens.effects.some((e) => e.effectType === 'background_replace')).toBe(true);
  });

  it('maps style prompt to style_transfer', () => {
    const { lens } = ptl.generate({ prompt: 'make me look like a painting' });
    expect(lens.effects.some((e) => e.effectType === 'style_transfer')).toBe(true);
  });

  it('extracts face_detect trigger', () => {
    const { lens } = ptl.generate({ prompt: 'apply glow effect on face detection' });
    expect(lens.triggers).toContain('face_detect');
  });

  it('uses always trigger when no keyword matches', () => {
    const { lens } = ptl.generate({ prompt: 'do something cool' });
    expect(lens.triggers).toContain('always');
  });

  it('generates a valid lens definition', () => {
    const { lens } = ptl.generate({ prompt: 'sparkle confetti when I smile' });
    expect(ptl.validate(lens)).toBe(true);
  });

  it('respects intensity parameter', () => {
    const { lens } = ptl.generate({ prompt: 'add glow', intensity: 0.3 });
    expect(lens.parameters['intensity']!.default).toBe(0.3);
  });

  it('defaults to color_grade when no effects match', () => {
    const { lens } = ptl.generate({ prompt: 'make me look good' });
    expect(lens.effects.some((e) => e.effectType === 'color_grade')).toBe(true);
  });

  it('returns high confidence for well-matched prompts', () => {
    const { confidence } = ptl.generate({ prompt: 'sparkle glow smile' });
    expect(confidence).toBeGreaterThan(0.5);
  });

  it('returns low confidence for unrecognized prompts', () => {
    const { confidence } = ptl.generate({ prompt: 'do something entirely unrecognized here now' });
    expect(confidence).toBe(0);
  });

  it('returns zero confidence for empty-ish prompts with no matches', () => {
    const { confidence } = ptl.generate({ prompt: 'xyz abc' });
    expect(confidence).toBe(0);
  });
});

describe('StyleTransfer', () => {
  it('applies style to face region only', () => {
    const transfer = new StyleTransfer({
      stylePreset: 'oil_painting',
      intensity: 0.8,
      faceOnly: true,
      preserveIdentity: true,
    });
    const result = transfer.apply(makeFace());
    expect(result.applied).toBe(true);
    expect(result.region).toBe('face');
    expect(result.maskBounds).not.toBeNull();
  });

  it('rejects invalid preset', () => {
    const transfer = new StyleTransfer({
      stylePreset: 'nonexistent_style',
      intensity: 0.5,
      faceOnly: false,
      preserveIdentity: true,
    });
    const result = transfer.apply(makeFace());
    expect(result.applied).toBe(false);
  });

  it('returns preset list', () => {
    const transfer = new StyleTransfer({
      stylePreset: 'sketch',
      intensity: 0.5,
      faceOnly: false,
      preserveIdentity: true,
    });
    expect(transfer.getPresets()).toContain('oil_painting');
    expect(transfer.getPresets()).toContain('watercolor');
  });

  it('applies to full frame when faceOnly is false', () => {
    const transfer = new StyleTransfer({
      stylePreset: 'anime',
      intensity: 0.5,
      faceOnly: false,
      preserveIdentity: true,
    });
    const result = transfer.apply(makeFace());
    expect(result.region).toBe('full_frame');
  });

  it('sets intensity within bounds', () => {
    const transfer = new StyleTransfer({
      stylePreset: 'sketch',
      intensity: 0.5,
      faceOnly: false,
      preserveIdentity: true,
    });
    transfer.setIntensity(2.0);
    const result = transfer.apply(makeFace());
    expect(result.intensity).toBe(1.0);
  });
});

describe('BackgroundReplacer', () => {
  it('segments person from background', () => {
    const replacer = new BackgroundReplacer({
      type: 'generated',
      edgeRefinement: 0.8,
      temporalSmoothing: 0.5,
    });
    const result = replacer.segment([makeBody()]);
    expect(result.personMask).toBe(true);
    expect(result.bounds).not.toBeNull();
  });

  it('returns no mask for empty bodies', () => {
    const replacer = new BackgroundReplacer({
      type: 'static',
      source: 'beach.jpg',
      edgeRefinement: 0.5,
      temporalSmoothing: 0.3,
    });
    const result = replacer.segment([]);
    expect(result.personMask).toBe(false);
    expect(result.bounds).toBeNull();
  });

  it('applies temporal smoothing', () => {
    const replacer = new BackgroundReplacer({
      type: 'blur',
      edgeRefinement: 0.5,
      temporalSmoothing: 0.8,
    });
    const body = makeBody();
    const result1 = replacer.segment([body]);
    const result2 = replacer.segment([body]);
    expect(result1.bounds).not.toBeNull();
    expect(result2.bounds).not.toBeNull();
  });

  it('resets temporal state', () => {
    const replacer = new BackgroundReplacer({
      type: 'generated',
      edgeRefinement: 0.5,
      temporalSmoothing: 0.5,
    });
    replacer.segment([makeBody()]);
    replacer.reset();
    const result = replacer.segment([makeBody()]);
    expect(result.bounds).not.toBeNull();
  });
});
