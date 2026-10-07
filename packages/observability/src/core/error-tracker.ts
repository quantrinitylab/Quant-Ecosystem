// ============================================================================
// Error Tracker - Error Capture, Deduplication, and Analysis
// ============================================================================

import { ErrorContext, ErrorGroup, Breadcrumb, StackFrame, TrackedError, LogLevel } from '../types';

interface AlertThreshold {
  name: string;
  errorsPerMinute: number;
  callback: (rate: number) => void;
}

export class ErrorTracker {
  private errors: TrackedError[] = [];
  private groups: Map<string, ErrorGroup> = new Map();
  private breadcrumbs: Breadcrumb[] = [];
  private maxBreadcrumbs: number = 50;
  private maxErrors: number = 10000;
  private alertThresholds: AlertThreshold[] = [];
  private errorTimestamps: number[] = [];
  private resolvedFingerprints: Set<string> = new Set();
  private defaultContext: ErrorContext;
  private rateWindow: number = 60000; // 1 minute
  private baselineRate: number = 0;
  private spikeMultiplier: number = 3;

  constructor(environment: string = 'production', release?: string) {
    this.defaultContext = {
      environment,
      release,
      tags: {},
    };
  }

  // Capture an error with context
  captureError(error: Error, context?: Partial<ErrorContext>): TrackedError {
    const stackFrames = this.parseStackTrace(error.stack || '');
    const fingerprint = this.generateFingerprint(error, stackFrames);
    const mergedContext: ErrorContext = {
      ...this.defaultContext,
      ...context,
      tags: { ...this.defaultContext.tags, ...context?.tags },
    };

    const trackedError: TrackedError = {
      id: this.generateId(),
      fingerprint,
      name: error.name,
      message: error.message,
      stack: stackFrames,
      context: mergedContext,
      breadcrumbs: [...this.breadcrumbs],
      timestamp: Date.now(),
    };

    // Store error
    this.errors.push(trackedError);
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-Math.floor(this.maxErrors * 0.75));
    }

    // Update error group
    this.updateGroup(trackedError);

    // Track rate
    this.errorTimestamps.push(Date.now());
    this.pruneTimestamps();

    // Check alert thresholds
    this.checkAlerts();

    // Check if previously resolved error has recurred
    if (this.resolvedFingerprints.has(fingerprint)) {
      this.resolvedFingerprints.delete(fingerprint);
      const group = this.groups.get(fingerprint);
      if (group) {
        group.resolved = false;
      }
    }

    return trackedError;
  }

  // Generate error fingerprint from message and stack
  generateFingerprint(error: Error, stackFrames?: StackFrame[]): string {
    const frames = stackFrames || this.parseStackTrace(error.stack || '');

    // Normalize message (remove variable data like numbers, IDs)
    const normalizedMessage = error.message
      .replace(/\d+/g, 'N')
      .replace(/[0-9a-f]{8,}/gi, 'ID')
      .replace(/"[^"]*"/g, '"STR"');

    // Normalize stack (remove line numbers, just keep function names and file paths)
    const normalizedStack = frames
      .slice(0, 5) // Use top 5 frames
      .map((f) => `${f.functionName}@${this.normalizeFilePath(f.fileName)}`)
      .join('|');

    // Simple hash of normalized components
    const input = `${error.name}:${normalizedMessage}:${normalizedStack}`;
    return this.hashString(input);
  }

  // Normalize file path (remove varying parts)
  private normalizeFilePath(filePath: string): string {
    return filePath
      .replace(/.*node_modules\//, 'nm/')
      .replace(/.*\/src\//, 'src/')
      .replace(/.*\/dist\//, 'dist/')
      .replace(/\?.*$/, '');
  }

  // Simple string hash (FNV-1a inspired)
  private hashString(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  // Parse stack trace into structured frames
  parseStackTrace(stack: string): StackFrame[] {
    const frames: StackFrame[] = [];
    const lines = stack.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Match "at functionName (file:line:column)" or "at file:line:column"
      const match1 = trimmed.match(/^at (.+) \((.+):(\d+):(\d+)\)$/);
      const match2 = trimmed.match(/^at (.+):(\d+):(\d+)$/);

      if (match1) {
        frames.push({
          functionName: match1[1]!,
          fileName: match1[2]!,
          lineNumber: parseInt(match1[3]!, 10),
          columnNumber: parseInt(match1[4]!, 10),
          source: trimmed,
        });
      } else if (match2) {
        frames.push({
          functionName: '<anonymous>',
          fileName: match2[1]!,
          lineNumber: parseInt(match2[2]!, 10),
          columnNumber: parseInt(match2[3]!, 10),
          source: trimmed,
        });
      }
    }

    return frames;
  }

  // Update error group (deduplication)
  private updateGroup(error: TrackedError): void {
    const existing = this.groups.get(error.fingerprint);

    if (existing) {
      existing.count++;
      existing.lastSeen = error.timestamp;
      existing.context.push(error.context);
      // Keep only last 10 contexts
      if (existing.context.length > 10) {
        existing.context = existing.context.slice(-10);
      }
      existing.priority = this.calculatePriority(existing);
    } else {
      const group: ErrorGroup = {
        fingerprint: error.fingerprint,
        message: error.message,
        count: 1,
        firstSeen: error.timestamp,
        lastSeen: error.timestamp,
        context: [error.context],
        resolved: false,
        priority: 1,
      };
      this.groups.set(error.fingerprint, group);
    }
  }

  // Calculate error priority (frequency * recency * impact)
  calculatePriority(group: ErrorGroup): number {
    const now = Date.now();
    const hoursSinceFirst = Math.max(1, (now - group.firstSeen) / 3600000);
    const hoursSinceLast = Math.max(0.1, (now - group.lastSeen) / 3600000);

    // Frequency: occurrences per hour
    const frequency = group.count / hoursSinceFirst;

    // Recency: inverse of hours since last occurrence
    const recency = 1 / hoursSinceLast;

    // Impact: based on count
    const impact = Math.log2(group.count + 1);

    return frequency * recency * impact;
  }

  // Add breadcrumb (user action before error)
  addBreadcrumb(
    category: string,
    message: string,
    level: LogLevel = 'info',
    data?: Record<string, unknown>,
  ): void {
    this.breadcrumbs.push({
      timestamp: Date.now(),
      category,
      message,
      level,
      data,
    });

    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  // Get breadcrumbs
  getBreadcrumbs(): Breadcrumb[] {
    return [...this.breadcrumbs];
  }

  // Clear breadcrumbs
  clearBreadcrumbs(): void {
    this.breadcrumbs = [];
  }

  // Get error group by fingerprint
  getGroup(fingerprint: string): ErrorGroup | null {
    return this.groups.get(fingerprint) || null;
  }

  // Get all error groups
  getGroups(): ErrorGroup[] {
    return Array.from(this.groups.values());
  }

  // Get top error groups by priority
  getTopGroups(count: number = 10): ErrorGroup[] {
    return this.getGroups()
      .filter((g) => !g.resolved)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, count);
  }

  // Mark error group as resolved
  resolveGroup(fingerprint: string): boolean {
    const group = this.groups.get(fingerprint);
    if (!group) return false;

    group.resolved = true;
    this.resolvedFingerprints.add(fingerprint);
    return true;
  }

  // Get current error rate (errors per minute)
  getErrorRate(): number {
    this.pruneTimestamps();
    const now = Date.now();
    const recentErrors = this.errorTimestamps.filter((t) => now - t < this.rateWindow);
    return recentErrors.length;
  }

  // Detect error rate spike
  detectSpike(): {
    spiking: boolean;
    currentRate: number;
    baselineRate: number;
    multiplier: number;
  } {
    const currentRate = this.getErrorRate();
    const spiking = this.baselineRate > 0 && currentRate > this.baselineRate * this.spikeMultiplier;

    return {
      spiking,
      currentRate,
      baselineRate: this.baselineRate,
      multiplier: this.baselineRate > 0 ? currentRate / this.baselineRate : 0,
    };
  }

  // Update baseline rate
  updateBaseline(): void {
    this.baselineRate = this.getErrorRate();
  }

  // Set alert threshold
  addAlertThreshold(name: string, errorsPerMinute: number, callback: (rate: number) => void): void {
    this.alertThresholds.push({ name, errorsPerMinute, callback });
  }

  // Remove alert threshold
  removeAlertThreshold(name: string): void {
    this.alertThresholds = this.alertThresholds.filter((t) => t.name !== name);
  }

  // Check alert thresholds
  private checkAlerts(): void {
    const rate = this.getErrorRate();
    for (const threshold of this.alertThresholds) {
      if (rate >= threshold.errorsPerMinute) {
        try {
          threshold.callback(rate);
        } catch (_) {
          // Ignore callback errors
        }
      }
    }
  }

  // Prune old timestamps
  private pruneTimestamps(): void {
    const cutoff = Date.now() - this.rateWindow * 5;
    this.errorTimestamps = this.errorTimestamps.filter((t) => t >= cutoff);
  }

  // Generate unique ID
  private generateId(): string {
    return `err_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get errors by fingerprint
  getErrorsByFingerprint(fingerprint: string): TrackedError[] {
    return this.errors.filter((e) => e.fingerprint === fingerprint);
  }

  // Get recent errors
  getRecentErrors(count: number = 50): TrackedError[] {
    return this.errors.slice(-count);
  }

  // Set default context
  setDefaultContext(context: Partial<ErrorContext>): void {
    Object.assign(this.defaultContext, context);
  }

  // Add tag to default context
  addTag(key: string, value: string): void {
    this.defaultContext.tags[key] = value;
  }

  // Get stats
  getStats(): {
    totalErrors: number;
    uniqueGroups: number;
    resolvedGroups: number;
    unresolvedGroups: number;
    errorRate: number;
  } {
    const resolved = Array.from(this.groups.values()).filter((g) => g.resolved).length;
    return {
      totalErrors: this.errors.length,
      uniqueGroups: this.groups.size,
      resolvedGroups: resolved,
      unresolvedGroups: this.groups.size - resolved,
      errorRate: this.getErrorRate(),
    };
  }

  // Set max breadcrumbs
  setMaxBreadcrumbs(max: number): void {
    this.maxBreadcrumbs = Math.max(1, max);
    while (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  // Set spike detection parameters
  setSpikeDetection(baselineRate: number, multiplier: number): void {
    this.baselineRate = baselineRate;
    this.spikeMultiplier = multiplier;
  }

  // Reset
  reset(): void {
    this.errors = [];
    this.groups.clear();
    this.breadcrumbs = [];
    this.errorTimestamps = [];
    this.resolvedFingerprints.clear();
    this.baselineRate = 0;
  }
}
