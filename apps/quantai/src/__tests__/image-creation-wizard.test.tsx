// ============================================================================
// QuantAI — Image Creation Wizard Modal React Component Tests
// Task W39-A06 Parity Suite
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ImageCreationWizardModal,
  STYLES_LIST,
  MOODS_LIST,
  ASPECT_RATIOS_LIST,
  TEMPLATES_GALLERY,
} from '../components/ImageCreationWizardModal';

describe('ImageCreationWizardModal (Task W39-A06 React Suite)', () => {
  describe('1. Visibility & Overlay State', () => {
    it('renders null when isOpen is false', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImageCreationWizardModal, {
          isOpen: false,
          onClose: vi.fn(),
        }),
      );
      expect(html).toBe('');
    });

    it('renders modal dialog with backdrop and header when isOpen is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImageCreationWizardModal, {
          isOpen: true,
          onClose: vi.fn(),
        }),
      );
      expect(html).toContain('Image Creation Wizard');
      expect(html).toContain('QuantAI Diffusion');
      expect(html).toContain('Guided Wizard');
      expect(html).toContain('Templates');
    });
  });

  describe('2. Stepper Wizard Header & Progress Bar', () => {
    it('renders all 3 wizard steps in stepper bar', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImageCreationWizardModal, {
          isOpen: true,
          onClose: vi.fn(),
        }),
      );
      expect(html).toContain('1. Idea &amp; Subject');
      expect(html).toContain('2. Visual Style');
      expect(html).toContain('3. Mood &amp; Lighting');
    });
  });

  describe('3. Step 1: Idea Input & Aspect Ratio Selector', () => {
    it('renders idea input textarea and placeholder', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImageCreationWizardModal, {
          isOpen: true,
          onClose: vi.fn(),
          initialIdea: 'A futuristic quantum laboratory',
        }),
      );
      expect(html).toContain('What do you want to create?');
      expect(html).toContain('A futuristic quantum laboratory');
      expect(html).toContain('Aspect Ratio &amp; Dimensions');
    });

    it('renders all 4 aspect ratio options with dimensions', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImageCreationWizardModal, {
          isOpen: true,
          onClose: vi.fn(),
        }),
      );
      expect(html).toContain('Square (1:1)');
      expect(html).toContain('1080x1080');
      expect(html).toContain('Widescreen (16:9)');
      expect(html).toContain('1920x1080');
      expect(html).toContain('Reels / Portrait (9:16)');
      expect(html).toContain('1080x1920');
      expect(html).toContain('Standard (4:3)');
      expect(html).toContain('1440x1080');
    });

    it('renders creative suggestion starter chips', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImageCreationWizardModal, {
          isOpen: true,
          onClose: vi.fn(),
        }),
      );
      expect(html).toContain('Futuristic quantum server room with neon conduits');
      expect(html).toContain('Cyberpunk street food vendor in holographic Tokyo');
    });
  });

  describe('4. Style Presets Constants & Options', () => {
    it('exports all 8 required visual style presets', () => {
      expect(STYLES_LIST).toHaveLength(8);
      const names = STYLES_LIST.map((s) => s.name);
      expect(names).toContain('Photorealistic');
      expect(names).toContain('Anime / Manga');
      expect(names).toContain('Cyberpunk Neon');
      expect(names).toContain('Minimalist 3D');
      expect(names).toContain('Cinematic Macro');
      expect(names).toContain('Retro Pixel Art');
      expect(names).toContain('Watercolor & Ink');
      expect(names).toContain('Vector Illustration');
    });

    it('has valid modifiers and recommended model for each style', () => {
      STYLES_LIST.forEach((s) => {
        expect(s.modifiers.length).toBeGreaterThan(0);
        expect(s.iconEmoji).toBeTruthy();
        expect(s.recommendedModel).toBeTruthy();
      });
    });
  });

  describe('5. Mood Presets Constants & Options', () => {
    it('exports all 7 required mood & lighting presets', () => {
      expect(MOODS_LIST).toHaveLength(7);
      const names = MOODS_LIST.map((m) => m.name);
      expect(names).toContain('Golden Hour');
      expect(names).toContain('Cyberpunk Neon');
      expect(names).toContain('Studio Softbox');
      expect(names).toContain('Dramatic Volumetric');
      expect(names).toContain('Dark Noir');
      expect(names).toContain('Ethereal Bioluminescent');
      expect(names).toContain('Warm Sunset');
    });

    it('has lighting modifiers and emoji for each mood', () => {
      MOODS_LIST.forEach((m) => {
        expect(m.lightingModifiers.length).toBeGreaterThan(0);
        expect(m.iconEmoji).toBeTruthy();
        expect(m.colorTemperature).toBeDefined();
      });
    });
  });

  describe('6. Template Marketplace Gallery Tab', () => {
    it('renders templates tab when defaultTab is set to templates', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImageCreationWizardModal, {
          isOpen: true,
          onClose: vi.fn(),
          defaultTab: 'templates',
        }),
      );

      expect(html).toContain('Search templates');
      expect(html).toContain('Cyberpunk Rain-Slicked Alleyway');
      expect(html).toContain('Bioluminescent Deep Sea Sanctuary');
      expect(html).toContain('Studio Product Shot - Luxury Ceramic Watch');
      expect(html).toContain('Ghibli-Style Floating Cloud Castle');
      expect(html).toContain('⚡ Use Template');
    });

    it('contains at least 6 high-fidelity curated templates', () => {
      expect(TEMPLATES_GALLERY.length).toBeGreaterThanOrEqual(6);
      TEMPLATES_GALLERY.forEach((tpl) => {
        expect(tpl.id).toBeTruthy();
        expect(tpl.title).toBeTruthy();
        expect(tpl.category).toBeTruthy();
        expect(tpl.style).toBeTruthy();
        expect(tpl.mood).toBeTruthy();
        expect(tpl.aspectRatio).toBeTruthy();
        expect(tpl.synthesizedPrompt).toBeTruthy();
      });
    });
  });

  describe('7. Custom Aspect Ratios List', () => {
    it('exports all 4 standard aspect ratios', () => {
      expect(ASPECT_RATIOS_LIST).toHaveLength(4);
      const ratios = ASPECT_RATIOS_LIST.map((a) => a.ratio);
      expect(ratios).toEqual(['1:1', '16:9', '9:16', '4:3']);
    });
  });
});
