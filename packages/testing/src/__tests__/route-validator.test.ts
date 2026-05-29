// ============================================================================
// Testing Framework - Route Validator Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { RouteValidator } from '../core/route-validator';
import type { RouteDefinition } from '../core/route-validator';

describe('RouteValidator', () => {
  let validator: RouteValidator;

  beforeEach(() => {
    validator = new RouteValidator();
  });

  it('validates a valid set of routes', () => {
    const routes: RouteDefinition[] = [
      { path: '/users', method: 'GET', handler: 'listUsers', linksTo: ['/users/:id'] },
      { path: '/users/:id', method: 'GET', handler: 'getUser', linksTo: ['/users'] },
      { path: '/users', method: 'POST', handler: 'createUser' },
    ];

    const result = validator.validateRoutes(routes);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects duplicate routes', () => {
    const routes: RouteDefinition[] = [
      { path: '/users', method: 'GET', handler: 'listUsers' },
      { path: '/users', method: 'GET', handler: 'listUsersV2' },
    ];

    const result = validator.validateRoutes(routes);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === 'duplicate')).toBe(true);
  });

  it('allows same path with different methods', () => {
    const routes: RouteDefinition[] = [
      { path: '/users', method: 'GET', handler: 'listUsers' },
      { path: '/users', method: 'POST', handler: 'createUser' },
      { path: '/users', method: 'DELETE', handler: 'deleteAllUsers' },
    ];

    const duplicates = validator.checkDuplicates(routes);
    expect(duplicates).toHaveLength(0);
  });

  it('detects dead-end routes', () => {
    const routes: RouteDefinition[] = [
      { path: '/home', method: 'GET', handler: 'home', linksTo: ['/dead'] },
      { path: '/dead', method: 'GET', handler: 'deadEnd' },
    ];

    const deadEnds = validator.checkDeadEnds(routes);
    expect(deadEnds).toHaveLength(1);
    expect(deadEnds[0]!.type).toBe('dead-end');
    expect(deadEnds[0]!.message).toContain('/dead');
  });

  it('detects invalid links to non-existent routes', () => {
    const routes: RouteDefinition[] = [
      { path: '/home', method: 'GET', handler: 'home', linksTo: ['/nonexistent'] },
      { path: '/about', method: 'GET', handler: 'about' },
    ];

    const result = validator.validateRoutes(routes);
    expect(result.errors.some((e) => e.type === 'invalid-link')).toBe(true);
    expect(result.errors[0]!.message).toContain('/nonexistent');
  });

  it('detects missing handler', () => {
    const routes: RouteDefinition[] = [{ path: '/broken', method: 'GET', handler: '' }];

    const result = validator.validateRoutes(routes);
    expect(result.errors.some((e) => e.type === 'missing-handler')).toBe(true);
  });

  it('warns about paths without GET method', () => {
    const routes: RouteDefinition[] = [
      { path: '/data', method: 'POST', handler: 'createData' },
      { path: '/data', method: 'PUT', handler: 'updateData' },
    ];

    const result = validator.validateRoutes(routes);
    expect(result.warnings.some((w) => w.type === 'no-get')).toBe(true);
  });

  it('generates human-readable report', () => {
    const routes: RouteDefinition[] = [
      { path: '/users', method: 'GET', handler: 'listUsers', linksTo: ['/missing'] },
      { path: '/users', method: 'GET', handler: 'duplicateUsers' },
    ];

    const result = validator.validateRoutes(routes);
    const report = validator.generateReport(result);

    expect(report).toContain('Route Validation Report');
    expect(report).toContain('FAIL');
    expect(report).toContain('Errors:');
  });

  it('reports PASS for valid routes in report', () => {
    const routes: RouteDefinition[] = [
      { path: '/api/health', method: 'GET', handler: 'healthCheck' },
    ];

    const result = validator.validateRoutes(routes);
    const report = validator.generateReport(result);

    expect(report).toContain('PASS');
    expect(report).toContain('Errors: 0');
  });
});
