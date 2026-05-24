// ============================================================================
// QuantAI API Server
// Central AI hub - assistant, device control, automation, ecosystem management
// ============================================================================

import type { Request, Response, Middleware } from './middleware';
import { RateLimiter, corsMiddleware, requestIdMiddleware, securityHeaders, loggingMiddleware, errorHandler } from './middleware';

import { assistantRoutes } from './routes/assistant';
import { deviceControlRoutes } from './routes/device-control';
import { modelRoutes } from './routes/models';
import { automationRoutes } from './routes/automation';
import { ecosystemRoutes } from './routes/ecosystem';
import { analyticsRoutes } from './routes/analytics';
import { trainingRoutes } from './routes/training';
import { pluginRoutes } from './routes/plugins';

import type { RouteDefinition } from '../src/types';

export interface ServerConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  rateLimit: { windowMs: number; maxRequests: number };
  env: 'development' | 'production' | 'test';
}

const defaultConfig: ServerConfig = {
  port: 3009,
  host: '0.0.0.0',
  corsOrigins: ['https://ai.quant.app', 'http://localhost:3000', 'http://localhost:3009'],
  rateLimit: { windowMs: 15 * 60 * 1000, maxRequests: 10000 },
  env: (process.env['NODE_ENV'] as any) || 'development',
};

interface RegisteredRoute { method: string; pathPattern: RegExp; paramNames: string[]; handler: (req: Request, res: Response) => Promise<void>; middleware: Middleware[]; requiresAuth: boolean; }

class Router {
  private routes: RegisteredRoute[] = [];
  register(routes: RouteDefinition[]): void { for (const route of routes) { const { pattern, paramNames } = this.pathToRegex(route.path); this.routes.push({ method: route.method, pathPattern: pattern, paramNames, handler: route.handler, middleware: route.middleware || [], requiresAuth: route.requiresAuth ?? true }); } }
  match(method: string, path: string): { route: RegisteredRoute; params: Record<string, string> } | null { for (const route of this.routes) { if (route.method !== method) continue; const match = path.match(route.pathPattern); if (match) { const params: Record<string, string> = {}; route.paramNames.forEach((name, i) => { params[name] = match[i + 1]; }); return { route, params }; } } return null; }
  private pathToRegex(path: string): { pattern: RegExp; paramNames: string[] } { const paramNames: string[] = []; const regexStr = path.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => { paramNames.push(name); return '([^/]+)'; }); return { pattern: new RegExp(`^${regexStr}$`), paramNames }; }
}

export class QuantAIServer {
  private config: ServerConfig;
  private router: Router;
  private globalMiddleware: Middleware[] = [];

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.router = new Router();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.globalMiddleware.push(requestIdMiddleware());
    this.globalMiddleware.push(securityHeaders());
    this.globalMiddleware.push(corsMiddleware(this.config.corsOrigins));
    this.globalMiddleware.push(new RateLimiter(this.config.rateLimit).middleware());
    if (this.config.env !== 'test') this.globalMiddleware.push(loggingMiddleware());
  }

  private setupRoutes(): void {
    this.router.register(assistantRoutes);
    this.router.register(deviceControlRoutes);
    this.router.register(modelRoutes);
    this.router.register(automationRoutes);
    this.router.register(ecosystemRoutes);
    this.router.register(analyticsRoutes);
    this.router.register(trainingRoutes);
    this.router.register(pluginRoutes);
  }

  async handleRequest(req: Request, res: Response): Promise<void> {
    try {
      for (const mw of this.globalMiddleware) { let ok = true; await new Promise<void>(resolve => { mw(req, res, (err?: Error) => { if (err) ok = false; resolve(); }); }); if (!ok || res.headersSent) return; }
      const match = this.router.match(req.method, req.path);
      if (!match) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `${req.method} ${req.path} not found`, statusCode: 404 } }); return; }
      const { route, params } = match;
      req.params = params;
      if (route.requiresAuth) {
        const authHeader = req.headers['authorization'] || '';
        if (!authHeader.startsWith('Bearer ')) { res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Bearer token required', statusCode: 401 } }); return; }
        const decoded = this.decodeToken(authHeader.substring(7));
        if (!decoded) { res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token', statusCode: 401 } }); return; }
        req.userId = decoded.sub;
        req.user = { id: decoded.sub, email: decoded.email || '', username: decoded.username || '', role: decoded.role || 'user', aiTier: decoded.aiTier || 'free' };
      }
      for (const mw of route.middleware) { let ok = true; await new Promise<void>(resolve => { mw(req, res, (err?: Error) => { if (err) ok = false; resolve(); }); }); if (!ok || res.headersSent) return; }
      await route.handler(req, res);
    } catch (error) { errorHandler()(error as Error, req, res, () => {}); }
  }

  private decodeToken(token: string): Record<string, any> | null {
    try { const parts = token.split('.'); if (parts.length !== 3) return null; const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null; return payload; } catch { return null; }
  }

  getRoutes() {
    const allRoutes = [...assistantRoutes, ...deviceControlRoutes, ...modelRoutes, ...automationRoutes, ...ecosystemRoutes, ...analyticsRoutes, ...trainingRoutes, ...pluginRoutes];
    return allRoutes.map(r => ({ method: r.method, path: r.path, requiresAuth: r.requiresAuth ?? true }));
  }

  getHealthStatus() { return { status: 'healthy', service: 'quantai', uptime: process.uptime(), version: '1.0.0', routes: this.getRoutes().length, features: ['assistant', 'device-control', 'automation', 'models', 'ecosystem', 'plugins', 'training'] }; }

  start(): void {
    const http = require('http');
    const server = http.createServer(async (incomingReq: any, outgoingRes: any) => {
      let body = '';
      incomingReq.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      incomingReq.on('end', async () => {
        const url = new URL(incomingReq.url || '/', `http://${incomingReq.headers.host}`);
        const req: Request = { method: incomingReq.method || 'GET', url: incomingReq.url || '/', path: url.pathname, params: {}, query: Object.fromEntries(url.searchParams.entries()), body: body ? JSON.parse(body) : {}, headers: incomingReq.headers as Record<string, string>, ip: incomingReq.socket?.remoteAddress || '127.0.0.1' };
        let statusCode = 200; const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const res: Response = { statusCode: 200, headersSent: false, status(code) { statusCode = code; res.statusCode = code; return res; }, json(data) { if (res.headersSent) return; res.headersSent = true; outgoingRes.writeHead(statusCode, headers); outgoingRes.end(JSON.stringify(data)); }, send(data) { if (res.headersSent) return; res.headersSent = true; outgoingRes.writeHead(statusCode, headers); outgoingRes.end(data); }, setHeader(name, value) { headers[name] = value; return res; } };
        if (req.path === '/health') { res.status(200).json(this.getHealthStatus()); return; }
        await this.handleRequest(req, res);
        if (!res.headersSent) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found', statusCode: 404 } }); }
      });
    });
    server.listen(this.config.port, this.config.host, () => { console.log(`[QuantAI] Server running at http://${this.config.host}:${this.config.port}`); console.log(`[QuantAI] Routes registered: ${this.getRoutes().length}`); });
  }
}

export default QuantAIServer;
