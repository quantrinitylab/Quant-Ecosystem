// ============================================================================
// Security Package - Input Validator
// ============================================================================

import type { ValidationSchema, ValidationRule, ValidationResult, ValidationError } from '../types';

/**
 * InputValidator - Schema-based input validation framework with type checking,
 * nested object validation, array validation, custom rules, and sanitization.
 */
export class InputValidator {
  private schemas: Map<string, ValidationSchema>;
  private customRules: Map<string, (value: unknown, params?: unknown) => boolean>;
  private validationHistory: { schema: string; valid: boolean; timestamp: number }[];

  constructor() {
    this.schemas = new Map();
    this.customRules = new Map();
    this.validationHistory = [];
    this.registerDefaultRules();
  }

  /** Register a validation schema */
  registerSchema(name: string, schema: ValidationSchema): void {
    this.schemas.set(name, schema);
  }

  /** Register a custom validation rule */
  registerRule(name: string, validator: (value: unknown, params?: unknown) => boolean): void {
    this.customRules.set(name, validator);
  }

  /** Validate data against a named schema */
  async validate(schemaName: string, data: Record<string, unknown>): Promise<ValidationResult> {
    const schema = this.schemas.get(schemaName);
    if (!schema) {
      return {
        valid: false,
        errors: [
          {
            field: '_schema',
            rule: 'exists',
            message: `Schema '${schemaName}' not found`,
            value: null,
          },
        ],
        sanitized: {},
        fieldCount: 0,
      };
    }
    return this.validateAgainstSchema(schema, data);
  }

  /** Validate data against a schema object directly */
  async validateAgainstSchema(
    schema: ValidationSchema,
    data: Record<string, unknown>,
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const sanitized: Record<string, unknown> = {};
    let fieldCount = 0;

    // Check for unknown fields in strict mode
    if (schema.strict && !schema.allowUnknown) {
      for (const key of Object.keys(data)) {
        if (!(key in schema.fields)) {
          errors.push({
            field: key,
            rule: 'unknown_field',
            message: `Unknown field '${key}' is not allowed`,
            value: data[key],
          });
          if (schema.abortEarly) {
            return { valid: false, errors, sanitized, fieldCount };
          }
        }
      }
    }

    // Validate each defined field
    for (const [fieldName, rule] of Object.entries(schema.fields)) {
      fieldCount++;
      const value = data[fieldName];
      const fieldErrors = this.validateField(fieldName, value, rule);

      if (fieldErrors.length > 0) {
        errors.push(...fieldErrors);
        if (schema.abortEarly) {
          return { valid: false, errors, sanitized, fieldCount };
        }
      } else {
        sanitized[fieldName] = this.sanitizeValue(value, rule);
      }
    }

    this.validationHistory.push({
      schema: Object.keys(schema.fields).join(','),
      valid: errors.length === 0,
      timestamp: Date.now(),
    });

    return { valid: errors.length === 0, errors, sanitized, fieldCount };
  }

  /** Validate a single field against its rule */
  private validateField(
    fieldName: string,
    value: unknown,
    rule: ValidationRule,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Required check
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push({
        field: fieldName,
        rule: 'required',
        message: rule.message || `${fieldName} is required`,
        value,
      });
      return errors;
    }

    // Skip further validation if value is not provided and not required
    if (value === undefined || value === null) {
      return errors;
    }

    // Type checking
    const typeError = this.checkType(fieldName, value, rule);
    if (typeError) {
      errors.push(typeError);
      return errors;
    }

    // Min/max validation
    if (rule.min !== undefined) {
      const minError = this.checkMin(fieldName, value, rule);
      if (minError) errors.push(minError);
    }

    if (rule.max !== undefined) {
      const maxError = this.checkMax(fieldName, value, rule);
      if (maxError) errors.push(maxError);
    }

    // Pattern validation
    if (rule.pattern) {
      const patternError = this.checkPattern(fieldName, value, rule);
      if (patternError) errors.push(patternError);
    }

    // Enum validation
    if (rule.enum && rule.enum.length > 0) {
      if (!rule.enum.includes(value)) {
        errors.push({
          field: fieldName,
          rule: 'enum',
          message: rule.message || `${fieldName} must be one of: ${rule.enum.join(', ')}`,
          value,
        });
      }
    }

    // Nested object validation
    if (rule.type === 'object' && rule.properties && typeof value === 'object') {
      const nestedErrors = this.validateNestedObject(
        fieldName,
        value as Record<string, unknown>,
        rule.properties,
      );
      errors.push(...nestedErrors);
    }

    // Array validation
    if (rule.type === 'array' && rule.items && Array.isArray(value)) {
      const arrayErrors = this.validateArray(fieldName, value, rule.items);
      errors.push(...arrayErrors);
    }

    // Custom rule validation
    if (rule.custom) {
      const customValidator = this.customRules.get(rule.custom);
      if (customValidator && !customValidator(value)) {
        errors.push({
          field: fieldName,
          rule: `custom:${rule.custom}`,
          message: rule.message || `${fieldName} failed custom validation '${rule.custom}'`,
          value,
        });
      }
    }

    return errors;
  }

  /** Check type of value against rule */
  private checkType(
    fieldName: string,
    value: unknown,
    rule: ValidationRule,
  ): ValidationError | null {
    switch (rule.type) {
      case 'string':
        if (typeof value !== 'string') {
          return {
            field: fieldName,
            rule: 'type',
            message: `${fieldName} must be a string`,
            value,
          };
        }
        break;
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return {
            field: fieldName,
            rule: 'type',
            message: `${fieldName} must be a number`,
            value,
          };
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          return {
            field: fieldName,
            rule: 'type',
            message: `${fieldName} must be a boolean`,
            value,
          };
        }
        break;
      case 'object':
        if (typeof value !== 'object' || Array.isArray(value)) {
          return {
            field: fieldName,
            rule: 'type',
            message: `${fieldName} must be an object`,
            value,
          };
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          return {
            field: fieldName,
            rule: 'type',
            message: `${fieldName} must be an array`,
            value,
          };
        }
        break;
      case 'email':
        if (typeof value !== 'string' || !this.isValidEmail(value)) {
          return {
            field: fieldName,
            rule: 'type',
            message: `${fieldName} must be a valid email`,
            value,
          };
        }
        break;
      case 'url':
        if (typeof value !== 'string' || !this.isValidUrl(value)) {
          return {
            field: fieldName,
            rule: 'type',
            message: `${fieldName} must be a valid URL`,
            value,
          };
        }
        break;
      case 'date':
        if (typeof value === 'string' && isNaN(Date.parse(value))) {
          return {
            field: fieldName,
            rule: 'type',
            message: `${fieldName} must be a valid date`,
            value,
          };
        }
        break;
      case 'uuid':
        if (typeof value !== 'string' || !this.isValidUUID(value)) {
          return {
            field: fieldName,
            rule: 'type',
            message: `${fieldName} must be a valid UUID`,
            value,
          };
        }
        break;
    }
    return null;
  }

  /** Check minimum constraint */
  private checkMin(
    fieldName: string,
    value: unknown,
    rule: ValidationRule,
  ): ValidationError | null {
    const min = rule.min!;
    if (typeof value === 'string' && value.length < min) {
      return {
        field: fieldName,
        rule: 'min',
        message: `${fieldName} must be at least ${min} characters`,
        value,
      };
    }
    if (typeof value === 'number' && value < min) {
      return {
        field: fieldName,
        rule: 'min',
        message: `${fieldName} must be at least ${min}`,
        value,
      };
    }
    if (Array.isArray(value) && value.length < min) {
      return {
        field: fieldName,
        rule: 'min',
        message: `${fieldName} must have at least ${min} items`,
        value,
      };
    }
    return null;
  }

  /** Check maximum constraint */
  private checkMax(
    fieldName: string,
    value: unknown,
    rule: ValidationRule,
  ): ValidationError | null {
    const max = rule.max!;
    if (typeof value === 'string' && value.length > max) {
      return {
        field: fieldName,
        rule: 'max',
        message: `${fieldName} must be at most ${max} characters`,
        value,
      };
    }
    if (typeof value === 'number' && value > max) {
      return {
        field: fieldName,
        rule: 'max',
        message: `${fieldName} must be at most ${max}`,
        value,
      };
    }
    if (Array.isArray(value) && value.length > max) {
      return {
        field: fieldName,
        rule: 'max',
        message: `${fieldName} must have at most ${max} items`,
        value,
      };
    }
    return null;
  }

  /** Check pattern constraint */
  private checkPattern(
    fieldName: string,
    value: unknown,
    rule: ValidationRule,
  ): ValidationError | null {
    if (typeof value !== 'string') return null;
    const regex = new RegExp(rule.pattern!);
    if (!regex.test(value)) {
      return {
        field: fieldName,
        rule: 'pattern',
        message: rule.message || `${fieldName} does not match required pattern`,
        value,
      };
    }
    return null;
  }

  /** Validate nested object fields */
  private validateNestedObject(
    parentField: string,
    obj: Record<string, unknown>,
    properties: Record<string, ValidationRule>,
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    for (const [key, rule] of Object.entries(properties)) {
      const fullPath = `${parentField}.${key}`;
      const fieldErrors = this.validateField(fullPath, obj[key], rule);
      errors.push(...fieldErrors);
    }
    return errors;
  }

  /** Validate array items */
  private validateArray(
    fieldName: string,
    arr: unknown[],
    itemRule: ValidationRule,
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    for (let i = 0; i < arr.length; i++) {
      const itemPath = `${fieldName}[${i}]`;
      const itemErrors = this.validateField(itemPath, arr[i], itemRule);
      errors.push(...itemErrors);
    }
    return errors;
  }

  /** Sanitize a value based on its rule type */
  private sanitizeValue(value: unknown, rule: ValidationRule): unknown {
    if (value === null || value === undefined) return value;
    if (rule.type === 'string' && typeof value === 'string') {
      return value.trim();
    }
    return value;
  }

  /** Email validation */
  private isValidEmail(value: string): boolean {
    const emailRegex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(value) && value.length <= 254;
  }

  /** URL validation */
  private isValidUrl(value: string): boolean {
    try {
      const urlRegex = /^https?:\/\/[^\s/$.?#].[^\s]*$/;
      return urlRegex.test(value);
    } catch {
      return false;
    }
  }

  /** UUID validation */
  private isValidUUID(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  /** Register default custom validation rules */
  private registerDefaultRules(): void {
    this.customRules.set('alphanumeric', (v) => typeof v === 'string' && /^[a-zA-Z0-9]+$/.test(v));
    this.customRules.set(
      'slug',
      (v) => typeof v === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v),
    );
    this.customRules.set('phone', (v) => typeof v === 'string' && /^\+?[1-9]\d{1,14}$/.test(v));
    this.customRules.set('ipv4', (v) => typeof v === 'string' && /^(\d{1,3}\.){3}\d{1,3}$/.test(v));
    this.customRules.set('hex', (v) => typeof v === 'string' && /^[0-9a-fA-F]+$/.test(v));
    this.customRules.set('base64', (v) => typeof v === 'string' && /^[A-Za-z0-9+/]+=*$/.test(v));
    this.customRules.set('creditCard', (v) => typeof v === 'string' && this.luhnCheck(v));
    this.customRules.set('positive', (v) => typeof v === 'number' && v > 0);
    this.customRules.set('integer', (v) => typeof v === 'number' && Number.isInteger(v));
  }

  /** Luhn algorithm for credit card validation */
  private luhnCheck(num: string): boolean {
    const digits = num.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;

    let sum = 0;
    let alternate = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i]!, 10);
      if (alternate) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      alternate = !alternate;
    }
    return sum % 10 === 0;
  }

  /** Get validation history */
  getHistory(): { schema: string; valid: boolean; timestamp: number }[] {
    return [...this.validationHistory];
  }

  /** Get registered schema names */
  getSchemaNames(): string[] {
    return Array.from(this.schemas.keys());
  }

  /** Get registered custom rule names */
  getRuleNames(): string[] {
    return Array.from(this.customRules.keys());
  }
}
