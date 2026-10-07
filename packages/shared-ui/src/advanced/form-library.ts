// ============================================================================
// @quant/shared-ui - Advanced Form Management Library
// ============================================================================

import {
  FormState,
  FormField,
  FieldValidation,
  ValidationRule,
  FieldArray,
  FormSchema,
  ConditionalConfig,
  CrossFieldRule,
} from './types';

interface FieldConfig {
  name: string;
  initialValue: any;
  rules: ValidationRule[];
  conditional?: ConditionalConfig;
  type?: string;
}

interface FormManagerOptions {
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  validateOnSubmit?: boolean;
  revalidateOnChange?: boolean;
  schema?: FormSchema;
}

type FieldListener = (field: FormField) => void;
type FormListener = (state: FormState) => void;
type SubmitHandler = (values: Record<string, any>) => void | Promise<void>;

export class FormManager {
  private fields: Map<string, FormField> = new Map();
  private fieldConfigs: Map<string, FieldConfig> = new Map();
  private fieldArrays: Map<string, any[]> = new Map();
  private initialValues: Record<string, any> = {};
  private fieldListeners: Map<string, Set<FieldListener>> = new Map();
  private formListeners: Set<FormListener> = new Set();
  private crossFieldRules: CrossFieldRule[] = [];
  private options: FormManagerOptions;
  private submitCount: number = 0;
  private isSubmitting: boolean = false;

  constructor(options: FormManagerOptions = {}) {
    this.options = {
      validateOnChange: true,
      validateOnBlur: true,
      validateOnSubmit: true,
      revalidateOnChange: true,
      ...options,
    };
    if (options.schema) {
      this.initFromSchema(options.schema);
    }
  }

  // Initialize form from schema definition
  private initFromSchema(schema: FormSchema): void {
    for (const fieldSchema of schema.fields) {
      this.registerField(fieldSchema.name, {
        initialValue: fieldSchema.initialValue ?? '',
        rules: fieldSchema.rules || [],
        conditional: fieldSchema.conditional,
        type: fieldSchema.type,
      });
    }
    if (schema.crossFieldValidation) {
      this.crossFieldRules = schema.crossFieldValidation;
    }
  }

  // Register a new field
  registerField(name: string, config: Omit<FieldConfig, 'name'>): void {
    const fieldConfig: FieldConfig = { name, ...config };
    this.fieldConfigs.set(name, fieldConfig);
    this.initialValues[name] = config.initialValue;
    const field: FormField = {
      name,
      value: config.initialValue,
      error: null,
      touched: false,
      dirty: false,
      validating: false,
      disabled: false,
    };
    this.fields.set(name, field);
  }

  // Unregister a field
  unregisterField(name: string): void {
    this.fields.delete(name);
    this.fieldConfigs.delete(name);
    this.fieldListeners.delete(name);
    delete this.initialValues[name];
  }

  // Set field value
  setValue(name: string, value: any): void {
    const field = this.fields.get(name);
    if (!field) return;
    const updatedField: FormField = {
      ...field,
      value,
      dirty: value !== this.initialValues[name],
    };
    this.fields.set(name, updatedField);
    this.evaluateConditionals();
    if (this.options.validateOnChange || (this.options.revalidateOnChange && field.error)) {
      this.validateField(name);
    }
    this.notifyFieldListeners(name);
    this.notifyFormListeners();
  }

  // Get field value
  getValue(name: string): any {
    return this.fields.get(name)?.value;
  }

  // Get all form values
  getValues(): Record<string, any> {
    const values: Record<string, any> = {};
    this.fields.forEach((field, name) => {
      if (!field.disabled) {
        values[name] = field.value;
      }
    });
    return values;
  }

  // Mark field as touched (usually on blur)
  setTouched(name: string, touched: boolean = true): void {
    const field = this.fields.get(name);
    if (!field) return;
    const updatedField: FormField = { ...field, touched };
    this.fields.set(name, updatedField);
    if (touched && this.options.validateOnBlur) {
      this.validateField(name);
    }
    this.notifyFieldListeners(name);
    this.notifyFormListeners();
  }

  // Set field error manually
  setError(name: string, error: string | null): void {
    const field = this.fields.get(name);
    if (!field) return;
    this.fields.set(name, { ...field, error });
    this.notifyFieldListeners(name);
    this.notifyFormListeners();
  }

  // Validate a single field
  async validateField(name: string): Promise<FieldValidation> {
    const field = this.fields.get(name);
    const config = this.fieldConfigs.get(name);
    if (!field || !config) return { valid: true, error: null };

    this.fields.set(name, { ...field, validating: true });

    const result = await this.runValidation(field.value, config.rules, this.getValues());

    const updatedField = this.fields.get(name);
    if (updatedField) {
      this.fields.set(name, { ...updatedField, error: result.error, validating: false });
      this.notifyFieldListeners(name);
    }
    return result;
  }

  // Validate all fields
  async validateAll(): Promise<boolean> {
    let isValid = true;
    const fieldNames = Array.from(this.fields.keys());

    for (const name of fieldNames) {
      const result = await this.validateField(name);
      if (!result.valid) isValid = false;
    }

    // Run cross-field validation
    const values = this.getValues();
    for (const rule of this.crossFieldRules) {
      const errors = rule.validator(values);
      if (errors) {
        isValid = false;
        for (const [fieldName, error] of Object.entries(errors)) {
          this.setError(fieldName, error);
        }
      }
    }

    return isValid;
  }

  // Run validation rules against a value
  private async runValidation(
    value: any,
    rules: ValidationRule[],
    formValues: Record<string, any>,
  ): Promise<FieldValidation> {
    for (const rule of rules) {
      const valid = await this.checkRule(value, rule, formValues);
      if (!valid) {
        return { valid: false, error: rule.message };
      }
    }
    return { valid: true, error: null };
  }

  // Check individual validation rule
  private async checkRule(
    value: any,
    rule: ValidationRule,
    formValues: Record<string, any>,
  ): Promise<boolean> {
    switch (rule.type) {
      case 'required':
        if (typeof value === 'string') return value.trim().length > 0;
        if (Array.isArray(value)) return value.length > 0;
        return value !== null && value !== undefined;

      case 'minLength':
        return typeof value === 'string' && value.length >= (rule.value as number);

      case 'maxLength':
        return typeof value === 'string' && value.length <= (rule.value as number);

      case 'min':
        return typeof value === 'number' && value >= (rule.value as number);

      case 'max':
        return typeof value === 'number' && value <= (rule.value as number);

      case 'pattern':
        if (typeof value !== 'string') return false;
        const regex = rule.value instanceof RegExp ? rule.value : new RegExp(rule.value as string);
        return regex.test(value);

      case 'email':
        if (typeof value !== 'string') return false;
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return emailRegex.test(value);

      case 'custom':
        if (!rule.validator) return true;
        return rule.validator(value, formValues);

      case 'async':
        if (!rule.validator) return true;
        return await rule.validator(value, formValues);

      default:
        return true;
    }
  }

  // Evaluate conditional field visibility/disabled state
  private evaluateConditionals(): void {
    this.fieldConfigs.forEach((config, name) => {
      if (!config.conditional) return;
      const { field: depField, operator, value: targetValue, action } = config.conditional;
      const depValue = this.getValue(depField);
      let conditionMet = false;

      switch (operator) {
        case 'equals':
          conditionMet = depValue === targetValue;
          break;
        case 'notEquals':
          conditionMet = depValue !== targetValue;
          break;
        case 'contains':
          conditionMet = typeof depValue === 'string' && depValue.includes(targetValue);
          break;
        case 'greaterThan':
          conditionMet = depValue > targetValue;
          break;
        case 'lessThan':
          conditionMet = depValue < targetValue;
          break;
      }

      const currentField = this.fields.get(name);
      if (!currentField) return;

      if (action === 'disable') {
        this.fields.set(name, { ...currentField, disabled: conditionMet });
      } else if (action === 'enable') {
        this.fields.set(name, { ...currentField, disabled: !conditionMet });
      }
    });
  }

  // Field Arrays - Dynamic list management
  createFieldArray(name: string, initialItems: any[] = []): FieldArray {
    this.fieldArrays.set(name, [...initialItems]);
    const self = this;

    return {
      get fields() {
        return self.fieldArrays.get(name) || [];
      },
      append(value: any) {
        const items = self.fieldArrays.get(name) || [];
        items.push(value);
        self.fieldArrays.set(name, items);
        self.notifyFormListeners();
      },
      remove(index: number) {
        const items = self.fieldArrays.get(name) || [];
        items.splice(index, 1);
        self.fieldArrays.set(name, items);
        self.notifyFormListeners();
      },
      move(from: number, to: number) {
        const items = self.fieldArrays.get(name) || [];
        if (from < 0 || from >= items.length || to < 0 || to >= items.length) return;
        const [item] = items.splice(from, 1);
        items.splice(to, 0, item);
        self.fieldArrays.set(name, items);
        self.notifyFormListeners();
      },
      insert(index: number, value: any) {
        const items = self.fieldArrays.get(name) || [];
        items.splice(index, 0, value);
        self.fieldArrays.set(name, items);
        self.notifyFormListeners();
      },
      swap(indexA: number, indexB: number) {
        const items = self.fieldArrays.get(name) || [];
        if (indexA < 0 || indexA >= items.length || indexB < 0 || indexB >= items.length) return;
        const temp = items[indexA];
        items[indexA] = items[indexB];
        items[indexB] = temp;
        self.fieldArrays.set(name, items);
        self.notifyFormListeners();
      },
    };
  }

  // Submit the form
  async handleSubmit(handler: SubmitHandler): Promise<boolean> {
    this.submitCount++;
    if (this.options.validateOnSubmit) {
      const isValid = await this.validateAll();
      if (!isValid) return false;
    }
    this.isSubmitting = true;
    this.notifyFormListeners();
    try {
      await handler(this.getValues());
      return true;
    } catch (error) {
      return false;
    } finally {
      this.isSubmitting = false;
      this.notifyFormListeners();
    }
  }

  // Reset form to initial values
  reset(values?: Record<string, any>): void {
    this.fields.forEach((_field, name) => {
      const resetValue = values?.[name] ?? this.initialValues[name];
      this.fields.set(name, {
        name,
        value: resetValue,
        error: null,
        touched: false,
        dirty: false,
        validating: false,
        disabled: false,
      });
    });
    this.fieldArrays.clear();
    this.notifyFormListeners();
  }

  // Check if form has unsaved changes
  isDirty(): boolean {
    for (const [_name, field] of this.fields) {
      if (field.dirty) return true;
    }
    return false;
  }

  // Get form state snapshot
  getFormState(): FormState {
    const errors: Record<string, string> = {};
    const touched: Record<string, boolean> = {};
    const dirty: Record<string, boolean> = {};
    const values: Record<string, any> = {};
    let isValid = true;

    this.fields.forEach((field, name) => {
      values[name] = field.value;
      if (field.error) {
        errors[name] = field.error;
        isValid = false;
      }
      touched[name] = field.touched;
      dirty[name] = field.dirty;
    });

    return {
      values,
      errors,
      touched,
      dirty,
      isSubmitting: this.isSubmitting,
      isValid,
      submitCount: this.submitCount,
    };
  }

  // Get single field state
  getField(name: string): FormField | undefined {
    return this.fields.get(name);
  }

  // Subscribe to field changes
  subscribeToField(name: string, listener: FieldListener): () => void {
    if (!this.fieldListeners.has(name)) {
      this.fieldListeners.set(name, new Set());
    }
    this.fieldListeners.get(name)!.add(listener);
    return () => {
      this.fieldListeners.get(name)?.delete(listener);
    };
  }

  // Subscribe to form state changes
  subscribe(listener: FormListener): () => void {
    this.formListeners.add(listener);
    return () => {
      this.formListeners.delete(listener);
    };
  }

  // Notify field-level listeners
  private notifyFieldListeners(name: string): void {
    const field = this.fields.get(name);
    if (!field) return;
    this.fieldListeners.get(name)?.forEach((listener) => listener(field));
  }

  // Notify form-level listeners
  private notifyFormListeners(): void {
    const state = this.getFormState();
    this.formListeners.forEach((listener) => listener(state));
  }

  // Bulk set values
  setValues(values: Record<string, any>): void {
    for (const [name, value] of Object.entries(values)) {
      const field = this.fields.get(name);
      if (field) {
        this.fields.set(name, {
          ...field,
          value,
          dirty: value !== this.initialValues[name],
        });
      }
    }
    this.evaluateConditionals();
    this.notifyFormListeners();
  }

  // Touch all fields (useful before submit)
  touchAll(): void {
    this.fields.forEach((field, name) => {
      this.fields.set(name, { ...field, touched: true });
    });
    this.notifyFormListeners();
  }

  destroy(): void {
    this.fields.clear();
    this.fieldConfigs.clear();
    this.fieldArrays.clear();
    this.fieldListeners.clear();
    this.formListeners.clear();
    this.crossFieldRules = [];
  }
}

export default FormManager;
