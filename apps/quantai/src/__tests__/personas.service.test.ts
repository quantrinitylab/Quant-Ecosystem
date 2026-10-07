import { describe, it, expect, beforeEach } from 'vitest';
import { PersonasService } from '../services/personas.service';

describe('PersonasService', () => {
  let service: PersonasService;

  beforeEach(() => {
    service = new PersonasService();
  });

  describe('create', () => {
    it('should create a persona', () => {
      const persona = service.create({
        name: 'Test Bot',
        systemPrompt: 'You are helpful.',
        model: 'gpt-4',
        avatar: '🤖',
        temperature: 0.7,
        maxTokens: 2048,
      });
      expect(persona.id).toBeDefined();
      expect(persona.name).toBe('Test Bot');
      expect(persona.isActive).toBe(false);
      expect(persona.createdAt).toBeGreaterThan(0);
    });
  });

  describe('update', () => {
    it('should update persona fields', () => {
      const persona = service.create({
        name: 'Bot',
        systemPrompt: 'Hello',
        model: 'gpt-4',
        avatar: '🤖',
        temperature: 0.5,
        maxTokens: 1024,
      });
      const updated = service.update(persona.id, { name: 'Updated Bot', temperature: 0.9 });
      expect(updated?.name).toBe('Updated Bot');
      expect(updated?.temperature).toBe(0.9);
    });

    it('should return null for non-existent id', () => {
      expect(service.update('fake-id', { name: 'X' })).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a persona', () => {
      const persona = service.create({
        name: 'Bot',
        systemPrompt: '',
        model: 'gpt-4',
        avatar: '',
        temperature: 0.5,
        maxTokens: 1024,
      });
      expect(service.delete(persona.id)).toBe(true);
      expect(service.list()).toHaveLength(0);
    });

    it('should return false for non-existent id', () => {
      expect(service.delete('fake-id')).toBe(false);
    });

    it('should clear active if deleted persona was active', () => {
      const persona = service.create({
        name: 'Bot',
        systemPrompt: '',
        model: 'gpt-4',
        avatar: '',
        temperature: 0.5,
        maxTokens: 1024,
      });
      service.activate(persona.id);
      service.delete(persona.id);
      expect(service.getActive()).toBeNull();
    });
  });

  describe('list', () => {
    it('should list all personas', () => {
      service.create({
        name: 'A',
        systemPrompt: '',
        model: 'gpt-4',
        avatar: '',
        temperature: 0.5,
        maxTokens: 1024,
      });
      service.create({
        name: 'B',
        systemPrompt: '',
        model: 'gpt-4',
        avatar: '',
        temperature: 0.5,
        maxTokens: 1024,
      });
      expect(service.list()).toHaveLength(2);
    });
  });

  describe('activate / getActive', () => {
    it('should activate a persona', () => {
      const persona = service.create({
        name: 'Bot',
        systemPrompt: '',
        model: 'gpt-4',
        avatar: '',
        temperature: 0.5,
        maxTokens: 1024,
      });
      const activated = service.activate(persona.id);
      expect(activated?.isActive).toBe(true);
      expect(service.getActive()?.id).toBe(persona.id);
    });

    it('should deactivate previous persona when activating new one', () => {
      const p1 = service.create({
        name: 'A',
        systemPrompt: '',
        model: 'gpt-4',
        avatar: '',
        temperature: 0.5,
        maxTokens: 1024,
      });
      const p2 = service.create({
        name: 'B',
        systemPrompt: '',
        model: 'gpt-4',
        avatar: '',
        temperature: 0.5,
        maxTokens: 1024,
      });
      service.activate(p1.id);
      service.activate(p2.id);
      expect(service.getActive()?.id).toBe(p2.id);
      // p1 should no longer be active
      const list = service.list();
      const found = list.find((p) => p.id === p1.id);
      expect(found?.isActive).toBe(false);
    });

    it('should return null if no persona is active', () => {
      expect(service.getActive()).toBeNull();
    });

    it('should return null for non-existent id', () => {
      expect(service.activate('fake')).toBeNull();
    });
  });

  describe('duplicate', () => {
    it('should duplicate a persona', () => {
      const original = service.create({
        name: 'Original',
        systemPrompt: 'Be helpful',
        model: 'gpt-4',
        avatar: '🤖',
        temperature: 0.5,
        maxTokens: 1024,
      });
      const copy = service.duplicate(original.id);
      expect(copy).not.toBeNull();
      expect(copy?.name).toBe('Original (Copy)');
      expect(copy?.systemPrompt).toBe('Be helpful');
      expect(copy?.id).not.toBe(original.id);
    });

    it('should return null for non-existent id', () => {
      expect(service.duplicate('fake')).toBeNull();
    });
  });

  describe('getDefaults', () => {
    it('should return 4 default personas', () => {
      const defaults = service.getDefaults();
      expect(defaults).toHaveLength(4);
      expect(defaults.map((d) => d.name)).toContain('Coder');
      expect(defaults.map((d) => d.name)).toContain('Writer');
    });
  });
});
