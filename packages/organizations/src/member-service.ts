import { randomUUID } from 'crypto';
import type { OrgMember } from './types';
import { OrgRole } from './types';

export class MemberService {
  private members: OrgMember[] = [];

  invite(orgId: string, userId: string, role: OrgRole = OrgRole.MEMBER): OrgMember {
    const existing = this.getMembership(orgId, userId);
    if (existing) {
      throw new Error(`User "${userId}" is already a member of organization "${orgId}"`);
    }

    const member: OrgMember = {
      id: randomUUID(),
      orgId,
      userId,
      role,
      joinedAt: new Date(),
    };

    this.members.push(member);
    return member;
  }

  remove(orgId: string, userId: string): boolean {
    const index = this.members.findIndex((m) => m.orgId === orgId && m.userId === userId);
    if (index === -1) return false;
    this.members.splice(index, 1);
    return true;
  }

  changeRole(orgId: string, userId: string, newRole: OrgRole): OrgMember {
    const member = this.getMembership(orgId, userId);
    if (!member) {
      throw new Error(`Member not found for user "${userId}" in organization "${orgId}"`);
    }

    const updated: OrgMember = { ...member, role: newRole };
    const index = this.members.findIndex((m) => m.orgId === orgId && m.userId === userId);
    this.members[index] = updated;
    return updated;
  }

  listMembers(orgId: string): OrgMember[] {
    return this.members.filter((m) => m.orgId === orgId);
  }

  getMembership(orgId: string, userId: string): OrgMember | null {
    return this.members.find((m) => m.orgId === orgId && m.userId === userId) ?? null;
  }
}
