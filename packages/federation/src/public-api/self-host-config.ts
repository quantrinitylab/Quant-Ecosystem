import { z } from 'zod';

export const DatabaseConfigSchema = z.object({
  type: z.enum(['postgres', 'mysql', 'sqlite']),
  host: z.string(),
  port: z.number(),
  name: z.string(),
  username: z.string(),
  password: z.string(),
  ssl: z.boolean().default(false),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

export const StorageConfigSchema = z.object({
  type: z.enum(['local', 's3', 'minio']),
  path: z.string().optional(),
  bucket: z.string().optional(),
  endpoint: z.string().optional(),
  accessKey: z.string().optional(),
  secretKey: z.string().optional(),
});

export type StorageConfig = z.infer<typeof StorageConfigSchema>;

export const FederationConfigSchema = z.object({
  enabled: z.boolean(),
  domain: z.string(),
  protocols: z.array(z.enum(['activitypub', 'at-protocol', 'matrix'])),
  allowList: z.array(z.string()).optional(),
  blockList: z.array(z.string()).optional(),
});

export type FederationConfig = z.infer<typeof FederationConfigSchema>;

export const SelfHostConfigSchema = z.object({
  instanceName: z.string(),
  domain: z.string(),
  adminEmail: z.string(),
  database: DatabaseConfigSchema,
  storage: StorageConfigSchema,
  federation: FederationConfigSchema,
  port: z.number().default(3000),
  publicUrl: z.string(),
  registrationOpen: z.boolean().default(true),
  maxUsers: z.number().optional(),
});

export type SelfHostConfigType = z.infer<typeof SelfHostConfigSchema>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class SelfHostConfig {
  private config: SelfHostConfigType | null = null;

  initialize(config: SelfHostConfigType): boolean {
    const result = SelfHostConfigSchema.safeParse(config);
    if (!result.success) return false;
    this.config = result.data;
    return true;
  }

  validateConfig(config: unknown): ValidationResult {
    const result = SelfHostConfigSchema.safeParse(config);
    if (result.success) {
      return { valid: true, errors: [] };
    }

    const errors = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    return { valid: false, errors };
  }

  getRequiredServices(): string[] {
    if (!this.config) return [];

    const services: string[] = ['database', 'storage'];

    if (this.config.federation.enabled) {
      services.push('federation');
      for (const protocol of this.config.federation.protocols) {
        services.push(protocol);
      }
    }

    return services;
  }

  getDatabaseConfig(): DatabaseConfig | null {
    return this.config?.database ?? null;
  }

  getFederationConfig(): FederationConfig | null {
    return this.config?.federation ?? null;
  }

  getStorageConfig(): StorageConfig | null {
    return this.config?.storage ?? null;
  }

  exportConfig(): string | null {
    if (!this.config) return null;
    return JSON.stringify(this.config, null, 2);
  }

  importConfig(data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      return this.initialize(parsed);
    } catch {
      return false;
    }
  }
}
