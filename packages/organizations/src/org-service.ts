import { randomUUID } from 'crypto';
import type { Organization, CreateOrgInput, UpdateOrgInput } from './types';
import { OrgPlan } from './types';

export class OrgService {
  private orgs = new Map<string, Organization>();

  createOrg(input: CreateOrgInput): Organization {
    // Validate slug uniqueness
    for (const org of this.orgs.values()) {
      if (org.slug === input.slug) {
        throw new Error(`Organization with slug "${input.slug}" already exists`);
      }
    }

    const now = new Date();
    const org: Organization = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      plan: input.plan ?? OrgPlan.FREE,
      settings: {},
      createdAt: now,
      updatedAt: now,
    };

    this.orgs.set(org.id, org);
    return org;
  }

  getOrg(id: string): Organization | null {
    return this.orgs.get(id) ?? null;
  }

  getOrgBySlug(slug: string): Organization | null {
    for (const org of this.orgs.values()) {
      if (org.slug === slug) {
        return org;
      }
    }
    return null;
  }

  updateOrg(id: string, input: UpdateOrgInput): Organization {
    const org = this.orgs.get(id);
    if (!org) {
      throw new Error(`Organization with id "${id}" not found`);
    }

    const updated: Organization = {
      ...org,
      name: input.name ?? org.name,
      plan: input.plan ?? org.plan,
      settings: input.settings ?? org.settings,
      updatedAt: new Date(),
    };

    this.orgs.set(id, updated);
    return updated;
  }

  deleteOrg(id: string): boolean {
    return this.orgs.delete(id);
  }

  listOrgs(): Organization[] {
    return Array.from(this.orgs.values());
  }
}
