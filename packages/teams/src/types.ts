// ============================================================================
// @quant/teams - Types
// ============================================================================

import { z } from 'zod';

export type OrgPlan = 'free' | 'starter' | 'business' | 'enterprise';
export type OrgMemberRole = 'owner' | 'admin' | 'member' | 'guest';
export type SSOProvider = 'saml' | 'oidc';
export type SeatTier = 'basic' | 'standard' | 'enterprise';
export type ComplianceRuleType = 'retention' | 'dlp' | 'audit' | 'geo-restriction';

// ---------- Zod Schemas ----------

export const OrgPlanSchema = z.enum(['free', 'starter', 'business', 'enterprise']);
export const OrgMemberRoleSchema = z.enum(['owner', 'admin', 'member', 'guest']);

export const OrganizationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  domain: z.string().min(1),
  plan: OrgPlanSchema,
  seatCount: z.number().nonnegative(),
  maxSeats: z.number().positive(),
  ssoEnabled: z.boolean(),
  scimEnabled: z.boolean(),
  createdAt: z.number(),
});

export const OrgMemberSchema = z.object({
  id: z.string().min(1),
  orgId: z.string().min(1),
  userId: z.string().min(1),
  role: OrgMemberRoleSchema,
  joinedAt: z.number(),
  seatType: z.enum(['basic', 'standard', 'enterprise']),
});

export const CreateOrgInputSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
  plan: OrgPlanSchema,
});

// ---------- Interfaces ----------

export interface Organization {
  id: string;
  name: string;
  domain: string;
  plan: OrgPlan;
  seatCount: number;
  maxSeats: number;
  ssoEnabled: boolean;
  scimEnabled: boolean;
  createdAt: number;
}

export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  role: OrgMemberRole;
  joinedAt: number;
  seatType: SeatTier;
}

export interface SSOConfig {
  id: string;
  orgId: string;
  provider: SSOProvider;
  entityId: string;
  metadataUrl: string;
  certificate: string;
  mappings: Record<string, string>;
  // Dev/test escape hatch ONLY: when true, validateAssertion accepts assertions
  // without real signature verification. Defaults to false (fail closed).
  allowInsecureAssertion?: boolean;
}

export interface SCIMConfig {
  id: string;
  orgId: string;
  endpoint: string;
  token: string;
  syncEnabled: boolean;
  lastSync: number | null;
}

export interface AdminPolicy {
  id: string;
  orgId: string;
  name: string;
  rules: string[];
  scope: string;
  enforcement: 'strict' | 'warn' | 'log';
}

export interface SharedWorkspace {
  id: string;
  orgId: string;
  name: string;
  members: string[];
  permissions: Record<string, string[]>;
  resources: string[];
  createdAt: number;
}

export interface TeamAgent {
  id: string;
  orgId: string;
  name: string;
  capabilities: string[];
  assignedTo: string[];
  policy: string;
}

export interface SeatLicense {
  orgId: string;
  tier: SeatTier;
  pricePerSeat: number;
  totalSeats: number;
  usedSeats: number;
}

export interface ComplianceRule {
  id: string;
  orgId: string;
  type: ComplianceRuleType;
  config: Record<string, unknown>;
  enabled: boolean;
}

export interface AuditEntry {
  id: string;
  orgId: string;
  actorId: string;
  action: string;
  resource: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}
