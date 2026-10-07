import { describe, it, expect, beforeEach } from 'vitest';
import { InputValidator } from './input-validator';
import type { ValidationSchema } from '../types';

const schema = (fields: ValidationSchema['fields'], opts: Partial<ValidationSchema> = {}): ValidationSchema => ({
  fields,
  strict: false,
  allowUnknown: true,
  abortEarly: false,
  ...opts,
});

describe('InputValidator', () => {
  let validator: InputValidator;

  beforeEach(() => {
    validator = new InputValidator();
  });

  describe('validate (named schema)', () => {
    it('errors when the schema is not registered', async () => {
      const result = await validator.validate('missing', {});
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.field).toBe('_schema');
    });

    it('validates a registered schema', async () => {
      validator.registerSchema('user', schema({ name: { type: 'string', required: true } }));
      const result = await validator.validate('user', { name: 'Ann' });
      expect(result.valid).toBe(true);
      expect(validator.getSchemaNames()).toContain('user');
    });
  });

  describe('required + type checks', () => {
    it('reports missing required fields', async () => {
      const result = await validator.validateAgainstSchema(
        schema({ email: { type: 'email', required: true } }),
        {},
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.rule).toBe('required');
    });

    it('skips validation for optional, absent fields', async () => {
      const result = await validator.validateAgainstSchema(
        schema({ nickname: { type: 'string', required: false } }),
        {},
      );
      expect(result.valid).toBe(true);
    });

    it('enforces string/number/boolean types', async () => {
      const result = await validator.validateAgainstSchema(
        schema({ age: { type: 'number', required: true } }),
        { age: 'not-a-number' },
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.rule).toBe('type');
    });

    it('validates email, url and uuid types', async () => {
      const s = schema({
        e: { type: 'email', required: true },
        u: { type: 'url', required: true },
        id: { type: 'uuid', required: true },
      });
      const ok = await validator.validateAgainstSchema(s, {
        e: 'a@b.com',
        u: 'https://x.io/y',
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(ok.valid).toBe(true);

      const bad = await validator.validateAgainstSchema(s, { e: 'nope', u: 'ftp://x', id: 'xyz' });
      expect(bad.valid).toBe(false);
      expect(bad.errors.length).toBe(3);
    });
  });

  describe('min / max / pattern / enum', () => {
    it('enforces min and max on strings', async () => {
      const s = schema({ name: { type: 'string', required: true, min: 2, max: 5 } });
      expect((await validator.validateAgainstSchema(s, { name: 'a' })).valid).toBe(false);
      expect((await validator.validateAgainstSchema(s, { name: 'toolong' })).valid).toBe(false);
      expect((await validator.validateAgainstSchema(s, { name: 'abc' })).valid).toBe(true);
    });

    it('enforces pattern and enum', async () => {
      const s = schema({
        code: { type: 'string', required: true, pattern: '^[A-Z]{3}$' },
        role: { type: 'string', required: true, enum: ['admin', 'user'] },
      });
      const bad = await validator.validateAgainstSchema(s, { code: 'ab', role: 'guest' });
      expect(bad.valid).toBe(false);
      expect(bad.errors.map((e) => e.rule)).toEqual(expect.arrayContaining(['pattern', 'enum']));
    });
  });

  describe('strict mode + nested + arrays', () => {
    it('rejects unknown fields in strict mode', async () => {
      const result = await validator.validateAgainstSchema(
        schema({ a: { type: 'string', required: false } }, { strict: true, allowUnknown: false }),
        { a: 'x', extra: 1 },
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.rule).toBe('unknown_field');
    });

    it('aborts early when configured', async () => {
      const result = await validator.validateAgainstSchema(
        schema(
          { a: { type: 'string', required: true }, b: { type: 'string', required: true } },
          { abortEarly: true },
        ),
        {},
      );
      expect(result.errors.length).toBe(1);
    });

    it('validates nested object properties', async () => {
      const s = schema({
        profile: {
          type: 'object',
          required: true,
          properties: { age: { type: 'number', required: true } },
        },
      });
      const bad = await validator.validateAgainstSchema(s, { profile: { age: 'x' } });
      expect(bad.valid).toBe(false);
      expect(bad.errors[0]?.field).toBe('profile.age');
    });

    it('validates array items', async () => {
      const s = schema({
        tags: { type: 'array', required: true, items: { type: 'string', required: true } },
      });
      const bad = await validator.validateAgainstSchema(s, { tags: ['ok', 5] });
      expect(bad.valid).toBe(false);
      expect(bad.errors[0]?.field).toBe('tags[1]');
    });
  });

  describe('custom rules + sanitization', () => {
    it('applies built-in custom rules (alphanumeric, creditCard)', async () => {
      const s = schema({
        slug: { type: 'string', required: true, custom: 'alphanumeric' },
        card: { type: 'string', required: true, custom: 'creditCard' },
      });
      const ok = await validator.validateAgainstSchema(s, { slug: 'abc123', card: '4539578763621486' });
      expect(ok.valid).toBe(true);
      const bad = await validator.validateAgainstSchema(s, { slug: 'a b', card: '1234' });
      expect(bad.valid).toBe(false);
    });

    it('supports a user-registered custom rule', async () => {
      validator.registerRule('even', (v) => typeof v === 'number' && v % 2 === 0);
      expect(validator.getRuleNames()).toContain('even');
      const s = schema({ n: { type: 'number', required: true, custom: 'even' } });
      expect((await validator.validateAgainstSchema(s, { n: 3 })).valid).toBe(false);
      expect((await validator.validateAgainstSchema(s, { n: 4 })).valid).toBe(true);
    });

    it('trims string values in the sanitized output', async () => {
      const s = schema({ name: { type: 'string', required: true } });
      const result = await validator.validateAgainstSchema(s, { name: '  spaced  ' });
      expect(result.sanitized.name).toBe('spaced');
    });

    it('records validation history', async () => {
      const s = schema({ a: { type: 'string', required: false } });
      await validator.validateAgainstSchema(s, { a: 'x' });
      expect(validator.getHistory().length).toBe(1);
    });
  });
});
