import { describe, it, expect, beforeEach } from 'vitest';
import { EmailTemplateService } from '../services/email-templates.service';

describe('EmailTemplateService', () => {
  let service: EmailTemplateService;

  beforeEach(() => {
    service = new EmailTemplateService();
  });

  describe('create', () => {
    it('should create a template with auto-extracted variables', () => {
      const template = service.create({
        name: 'Welcome Email',
        subject: 'Welcome {{name}}!',
        body: 'Hello {{name}}, welcome to {{company}}.',
        category: 'onboarding',
      });

      expect(template.id).toBeDefined();
      expect(template.name).toBe('Welcome Email');
      expect(template.variables).toContain('name');
      expect(template.variables).toContain('company');
      expect(template.createdAt).toBeGreaterThan(0);
      expect(template.updatedAt).toBeGreaterThan(0);
    });

    it('should assign unique ids', () => {
      const first = service.create({ name: 'A', subject: 'a', body: 'a', category: 'x' });
      const second = service.create({ name: 'B', subject: 'b', body: 'b', category: 'x' });

      expect(first.id).not.toBe(second.id);
    });

    it('should handle templates with no variables', () => {
      const template = service.create({
        name: 'Simple',
        subject: 'Hello',
        body: 'Just a plain email.',
        category: 'general',
      });

      expect(template.variables).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should update template fields', () => {
      const template = service.create({
        name: 'Original',
        subject: 'Hi {{name}}',
        body: 'Body',
        category: 'general',
      });

      const updated = service.update(template.id, {
        name: 'Updated',
        body: 'New body with {{role}}',
      });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Updated');
      expect(updated?.variables).toContain('name');
      expect(updated?.variables).toContain('role');
    });

    it('should return null for non-existent template', () => {
      const result = service.update('non-existent', { name: 'X' });
      expect(result).toBeNull();
    });

    it('should not change id or createdAt', () => {
      const template = service.create({
        name: 'Test',
        subject: 'S',
        body: 'B',
        category: 'c',
      });

      const updated = service.update(template.id, { name: 'Changed' });
      expect(updated?.id).toBe(template.id);
      expect(updated?.createdAt).toBe(template.createdAt);
    });
  });

  describe('delete', () => {
    it('should delete an existing template', () => {
      const template = service.create({
        name: 'ToDelete',
        subject: 'S',
        body: 'B',
        category: 'c',
      });

      expect(service.delete(template.id)).toBe(true);
      expect(service.list()).toHaveLength(0);
    });

    it('should return false for non-existent template', () => {
      expect(service.delete('non-existent')).toBe(false);
    });
  });

  describe('list', () => {
    it('should return all templates', () => {
      service.create({ name: 'A', subject: 'S', body: 'B', category: 'cat1' });
      service.create({ name: 'B', subject: 'S', body: 'B', category: 'cat2' });

      expect(service.list()).toHaveLength(2);
    });

    it('should filter by category', () => {
      service.create({ name: 'A', subject: 'S', body: 'B', category: 'cat1' });
      service.create({ name: 'B', subject: 'S', body: 'B', category: 'cat2' });
      service.create({ name: 'C', subject: 'S', body: 'B', category: 'cat1' });

      const filtered = service.list('cat1');
      expect(filtered).toHaveLength(2);
      expect(filtered.every((t) => t.category === 'cat1')).toBe(true);
    });
  });

  describe('apply', () => {
    it('should substitute variables in subject and body', () => {
      const template = service.create({
        name: 'Greeting',
        subject: 'Hi {{name}}!',
        body: 'Welcome to {{company}}, {{name}}.',
        category: 'general',
      });

      const result = service.apply(template.id, { name: 'Alice', company: 'Acme' });
      expect(result).not.toBeNull();
      expect(result?.subject).toBe('Hi Alice!');
      expect(result?.body).toBe('Welcome to Acme, Alice.');
    });

    it('should leave unmatched variables as-is', () => {
      const template = service.create({
        name: 'Partial',
        subject: '{{greeting}} {{name}}',
        body: 'Body',
        category: 'general',
      });

      const result = service.apply(template.id, { greeting: 'Hello' });
      expect(result?.subject).toBe('Hello {{name}}');
    });

    it('should return null for non-existent template', () => {
      const result = service.apply('non-existent', {});
      expect(result).toBeNull();
    });
  });

  describe('extractVariables', () => {
    it('should extract variable names from text', () => {
      const vars = service.extractVariables('Hello {{name}}, your {{role}} at {{company}}');
      expect(vars).toContain('name');
      expect(vars).toContain('role');
      expect(vars).toContain('company');
    });

    it('should return empty array for text without variables', () => {
      const vars = service.extractVariables('No variables here');
      expect(vars).toHaveLength(0);
    });

    it('should deduplicate variables', () => {
      const vars = service.extractVariables('{{name}} and {{name}} again');
      expect(vars).toHaveLength(1);
      expect(vars[0]).toBe('name');
    });
  });
});
