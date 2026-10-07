/**
 * Environment-aware logger that suppresses non-error output in production.
 * In production (NODE_ENV === 'production'), only error() logs.
 * In development/test, all methods log normally.
 */

type LogLevel = 'debug' | 'log' | 'warn' | 'error';

function shouldLog(level: LogLevel): boolean {
  if (level === 'error') return true;
  return typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : true;
}

function sanitizeLogArg(arg: unknown): unknown {
  // Strip CR/LF and other control chars to prevent log forging/injection.
  return typeof arg === 'string' ? arg.replace(/[\u0000-\u001f\u007f]/g, ' ') : arg;
}

export const logger = {
  debug(...args: unknown[]): void {
    if (shouldLog('debug')) globalThis.console.debug('[QUANT]', ...args.map(sanitizeLogArg));
  },
  log(...args: unknown[]): void {
    if (shouldLog('log')) globalThis.console.log('[QUANT]', ...args.map(sanitizeLogArg));
  },
  warn(...args: unknown[]): void {
    if (shouldLog('warn')) globalThis.console.warn('[QUANT]', ...args.map(sanitizeLogArg));
  },
  error(...args: unknown[]): void {
    if (shouldLog('error')) globalThis.console.error('[QUANT]', ...args.map(sanitizeLogArg));
  },
};

// Security: CodeQL #149: log args are control-char sanitized (no log injection).
