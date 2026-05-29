// ============================================================================
// Testing Framework - Route Validator
// Validates route definitions for completeness and consistency
// ============================================================================

export interface RouteDefinition {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  handler: string;
  linksTo?: string[];
}

export interface RouteValidationResult {
  valid: boolean;
  errors: RouteError[];
  warnings: RouteWarning[];
}

export interface RouteError {
  type: 'dead-end' | 'duplicate' | 'invalid-link' | 'missing-handler';
  route: string;
  message: string;
}

export interface RouteWarning {
  type: 'orphaned' | 'no-get' | 'naming-convention';
  route: string;
  message: string;
}

export class RouteValidator {
  validateRoutes(routes: RouteDefinition[]): RouteValidationResult {
    const errors: RouteError[] = [];
    const warnings: RouteWarning[] = [];

    // Check for duplicates
    errors.push(...this.checkDuplicates(routes));

    // Check for dead ends
    errors.push(...this.checkDeadEnds(routes));

    // Check for invalid links
    errors.push(...this.checkInvalidLinks(routes));

    // Check for missing handlers
    for (const route of routes) {
      if (!route.handler || route.handler.trim() === '') {
        errors.push({
          type: 'missing-handler',
          route: `${route.method} ${route.path}`,
          message: `Route ${route.method} ${route.path} has no handler defined`,
        });
      }
    }

    // Check warnings
    const pathsWithGet = new Set(routes.filter((r) => r.method === 'GET').map((r) => r.path));
    const uniquePaths = new Set(routes.map((r) => r.path));

    for (const path of uniquePaths) {
      if (!pathsWithGet.has(path)) {
        const methods = routes.filter((r) => r.path === path).map((r) => r.method);
        if (methods.includes('POST') || methods.includes('PUT')) {
          warnings.push({
            type: 'no-get',
            route: path,
            message: `Path ${path} has write methods but no GET method`,
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  checkDeadEnds(routes: RouteDefinition[]): RouteError[] {
    const errors: RouteError[] = [];
    const allPaths = new Set(routes.map((r) => r.path));
    const linkedPaths = new Set<string>();

    for (const route of routes) {
      if (route.linksTo) {
        for (const link of route.linksTo) {
          linkedPaths.add(link);
        }
      }
    }

    // A dead end is a route that has no links out and is not a terminal endpoint
    for (const route of routes) {
      if (route.method === 'GET' && (!route.linksTo || route.linksTo.length === 0)) {
        // Check if this route is referenced by others (it receives traffic but goes nowhere)
        if (linkedPaths.has(route.path) && allPaths.size > 1) {
          errors.push({
            type: 'dead-end',
            route: `${route.method} ${route.path}`,
            message: `Route ${route.path} is linked to but has no outgoing links (dead end)`,
          });
        }
      }
    }

    return errors;
  }

  checkDuplicates(routes: RouteDefinition[]): RouteError[] {
    const errors: RouteError[] = [];
    const seen = new Set<string>();

    for (const route of routes) {
      const key = `${route.method}:${route.path}`;
      if (seen.has(key)) {
        errors.push({
          type: 'duplicate',
          route: `${route.method} ${route.path}`,
          message: `Duplicate route: ${route.method} ${route.path}`,
        });
      }
      seen.add(key);
    }

    return errors;
  }

  checkInvalidLinks(routes: RouteDefinition[]): RouteError[] {
    const errors: RouteError[] = [];
    const allPaths = new Set(routes.map((r) => r.path));

    for (const route of routes) {
      if (route.linksTo) {
        for (const link of route.linksTo) {
          if (!allPaths.has(link)) {
            errors.push({
              type: 'invalid-link',
              route: `${route.method} ${route.path}`,
              message: `Route ${route.path} links to ${link} which does not exist`,
            });
          }
        }
      }
    }

    return errors;
  }

  generateReport(result: RouteValidationResult): string {
    const lines: string[] = [];

    lines.push('=== Route Validation Report ===');
    lines.push(`Status: ${result.valid ? 'PASS' : 'FAIL'}`);
    lines.push(`Errors: ${result.errors.length}`);
    lines.push(`Warnings: ${result.warnings.length}`);
    lines.push('');

    if (result.errors.length > 0) {
      lines.push('--- Errors ---');
      for (const error of result.errors) {
        lines.push(`  [${error.type}] ${error.route}: ${error.message}`);
      }
      lines.push('');
    }

    if (result.warnings.length > 0) {
      lines.push('--- Warnings ---');
      for (const warning of result.warnings) {
        lines.push(`  [${warning.type}] ${warning.route}: ${warning.message}`);
      }
    }

    return lines.join('\n');
  }
}
