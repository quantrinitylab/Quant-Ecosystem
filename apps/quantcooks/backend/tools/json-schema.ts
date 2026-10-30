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
//
// Zod 4 note (repo override pins zod 4.6.6): this file reads zod's
// runtime internals, which zod 4 reshaped — `_def.type` is now a
// lowercase string ('object', 'string', …) instead of `typeName`
// ('ZodObject', …); string/number/array bounds live in `_def.checks`
// as check objects whose payload is `check._zod.def`
// ({check: 'min_length', minimum} / {check: 'greater_than', value,
// inclusive} / {check: 'number_format', format: 'safeint'}); transforms
// are `pipe` nodes (follow `in` for the input schema); arrays carry
// `element` (not `type`); literals carry `values` (not `value`); enums
// carry `entries`. The converter maps those back onto the old names so
// every switch case below — and therefore the emitted JSON Schema
// shape — is unchanged from the zod 3 version. `_def` is deliberately
// read through `unknown` (see defOf): zod 4 types it opaquely, and this
// file's whole job is dynamic introspection of it.
// ============================================================================

import { z } from 'zod';
import type { ToolInputSchema } from '@quant/quant-tools';

type Json = Record<string, unknown>;

/** The raw zod 4 definition object, read as a record for introspection. */
function defOf(schema: z.ZodTypeAny): Record<string, unknown> {
  const def: unknown = (schema as { _def?: unknown })._def;
  return def !== null && typeof def === 'object'
    ? (def as Record<string, unknown>)
    : {};
}

const TYPE_NAMES: Record<string, string> = {
  object: 'ZodObject',
  string: 'ZodString',
  number: 'ZodNumber',
  boolean: 'ZodBoolean',
  array: 'ZodArray',
  enum: 'ZodEnum',
  literal: 'ZodLiteral',
  union: 'ZodUnion',
  record: 'ZodRecord',
  optional: 'ZodOptional',
  nullable: 'ZodNullable',
  default: 'ZodDefault',
  unknown: 'ZodUnknown',
  any: 'ZodAny',
  // A zod 4 transform is a pipe node; unwrap follows its input side.
  pipe: 'ZodEffects',
};

function typeName(schema: z.ZodTypeAny): string {
  const type = defOf(schema)['type'];
  return typeof type === 'string' ? (TYPE_NAMES[type] ?? '') : '';
}

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  for (;;) {
    const name = typeName(current);
    if (name === 'ZodEffects') {
      const def = defOf(current);
      const inner = def['in'] ?? def['schema'];
      if (inner !== null && typeof inner === 'object') {
        current = inner as z.ZodTypeAny;
        continue;
      }
    }
    return current;
  }
}

interface CheckDef {
  check?: string;
  minimum?: number;
  maximum?: number;
  value?: number;
  inclusive?: boolean;
  format?: string;
}

/** Zod 4 check payloads: `_def.checks[i]._zod.def`. */
function checkDefs(def: Record<string, unknown>): CheckDef[] {
  const checks = def['checks'];
  if (!Array.isArray(checks)) return [];
  const out: CheckDef[] = [];
  for (const check of checks) {
    const payload: unknown = (check as { _zod?: { def?: unknown } })._zod?.def;
    if (payload !== null && typeof payload === 'object') {
      const d = payload as Record<string, unknown>;
      const num = (v: unknown): number | undefined =>
        typeof v === 'number' ? v : undefined;
      out.push({
        check: typeof d['check'] === 'string' ? d['check'] : undefined,
        minimum: num(d['minimum']),
        maximum: num(d['maximum']),
        value: num(d['value']),
        inclusive: typeof d['inclusive'] === 'boolean' ? d['inclusive'] : undefined,
        format: typeof d['format'] === 'string' ? d['format'] : undefined,
      });
    }
  }
  return out;
}

export function zodToJsonSchema(schema: z.ZodTypeAny): Json {
  const s = unwrap(schema);
  const name = typeName(s);
  const def = defOf(s);
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
      const out: Json = { type: 'string' };
      for (const check of checkDefs(def)) {
        if (check.check === 'min_length' && check.minimum !== undefined) {
          out['minLength'] = check.minimum;
        }
        if (check.check === 'max_length' && check.maximum !== undefined) {
          out['maxLength'] = check.maximum;
        }
      }
      return withDesc(out);
    }
    case 'ZodNumber': {
      const out: Json = { type: 'number' };
      for (const check of checkDefs(def)) {
        if (check.check === 'number_format' && check.format !== undefined) {
          if (check.format.includes('int')) out.type = 'integer';
        }
        if (check.check === 'greater_than' && check.value !== undefined) {
          if (check.inclusive === false) out['exclusiveMinimum'] = check.value;
          else out['minimum'] = check.value;
        }
        if (check.check === 'less_than' && check.value !== undefined) {
          if (check.inclusive === false) out['exclusiveMaximum'] = check.value;
          else out['maximum'] = check.value;
        }
      }
      return withDesc(out);
    }
    case 'ZodBoolean':
      return withDesc({ type: 'boolean' });
    case 'ZodArray': {
      const inner = (def['element'] ?? def['type']) as z.ZodTypeAny;
      const out: Json = { type: 'array', items: zodToJsonSchema(inner) };
      for (const check of checkDefs(def)) {
        if (check.check === 'min_length' && check.minimum !== undefined) {
          out['minItems'] = check.minimum;
        }
        if (check.check === 'max_length' && check.maximum !== undefined) {
          out['maxItems'] = check.maximum;
        }
      }
      return withDesc(out);
    }
    case 'ZodEnum': {
      const entries = def['entries'];
      let values: unknown[] = [];
      if (entries !== null && typeof entries === 'object') {
        values = Object.values(entries as Record<string, unknown>);
      }
      if (!values.length) {
        const opts = (s as unknown as { options?: readonly unknown[] }).options;
        if (opts) values = [...opts];
      }
      return withDesc({ type: 'string', enum: values });
    }
    case 'ZodLiteral': {
      const values = def['values'];
      const value = Array.isArray(values) ? values[0] : def['value'];
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
      const defaultValue = def['defaultValue'];
      return {
        ...inner,
        default: typeof defaultValue === 'function' ? (defaultValue as () => unknown)() : defaultValue,
      };
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
    const def = defOf(schema);
    const inner = def['in'] ?? def['schema'];
    if (inner !== null && typeof inner === 'object') {
      return isOptionalField(inner as z.ZodTypeAny);
    }
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
      // Zod 3 stored defaultValue as a thunk; zod 4 stores the value
      // itself. Accept both so the field map keeps its default.
      const defaultValue = defOf(f)['defaultValue'];
      if (defaultValue !== undefined) {
        entry.default =
          typeof defaultValue === 'function'
            ? (defaultValue as () => unknown)()
            : defaultValue;
      }
    }
    out[key] = entry;
  }
  return out;
}
