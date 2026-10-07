import { describe, it, expect, beforeEach } from 'vitest';
import { OrgService } from '../orgs/org-service.js';

describe('OrgService', () => {
  let service: OrgService;

  beforeEach(() => {
    service = new OrgService();
  });

  it('creates an organization', async () => {
    const org = await service.create('Acme Corp', 'acme.com', 'business');
    expect(org.name).toBe('Acme Corp');
    expect(org.domain).toBe('acme.com');
    expect(org.plan).toBe('business');
    expect(org.seatCount).toBe(0);
    expect(org.id).toBeDefined();
  });

  it('gets an organization by id', async () => {
    const org = await service.create('TestOrg', 'test.io', 'starter');
    const retrieved = await service.get(org.id);
    expect(retrieved).toEqual(org);
  });

  it('returns undefined for non-existent org', async () => {
    const result = await service.get('non-existent');
    expect(result).toBeUndefined();
  });

  it('updates an organization', async () => {
    const org = await service.create('OldName', 'old.com', 'free');
    const updated = await service.update(org.id, { name: 'NewName' });
    expect(updated?.name).toBe('NewName');
    expect(updated?.domain).toBe('old.com');
  });

  it('deletes an organization', async () => {
    const org = await service.create('ToDelete', 'del.com', 'free');
    const deleted = await service.delete(org.id);
    expect(deleted).toBe(true);
    const result = await service.get(org.id);
    expect(result).toBeUndefined();
  });

  it('adds a member to organization', async () => {
    const org = await service.create('TeamOrg', 'team.com', 'business');
    const member = await service.addMember(org.id, 'user-1', 'admin');
    expect(member).toBeDefined();
    expect(member?.userId).toBe('user-1');
    expect(member?.role).toBe('admin');
  });

  it('prevents duplicate member', async () => {
    const org = await service.create('TeamOrg', 'team.com', 'business');
    await service.addMember(org.id, 'user-1', 'admin');
    const duplicate = await service.addMember(org.id, 'user-1', 'member');
    expect(duplicate).toBeUndefined();
  });

  it('removes a member from organization', async () => {
    const org = await service.create('TeamOrg', 'team.com', 'business');
    await service.addMember(org.id, 'user-1', 'member');
    const removed = await service.removeMember(org.id, 'user-1');
    expect(removed).toBe(true);
    const members = await service.listMembers(org.id);
    expect(members).toHaveLength(0);
  });

  it('lists members of organization', async () => {
    const org = await service.create('TeamOrg', 'team.com', 'business');
    await service.addMember(org.id, 'user-1', 'admin');
    await service.addMember(org.id, 'user-2', 'member');
    const members = await service.listMembers(org.id);
    expect(members).toHaveLength(2);
  });

  it('sets member role', async () => {
    const org = await service.create('TeamOrg', 'team.com', 'business');
    await service.addMember(org.id, 'user-1', 'member');
    const updated = await service.setMemberRole(org.id, 'user-1', 'admin');
    expect(updated?.role).toBe('admin');
  });

  it('updates seat count when adding/removing members', async () => {
    const org = await service.create('TeamOrg', 'team.com', 'business');
    await service.addMember(org.id, 'user-1', 'member');
    await service.addMember(org.id, 'user-2', 'member');
    let current = await service.get(org.id);
    expect(current?.seatCount).toBe(2);
    await service.removeMember(org.id, 'user-1');
    current = await service.get(org.id);
    expect(current?.seatCount).toBe(1);
  });
});
