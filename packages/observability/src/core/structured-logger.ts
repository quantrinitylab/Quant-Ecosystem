// ============================================================================
// Structured Logger - Production-grade JSON Structured Logging
// ============================================================================

import {
  LogEntry,
  LogLevel,
  LoggerConfig,
  LogContext,
  RedactionPattern,
} from '../types';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

export class StructuredLogger {
  private config: LoggerConfig;
  private context: LogContext;
  private ringBuffer: LogEntry[] = [];
  private batchBuffer: LogEntry[] = [];
  private batchSize: number;
  private childLoggers: StructuredLogger[] = [];
  private sampleCounters: Map<LogLevel, number> = new Map();
  private outputEntries: LogEntry[] = [];
  private defaultRedactionPatterns: RedactionPattern[] = [
    {
      name: 'email',
      pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      replacement: '[REDACTED:email]',
    },
    {
      name: 'phone',
      pattern: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      replacement: '[REDACTED:phone]',
    },
    {
      name: 'ssn',
      pattern: /\d{3}[-.\s]?\d{2}[-.\s]?\d{4}/g,
      replacement: '[REDACTED:ssn]',
    },
    {
      name: 'credit_card',
      pattern: /\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}/g,
      replacement: '[REDACTED:cc]',
    },
    {
      name: 'bearer_token',
      pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
      replacement: '[REDACTED:token]',
    },
  ];

  constructor(config?: Partial<LoggerConfig>, context?: LogContext) {
    this.config = {
      minLevel: config?.minLevel ?? 'info',
      serviceName: config?.serviceName ?? 'default',
      hostname: config?.hostname ?? 'localhost',
      samplingRate: config?.samplingRate ?? 1.0,
      bufferSize: config?.bufferSize ?? 1000,
      redactionPatterns: config?.redactionPatterns ?? this.defaultRedactionPatterns,
    };
    this.context = context || {};
    this.batchSize = 100;
  }

  // Check if level passes minimum filter
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
  }

  // Apply sampling logic
  private shouldSample(level: LogLevel): boolean {
    if (this.config.samplingRate >= 1.0) return true;
    if (level === 'error' || level === 'fatal') return true; // Always log errors

    const counter = (this.sampleCounters.get(level) || 0) + 1;
    this.sampleCounters.set(level, counter);

    // Sample based on rate
    return Math.random() < this.config.samplingRate;
  }

  // Apply PII redaction to a string
  private redact(value: string): string {
    let result = value;
    for (const pattern of this.config.redactionPatterns) {
      result = result.replace(pattern.pattern, pattern.replacement);
      // Reset regex lastIndex for global patterns
      pattern.pattern.lastIndex = 0;
    }
    return result;
  }

  // Deep redact an object
  private deepRedact(obj: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        redacted[key] = this.redact(value);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        redacted[key] = this.deepRedact(value as Record<string, unknown>);
      } else if (Array.isArray(value)) {
        redacted[key] = value.map(item =>
          typeof item === 'string' ? this.redact(item) :
          typeof item === 'object' && item !== null ? this.deepRedact(item as Record<string, unknown>) :
          item
        );
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }

  // Format log entry as JSON
  private formatEntry(entry: LogEntry): string {
    return JSON.stringify({
      timestamp: new Date(entry.timestamp).toISOString(),
      level: entry.level,
      message: entry.message,
      service: this.config.serviceName,
      hostname: this.config.hostname,
      correlationId: entry.correlationId,
      traceId: entry.traceId,
      spanId: entry.spanId,
      ...entry.context,
      ...entry.attributes,
    });
  }

  // Create a log entry
  private createEntry(
    level: LogLevel,
    message: string | (() => string),
    extra?: Record<string, unknown>
  ): LogEntry | null {
    if (!this.shouldLog(level)) return null;
    if (!this.shouldSample(level)) return null;

    // Lazy message evaluation
    const resolvedMessage = typeof message === 'function' ? message() : message;
    const redactedMessage = this.redact(resolvedMessage);

    const context = extra ? this.deepRedact({ ...this.context, ...extra }) : this.deepRedact({ ...this.context });

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message: redactedMessage,
      context,
      correlationId: (this.context.correlationId as string) || null,
      traceId: (this.context.traceId as string) || null,
      spanId: (this.context.spanId as string) || null,
      attributes: {},
    };

    // Add to ring buffer
    this.addToRingBuffer(entry);

    // Add to batch buffer
    this.batchBuffer.push(entry);
    if (this.batchBuffer.length >= this.batchSize) {
      this.flushBatch();
    }

    // Store output
    this.outputEntries.push(entry);

    return entry;
  }

  // Add to ring buffer (circular)
  private addToRingBuffer(entry: LogEntry): void {
    if (this.ringBuffer.length >= this.config.bufferSize) {
      this.ringBuffer.shift();
    }
    this.ringBuffer.push(entry);
  }

  // Log methods
  trace(message: string | (() => string), extra?: Record<string, unknown>): LogEntry | null {
    return this.createEntry('trace', message, extra);
  }

  debug(message: string | (() => string), extra?: Record<string, unknown>): LogEntry | null {
    return this.createEntry('debug', message, extra);
  }

  info(message: string | (() => string), extra?: Record<string, unknown>): LogEntry | null {
    return this.createEntry('info', message, extra);
  }

  warn(message: string | (() => string), extra?: Record<string, unknown>): LogEntry | null {
    return this.createEntry('warn', message, extra);
  }

  error(message: string | (() => string), extra?: Record<string, unknown>): LogEntry | null {
    return this.createEntry('error', message, extra);
  }

  fatal(message: string | (() => string), extra?: Record<string, unknown>): LogEntry | null {
    return this.createEntry('fatal', message, extra);
  }

  // Structured error logging
  logError(error: Error, extra?: Record<string, unknown>): LogEntry | null {
    const errorContext: Record<string, unknown> = {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack || '',
      ...(extra || {}),
    };

    // Capture cause chain
    let currentError: Error | undefined = error;
    const causes: string[] = [];
    let depth = 0;
    while (currentError && depth < 10) {
      if (depth > 0) causes.push(currentError.message);
      currentError = (currentError as any).cause;
      depth++;
    }
    if (causes.length > 0) {
      errorContext.errorCauses = causes;
    }

    return this.createEntry('error', error.message, errorContext);
  }

  // Create child logger with additional context
  child(childContext: LogContext): StructuredLogger {
    const mergedContext = { ...this.context, ...childContext };
    const childLogger = new StructuredLogger(
      { ...this.config },
      mergedContext
    );
    this.childLoggers.push(childLogger);
    return childLogger;
  }

  // Set context fields
  setContext(context: Partial<LogContext>): void {
    Object.assign(this.context, context);
  }

  // Get current context
  getContext(): LogContext {
    return { ...this.context };
  }

  // Get ring buffer contents (for on-demand inspection)
  getRecentLogs(count?: number): LogEntry[] {
    const limit = count || this.ringBuffer.length;
    return this.ringBuffer.slice(-limit);
  }

  // Get all output entries
  getOutputEntries(): LogEntry[] {
    return [...this.outputEntries];
  }

  // Flush batch buffer
  flushBatch(): LogEntry[] {
    const batch = [...this.batchBuffer];
    this.batchBuffer = [];
    return batch;
  }

  // Get pending batch
  getPendingBatch(): LogEntry[] {
    return [...this.batchBuffer];
  }

  // Format all entries in batch as JSON lines
  formatBatch(entries: LogEntry[]): string[] {
    return entries.map(entry => this.formatEntry(entry));
  }

  // Add custom redaction pattern
  addRedactionPattern(name: string, pattern: RegExp, replacement: string): void {
    this.config.redactionPatterns.push({ name, pattern, replacement });
  }

  // Remove redaction pattern
  removeRedactionPattern(name: string): void {
    this.config.redactionPatterns = this.config.redactionPatterns.filter(p => p.name !== name);
  }

  // Set minimum log level
  setLevel(level: LogLevel): void {
    this.config.minLevel = level;
  }

  // Get current level
  getLevel(): LogLevel {
    return this.config.minLevel;
  }

  // Set sampling rate
  setSamplingRate(rate: number): void {
    this.config.samplingRate = Math.max(0, Math.min(1, rate));
  }

  // Get log level priority
  getLevelPriority(level: LogLevel): number {
    return LOG_LEVEL_PRIORITY[level];
  }

  // Check if a specific level is enabled
  isLevelEnabled(level: LogLevel): boolean {
    return this.shouldLog(level);
  }

  // Clear all buffers
  clear(): void {
    this.ringBuffer = [];
    this.batchBuffer = [];
    this.outputEntries = [];
    this.sampleCounters.clear();
  }

  // Get stats
  getStats(): { ringBufferSize: number; batchSize: number; totalLogged: number; childCount: number } {
    return {
      ringBufferSize: this.ringBuffer.length,
      batchSize: this.batchBuffer.length,
      totalLogged: this.outputEntries.length,
      childCount: this.childLoggers.length,
    };
  }

  // Redact a value directly (utility)
  redactValue(value: string): string {
    return this.redact(value);
  }

  // Get all child loggers
  getChildren(): StructuredLogger[] {
    return [...this.childLoggers];
  }

  // Set batch size
  setBatchSize(size: number): void {
    this.batchSize = Math.max(1, size);
  }

  // Get config (read-only copy)
  getConfig(): LoggerConfig {
    return { ...this.config };
  }
}
