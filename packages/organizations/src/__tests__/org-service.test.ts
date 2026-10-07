import { describe, it, expect, beforeEach } from 'vitest';
import { OrgService } from '../org-service';
import { OrgPlan } from '../types';

describe('OrgService', () => {
  let service: OrgService;

  beforeEach(() => {
    service = new OrgService();
  });

  it('createOrg creates with valid data', () => {
    const org = service.createOrg({ name: 'Test Org', slug: 'test-org', plan: OrgPlan.FREE });

    expect(org.id).toBeDefined();
    expect(org.name).toBe('Test Org');
    expect(org.slug).toBe('test-org');
    expect(org.plan).toBe(OrgPlan.FREE);
    expect(org.createdAt).toBeInstanceOf(Date);
    expect(org.updatedAt).toBeInstanceOf(Date);
  });

  it('createOrg throws on duplicate slug', () => {
    service.createOrg({ name: 'Org 1', slug: 'duplicate-slug' });

    expect(() => service.createOrg({ name: 'Org 2', slug: 'duplicate-slug' })).toThrow(
      'Organization with slug "duplicate-slug" already exists',
    );
  });

  it('getOrg returns org', () => {
    const created = service.createOrg({ name: 'Test Org', slug: 'test-org' });
    const fetched = service.getOrg(created.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.name).toBe('Test Org');
  });

  it('getOrg returns null for non-existent id', () => {
    const fetched = service.getOrg('non-existent-id');
    expect(fetched).toBeNull();
  });

  it('updateOrg updates fields', () => {
    const org = service.createOrg({ name: 'Original', slug: 'original' });
    const updated = service.updateOrg(org.id, { name: 'Updated', plan: OrgPlan.PRO });

    expect(updated.name).toBe('Updated');
    expect(updated.plan).toBe(OrgPlan.PRO);
    expect(updated.slug).toBe('original');
  });

  it('deleteOrg removes org', () => {
    const org = service.createOrg({ name: 'To Delete', slug: 'to-delete' });
    const deleted = service.deleteOrg(org.id);

    expect(deleted).toBe(true);
    expect(service.getOrg(org.id)).toBeNull();
  });

  it('deleteOrg returns false for non-existent org', () => {
    expect(service.deleteOrg('non-existent')).toBe(false);
  });

  it('listOrgs returns all', () => {
    service.createOrg({ name: 'Org 1', slug: 'org-1' });
    service.createOrg({ name: 'Org 2', slug: 'org-2' });
    service.createOrg({ name: 'Org 3', slug: 'org-3' });

    const orgs = service.listOrgs();
    expect(orgs).toHaveLength(3);
  });

  it('getOrgBySlug returns org', () => {
    service.createOrg({ name: 'By Slug', slug: 'by-slug' });
    const org = service.getOrgBySlug('by-slug');

    expect(org).not.toBeNull();
    expect(org!.name).toBe('By Slug');
  });
});
