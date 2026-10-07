import { z } from 'zod';
import { PermissionLevelSchema } from '../permissions.js';

export const AgentCapabilitySchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  requiredPermission: PermissionLevelSchema,
});

export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

export const AgentSpecSchema = z.object({
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver (x.y.z)'),
  author: z.string().min(1),
  description: z.string().min(10).max(500),
  permissions: z.array(PermissionLevelSchema).min(1),
  capabilities: z.array(AgentCapabilitySchema).min(1),
  entrypoint: z.string().min(1),
  configSchema: z.record(z.string(), z.string()).optional(),
  tags: z.array(z.string()).optional(),
  icon: z.string().optional(),
});

export type AgentSpec = z.infer<typeof AgentSpecSchema>;

export interface PublishedAgentSpec extends AgentSpec {
  id: string;
  publishedAt: number;
  downloads: number;
  rating: number;
}
