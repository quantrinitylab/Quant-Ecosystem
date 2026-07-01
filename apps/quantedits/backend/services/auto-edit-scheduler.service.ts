// ============================================================================
// QuantEdits - Daily auto-edit scheduler
// ============================================================================
//
// Runs the AutoEditOrchestrator once a day for every opted-in user. The
// orchestrator is already idempotent per (user, UTC day) — a completed run is
// returned untouched — so a duplicate cron fire never double-posts. This
// scheduler is fail-soft: one user's failure is counted and the batch
// continues; it never fabricates success.

export interface AutoEditPreferenceRow {
  userId: string;
  enabled: boolean;
  sourceRef: string | null;
  templateId: string | null;
  caption: string | null;
}

export interface AutoEditSchedulerPrisma {
  autoEditPreference: {
    findMany(args: { where?: Record<string, unknown> }): Promise<AutoEditPreferenceRow[]>;
  };
}

/** The slice of AutoEditOrchestrator the scheduler needs (structural). */
export interface OrchestratorPort {
  runDaily(
    userId: string,
    options: { utcDay?: string; sourceRef?: string; templateId?: string; caption?: string },
  ): Promise<{ status: 'completed' | 'failed' }>;
}

export interface AutoEditBatchSummary {
  utcDay: string;
  usersConsidered: number;
  completed: number;
  failed: number;
}

const UTC_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export class AutoEditSchedulerService {
  constructor(
    private readonly prisma: AutoEditSchedulerPrisma,
    private readonly orchestrator: OrchestratorPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async runDaily(utcDay?: string): Promise<AutoEditBatchSummary> {
    const day = utcDay ?? this.now().toISOString().slice(0, 10);
    if (!UTC_DAY_RE.test(day)) {
      const err = new Error('utcDay must be a YYYY-MM-DD UTC-day string') as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }

    const prefs = await this.prisma.autoEditPreference.findMany({ where: { enabled: true } });
    let completed = 0;
    let failed = 0;

    for (const pref of prefs) {
      try {
        const result = await this.orchestrator.runDaily(pref.userId, {
          utcDay: day,
          ...(pref.sourceRef ? { sourceRef: pref.sourceRef } : {}),
          ...(pref.templateId ? { templateId: pref.templateId } : {}),
          ...(pref.caption ? { caption: pref.caption } : {}),
        });
        if (result.status === 'completed') completed += 1;
        else failed += 1;
      } catch {
        // Fail-soft: a per-user failure never aborts the batch.
        failed += 1;
      }
    }

    return { utcDay: day, usersConsidered: prefs.length, completed, failed };
  }
}
