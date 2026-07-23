import type { ShadowReport } from '@quant/ai';
import type { CreateMemoryShadowReportInput, MemoryShadowReportRow } from '@quant/database';
import type { DurableShadowReportSink } from './memory-facade.service';

const FULL_COMMIT_SHA = /^[a-f0-9]{40}$/i;
const DAY_MS = 86_400_000;

export interface ShadowReportWriter {
  create(input: CreateMemoryShadowReportInput): Promise<MemoryShadowReportRow>;
  countForTenant(tenantId: string): Promise<number>;
}

export interface PrismaShadowReportSinkConfig {
  commitSha: string;
  policyVersion: string;
  corpusVersion: string;
  retentionDays?: number;
}

/**
 * Persists personal QuantAI shadow evidence. Until a canonical org tenant claim
 * exists, the authenticated actor is the tenant boundary; untrusted headers are
 * never used to derive tenantId.
 */
export class PrismaShadowReportSink implements DurableShadowReportSink {
  readonly durability = 'durable' as const;
  private readonly retentionMs: number;

  constructor(
    private readonly writer: ShadowReportWriter,
    private readonly config: PrismaShadowReportSinkConfig,
  ) {
    if (!FULL_COMMIT_SHA.test(config.commitSha)) {
      throw new Error('QUANT_COMMIT_SHA must be a full 40-character commit SHA');
    }
    if (!config.policyVersion.trim()) throw new Error('MEMORY_POLICY_VERSION is required');
    if (!config.corpusVersion.trim()) throw new Error('MEMORY_CORPUS_VERSION is required');
    const retentionDays = config.retentionDays ?? 30;
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 90) {
      throw new Error('MEMORY_SHADOW_RETENTION_DAYS must be an integer between 1 and 90');
    }
    this.retentionMs = retentionDays * DAY_MS;
  }

  async emit(report: ShadowReport): Promise<void> {
    if (report.mode !== 'shadow') throw new Error('Only shadow-mode reports may be persisted');
    if (!report.actorUserId) throw new Error('Shadow report actorUserId is required');
    const observedAt = new Date(report.at);
    if (Number.isNaN(observedAt.getTime())) throw new Error('Shadow report timestamp is invalid');

    const input: CreateMemoryShadowReportInput = {
      tenantId: report.actorUserId,
      orgId: null,
      actorUserId: report.actorUserId,
      requestId: report.requestId,
      mode: report.mode,
      query: report.query,
      legacy: report.legacy,
      next: report.next,
      divergence: report.divergence,
      severity: report.divergence.severity,
      agreementRate: report.divergence.agreementRate,
      infrastructureError: report.next.error !== undefined,
      commitSha: this.config.commitSha,
      policyVersion: this.config.policyVersion,
      corpusVersion: this.config.corpusVersion,
      observedAt,
      expiresAt: new Date(observedAt.getTime() + this.retentionMs),
    };
    await this.writer.create(input);
  }

  countForActor(actorUserId: string): Promise<number> {
    if (!actorUserId) throw new Error('actorUserId is required');
    return this.writer.countForTenant(actorUserId);
  }
}
