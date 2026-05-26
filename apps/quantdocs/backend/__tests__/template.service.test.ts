import { describe, it, expect } from 'vitest';
import { TemplateService } from '../services/template.service';

describe('TemplateService', () => {
  const service = new TemplateService();

  describe('getTemplates', () => {
    it('returns all 5 built-in templates', () => {
      const templates = service.getTemplates();

      expect(templates).toHaveLength(5);
      const ids = templates.map((t) => t.id);
      expect(ids).toContain('blank');
      expect(ids).toContain('meeting-notes');
      expect(ids).toContain('project-proposal');
      expect(ids).toContain('technical-spec');
      expect(ids).toContain('report');
    });

    it('each template has required properties', () => {
      const templates = service.getTemplates();

      for (const template of templates) {
        expect(template).toHaveProperty('id');
        expect(template).toHaveProperty('name');
        expect(template).toHaveProperty('description');
        expect(template).toHaveProperty('content');
        expect(template).toHaveProperty('metadata');
      }
    });
  });

  describe('getTemplate', () => {
    it('returns specific template by id - meeting-notes', () => {
      const template = service.getTemplate('meeting-notes');

      expect(template).toBeDefined();
      expect(template!.id).toBe('meeting-notes');
      expect(template!.name).toBe('Meeting Notes');
      expect(template!.content).toContain('Attendees');
      expect(template!.content).toContain('Action Items');
    });

    it('returns undefined for non-existent template', () => {
      const template = service.getTemplate('nonexistent');

      expect(template).toBeUndefined();
    });

    it('returns blank template', () => {
      const template = service.getTemplate('blank');

      expect(template).toBeDefined();
      expect(template!.id).toBe('blank');
      expect(template!.content).toBe('');
    });
  });

  describe('createFromTemplate', () => {
    it('produces doc object with template content', () => {
      const result = service.createFromTemplate('meeting-notes', 'user-1');

      expect(result.id).toBeDefined();
      expect(result.title).toBe('Meeting Notes');
      expect(result.content).toContain('Attendees');
      expect(result.userId).toBe('user-1');
      expect(result.templateId).toBe('meeting-notes');
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('applies customizations - custom title', () => {
      const result = service.createFromTemplate('project-proposal', 'user-1', {
        title: 'My Custom Proposal',
      });

      expect(result.title).toBe('My Custom Proposal');
      expect(result.content).toContain('Executive Summary');
    });

    it('applies customizations - custom metadata', () => {
      const result = service.createFromTemplate('technical-spec', 'user-1', {
        metadata: { team: 'backend' },
      });

      expect(result.metadata).toEqual(expect.objectContaining({ team: 'backend' }));
    });

    it('falls back to blank doc for unknown template', () => {
      const result = service.createFromTemplate('nonexistent', 'user-1');

      expect(result.title).toBe('Untitled Document');
      expect(result.content).toBe('');
      expect(result.templateId).toBe('blank');
    });
  });
});
