// ============================================================================
// quantmail-superhub · Task 23.1 — cross-cutting ownership/tenant authz filter
// (Requirements 22.1, 22.2, 22.3)
// ============================================================================
//
// The neutral ownership filter every pillar query/tool action is filtered by.
// These unit tests pin the canonical owner-only / tenant-admin policy and its
// FAIL-CLOSED behaviour:
//   * direct ownership is allowed (the mail-domain rule);
//   * a cross-owner request is DENIED (Req 22.1/22.2);
//   * a cross-tenant request is DENIED unless the principal is a same-tenant
//     admin (Req 22.2);
//   * missing/invalid inputs fail closed (deny);
//   * assertOwnership throws the same 403 FORBIDDEN the mail domain raises.

import { describe, it, expect } from 'vitest';
import {
  ownerOnlyAuthz,
  createMailDomainOwnershipAuthz,
  assertOwnership,
  type OwnershipPrincipal,
  type OwnedResource,
} from '../shared/ownership-authz';

describe('ownerOnlyAuthz.isAuthorized — ownership/tenant filter (Req 22.1/22.2)', () => {
  it('ALLOWS a principal accessing a resource it directly owns (the mail-domain rule)', () => {
    const principal: OwnershipPrincipal = { principalId: 'alice' };
    const resource: OwnedResource = { ownerId: 'alice' };
    expect(ownerOnlyAuthz.isAuthorized(principal, resource)).toBe(true);
  });

  it('DENIES a cross-owner access (a resource owned by another user) (Req 22.1)', () => {
    const principal: OwnershipPrincipal = { principalId: 'alice' };
    const resource: OwnedResource = { ownerId: 'bob' };
    expect(ownerOnlyAuthz.isAuthorized(principal, resource)).toBe(false);
  });

  it('DENIES a cross-tenant access when the principal is not a tenant admin (Req 22.2)', () => {
    const principal: OwnershipPrincipal = { principalId: 'alice', tenantId: 'tenant-A' };
    const resource: OwnedResource = { ownerId: 'bob', tenantId: 'tenant-B' };
    expect(ownerOnlyAuthz.isAuthorized(principal, resource)).toBe(false);
  });

  it('ALLOWS a same-tenant admin to access another member\'s resource (Req 16.4 allowance)', () => {
    const principal: OwnershipPrincipal = {
      principalId: 'ceo',
      tenantId: 'tenant-A',
      isTenantAdmin: true,
    };
    const resource: OwnedResource = { ownerId: 'employee', tenantId: 'tenant-A' };
    expect(ownerOnlyAuthz.isAuthorized(principal, resource)).toBe(true);
  });

  it('DENIES a tenant admin from reaching across into a DIFFERENT tenant (no cross-tenant admin)', () => {
    const principal: OwnershipPrincipal = {
      principalId: 'ceo',
      tenantId: 'tenant-A',
      isTenantAdmin: true,
    };
    const resource: OwnedResource = { ownerId: 'employee', tenantId: 'tenant-B' };
    expect(ownerOnlyAuthz.isAuthorized(principal, resource)).toBe(false);
  });

  it('FAILS CLOSED on missing/invalid inputs (null principal/resource, empty ids)', () => {
    expect(ownerOnlyAuthz.isAuthorized(null as never, { ownerId: 'a' })).toBe(false);
    expect(ownerOnlyAuthz.isAuthorized({ principalId: 'a' }, null as never)).toBe(false);
    expect(ownerOnlyAuthz.isAuthorized({ principalId: '' }, { ownerId: 'a' })).toBe(false);
    expect(ownerOnlyAuthz.isAuthorized({ principalId: 'a' }, { ownerId: '' })).toBe(false);
  });

  it('the production adapter factory returns the same owner-only policy', () => {
    const authz = createMailDomainOwnershipAuthz();
    expect(authz.isAuthorized({ principalId: 'alice' }, { ownerId: 'alice' })).toBe(true);
    expect(authz.isAuthorized({ principalId: 'alice' }, { ownerId: 'bob' })).toBe(false);
  });
});

describe('assertOwnership — deny == throw 403 FORBIDDEN (Req 22.2)', () => {
  it('returns silently when the principal is authorized', () => {
    expect(() =>
      assertOwnership(ownerOnlyAuthz, { principalId: 'alice' }, { ownerId: 'alice' }),
    ).not.toThrow();
  });

  it('throws 403 FORBIDDEN on a cross-owner request, enriching the message with kind + id', () => {
    expect(() =>
      assertOwnership(
        ownerOnlyAuthz,
        { principalId: 'alice' },
        { ownerId: 'bob', kind: 'email', resourceId: 'em-1' },
      ),
    ).toThrowError(/Not authorized to access email 'em-1'/);

    try {
      assertOwnership(ownerOnlyAuthz, { principalId: 'alice' }, { ownerId: 'bob' });
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    }
  });
});
