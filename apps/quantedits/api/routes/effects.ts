// ============================================================================
// QuantEdits API - Effects Routes
// Video/photo effects, transitions, animations, text effects, stickers
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition, Effect, EffectCategory } from '../../src/types';

const EFFECTS_LIBRARY: Effect[] = [
  { id: 'eff_blur', name: 'Gaussian Blur', category: 'blur', description: 'Smooth blur effect', thumbnail: '/effects/blur.png', params: [{ name: 'radius', type: 'range', default: 5, min: 0, max: 50, step: 1 }], isCustom: false, isPremium: false },
  { id: 'eff_motion_blur', name: 'Motion Blur', category: 'blur', description: 'Directional motion blur', thumbnail: '/effects/motion-blur.png', params: [{ name: 'angle', type: 'range', default: 0, min: 0, max: 360 }, { name: 'distance', type: 'range', default: 10, min: 0, max: 100 }], isCustom: false, isPremium: false },
  { id: 'eff_vintage', name: 'Vintage Film', category: 'filter', description: 'Classic film grain look', thumbnail: '/effects/vintage.png', params: [{ name: 'intensity', type: 'range', default: 0.7, min: 0, max: 1, step: 0.1 }, { name: 'grain', type: 'range', default: 0.3, min: 0, max: 1 }], isCustom: false, isPremium: false },
  { id: 'eff_neon', name: 'Neon Glow', category: 'stylize', description: 'Vibrant neon edge glow', thumbnail: '/effects/neon.png', params: [{ name: 'color', type: 'color', default: '#ff00ff' }, { name: 'strength', type: 'range', default: 0.8, min: 0, max: 1 }], isCustom: false, isPremium: true },
  { id: 'eff_glitch', name: 'Glitch', category: 'distortion', description: 'Digital glitch distortion', thumbnail: '/effects/glitch.png', params: [{ name: 'intensity', type: 'range', default: 0.5, min: 0, max: 1 }, { name: 'speed', type: 'range', default: 1, min: 0.1, max: 5 }], isCustom: false, isPremium: false },
  { id: 'eff_chromatic', name: 'Chromatic Aberration', category: 'distortion', description: 'RGB channel split effect', thumbnail: '/effects/chromatic.png', params: [{ name: 'offset', type: 'range', default: 3, min: 0, max: 20 }, { name: 'angle', type: 'range', default: 0, min: 0, max: 360 }], isCustom: false, isPremium: false },
  { id: 'eff_fade_in', name: 'Fade In', category: 'transition', description: 'Smooth opacity fade in', thumbnail: '/effects/fade-in.png', params: [{ name: 'duration', type: 'range', default: 1, min: 0.1, max: 5 }], isCustom: false, isPremium: false },
  { id: 'eff_fade_out', name: 'Fade Out', category: 'transition', description: 'Smooth opacity fade out', thumbnail: '/effects/fade-out.png', params: [{ name: 'duration', type: 'range', default: 1, min: 0.1, max: 5 }], isCustom: false, isPremium: false },
  { id: 'eff_slide', name: 'Slide', category: 'transition', description: 'Slide transition between clips', thumbnail: '/effects/slide.png', params: [{ name: 'direction', type: 'select', default: 'left', options: ['left', 'right', 'up', 'down'] }, { name: 'duration', type: 'range', default: 0.5, min: 0.1, max: 3 }], isCustom: false, isPremium: false },
  { id: 'eff_zoom', name: 'Zoom', category: 'transition', description: 'Zoom transition', thumbnail: '/effects/zoom.png', params: [{ name: 'scale', type: 'range', default: 2, min: 1.1, max: 5 }, { name: 'duration', type: 'range', default: 0.5, min: 0.1, max: 3 }], isCustom: false, isPremium: false },
  { id: 'eff_bounce', name: 'Bounce', category: 'animation', description: 'Bouncing entrance animation', thumbnail: '/effects/bounce.png', params: [{ name: 'height', type: 'range', default: 50, min: 10, max: 200 }, { name: 'bounces', type: 'range', default: 3, min: 1, max: 10 }], isCustom: false, isPremium: false },
  { id: 'eff_typewriter', name: 'Typewriter', category: 'text-effect', description: 'Character-by-character reveal', thumbnail: '/effects/typewriter.png', params: [{ name: 'speed', type: 'range', default: 0.05, min: 0.01, max: 0.2 }, { name: 'cursor', type: 'boolean', default: true }], isCustom: false, isPremium: false },
  { id: 'eff_color_grade', name: 'Cinematic Color', category: 'color-grade', description: 'Hollywood-style color grading', thumbnail: '/effects/cinematic.png', params: [{ name: 'temperature', type: 'range', default: 6500, min: 2000, max: 10000 }, { name: 'tint', type: 'range', default: 0, min: -50, max: 50 }, { name: 'contrast', type: 'range', default: 1.1, min: 0.5, max: 2 }], isCustom: false, isPremium: true },
  { id: 'eff_vignette', name: 'Vignette', category: 'filter', description: 'Dark edges vignette', thumbnail: '/effects/vignette.png', params: [{ name: 'intensity', type: 'range', default: 0.5, min: 0, max: 1 }, { name: 'radius', type: 'range', default: 0.7, min: 0.1, max: 1 }], isCustom: false, isPremium: false },
  { id: 'eff_sharpen', name: 'Sharpen', category: 'filter', description: 'Increase image sharpness', thumbnail: '/effects/sharpen.png', params: [{ name: 'amount', type: 'range', default: 1, min: 0, max: 5 }], isCustom: false, isPremium: false },
];

export const effectRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/api/effects',
    handler: async (req: Request, res: Response) => {
      const { category, search, premium } = req.query as any;
      let effects = [...EFFECTS_LIBRARY];
      if (category) effects = effects.filter(e => e.category === category);
      if (premium !== undefined) effects = effects.filter(e => e.isPremium === (premium === 'true'));
      if (search) {
        const q = search.toLowerCase();
        effects = effects.filter(e => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q));
      }
      res.status(200).json({ success: true, data: effects });
    },
    requiresAuth: false,
  },
  {
    method: 'GET',
    path: '/api/effects/categories',
    handler: async (_req: Request, res: Response) => {
      const categories: { category: EffectCategory; count: number }[] = [];
      const catMap = new Map<EffectCategory, number>();
      for (const e of EFFECTS_LIBRARY) catMap.set(e.category, (catMap.get(e.category) || 0) + 1);
      for (const [category, count] of catMap) categories.push({ category, count });
      res.status(200).json({ success: true, data: categories });
    },
    requiresAuth: false,
  },
  {
    method: 'GET',
    path: '/api/effects/:id',
    handler: async (req: Request, res: Response) => {
      const effect = EFFECTS_LIBRARY.find(e => e.id === req.params['id']);
      if (!effect) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Effect not found' } }); return; }
      res.status(200).json({ success: true, data: effect });
    },
    requiresAuth: false,
  },
  {
    method: 'POST',
    path: '/api/effects/:id/apply',
    handler: async (req: Request, res: Response) => {
      const effect = EFFECTS_LIBRARY.find(e => e.id === req.params['id']);
      if (!effect) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Effect not found' } }); return; }
      const body = req.body as any;
      const appliedEffect = {
        id: `applied_${Date.now().toString(36)}`,
        effectId: effect.id,
        name: effect.name,
        enabled: true,
        params: body.params || {},
        intensity: body.intensity ?? 1,
      };
      res.status(200).json({ success: true, data: appliedEffect });
    },
  },
];
