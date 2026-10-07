import { z } from 'zod';

export const AuditEntrySchema = z.object({
  id: z.string(),
  agentId: z.string(),
  action: z.string(),
  timestamp: z.number(),
  result: z.enum(['success', 'failure', 'pending']),
  reversible: z.boolean(),
  metadata: z.record(z.unknown()).optional(),
});

export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export class AuditTrail {
  private entries: AuditEntry[] = [];

  log(entry: AuditEntry): void {
    const parsed = AuditEntrySchema.parse(entry);
    this.entries.push(parsed);
  }

  getHistory(): ReadonlyArray<AuditEntry> {
    return [...this.entries];
  }

  getByAgent(agentId: string): ReadonlyArray<AuditEntry> {
    return this.entries.filter((e) => e.agentId === agentId);
  }

  getReversibleActions(): ReadonlyArray<AuditEntry> {
    return this.entries.filter((e) => e.reversible);
  }

  clear(): void {
    this.entries = [];
  }
}
