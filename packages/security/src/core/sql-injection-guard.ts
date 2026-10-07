// ============================================================================
// Security Package - SQL Injection Guard
// ============================================================================

import type {
  SQLInjectionConfig,
  ParameterizedQuery,
  SQLInjectionResult,
  SQLThreat,
} from '../types';

/** Default SQL injection protection configuration */
const DEFAULT_CONFIG: SQLInjectionConfig = {
  strictMode: true,
  logAttempts: true,
  maxQueryLength: 10000,
  allowedOperators: [
    '=',
    '!=',
    '<',
    '>',
    '<=',
    '>=',
    'LIKE',
    'IN',
    'BETWEEN',
    'IS NULL',
    'IS NOT NULL',
  ],
  blockedKeywords: [
    'DROP',
    'DELETE',
    'TRUNCATE',
    'ALTER',
    'EXEC',
    'EXECUTE',
    'xp_',
    'sp_',
    'SHUTDOWN',
    'GRANT',
    'REVOKE',
  ],
};

/** SQL injection detection patterns */
const SQL_PATTERNS: {
  pattern: RegExp;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}[] = [
  { pattern: /('\s*(OR|AND)\s*'[^']*'\s*=\s*')/i, type: 'tautology', severity: 'critical' },
  {
    pattern: /('\s*;\s*(DROP|DELETE|ALTER|INSERT|UPDATE))/i,
    type: 'piggyback_query',
    severity: 'critical',
  },
  { pattern: /(UNION\s+(ALL\s+)?SELECT)/i, type: 'union_select', severity: 'critical' },
  { pattern: /(-{2}|#|\/\*)/i, type: 'comment_injection', severity: 'high' },
  { pattern: /(WAITFOR\s+DELAY|SLEEP\s*\(|BENCHMARK\s*\()/i, type: 'time_based', severity: 'high' },
  { pattern: /(LOAD_FILE\s*\(|INTO\s+(OUT|DUMP)FILE)/i, type: 'file_access', severity: 'critical' },
  {
    pattern: /(CHAR\s*\(|CHR\s*\(|ASCII\s*\(|CONCAT\s*\()/i,
    type: 'function_abuse',
    severity: 'medium',
  },
  { pattern: /(0x[0-9a-f]{4,})/i, type: 'hex_encoding', severity: 'medium' },
  {
    pattern: /(INFORMATION_SCHEMA|sys\.objects|sysobjects)/i,
    type: 'schema_discovery',
    severity: 'high',
  },
  { pattern: /('\s*OR\s+1\s*=\s*1)/i, type: 'always_true', severity: 'critical' },
  { pattern: /(;\s*SHUTDOWN)/i, type: 'shutdown_attempt', severity: 'critical' },
  { pattern: /(xp_cmdshell|xp_regread)/i, type: 'stored_procedure', severity: 'critical' },
  {
    pattern: /(HAVING\s+1\s*=\s*1|GROUP\s+BY.*HAVING)/i,
    type: 'having_injection',
    severity: 'high',
  },
  { pattern: /(ORDER\s+BY\s+\d+--)/i, type: 'order_by_injection', severity: 'medium' },
];

/**
 * SQLInjectionGuard - SQL injection prevention with parameterized query building,
 * pattern detection, input sanitization, and escape utilities.
 */
export class SQLInjectionGuard {
  private config: SQLInjectionConfig;
  private attemptLog: SQLThreat[];
  private queryWhitelist: Set<string>;
  private preparedStatements: Map<string, string>;

  constructor(config: Partial<SQLInjectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.attemptLog = [];
    this.queryWhitelist = new Set();
    this.preparedStatements = new Map();
  }

  /** Analyze input for SQL injection attempts */
  analyze(input: string): SQLInjectionResult {
    if (!input || typeof input !== 'string') {
      return { isSafe: true, threats: [], sanitized: input || '', confidence: 100 };
    }

    // Check length
    if (input.length > this.config.maxQueryLength) {
      return {
        isSafe: false,
        threats: [
          {
            type: 'length_exceeded',
            pattern: `length:${input.length}`,
            position: 0,
            severity: 'medium',
          },
        ],
        sanitized: input.substring(0, this.config.maxQueryLength),
        confidence: 90,
      };
    }

    const threats = this.detectThreats(input);
    const sanitized = this.sanitizeInput(input);
    const confidence = this.calculateConfidence(threats, input);

    if (threats.length > 0 && this.config.logAttempts) {
      this.attemptLog.push(...threats);
    }

    return {
      isSafe: threats.length === 0,
      threats,
      sanitized,
      confidence,
    };
  }

  /** Build a parameterized query from template and values */
  buildParameterizedQuery(template: string, params: Record<string, unknown>): ParameterizedQuery {
    const paramValues: unknown[] = [];
    let paramIndex = 1;
    let sql = template;

    // Replace named parameters with positional param markers
    sql = sql.replace(/:(\w+)/g, (match, paramName) => {
      if (paramName in params) {
        paramValues.push(params[paramName]);
        return `$${paramIndex++}`;
      }
      return match;
    });

    // Analyze for safety
    const analysis = this.analyze(sql);
    const hash = this.hashQuery(sql);

    return {
      sql,
      params: paramValues,
      hash,
      safe: analysis.isSafe,
      originalInput: template,
    };
  }

  /** Build a SELECT query safely */
  buildSelect(
    table: string,
    columns: string[],
    where?: Record<string, unknown>,
    orderBy?: string,
    limit?: number,
  ): ParameterizedQuery {
    // Validate table name
    const safeTable = this.escapeIdentifier(table);
    const safeCols = columns.map((c) => this.escapeIdentifier(c)).join(', ');

    let sql = `SELECT ${safeCols} FROM ${safeTable}`;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (where && Object.keys(where).length > 0) {
      const conditions: string[] = [];
      for (const [key, value] of Object.entries(where)) {
        const safeKey = this.escapeIdentifier(key);
        if (value === null) {
          conditions.push(`${safeKey} IS NULL`);
        } else if (Array.isArray(value)) {
          const paramMarkers = value.map(() => `$${paramIndex++}`).join(', ');
          conditions.push(`${safeKey} IN (${paramMarkers})`);
          params.push(...value);
        } else {
          conditions.push(`${safeKey} = $${paramIndex++}`);
          params.push(value);
        }
      }
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    if (orderBy) {
      const trimmedOrderBy = orderBy.trimEnd();
      const dirMatch = trimmedOrderBy.match(/\s(ASC|DESC)$/i);
      const safeOrderBy = this.escapeIdentifier(
        dirMatch ? trimmedOrderBy.slice(0, dirMatch.index) : trimmedOrderBy,
      );
      const direction = dirMatch?.[1]?.toUpperCase() || 'ASC';
      sql += ` ORDER BY ${safeOrderBy} ${direction}`;
    }

    if (limit && limit > 0) {
      sql += ` LIMIT $${paramIndex++}`;
      params.push(limit);
    }

    return {
      sql,
      params,
      hash: this.hashQuery(sql),
      safe: true,
      originalInput: `SELECT from ${table}`,
    };
  }

  /** Build an INSERT query safely */
  buildInsert(table: string, data: Record<string, unknown>): ParameterizedQuery {
    const safeTable = this.escapeIdentifier(table);
    const columns: string[] = [];
    const paramMarkers: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      columns.push(this.escapeIdentifier(key));
      paramMarkers.push(`$${paramIndex++}`);
      params.push(value);
    }

    const sql = `INSERT INTO ${safeTable} (${columns.join(', ')}) VALUES (${paramMarkers.join(', ')})`;

    return {
      sql,
      params,
      hash: this.hashQuery(sql),
      safe: true,
      originalInput: `INSERT into ${table}`,
    };
  }

  /** Escape a SQL identifier (table/column name) */
  escapeIdentifier(identifier: string): string {
    // Only allow alphanumeric and underscore
    const safe = identifier.replace(/[^a-zA-Z0-9_]/g, '');
    if (safe !== identifier) {
      // Identifier contained unsafe characters
      if (this.config.strictMode) {
        throw new Error(`Unsafe SQL identifier: ${identifier}`);
      }
    }
    return `"${safe}"`;
  }

  /** Escape a string value for SQL */
  escapeValue(value: string): string {
    if (typeof value !== 'string') return String(value);
    return value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "''")
      .replace(/"/g, '\\"')
      .replace(/\x00/g, '\\0')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\x1a/g, '\\Z');
  }

  /** Detect SQL injection patterns in input */
  private detectThreats(input: string): SQLThreat[] {
    const threats: SQLThreat[] = [];

    for (const { pattern, type, severity } of SQL_PATTERNS) {
      const match = input.match(pattern);
      if (match) {
        threats.push({
          type,
          pattern: match[0],
          position: match.index || 0,
          severity,
        });
      }
    }

    // Check for blocked keywords in strict mode
    if (this.config.strictMode) {
      for (const keyword of this.config.blockedKeywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        const match = input.match(regex);
        if (match) {
          threats.push({
            type: 'blocked_keyword',
            pattern: match[0],
            position: match.index || 0,
            severity: 'high',
          });
        }
      }
    }

    return threats;
  }

  /** Sanitize input by removing dangerous SQL constructs */
  private sanitizeInput(input: string): string {
    let sanitized = input;
    // Remove SQL comments
    sanitized = sanitized.replace(/--.*$/gm, '');
    sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, '');
    // Remove semicolons (prevent multiple statements)
    sanitized = sanitized.replace(/;/g, '');
    // Remove quotes that could break out of string context
    sanitized = sanitized.replace(/'/g, "''");
    return sanitized;
  }

  /** Calculate confidence score for the analysis */
  private calculateConfidence(threats: SQLThreat[], _input: string): number {
    if (threats.length === 0) return 100;
    const severityWeight = { low: 5, medium: 15, high: 30, critical: 50 };
    let deduction = 0;
    for (const threat of threats) {
      deduction += severityWeight[threat.severity];
    }
    return Math.max(0, 100 - deduction);
  }

  /**
   * Hash a query for caching/comparison.
   *
   * Bug E1 (security-crypto-hardening): intentionally left as a non-cryptographic
   * FNV-1a cache key. This 8-hex value is used only as a cache/whitelist comparison
   * key — it is never relied upon for integrity or unpredictability, and a collision
   * cannot bypass detection because every query is independently analyzed by analyze().
   * See design.md Property 14. No change required.
   */
  private hashQuery(query: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < query.length; i++) {
      hash ^= query.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  /** Add a query to the whitelist */
  addToWhitelist(queryHash: string): void {
    this.queryWhitelist.add(queryHash);
  }

  /** Register a prepared statement */
  registerPreparedStatement(name: string, template: string): void {
    this.preparedStatements.set(name, template);
  }

  /** Get attempt log */
  getAttemptLog(): SQLThreat[] {
    return [...this.attemptLog];
  }

  /** Clear attempt log */
  clearAttemptLog(): void {
    this.attemptLog = [];
  }
}
