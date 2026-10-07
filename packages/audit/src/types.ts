import { z } from 'zod';

export enum AuditAction {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  DATA_ACCESS = 'DATA_ACCESS',
  DATA_MODIFY = 'DATA_MODIFY',
  DATA_DELETE = 'DATA_DELETE',
  PERMISSION_CHANGE = 'PERMISSION_CHANGE',
  SETTINGS_CHANGE = 'SETTINGS_CHANGE',
  USER_CREATE = 'USER_CREATE',
  USER_DELETE = 'USER_DELETE',
  FLAG_TOGGLE = 'FLAG_TOGGLE',
}

export interface AuditEvent {
  id: string;
  userId: string;
  orgId?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  metadata: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface RetentionPolicy {
  resource: string;
  maxAgeDays: number;
  enabled: boolean;
}

export interface DataExportResult {
  userId: string;
  exportedAt: Date;
  data: Record<string, unknown[]>;
  format: 'json';
}

export const CreateAuditEventSchema = z.object({
  userId: z.string().min(1),
  orgId: z.string().optional(),
  action: z.nativeEnum(AuditAction),
  resource: z.string().min(1),
  resourceId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});

export const AuditQuerySchema = z.object({
  userId: z.string().optional(),
  action: z.nativeEnum(AuditAction).optional(),
  resource: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.number().min(1).max(1000).optional(),
  offset: z.number().min(0).optional(),
});

export type CreateAuditEventInput = z.infer<typeof CreateAuditEventSchema>;
export type AuditQueryInput = z.infer<typeof AuditQuerySchema>;
