import { describe, it, expect, beforeEach } from 'vitest';
import { SignatureBuilderService } from '../services/signature-builder.service';
import type { SignatureField } from '../services/signature-builder.service';

describe('SignatureBuilderService', () => {
  let service: SignatureBuilderService;

  const sampleFields: SignatureField[] = [
    { type: 'name', value: 'John Doe' },
    { type: 'title', value: 'Software Engineer' },
    { type: 'company', value: 'Acme Corp' },
    { type: 'email', value: 'john@acme.com' },
    { type: 'phone', value: '+1-555-0123' },
  ];

  beforeEach(() => {
    service = new SignatureBuilderService();
  });

  describe('create', () => {
    it('should create a signature with fields', () => {
      const sig = service.create('Work Signature', sampleFields);

      expect(sig.id).toBeDefined();
      expect(sig.name).toBe('Work Signature');
      expect(sig.fields).toEqual(sampleFields);
      expect(sig.html).toContain('John Doe');
    });

    it('should set the first signature as default', () => {
      const sig = service.create('First', sampleFields);
      expect(sig.isDefault).toBe(true);
    });

    it('should not set subsequent signatures as default', () => {
      service.create('First', sampleFields);
      const second = service.create('Second', sampleFields);
      expect(second.isDefault).toBe(false);
    });
  });

  describe('update', () => {
    it('should update signature fields', () => {
      const sig = service.create('Test', sampleFields);
      const newFields: SignatureField[] = [{ type: 'name', value: 'Jane Doe' }];

      const updated = service.update(sig.id, newFields);
      expect(updated?.fields).toEqual(newFields);
      expect(updated?.html).toContain('Jane Doe');
    });

    it('should return null for non-existent signature', () => {
      const result = service.update('non-existent', []);
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a signature', () => {
      const sig = service.create('Test', sampleFields);
      expect(service.delete(sig.id)).toBe(true);
      expect(service.list()).toHaveLength(0);
    });

    it('should reassign default when deleting default signature', () => {
      const first = service.create('First', sampleFields);
      service.create('Second', sampleFields);

      service.delete(first.id);
      const remaining = service.list();
      expect(remaining.some((s) => s.isDefault)).toBe(true);
    });

    it('should return false for non-existent signature', () => {
      expect(service.delete('non-existent')).toBe(false);
    });
  });

  describe('setDefault', () => {
    it('should change the default signature', () => {
      service.create('First', sampleFields);
      const second = service.create('Second', sampleFields);

      service.setDefault(second.id);

      const defaultSig = service.getDefault();
      expect(defaultSig?.id).toBe(second.id);
    });

    it('should unset previous default', () => {
      const first = service.create('First', sampleFields);
      const second = service.create('Second', sampleFields);

      service.setDefault(second.id);

      const all = service.list();
      const firstSig = all.find((s) => s.id === first.id);
      expect(firstSig?.isDefault).toBe(false);
    });
  });

  describe('getDefault', () => {
    it('should return null when no signatures exist', () => {
      expect(service.getDefault()).toBeNull();
    });

    it('should return the default signature', () => {
      const sig = service.create('Default', sampleFields);
      expect(service.getDefault()?.id).toBe(sig.id);
    });
  });

  describe('list', () => {
    it('should return all signatures', () => {
      service.create('A', sampleFields);
      service.create('B', sampleFields);
      service.create('C', sampleFields);

      expect(service.list()).toHaveLength(3);
    });
  });

  describe('renderHtml', () => {
    it('should generate HTML with all field types', () => {
      const fields: SignatureField[] = [
        { type: 'name', value: 'Test User' },
        { type: 'title', value: 'Developer' },
        { type: 'company', value: 'Corp' },
        { type: 'phone', value: '555-0000' },
        { type: 'email', value: 'test@corp.com' },
        { type: 'website', value: 'https://corp.com' },
        { type: 'social', value: 'https://twitter.com/test' },
        { type: 'image', value: 'https://corp.com/logo.png' },
      ];

      const sig = service.create('Full', fields);

      expect(sig.html).toContain('Test User');
      expect(sig.html).toContain('mailto:test@corp.com');
      expect(sig.html).toContain('tel:555-0000');
      expect(sig.html).toContain('https://corp.com');
      expect(sig.html).toContain('<img');
    });

    it('should escape HTML entities', () => {
      const fields: SignatureField[] = [{ type: 'name', value: '<script>alert("xss")</script>' }];

      const sig = service.create('XSS Test', fields);
      expect(sig.html).not.toContain('<script>');
      expect(sig.html).toContain('&lt;script&gt;');
    });
  });
});
