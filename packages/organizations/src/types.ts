import { z } from 'zod';

export enum OrgRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum OrgPlan {
  FREE = 'FREE',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  role: OrgRole;
  joinedAt: Date;
}

export interface Workspace {
  id: string;
  orgId: string;
  name: string;
  settings: Record<string, unknown>;
  createdAt: Date;
}

export interface OrgContext {
  orgId: string;
  org: Organization;
  memberRole: OrgRole;
}

export const CreateOrgSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  plan: z.nativeEnum(OrgPlan).optional(),
});

export const UpdateOrgSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  plan: z.nativeEnum(OrgPlan).optional(),
  settings: z.record(z.unknown()).optional(),
});

export const InviteMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.nativeEnum(OrgRole).optional(),
});

export type CreateOrgInput = z.infer<typeof CreateOrgSchema>;
export type UpdateOrgInput = z.infer<typeof UpdateOrgSchema>;
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
