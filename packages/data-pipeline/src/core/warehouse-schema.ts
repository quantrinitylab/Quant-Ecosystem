// ============================================================================
// Data Pipeline Package - Warehouse Schema
// ============================================================================

import type {
  FactTable,
  DimensionTable,
  DimensionColumn,
  Hierarchy,
  StarSchema,
  PartitionStrategy,
  PartitionType,
  SlowlyChangingDimension,
  SCDType,
  MeasureColumn,
  DimensionKey,
  IndexDefinition,
  AggregateFunctionType,
} from '../types';

/** Schema validation error */
interface SchemaValidationError {
  table: string;
  field: string;
  message: string;
}

/** Schema migration definition */
interface SchemaMigration {
  id: string;
  schemaName: string;
  fromVersion: number;
  toVersion: number;
  operations: MigrationOperation[];
  createdAt: number;
}

/** Individual migration operation */
interface MigrationOperation {
  type: 'add_column' | 'remove_column' | 'rename_column' | 'modify_type' | 'add_index' | 'add_dimension';
  table: string;
  details: Record<string, unknown>;
}

/**
 * WarehouseSchema - Data warehouse schema management
 * Supports star schema modeling, fact/dimension tables,
 * slowly changing dimensions, and partition strategies.
 */
export class WarehouseSchema {
  private schemas: Map<string, StarSchema> = new Map();
  private factTables: Map<string, FactTable> = new Map();
  private dimensionTables: Map<string, DimensionTable> = new Map();
  private scdConfigs: Map<string, SlowlyChangingDimension> = new Map();
  private migrations: SchemaMigration[] = [];

  /**
   * Define a new fact table
   */
  public defineFactTable(
    name: string,
    grain: string[],
    measures: MeasureColumn[],
    dimensionKeys: DimensionKey[],
    partitionStrategy?: PartitionStrategy
  ): FactTable {
    const factTable: FactTable = {
      name,
      grain,
      measures,
      dimensionKeys,
      partitionStrategy: partitionStrategy ?? {
        type: 'date',
        column: 'created_at',
        granularity: 'monthly',
      },
      indexes: this.generateDefaultIndexes(name, dimensionKeys, grain),
    };

    // Validate dimension keys reference existing dimension tables
    for (const key of dimensionKeys) {
      if (!this.dimensionTables.has(key.dimensionTable)) {
        // Auto-create placeholder dimension
        this.dimensionTables.set(key.dimensionTable, {
          name: key.dimensionTable,
          columns: [{ name: key.dimensionColumn, type: 'integer', nullable: false }],
          hierarchies: [],
          scdType: 'type1',
          naturalKey: [key.dimensionColumn],
        });
      }
    }

    this.factTables.set(name, factTable);
    return factTable;
  }

  /**
   * Define a new dimension table
   */
  public defineDimensionTable(
    name: string,
    columns: DimensionColumn[],
    hierarchies: Hierarchy[] = [],
    scdType: SCDType = 'type1',
    naturalKey?: string[]
  ): DimensionTable {
    const dimensionTable: DimensionTable = {
      name,
      columns,
      hierarchies,
      scdType,
      naturalKey: naturalKey ?? [columns[0]?.name ?? 'id'],
    };

    this.dimensionTables.set(name, dimensionTable);

    // Configure SCD if type 2 or 3
    if (scdType !== 'type1') {
      this.configureSCD(name, scdType, columns);
    }

    return dimensionTable;
  }

  /**
   * Create a star schema combining fact and dimension tables
   */
  public createStarSchema(
    name: string,
    factTableName: string,
    dimensionTableNames: string[],
    description: string = ''
  ): StarSchema {
    const factTable = this.factTables.get(factTableName);
    if (!factTable) {
      throw new Error(`Fact table '${factTableName}' not found`);
    }

    const dimensions: DimensionTable[] = [];
    for (const dimName of dimensionTableNames) {
      const dim = this.dimensionTables.get(dimName);
      if (!dim) {
        throw new Error(`Dimension table '${dimName}' not found`);
      }
      dimensions.push(dim);
    }

    const schema: StarSchema = {
      name,
      factTable,
      dimensions,
      description,
      version: 1,
    };

    // Increment version if schema already exists
    const existing = this.schemas.get(name);
    if (existing) {
      schema.version = existing.version + 1;
    }

    this.schemas.set(name, schema);
    return schema;
  }

  /**
   * Add a slowly changing dimension configuration
   */
  public addSCD(
    dimensionTable: string,
    type: SCDType,
    trackedColumns: string[],
    effectiveDateColumn: string = 'effective_date',
    options?: { expirationDateColumn?: string; currentFlagColumn?: string; versionColumn?: string }
  ): SlowlyChangingDimension {
    const scd: SlowlyChangingDimension = {
      dimensionTable,
      type,
      trackedColumns,
      effectiveDateColumn,
      expirationDateColumn: options?.expirationDateColumn,
      currentFlagColumn: options?.currentFlagColumn,
      versionColumn: options?.versionColumn,
    };

    this.scdConfigs.set(dimensionTable, scd);

    // Add required columns to dimension table
    const dimTable = this.dimensionTables.get(dimensionTable);
    if (dimTable) {
      this.addSCDColumns(dimTable, scd);
    }

    return scd;
  }

  /**
   * Get a star schema by name
   */
  public getStarSchema(name: string): StarSchema | null {
    return this.schemas.get(name) ?? null;
  }

  /**
   * Get a fact table by name
   */
  public getFactTable(name: string): FactTable | null {
    return this.factTables.get(name) ?? null;
  }

  /**
   * Get a dimension table by name
   */
  public getDimensionTable(name: string): DimensionTable | null {
    return this.dimensionTables.get(name) ?? null;
  }

  /**
   * Validate schema integrity
   */
  public validateSchema(schemaName: string): SchemaValidationError[] {
    const errors: SchemaValidationError[] = [];
    const schema = this.schemas.get(schemaName);

    if (!schema) {
      errors.push({ table: '', field: '', message: `Schema '${schemaName}' not found` });
      return errors;
    }

    // Validate fact table references
    for (const dimKey of schema.factTable.dimensionKeys) {
      const dim = schema.dimensions.find(d => d.name === dimKey.dimensionTable);
      if (!dim) {
        errors.push({
          table: schema.factTable.name,
          field: dimKey.name,
          message: `Dimension key '${dimKey.name}' references unknown dimension '${dimKey.dimensionTable}'`,
        });
      } else {
        const col = dim.columns.find(c => c.name === dimKey.dimensionColumn);
        if (!col) {
          errors.push({
            table: dimKey.dimensionTable,
            field: dimKey.dimensionColumn,
            message: `Column '${dimKey.dimensionColumn}' not found in dimension '${dimKey.dimensionTable}'`,
          });
        }
      }
    }

    // Validate hierarchies
    for (const dim of schema.dimensions) {
      for (const hierarchy of dim.hierarchies) {
        for (const level of hierarchy.levels) {
          const col = dim.columns.find(c => c.name === level);
          if (!col) {
            errors.push({
              table: dim.name,
              field: level,
              message: `Hierarchy level '${level}' not found in dimension '${dim.name}'`,
            });
          }
        }
      }
    }

    // Validate grain columns exist
    for (const grainCol of schema.factTable.grain) {
      const hasMeasure = schema.factTable.measures.some(m => m.name === grainCol);
      const hasDimKey = schema.factTable.dimensionKeys.some(k => k.name === grainCol);
      if (!hasMeasure && !hasDimKey) {
        errors.push({
          table: schema.factTable.name,
          field: grainCol,
          message: `Grain column '${grainCol}' not found as measure or dimension key`,
        });
      }
    }

    return errors;
  }

  /**
   * Generate DDL-like schema description
   */
  public generateSchemaSQL(schemaName: string): string {
    const schema = this.schemas.get(schemaName);
    if (!schema) return '';

    const lines: string[] = [];
    lines.push(`-- Star Schema: ${schema.name} (v${schema.version})`);
    lines.push(`-- ${schema.description}`);
    lines.push('');

    // Dimension tables
    for (const dim of schema.dimensions) {
      lines.push(`CREATE TABLE ${dim.name} (`);
      for (const col of dim.columns) {
        lines.push(`  ${col.name} ${col.type}${col.nullable ? '' : ' NOT NULL'},`);
      }
      lines.push(`  PRIMARY KEY (${dim.naturalKey.join(', ')})`);
      lines.push(');');
      lines.push('');
    }

    // Fact table
    lines.push(`CREATE TABLE ${schema.factTable.name} (`);
    for (const key of schema.factTable.dimensionKeys) {
      lines.push(`  ${key.name} INTEGER NOT NULL REFERENCES ${key.dimensionTable}(${key.dimensionColumn}),`);
    }
    for (const measure of schema.factTable.measures) {
      lines.push(`  ${measure.name} ${measure.type}${measure.nullable ? '' : ' NOT NULL'},`);
    }
    lines.push(`  PRIMARY KEY (${schema.factTable.grain.join(', ')})`);
    lines.push(`)${this.generatePartitionClause(schema.factTable.partitionStrategy)};`);

    return lines.join('\n');
  }

  /**
   * Generate default indexes for a fact table
   */
  private generateDefaultIndexes(
    tableName: string,
    dimensionKeys: DimensionKey[],
    grain: string[]
  ): IndexDefinition[] {
    const indexes: IndexDefinition[] = [];

    // Index on each dimension key
    for (const key of dimensionKeys) {
      indexes.push({
        name: `idx_${tableName}_${key.name}`,
        columns: [key.name],
        type: 'btree',
        unique: false,
      });
    }

    // Composite index on grain
    if (grain.length > 1) {
      indexes.push({
        name: `idx_${tableName}_grain`,
        columns: grain,
        type: 'btree',
        unique: true,
      });
    }

    return indexes;
  }

  /**
   * Configure SCD columns for a dimension table
   */
  private configureSCD(
    tableName: string,
    scdType: SCDType,
    columns: DimensionColumn[]
  ): void {
    const trackedColumns = columns
      .filter(c => c.name !== 'id' && !c.name.includes('key'))
      .map(c => c.name);

    this.addSCD(tableName, scdType, trackedColumns);
  }

  /**
   * Add SCD-required columns to a dimension table
   */
  private addSCDColumns(
    dimTable: DimensionTable,
    scd: SlowlyChangingDimension
  ): void {
    const existingNames = new Set(dimTable.columns.map(c => c.name));

    if (scd.type === 'type2') {
      if (!existingNames.has(scd.effectiveDateColumn)) {
        dimTable.columns.push({ name: scd.effectiveDateColumn, type: 'timestamp', nullable: false });
      }
      if (scd.expirationDateColumn && !existingNames.has(scd.expirationDateColumn)) {
        dimTable.columns.push({ name: scd.expirationDateColumn, type: 'timestamp', nullable: true });
      }
      if (scd.currentFlagColumn && !existingNames.has(scd.currentFlagColumn)) {
        dimTable.columns.push({ name: scd.currentFlagColumn, type: 'boolean', nullable: false });
      }
      if (scd.versionColumn && !existingNames.has(scd.versionColumn)) {
        dimTable.columns.push({ name: scd.versionColumn, type: 'integer', nullable: false });
      }
    } else if (scd.type === 'type3') {
      // Type 3: add previous value columns
      for (const col of scd.trackedColumns) {
        const prevColName = `prev_${col}`;
        if (!existingNames.has(prevColName)) {
          const originalCol = dimTable.columns.find(c => c.name === col);
          dimTable.columns.push({
            name: prevColName,
            type: originalCol?.type ?? 'varchar',
            nullable: true,
          });
        }
      }
    }
  }

  /**
   * Generate partition clause for SQL
   */
  private generatePartitionClause(strategy: PartitionStrategy): string {
    switch (strategy.type) {
      case 'date':
        return ` PARTITION BY RANGE (${strategy.column}) /* ${strategy.granularity ?? 'monthly'} */`;
      case 'hash':
        return ` PARTITION BY HASH (${strategy.column}) PARTITIONS ${strategy.numPartitions ?? 16}`;
      case 'range':
        return ` PARTITION BY RANGE (${strategy.column})`;
      case 'list':
        return ` PARTITION BY LIST (${strategy.column})`;
      case 'region':
        return ` PARTITION BY LIST (${strategy.column}) /* regional */`;
      default:
        return '';
    }
  }
}
