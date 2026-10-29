// ============================================================================
// QuantCooks CP-1 — zod → JSON Schema + quant-tools field map (§2.1 D4).
// ============================================================================
//
// D4 says: check the workspace catalogue first; write a small local
// converter covering the schema subset used here if none exists. Checked
// 2026-10-29: `zod-to-json-schema` appears in the pnpm store only as a
// transitive dependency of unrelated packages — NO workspace package
// declares it, and apps/quantcooks may not gain a new direct dependency
// (plus lockfile change) inside this unit. So this converter covers
// exactly the subset the CP-1 definitions use: objects, strings, numbers,
// booleans, arrays, enums, literals, records, unions of literals,
// optional / nullable / default wrappers. Anything outside the subset
// degrades to `{}` (an unconstrained schema node) rather than throwing —
// the executor always re-validates against the real zod schema, so the
// JSON Schema is discovery metadata, never the validator (§2.3).
// ============================================================================

import { z } from 'zod';
import type { ToolInputSchema } from '@quant/quant-tools';

type Json = Record<string, unknown>;

function typeName(schema: z.ZodTypeAny): string {
  return (schema._def as { typeName?: string }).typeName ?? '';
}

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  for (;;) {
    const name = typeName(current);
    if (name === 'ZodEffects') {
      current = (current._def as { schema: z.ZodTypeAny }).schema;
      continue;
    }
    return current;
  }
}

export function zodToJsonSchema(schema: z.ZodTypeAny): Json {
  const s = unwrap(schema);
  const name = typeName(s);
  const def = s._def as Record<string, unknown>;
  const description = (s as { description?: string }).description;
  const withDesc = (out: Json): Json => (description ? { ...out, description } : out);

  switch (name) {
    case 'ZodObject': {
      const shape = (s as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, Json> = {};
      const required: string[] = [];
      for (const [key, field] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(field as z.ZodTypeAny);
        if (!isOptionalField(field as z.ZodTypeAny)) required.push(key);
      }
      return withDesc({
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false,
      });
    }
    case 'ZodString': {
      const checks = (def['checks'] as { kind: string; value?: number }[] | undefined) ?? [];
      const out: Json = { type: 'string' };
      for (const check of checks) {
        if (check.kind === 'min') out['minLength'] = check.value;
        if (check.kind === 'max') out['maxLength'] = check.value;
      }
      return withDesc(out);
    }
    case 'ZodNumber': {
      const checks = (def['checks'] as { kind: string; value?: number }[] | undefined) ?? [];
      const out: Json = { type: 'number' };
      for (const check of checks) {
        if (check.kind === 'int') out.type = 'integer';
        if (check.kind === 'min') out['minimum'] = check.value;
        if (check.kind === 'max') out['maximum'] = check.value;
      }
      return withDesc(out);
    }
    case 'ZodBoolean':
      return withDesc({ type: 'boolean' });
    case 'ZodArray': {
      const inner = def['type'] as z.ZodTypeAny;
      const out: Json = { type: 'array', items: zodToJsonSchema(inner) };
      if (typeof def['minLength'] === 'object' && def['minLength']) {
        out['minItems'] = (def['minLength'] as { value: number }).value;
      }
      if (typeof def['maxLength'] === 'object' && def['maxLength']) {
        out['maxItems'] = (def['maxLength'] as { value: number }).value;
      }
      return withDesc(out);
    }
    case 'ZodEnum': {
      const values = (s as z.ZodEnum<[string, ...string[]]>).options;
      return withDesc({ type: 'string', enum: [...values] });
    }
    case 'ZodLiteral': {
      const value = def['value'];
      return withDesc({ const: value });
    }
    case 'ZodUnion': {
      const options = def['options'] as z.ZodTypeAny[];
      return withDesc({ anyOf: options.map((o) => zodToJsonSchema(o)) });
    }
    case 'ZodRecord': {
      const valueType = def['valueType'] as z.ZodTypeAny | undefined;
      return withDesc({
        type: 'object',
        ...(valueType ? { additionalProperties: zodToJsonSchema(valueType) } : {}),
      });
    }
    case 'ZodOptional': {
      return zodToJsonSchema(def['innerType'] as z.ZodTypeAny);
    }
    case 'ZodNullable': {
      const inner = zodToJsonSchema(def['innerType'] as z.ZodTypeAny);
      return { anyOf: [inner, { type: 'null' }] };
    }
    case 'ZodDefault': {
      const inner = zodToJsonSchema(def['innerType'] as z.ZodTypeAny);
      return { ...inner, default: (def['defaultValue'] as () => unknown)() };
    }
    case 'ZodUnknown':
    case 'ZodAny':
      return withDesc({});
    default:
      return withDesc({});
  }
}

function isOptionalField(schema: z.ZodTypeAny): boolean {
  const name = typeName(schema);
  if (name === 'ZodOptional' || name === 'ZodDefault') return true;
  if (name === 'ZodEffects') {
    return isOptionalField((schema._def as { schema: z.ZodTypeAny }).schema);
  }
  return false;
}

/**
 * The quant-tools `ToolInputSchema` field map (§2.3): top-level fields
 * only, lossy by design of that package — discovery metadata; the
 * executor re-validates against the full zod schema on every call.
 */
export function zodToFieldMap(schema: z.ZodTypeAny): ToolInputSchema {
  const s = unwrap(schema);
  if (typeName(s) !== 'ZodObject') return {};
  const shape = (s as z.ZodObject<z.ZodRawShape>).shape;
  const out: ToolInputSchema = {};
  for (const [key, field] of Object.entries(shape)) {
    const f = unwrap(field as z.ZodTypeAny);
    const fname = typeName(f);
    const type: ToolInputSchema[string]['type'] =
      fname === 'ZodString' || fname === 'ZodEnum' || fname === 'ZodLiteral'
        ? 'string'
        : fname === 'ZodNumber'
          ? 'number'
          : fname === 'ZodBoolean'
            ? 'boolean'
            : fname === 'ZodArray'
              ? 'array'
              : 'object';
    const entry: ToolInputSchema[string] = {
      type,
      required: !isOptionalField(field as z.ZodTypeAny),
      description:
        (field as { description?: string }).description ??
        (f as { description?: string }).description ??
        key,
    };
    if (fname === 'ZodDefault') {
      entry.default = ((f._def as { defaultValue: () => unknown }).defaultValue)();
    }
    out[key] = entry;
  }
  return out;
}
