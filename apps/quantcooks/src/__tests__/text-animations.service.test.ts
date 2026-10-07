import { describe, it, expect, beforeEach } from 'vitest';
import { TextAnimationsService } from '../services/text-animations.service';
import type { TextStyle } from '../services/text-animations.service';

describe('TextAnimationsService', () => {
  let service: TextAnimationsService;
  const defaultStyle: TextStyle = {
    fontFamily: 'Arial',
    fontSize: 32,
    color: '#ffffff',
    bold: false,
    italic: false,
  };

  beforeEach(() => {
    service = new TextAnimationsService();
  });

  describe('create', () => {
    it('should create a text animation', () => {
      const animation = service.create('Hello World', 'fade_in', defaultStyle);
      expect(animation.text).toBe('Hello World');
      expect(animation.animation).toBe('fade_in');
      expect(animation.style.fontFamily).toBe('Arial');
      expect(animation.duration).toBe(1000);
      expect(animation.delay).toBe(0);
    });

    it('should use custom duration', () => {
      const animation = service.create('Test', 'typewriter', defaultStyle, 2000);
      expect(animation.duration).toBe(2000);
    });

    it('should create independent copies', () => {
      const animation = service.create('Test', 'bounce', defaultStyle);
      animation.text = 'Modified';
      const all = service.getAll();
      expect(all[0]?.text).toBe('Test');
    });
  });

  describe('update', () => {
    it('should update text', () => {
      const animation = service.create('Original', 'fade_in', defaultStyle);
      const updated = service.update(animation.id, { text: 'Updated' });
      expect(updated?.text).toBe('Updated');
    });

    it('should update animation type', () => {
      const animation = service.create('Test', 'fade_in', defaultStyle);
      const updated = service.update(animation.id, { animation: 'bounce' });
      expect(updated?.animation).toBe('bounce');
    });

    it('should update style', () => {
      const animation = service.create('Test', 'fade_in', defaultStyle);
      const newStyle: TextStyle = { ...defaultStyle, fontSize: 64, bold: true };
      const updated = service.update(animation.id, { style: newStyle });
      expect(updated?.style.fontSize).toBe(64);
      expect(updated?.style.bold).toBe(true);
    });

    it('should return null for non-existent animation', () => {
      expect(service.update('non-existent', { text: 'Test' })).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete an animation', () => {
      const animation = service.create('Test', 'fade_in', defaultStyle);
      expect(service.delete(animation.id)).toBe(true);
      expect(service.getAll()).toHaveLength(0);
    });

    it('should return false for non-existent animation', () => {
      expect(service.delete('non-existent')).toBe(false);
    });
  });

  describe('getPresets', () => {
    it('should return preset animations', () => {
      const presets = service.getPresets();
      expect(presets.length).toBeGreaterThan(0);
    });

    it('should include Title Card preset', () => {
      const presets = service.getPresets();
      const titleCard = presets.find((p) => p.name === 'Title Card');
      expect(titleCard?.animation).toBe('fade_in');
      expect(titleCard?.style.fontSize).toBe(48);
    });

    it('should include Typewriter Effect preset', () => {
      const presets = service.getPresets();
      const typewriter = presets.find((p) => p.name === 'Typewriter Effect');
      expect(typewriter?.animation).toBe('typewriter');
    });
  });

  describe('duplicate', () => {
    it('should create a copy with new ID', () => {
      const original = service.create('Hello', 'fade_in', defaultStyle);
      const copy = service.duplicate(original.id);
      expect(copy).not.toBeNull();
      expect(copy?.id).not.toBe(original.id);
      expect(copy?.text).toBe(original.text);
      expect(copy?.animation).toBe(original.animation);
    });

    it('should return null for non-existent animation', () => {
      expect(service.duplicate('non-existent')).toBeNull();
    });

    it('should result in two separate animations', () => {
      service.create('Test', 'bounce', defaultStyle);
      const all = service.getAll();
      const firstAnim = all[0];
      if (firstAnim) {
        service.duplicate(firstAnim.id);
      }
      expect(service.getAll()).toHaveLength(2);
    });
  });

  describe('getAll', () => {
    it('should return empty array initially', () => {
      expect(service.getAll()).toHaveLength(0);
    });

    it('should return all created animations', () => {
      service.create('One', 'fade_in', defaultStyle);
      service.create('Two', 'bounce', defaultStyle);
      service.create('Three', 'typewriter', defaultStyle);
      expect(service.getAll()).toHaveLength(3);
    });
  });
});
