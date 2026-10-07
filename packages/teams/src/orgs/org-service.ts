import type { Organization, OrgMember, OrgMemberRole, OrgPlan } from '../types.js';
import { CreateOrgInputSchema } from '../types.js';

export class OrgService {
  private orgs = new Map<string, Organization>();
  private members = new Map<string, OrgMember[]>();

  async create(name: string, domain: string, plan: OrgPlan): Promise<Organization> {
    CreateOrgInputSchema.parse({ name, domain, plan });
    const org: Organization = {
      id: crypto.randomUUID(),
      name,
      domain,
      plan,
      seatCount: 0,
      maxSeats: plan === 'enterprise' ? 10000 : plan === 'business' ? 500 : 50,
      ssoEnabled: false,
      scimEnabled: false,
      createdAt: Date.now(),
    };
    this.orgs.set(org.id, org);
    this.members.set(org.id, []);
    return org;
  }

  async get(orgId: string): Promise<Organization | undefined> {
    return this.orgs.get(orgId);
  }

  async update(
    orgId: string,
    updates: Partial<Pick<Organization, 'name' | 'domain' | 'plan'>>,
  ): Promise<Organization | undefined> {
    const org = this.orgs.get(orgId);
    if (!org) return undefined;
    const updated = { ...org, ...updates };
    this.orgs.set(orgId, updated);
    return updated;
  }

  async delete(orgId: string): Promise<boolean> {
    const deleted = this.orgs.delete(orgId);
    this.members.delete(orgId);
    return deleted;
  }

  async addMember(
    orgId: string,
    userId: string,
    role: OrgMemberRole,
  ): Promise<OrgMember | undefined> {
    const org = this.orgs.get(orgId);
    if (!org) return undefined;
    const orgMembers = this.members.get(orgId) ?? [];
    if (orgMembers.find((m) => m.userId === userId)) return undefined;
    const member: OrgMember = {
      id: crypto.randomUUID(),
      orgId,
      userId,
      role,
      joinedAt: Date.now(),
      seatType: 'standard',
    };
    orgMembers.push(member);
    this.members.set(orgId, orgMembers);
    org.seatCount = orgMembers.length;
    this.orgs.set(orgId, org);
    return member;
  }

  async removeMember(orgId: string, userId: string): Promise<boolean> {
    const org = this.orgs.get(orgId);
    if (!org) return false;
    const orgMembers = this.members.get(orgId) ?? [];
    const filtered = orgMembers.filter((m) => m.userId !== userId);
    if (filtered.length === orgMembers.length) return false;
    this.members.set(orgId, filtered);
    org.seatCount = filtered.length;
    this.orgs.set(orgId, org);
    return true;
  }

  async listMembers(orgId: string): Promise<OrgMember[]> {
    return this.members.get(orgId) ?? [];
  }

  async setMemberRole(
    orgId: string,
    userId: string,
    role: OrgMemberRole,
  ): Promise<OrgMember | undefined> {
    const orgMembers = this.members.get(orgId) ?? [];
    const member = orgMembers.find((m) => m.userId === userId);
    if (!member) return undefined;
    member.role = role;
    return member;
  }
}
