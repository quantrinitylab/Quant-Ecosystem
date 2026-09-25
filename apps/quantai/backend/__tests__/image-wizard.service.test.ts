// ============================================================================
// QuantAI — 3-Step Guided Image Creation Wizard Service & Route Tests
// Task W39-A06 Parity Suite
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  ImageWizardService,
  STYLE_PRESETS,
  MOOD_PRESETS,
  ASPECT_RATIOS,
  TEMPLATES,
} from '../services/image-wizard.service';
import imageWizardRoutes from '../routes/image-wizard';

describe('ImageWizardService (Task W39-A06 Suite)', () => {
  let service: ImageWizardService;

  beforeEach(() => {
    service = new ImageWizardService();
  });

  describe('1. Style Presets Invariant', () => {
    it('provides all 8 required visual style presets', () => {
      const styles = service.getStyles();
      expect(styles).toHaveLength(8);

      const expectedNames = [
        'Photorealistic',
        'Anime / Manga',
        'Cyberpunk Neon',
        'Minimalist 3D',
        'Cinematic Macro',
        'Retro Pixel Art',
        'Watercolor & Ink',
        'Vector Illustration',
      ];

      expectedNames.forEach((name) => {
        const found = styles.find((s) => s.name === name);
        expect(found, `Expected style preset "${name}" to exist`).toBeDefined();
        expect(found?.modifiers.length).toBeGreaterThan(0);
        expect(found?.negativeModifiers.length).toBeGreaterThan(0);
        expect(found?.recommendedModel).toBeTruthy();
        expect(found?.iconEmoji).toBeTruthy();
      });
    });

    it('matches STYLE_PRESETS constant accurately', () => {
      expect(service.getStyles()).toEqual(STYLE_PRESETS);
    });
  });

  describe('2. Mood & Lighting Presets Invariant', () => {
    it('provides all 7 required mood/lighting presets', () => {
      const moods = service.getMoods();
      expect(moods).toHaveLength(7);

      const expectedNames = [
        'Golden Hour',
        'Cyberpunk Neon',
        'Studio Softbox',
        'Dramatic Volumetric',
        'Dark Noir',
        'Ethereal Bioluminescent',
        'Warm Sunset',
      ];

      expectedNames.forEach((name) => {
        const found = moods.find((m) => m.name === name);
        expect(found, `Expected mood preset "${name}" to exist`).toBeDefined();
        expect(found?.lightingModifiers.length).toBeGreaterThan(0);
        expect(found?.atmosphereModifiers.length).toBeGreaterThan(0);
        expect(found?.iconEmoji).toBeTruthy();
        expect(found?.colorTemperature).toBeDefined();
      });
    });

    it('matches MOOD_PRESETS constant accurately', () => {
      expect(service.getMoods()).toEqual(MOOD_PRESETS);
    });
  });

  describe('3. Aspect Ratios Invariant', () => {
    it('provides all 4 aspect ratios with accurate dimensions', () => {
      const ratios = service.getAspectRatios();
      expect(ratios).toHaveLength(4);

      const map = new Map(ratios.map((r) => [r.ratio, r]));

      expect(map.get('1:1')?.dimensions).toEqual({ width: 1080, height: 1080 });
      expect(map.get('16:9')?.dimensions).toEqual({ width: 1920, height: 1080 });
      expect(map.get('9:16')?.dimensions).toEqual({ width: 1080, height: 1920 });
      expect(map.get('4:3')?.dimensions).toEqual({ width: 1440, height: 1080 });
    });
  });

  describe('4. Prompt Synthesizer (synthesizePrompt)', () => {
    it('synthesizes rich production diffusion prompt from parameters', () => {
      const result = service.synthesizePrompt(
        'A solitary cybernetic samurai beneath cherry blossoms',
        'Photorealistic',
        'Golden Hour',
        '16:9',
        ['volumetric dust', 'lens flare'],
      );

      expect(result.idea).toBe('A solitary cybernetic samurai beneath cherry blossoms');
      expect(result.style).toBe('Photorealistic');
      expect(result.mood).toBe('Golden Hour');
      expect(result.aspectRatio).toBe('16:9');
      expect(result.dimensions).toEqual({ width: 1920, height: 1080 });

      // Prompt should contain idea, style modifiers, mood modifiers, and flags
      expect(result.prompt).toContain('A solitary cybernetic samurai beneath cherry blossoms');
      expect(result.prompt).toContain('photorealistic');
      expect(result.prompt).toContain('Hasselblad');
      expect(result.prompt).toContain('golden hour');
      expect(result.prompt).toContain('volumetric dust');
      expect(result.prompt).toContain('--ar 16:9');
      expect(result.prompt).toContain('--v 6.0');

      // Negative prompt checks
      expect(result.negativePrompt).toContain('blurry');
      expect(result.negativePrompt).toContain('airbrushed');

      // Technical metadata
      expect(result.modelRecommendation).toBe('flux-1-schnell');
      expect(result.recommendedSteps).toBeGreaterThan(0);
      expect(result.cfgScale).toBeGreaterThan(0);
      expect(result.sampler).toBeTruthy();
      expect(result.estimatedInferenceTimeMs).toBeGreaterThan(0);
    });

    it('synthesizes prompt from an options object', () => {
      const result = service.synthesizePrompt({
        idea: 'Ancient stone temple overgrown with luminous moss',
        style: 'Anime / Manga',
        mood: 'Ethereal Bioluminescent',
        aspectRatio: '9:16',
        customKeywords: ['glowing spores', 'ghibli aesthetic'],
      });

      expect(result.idea).toBe('Ancient stone temple overgrown with luminous moss');
      expect(result.style).toBe('Anime / Manga');
      expect(result.mood).toBe('Ethereal Bioluminescent');
      expect(result.aspectRatio).toBe('9:16');
      expect(result.dimensions).toEqual({ width: 1080, height: 1920 });

      expect(result.prompt).toContain('makoto shinkai style');
      expect(result.prompt).toContain('bioluminescent');
      expect(result.prompt).toContain('glowing spores');
      expect(result.prompt).toContain('--ar 9:16');
    });

    it('handles fallback defaults gracefully for empty inputs', () => {
      const result = service.synthesizePrompt('');

      expect(result.idea).toBe('A surreal futuristic landscape');
      expect(result.style).toBe('Photorealistic');
      expect(result.mood).toBe('Golden Hour');
      expect(result.aspectRatio).toBe('1:1');
      expect(result.prompt).toContain('--ar 1:1');
    });

    it('supports comma-separated string for custom keywords', () => {
      const result = service.synthesizePrompt({
        idea: 'Mechanical owl',
        style: 'Minimalist 3D',
        mood: 'Studio Softbox',
        aspectRatio: '1:1',
        customKeywords: 'brass gears, glowing eyes, clean clay',
      });

      expect(result.prompt).toContain('brass gears');
      expect(result.prompt).toContain('glowing eyes');
      expect(result.prompt).toContain('clean clay');
      expect(result.style).toBe('Minimalist 3D');
      expect(result.tags).toContain('brass gears');
    });
  });

  describe('5. Template Marketplace Gallery', () => {
    it('returns curated templates with rich metadata', () => {
      const templates = service.getTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(10);

      templates.forEach((t) => {
        expect(t.id).toBeTruthy();
        expect(t.title).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.category).toBeTruthy();
        expect(t.idea).toBeTruthy();
        expect(t.style).toBeTruthy();
        expect(t.mood).toBeTruthy();
        expect(t.aspectRatio).toBeTruthy();
        expect(t.thumbnailEmoji).toBeTruthy();
        expect(t.popularityScore).toBeGreaterThanOrEqual(0);
        expect(t.synthesizedPrompt).toBeTruthy();
      });
    });

    it('filters templates by category', () => {
      const scifiTemplates = service.getTemplates('scifi');
      expect(scifiTemplates.length).toBeGreaterThan(0);
      scifiTemplates.forEach((t) => expect(t.category).toBe('scifi'));

      const allTemplates = service.getTemplates('all');
      expect(allTemplates.length).toEqual(service.getTemplates().length);
    });

    it('filters templates by search term', () => {
      const results = service.getTemplates(undefined, 'cyberpunk');
      expect(results.length).toBeGreaterThan(0);
      results.forEach((t) => {
        const matches =
          t.title.toLowerCase().includes('cyberpunk') ||
          t.description.toLowerCase().includes('cyberpunk') ||
          t.tags.some((tag) => tag.toLowerCase().includes('cyberpunk')) ||
          t.style.toLowerCase().includes('cyberpunk');
        expect(matches).toBe(true);
      });
    });

    it('retrieves template by unique ID', () => {
      const tpl = service.getTemplateById('cyber-rain-alley');
      expect(tpl).toBeDefined();
      expect(tpl?.title).toBe('Cyberpunk Rain-Slicked Alleyway');
      expect(tpl?.category).toBe('scifi');

      const nonExistent = service.getTemplateById('unknown-id-xyz');
      expect(nonExistent).toBeUndefined();
    });
  });

  describe('6. Fastify Route Endpoints', () => {
    let fastify: FastifyInstance;

    beforeEach(async () => {
      fastify = Fastify({ logger: false });
      fastify.decorate('imageWizardService', service);
      await fastify.register(imageWizardRoutes, { prefix: '/image-wizard' });
      await fastify.ready();
    });

    it('GET /image-wizard/presets returns all styles, moods, aspect ratios, and templates', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/image-wizard/presets',
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.success).toBe(true);
      expect(json.data.styles).toHaveLength(8);
      expect(json.data.moods).toHaveLength(7);
      expect(json.data.aspectRatios).toHaveLength(4);
      expect(json.data.templates.length).toBeGreaterThanOrEqual(10);
      expect(json.data.suggestionChips.length).toBeGreaterThan(0);
    });

    it('GET /image-wizard/templates returns template gallery', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/image-wizard/templates?category=scifi',
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.success).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);
      json.data.forEach((item: any) => expect(item.category).toBe('scifi'));
    });

    it('GET /image-wizard/templates/:id returns specific template or 404', async () => {
      const responseFound = await fastify.inject({
        method: 'GET',
        url: '/image-wizard/templates/cyber-rain-alley',
      });
      expect(responseFound.statusCode).toBe(200);
      const jsonFound = JSON.parse(responseFound.body);
      expect(jsonFound.success).toBe(true);
      expect(jsonFound.data.id).toBe('cyber-rain-alley');

      const responseMissing = await fastify.inject({
        method: 'GET',
        url: '/image-wizard/templates/nonexistent-template-id',
      });
      expect(responseMissing.statusCode).toBe(404);
      const jsonMissing = JSON.parse(responseMissing.body);
      expect(jsonMissing.success).toBe(false);
    });

    it('POST /image-wizard/synthesize returns synthesized prompt and technical configuration', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/image-wizard/synthesize',
        payload: {
          idea: 'Futuristic quantum supercomputer in an iceberg',
          style: 'Cyberpunk Neon',
          mood: 'Dramatic Volumetric',
          aspectRatio: '16:9',
          customKeywords: ['crystalline frost', 'subzero coolant'],
        },
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.success).toBe(true);
      expect(json.data.prompt).toContain('Futuristic quantum supercomputer in an iceberg');
      expect(json.data.prompt).toContain('cyberpunk aesthetic');
      expect(json.data.prompt).toContain('dramatic volumetric god rays');
      expect(json.data.prompt).toContain('--ar 16:9');
      expect(json.data.dimensions).toEqual({ width: 1920, height: 1080 });
      expect(json.data.negativePrompt).toBeTruthy();
    });

    it('POST /image-wizard/synthesize rejects invalid requests with 400', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/image-wizard/synthesize',
        payload: {
          idea: '', // Empty idea violates min(1)
        },
      });

      expect(response.statusCode).toBe(400);
      const json = JSON.parse(response.body);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Validation failed');
    });
  });
});
