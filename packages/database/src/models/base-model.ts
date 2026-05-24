// ============================================================================
// Database Models - Base Model with CRUD Operations
// ============================================================================

/** Query filter operators */
export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like' | 'ilike';

/** Query filter condition */
export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

/** Query options for finding records */
export interface QueryOptions {
  filters?: FilterCondition[];
  orderBy?: { field: string; direction: 'asc' | 'desc' }[];
  limit?: number;
  offset?: number;
  include?: string[];
  select?: string[];
}

/** Model event types */
export type ModelEvent = 'beforeCreate' | 'afterCreate' | 'beforeUpdate' | 'afterUpdate' | 'beforeDelete' | 'afterDelete';

/** Model hook function */
export type ModelHook<T> = (record: T) => Promise<T> | T;

/**
 * Base model class providing CRUD operations and query building.
 * This is a data access layer abstraction that works with any SQL/NoSQL backend.
 */
export abstract class BaseModel<T extends { id: string; createdAt: string; updatedAt: string }> {
  protected abstract tableName: string;
  protected abstract primaryKey: string;
  private hooks: Map<ModelEvent, ModelHook<T>[]> = new Map();
  private _store: Map<string, T> = new Map();

  constructor() {
    this.hooks = new Map();
    this._store = new Map();
  }

  /**
   * Register a lifecycle hook
   */
  protected registerHook(event: ModelEvent, hook: ModelHook<T>): void {
    const existing = this.hooks.get(event) || [];
    existing.push(hook);
    this.hooks.set(event, existing);
  }

  /**
   * Execute registered hooks for an event
   */
  private async executeHooks(event: ModelEvent, record: T): Promise<T> {
    const eventHooks = this.hooks.get(event) || [];
    let result = record;
    for (const hook of eventHooks) {
      result = await hook(result);
    }
    return result;
  }

  /**
   * Create a new record
   */
  async create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const now = new Date().toISOString();
    const id = this.generateId();
    const record = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    } as unknown as T;

    const prepared = await this.executeHooks('beforeCreate', record);
    this._store.set(id, prepared);
    const result = await this.executeHooks('afterCreate', prepared);
    return result;
  }

  /**
   * Find a record by ID
   */
  async findById(id: string): Promise<T | null> {
    return this._store.get(id) || null;
  }

  /**
   * Find multiple records matching options
   */
  async findMany(options: QueryOptions = {}): Promise<T[]> {
    let results = Array.from(this._store.values());

    // Apply filters
    if (options.filters) {
      results = results.filter((record) => {
        return options.filters!.every((filter) => {
          const value = (record as Record<string, unknown>)[filter.field];
          switch (filter.operator) {
            case 'eq': return value === filter.value;
            case 'neq': return value !== filter.value;
            case 'gt': return (value as number) > (filter.value as number);
            case 'gte': return (value as number) >= (filter.value as number);
            case 'lt': return (value as number) < (filter.value as number);
            case 'lte': return (value as number) <= (filter.value as number);
            case 'in': return Array.isArray(filter.value) && filter.value.includes(value);
            case 'like': return typeof value === 'string' && value.includes(filter.value as string);
            case 'ilike': return typeof value === 'string' && value.toLowerCase().includes((filter.value as string).toLowerCase());
            default: return true;
          }
        });
      });
    }

    // Apply ordering
    if (options.orderBy && options.orderBy.length > 0) {
      results.sort((a, b) => {
        for (const order of options.orderBy!) {
          const aVal = (a as Record<string, unknown>)[order.field];
          const bVal = (b as Record<string, unknown>)[order.field];
          if (aVal === bVal) continue;
          const direction = order.direction === 'asc' ? 1 : -1;
          if (aVal === null || aVal === undefined) return direction;
          if (bVal === null || bVal === undefined) return -direction;
          return aVal < bVal ? -direction : direction;
        }
        return 0;
      });
    }

    // Apply pagination
    if (options.offset !== undefined) {
      results = results.slice(options.offset);
    }
    if (options.limit !== undefined) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Find one record matching options
   */
  async findOne(options: QueryOptions): Promise<T | null> {
    const results = await this.findMany({ ...options, limit: 1 });
    return results[0] || null;
  }

  /**
   * Update a record by ID
   */
  async update(id: string, data: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<T | null> {
    const existing = this._store.get(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...data,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    } as T;

    const prepared = await this.executeHooks('beforeUpdate', updated);
    this._store.set(id, prepared);
    const result = await this.executeHooks('afterUpdate', prepared);
    return result;
  }

  /**
   * Delete a record by ID (soft delete by default)
   */
  async delete(id: string, soft: boolean = true): Promise<boolean> {
    const existing = this._store.get(id);
    if (!existing) return false;

    await this.executeHooks('beforeDelete', existing);

    if (soft) {
      const updated = {
        ...existing,
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as T;
      this._store.set(id, updated);
    } else {
      this._store.delete(id);
    }

    await this.executeHooks('afterDelete', existing);
    return true;
  }

  /**
   * Count records matching filters
   */
  async count(filters?: FilterCondition[]): Promise<number> {
    if (!filters || filters.length === 0) {
      return this._store.size;
    }
    const results = await this.findMany({ filters });
    return results.length;
  }

  /**
   * Check if a record exists
   */
  async exists(id: string): Promise<boolean> {
    return this._store.has(id);
  }

  /**
   * Upsert - create or update
   */
  async upsert(id: string, data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const existing = this._store.get(id);
    if (existing) {
      const result = await this.update(id, data as Partial<Omit<T, 'id' | 'createdAt'>>);
      return result!;
    }
    return this.create(data);
  }

  /**
   * Bulk create records
   */
  async createMany(records: Omit<T, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<T[]> {
    const results: T[] = [];
    for (const record of records) {
      results.push(await this.create(record));
    }
    return results;
  }

  /**
   * Bulk delete records
   */
  async deleteMany(ids: string[], soft: boolean = true): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
      const success = await this.delete(id, soft);
      if (success) deleted++;
    }
    return deleted;
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${this.tableName.slice(0, 3)}_${timestamp}_${random}`;
  }

  /**
   * Get the SQL representation for this model's table
   */
  abstract getTableDefinition(): object;
}
