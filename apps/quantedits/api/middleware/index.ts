// ============================================================================
// QuantEdits API - Middleware
// Authentication, rate limiting for editing platform
// ============================================================================

export interface Request {
  method: string;
  url: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  body: unknown;
  headers: Record<string, string>;
  ip: string;
  userId?: string;
  user?: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
  startTime?: number;
  requestId?: string;
}

export interface Response {
  status(code: number): Response;
  json(data: unknown): void;
  send(data: string): void;
  setHeader(name: string, value: string): Response;
  statusCode: number;
  headersSent: boolean;
}

export type NextFunction = (error?: Error) => void;
export type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

interface RateLimitEntry { count: number; resetAt: number; }

export class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(options: { windowMs: number; maxRequests: number }) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    setInterval(() => { const now = Date.now(); for (const [k, e] of this.store) { if (e.resetAt <= now) this.store.delete(k); } }, this.windowMs);
  }

  middleware(): Middleware {
    return (req, res, next) => {
      const key = req.ip || 'unknown';
      const now = Date.now();
      const entry = this.store.get(key);
      if (!entry || entry.resetAt <= now) { this.store.set(key, { count: 1, resetAt: now + this.windowMs }); next(); return; }
      if (entry.count >= this.maxRequests) { res.status(429).json({ success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests', statusCode: 429 } }); return; }
      entry.count++;
      next();
    };
  }
}

export function corsMiddleware(origins: string[]): Middleware {
  return (req, res, next) => {
    const origin = req.headers['origin'] || '';
    if (origins.includes('*') || origins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    next();
  };
}

export function requestIdMiddleware(): Middleware {
  return (req, _res, next) => {
    req.requestId = req.headers['x-request-id'] || `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
    req.startTime = Date.now();
    next();
  };
}

export function securityHeaders(): Middleware {
  return (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

export function loggingMiddleware(): Middleware {
  return (req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ID: ${req.requestId}`);
    next();
  };
}

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(): (error: Error, req: Request, res: Response, next: NextFunction) => void {
  return (error, _req, res, _next) => {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: { code: error.code, message: error.message, statusCode: error.statusCode } });
      return;
    }
    console.error('Unhandled error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred', statusCode: 500 } });
  };
}
