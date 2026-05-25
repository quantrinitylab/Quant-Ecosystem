// ============================================================================
// Data Pipeline Package - Data Validator
// ============================================================================

import type {
  ValidationSchema,
  ValidationRule,
  ValidationRuleType,
  FieldValidator,
  FieldType,
  ValidationResult,
  ValidationErrorDetail,
} from '../types';

/** Schema registry entry */
interface SchemaEntry {
  schema: ValidationSchema;
  versions: Map<number, ValidationSchema>;
  createdAt: number;
  updatedAt: number;
}

/**
 * DataValidator - Schema-based data validation engine
 * Supports field-level validation, type coercion, schema versioning,
 * and detailed error reporting with field paths.
 */
export class DataValidator {
  private schemas: Map<string, SchemaEntry> = new Map();

  /**
   * Register a validation schema
   */
  public registerSchema(schema: ValidationSchema): void {
    const existing = this.schemas.get(schema.name);

    if (existing) {
      existing.versions.set(schema.version, schema);
      existing.schema = schema;
      existing.updatedAt = Date.now();
    } else {
      const versions = new Map<number, ValidationSchema>();
      versions.set(schema.version, schema);
      this.schemas.set(schema.name, {
        schema,
        versions,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  /**
   * Get a registered schema by name and optional version
   */
  public getSchema(name: string, version?: number): ValidationSchema | null {
    const entry = this.schemas.get(name);
    if (!entry) return null;

    if (version !== undefined) {
      return entry.versions.get(version) ?? null;
    }
    return entry.schema;
  }

  /**
   * Validate a single record against a schema
   */
  public validate(schemaName: string, data: unknown, version?: number): ValidationResult {
    const schema = this.getSchema(schemaName, version);
    if (!schema) {
      return {
        valid: false,
        errors: [{
          path: '',
          rule: 'required',
          message: `Schema '${schemaName}' not found`,
          receivedValue: undefined,
        }],
        warnings: [],
      };
    }

    const errors: ValidationErrorDetail[] = [];
    const warnings: string[] = [];
    let coercedData: Record<string, unknown> = {};

    if (typeof data !== 'object' || data === null) {
      errors.push({
        path: '',
        rule: 'type',
        message: 'Data must be an object',
        receivedValue: data,
        expectedValue: 'object',
      });
      return { valid: false, errors, warnings };
    }

    const record = data as Record<string, unknown>;
    coercedData = { ...record };

    // Validate each field
    for (const field of schema.fields) {
      const value = this.getNestedValue(record, field.path);
      const fieldErrors = this.validateField(field, value);
      errors.push(...fieldErrors);

      // Apply coercion if enabled
      if (field.coerce && value !== undefined) {
        const coerced = this.coerceValue(value, field.type);
        if (coerced.success) {
          this.setNestedValue(coercedData, field.path, coerced.value);
        }
      }

      // Apply default if value is missing
      if (value === undefined && field.defaultValue !== undefined) {
        this.setNestedValue(coercedData, field.path, field.defaultValue);
      }
    }

    // Check for additional fields
    if (schema.strict && !schema.allowAdditionalFields) {
      const definedPaths = new Set(schema.fields.map(f => f.path.split('.')[0]));
      for (const key of Object.keys(record)) {
        if (!definedPaths.has(key)) {
          warnings.push(`Additional field '${key}' found but not defined in schema`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      coercedData,
      warnings,
    };
  }

  /**
   * Validate a batch of records
   */
  public validateBatch(
    schemaName: string,
    records: unknown[],
    version?: number
  ): { results: ValidationResult[]; summary: BatchValidationSummary } {
    const results: ValidationResult[] = [];
    let validCount = 0;
    let invalidCount = 0;
    const errorsByRule = new Map<string, number>();

    for (const record of records) {
      const result = this.validate(schemaName, record, version);
      results.push(result);

      if (result.valid) {
        validCount++;
      } else {
        invalidCount++;
        for (const error of result.errors) {
          const count = errorsByRule.get(error.rule) ?? 0;
          errorsByRule.set(error.rule, count + 1);
        }
      }
    }

    return {
      results,
      summary: {
        total: records.length,
        valid: validCount,
        invalid: invalidCount,
        errorsByRule: Object.fromEntries(errorsByRule),
      },
    };
  }

  /**
   * Coerce a value to a target type
   */
  public coerce(value: unknown, targetType: FieldType): { success: boolean; value: unknown } {
    return this.coerceValue(value, targetType);
  }

  /**
   * Validate a single field against its rules
   */
  private validateField(field: FieldValidator, value: unknown): ValidationErrorDetail[] {
    const errors: ValidationErrorDetail[] = [];

    for (const rule of field.rules) {
      const error = this.applyRule(field.path, rule, value, field.type);
      if (error) {
        errors.push(error);
      }
    }

    return errors;
  }

  /**
   * Apply a single validation rule
   */
  private applyRule(
    path: string,
    rule: ValidationRule,
    value: unknown,
    fieldType: FieldType
  ): ValidationErrorDetail | null {
    switch (rule.type) {
      case 'required':
        if (value === undefined || value === null || value === '') {
          return {
            path,
            rule: 'required',
            message: rule.message ?? `Field '${path}' is required`,
            receivedValue: value,
          };
        }
        break;

      case 'type':
        if (value !== undefined && value !== null) {
          if (!this.checkType(value, fieldType)) {
            return {
              path,
              rule: 'type',
              message: rule.message ?? `Field '${path}' must be of type '${fieldType}'`,
              receivedValue: value,
              expectedValue: fieldType,
            };
          }
        }
        break;

      case 'min':
        if (value !== undefined && value !== null) {
          const numValue = Number(value);
          const minValue = Number(rule.value);
          if (!isNaN(numValue) && numValue < minValue) {
            return {
              path,
              rule: 'min',
              message: rule.message ?? `Field '${path}' must be >= ${minValue}`,
              receivedValue: value,
              expectedValue: rule.value,
            };
          }
        }
        break;

      case 'max':
        if (value !== undefined && value !== null) {
          const numValue = Number(value);
          const maxValue = Number(rule.value);
          if (!isNaN(numValue) && numValue > maxValue) {
            return {
              path,
              rule: 'max',
              message: rule.message ?? `Field '${path}' must be <= ${maxValue}`,
              receivedValue: value,
              expectedValue: rule.value,
            };
          }
        }
        break;

      case 'minLength':
        if (value !== undefined && value !== null) {
          const strValue = String(value);
          const minLen = Number(rule.value);
          if (strValue.length < minLen) {
            return {
              path,
              rule: 'minLength',
              message: rule.message ?? `Field '${path}' must have at least ${minLen} characters`,
              receivedValue: value,
              expectedValue: rule.value,
            };
          }
        }
        break;

      case 'maxLength':
        if (value !== undefined && value !== null) {
          const strValue = String(value);
          const maxLen = Number(rule.value);
          if (strValue.length > maxLen) {
            return {
              path,
              rule: 'maxLength',
              message: rule.message ?? `Field '${path}' must have at most ${maxLen} characters`,
              receivedValue: value,
              expectedValue: rule.value,
            };
          }
        }
        break;

      case 'regex':
        if (value !== undefined && value !== null) {
          const pattern = new RegExp(String(rule.value));
          if (!pattern.test(String(value))) {
            return {
              path,
              rule: 'regex',
              message: rule.message ?? `Field '${path}' does not match pattern '${rule.value}'`,
              receivedValue: value,
              expectedValue: rule.value,
            };
          }
        }
        break;

      case 'enum':
        if (value !== undefined && value !== null) {
          const allowedValues = rule.value as unknown[];
          if (Array.isArray(allowedValues) && !allowedValues.includes(value)) {
            return {
              path,
              rule: 'enum',
              message: rule.message ?? `Field '${path}' must be one of: ${allowedValues.join(', ')}`,
              receivedValue: value,
              expectedValue: rule.value,
            };
          }
        }
        break;

      case 'email':
        if (value !== undefined && value !== null) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(String(value))) {
            return {
              path,
              rule: 'email',
              message: rule.message ?? `Field '${path}' must be a valid email`,
              receivedValue: value,
            };
          }
        }
        break;

      case 'url':
        if (value !== undefined && value !== null) {
          const urlRegex = /^https?:\/\/.+/;
          if (!urlRegex.test(String(value))) {
            return {
              path,
              rule: 'url',
              message: rule.message ?? `Field '${path}' must be a valid URL`,
              receivedValue: value,
            };
          }
        }
        break;

      case 'uuid':
        if (value !== undefined && value !== null) {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(String(value))) {
            return {
              path,
              rule: 'uuid',
              message: rule.message ?? `Field '${path}' must be a valid UUID`,
              receivedValue: value,
            };
          }
        }
        break;

      case 'custom':
        // Custom validators would be function references in a real implementation
        break;
    }

    return null;
  }

  /**
   * Check if a value matches the expected type
   */
  private checkType(value: unknown, expectedType: FieldType): boolean {
    switch (expectedType) {
      case 'string': return typeof value === 'string';
      case 'number': return typeof value === 'number' && !isNaN(value);
      case 'boolean': return typeof value === 'boolean';
      case 'date': return value instanceof Date || !isNaN(Date.parse(String(value)));
      case 'array': return Array.isArray(value);
      case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'null': return value === null;
      case 'any': return true;
      default: return true;
    }
  }

  /**
   * Coerce a value to the target type
   */
  private coerceValue(value: unknown, targetType: FieldType): { success: boolean; value: unknown } {
    try {
      switch (targetType) {
        case 'string':
          return { success: true, value: String(value) };

        case 'number': {
          const num = Number(value);
          return { success: !isNaN(num), value: isNaN(num) ? value : num };
        }

        case 'boolean': {
          if (typeof value === 'string') {
            const lower = value.toLowerCase();
            if (lower === 'true' || lower === '1' || lower === 'yes') {
              return { success: true, value: true };
            }
            if (lower === 'false' || lower === '0' || lower === 'no') {
              return { success: true, value: false };
            }
          }
          return { success: true, value: Boolean(value) };
        }

        case 'date': {
          const date = new Date(String(value));
          return { success: !isNaN(date.getTime()), value: date };
        }

        case 'array':
          if (Array.isArray(value)) return { success: true, value };
          return { success: true, value: [value] };

        default:
          return { success: true, value };
      }
    } catch {
      return { success: false, value };
    }
  }

  /**
   * Get a nested value from an object using dot notation
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Set a nested value on an object using dot notation
   */
  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] === undefined || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
  }
}

/** Summary of batch validation results */
interface BatchValidationSummary {
  total: number;
  valid: number;
  invalid: number;
  errorsByRule: Record<string, number>;
}
