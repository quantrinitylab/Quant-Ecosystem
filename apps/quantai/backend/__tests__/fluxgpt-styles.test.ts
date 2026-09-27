import { describe, it, expect } from 'vitest';
import {
  listLoraStyles,
  getLoraStyle,
  computeDimensions,
  enhancePrompt,
  LoraStyleId,
} from '../services/flux-styles.service';

describe('FluxGPT Prompt Enhancement & LoRA Style Engine', () => {
  it('should list all 8 standard presets', () => {
    const styles = listLoraStyles();
    expect(styles.length).toBeGreaterThanOrEqual(8);

    const ids = styles.map((s) => s.id);
    expect(ids).toContain('photorealistic');
    expect(ids).toContain('anime_cel');
    expect(ids).toContain('cyberpunk');
    expect(ids).toContain('pixar_3d');
    expect(ids).toContain('oil_painting');
    expect(ids).toContain('synthwave');
    expect(ids).toContain('dark_fantasy');
    expect(ids).toContain('vector_flat');
  });

  it('enhancePrompt should enrich user prompt without style', () => {
    const result = enhancePrompt('a cat');
    expect(result.originalPrompt).toBe('a cat');
    expect(result.enhancedPrompt).toContain('a cat');
    expect(result.enhancedPrompt).toContain('highly detailed');
    expect(result.appliedStyle).toBeUndefined();
    expect(result.targetWidth).toBe(1024);
    expect(result.targetHeight).toBe(1024);
  });

  it('enhancePrompt with styleId should prepend prefix and append suffix', () => {
    const result = enhancePrompt('a cat', { styleId: 'cyberpunk' });
    expect(result.originalPrompt).toBe('a cat');
    expect(result.appliedStyle).toBeDefined();
    expect(result.appliedStyle?.id).toBe('cyberpunk');
    expect(result.enhancedPrompt).toMatch(
      /^Cyberpunk 2077 style, neon lights, futuristic, a cat, neon glow/,
    );
    expect(result.negativePrompt).toContain('bright daylight');
  });

  it('computeDimensions should return standard resolutions', () => {
    expect(computeDimensions('1:1')).toEqual({ width: 1024, height: 1024 });
    expect(computeDimensions('16:9')).toEqual({ width: 1280, height: 720 });
    expect(computeDimensions('9:16')).toEqual({ width: 720, height: 1280 });
  });

  it('invalid style should return unstyled enhanced prompt gracefully', () => {
    // @ts-ignore
    const result = enhancePrompt('a cat', { styleId: 'invalid_style' });
    expect(result.appliedStyle).toBeUndefined();
    expect(result.enhancedPrompt).toContain('highly detailed');
  });
});
