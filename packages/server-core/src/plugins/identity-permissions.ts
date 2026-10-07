import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { PermissionEngine, RBACEngine } from '@quant/identity-permissions';
import { ScopeEvaluator, type ScopeEvaluatorFn } from '../permissions/scope-evaluator';

// Cross-cutting RBAC substrate (Category A). Wired ONCE in `createApp()` after
// `auth`, so `requireAuth({ scopes })` scope evaluation is backed by
// `@quant/identity-permissions` rather than an ad-hoc inline check, and so
// every per-app route that declares fine-grained scopes inherits it
// (Requirements 2.1, 4.3, 5.6, 7.4). The 401/403 semantics in `auth.ts`
// (design Property P7) are preserved — the evaluator only ever grants a
// superset of the previous exact-match behaviour.

declare module 'fastify' {
  interface FastifyInstance {
    /** Shared RBAC/ABAC substrate from `@quant/identity-permissions`. */
    permissions: {
      engine: PermissionEngine;
      rbac: RBACEngine;
      scopes: ScopeEvaluator;
    };
    /**
     * Scope evaluator consumed by `auth.ts`' `requireAuth({ scopes })`.
     * Backed by `@quant/identity-permissions` RBAC subsumption rules.
     */
    evaluateScopes: ScopeEvaluatorFn;
  }
}

async function identityPermissionsPlugin(fastify: FastifyInstance) {
  const engine = new PermissionEngine();
  const rbac = new RBACEngine();
  const evaluator = new ScopeEvaluator(engine, rbac);

  fastify.decorate('permissions', { engine, rbac, scopes: evaluator });
  fastify.decorate('evaluateScopes', (granted, required) => evaluator.satisfies(granted, required));
}

export default fp(identityPermissionsPlugin, {
  name: 'identity-permissions',
  dependencies: ['auth'],
});
