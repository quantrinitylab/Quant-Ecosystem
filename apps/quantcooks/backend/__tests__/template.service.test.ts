import { describe, it, expect } from 'vitest';
import { TemplateService, TemplateNotFoundError } from '../services/template.service';

describe('TemplateService', () => {
  const svc = new TemplateService();

  describe('listTemplates', () => {
    it('returns the full catalog', () => {
      const all = svc.listTemplates();
      expect(all.length).toBeGreaterThanOrEqual(5);
      expect(all.find((t) => t.id === 'reel-vertical')).toBeDefined();
    });

    it('filters by category', () => {
      const youtube = svc.listTemplates('youtube');
      expect(youtube.every((t) => t.category === 'youtube')).toBe(true);
      expect(youtube.find((t) => t.id === 'youtube-intro')).toBeDefined();
    });

    it('returns copies (mutating the result does not corrupt the catalog)', () => {
      const a = svc.listTemplates();
      a[0]!.name = 'MUTATED';
      a[0]!.layers[0]!.name = 'MUTATED';
      const b = svc.listTemplates();
      expect(b[0]!.name).not.toBe('MUTATED');
      expect(b[0]!.layers[0]!.name).not.toBe('MUTATED');
    });
  });

  describe('getTemplate', () => {
    it('returns a template with its preset layers', () => {
      const t = svc.getTemplate('reel-vertical');
      expect(t.aspectRatio).toBe('9:16');
      expect(t.width).toBe(1080);
      expect(t.height).toBe(1920);
      expect(t.layers.length).toBeGreaterThan(0);
    });

    it('throws for an unknown template', () => {
      expect(() => svc.getTemplate('nope')).toThrowError(TemplateNotFoundError);
    });
  });

  describe('applyTemplate', () => {
    it('produces a project draft from the template', () => {
      const draft = svc.applyTemplate('youtube-intro');
      expect(draft.templateId).toBe('youtube-intro');
      expect(draft.type).toBe('VIDEO');
      expect(draft.aspectRatio).toBe('16:9');
      expect(draft.durationSec).toBe(10);
      expect(draft.name).toBe('YouTube Intro');
      expect(draft.layers.length).toBeGreaterThan(0);
    });

    it('uses a custom project name when provided', () => {
      const draft = svc.applyTemplate('reel-vertical', { name: 'My Reel' });
      expect(draft.name).toBe('My Reel');
    });

    it('falls back to the template name for blank custom names', () => {
      const draft = svc.applyTemplate('reel-vertical', { name: '   ' });
      expect(draft.name).toBe('Vertical Reel');
    });

    it('throws for an unknown template', () => {
      expect(() => svc.applyTemplate('nope')).toThrowError(TemplateNotFoundError);
    });

    it('photo/collage templates have zero duration', () => {
      expect(svc.applyTemplate('square-post').durationSec).toBe(0);
      expect(svc.applyTemplate('collage-3').type).toBe('COLLAGE');
    });
  });
});
