// ============================================================================
// Permission Engine - Unified ABAC + RBAC permission evaluation
// ============================================================================
// NOTE: This is a pure synchronous engine designed for <5ms p99 evaluation.
// No async operations, no I/O - purely computational permission checks.

import type {
  PermissionAction,
  ResourceType,
  ABACContext,
  ABACCondition,
  PermissionPolicy,
  PermissionSubject,
  ResourcePermissionContract,
} from '../types.js';

export class PermissionEngine {
  private policies: PermissionPolicy[] = [];
  private contracts: Map<ResourceType, ResourcePermissionContract> = new Map();

  /** Register a permission policy */
  addPolicy(policy: PermissionPolicy): void {
    this.policies.push(policy);
  }

  /** Register a resource permission contract */
  registerContract(contract: ResourcePermissionContract): void {
    this.contracts.set(contract.resourceType, contract);
  }

  /** Register multiple resource permission contracts */
  registerContracts(contracts: ResourcePermissionContract[]): void {
    for (const contract of contracts) {
      this.contracts.set(contract.resourceType, contract);
    }
  }

  /**
   * Evaluate whether a subject can perform an action on a resource type.
   * Pure synchronous function - no I/O, no async. Target: <5ms p99.
   */
  can(
    subject: PermissionSubject,
    action: PermissionAction,
    resourceType: ResourceType,
    context?: ABACContext,
  ): boolean {
    // First check resource contracts (fast path)
    const contract = this.contracts.get(resourceType);
    if (contract) {
      const allowedRoles = contract.allowedActions[action];
      if (!allowedRoles || allowedRoles.length === 0) {
        return false;
      }
      const hasRole = subject.roles.some((role) => allowedRoles.includes(role));
      if (!hasRole) {
        return false;
      }
    }

    // Then check policies with ABAC conditions
    const applicablePolicies = this.policies.filter(
      (policy) =>
        policy.roles.some((role) => subject.roles.includes(role)) &&
        policy.actions.includes(action) &&
        policy.resourceTypes.includes(resourceType),
    );

    // If we have policies defined and none match, deny
    if (this.policies.length > 0 && applicablePolicies.length === 0 && !contract) {
      return false;
    }

    // If no contract and no policies match, deny
    if (!contract && applicablePolicies.length === 0) {
      return false;
    }

    // Evaluate ABAC conditions on applicable policies
    if (applicablePolicies.length > 0) {
      const policiesWithConditions = applicablePolicies.filter(
        (p) => p.conditions && p.conditions.length > 0,
      );

      if (policiesWithConditions.length > 0) {
        // If policies have conditions but no context was provided, deny access
        if (!context) {
          return false;
        }
        const anyPolicyPasses = policiesWithConditions.some((policy) =>
          this.evaluateConditions(policy.conditions!, context),
        );
        if (!anyPolicyPasses) {
          return false;
        }
      }
    }

    // If we only have a contract (no policies), the role check above is sufficient
    return true;
  }

  /** Evaluate all ABAC conditions (all must pass for a policy) */
  private evaluateConditions(conditions: ABACCondition[], context: ABACContext): boolean {
    return conditions.every((condition) => this.evaluateCondition(condition, context));
  }

  /** Evaluate a single ABAC condition */
  private evaluateCondition(condition: ABACCondition, context: ABACContext): boolean {
    const contextValue = context[condition.attribute];
    if (contextValue === undefined) {
      // If context doesn't provide the attribute, condition cannot be evaluated - pass
      return true;
    }

    const { operator, value } = condition;

    switch (operator) {
      case 'eq':
        return contextValue === value;
      case 'neq':
        return contextValue !== value;
      case 'gt':
        return (contextValue as number) > (value as number);
      case 'lt':
        return (contextValue as number) < (value as number);
      case 'gte':
        return (contextValue as number) >= (value as number);
      case 'lte':
        return (contextValue as number) <= (value as number);
      case 'in':
        return Array.isArray(value) && value.includes(contextValue);
      case 'notIn':
        return Array.isArray(value) && !value.includes(contextValue);
      default:
        return false;
    }
  }
}
