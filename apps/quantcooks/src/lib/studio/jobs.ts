// ============================================================================
// QuantCooks Studio — the unified job shape (spec §0.2)
//
// Every generation, transformation, export and pipeline run is one job:
// { job_id, status, progress, credit_cost, outputs[] }. The JobStrip renders
// this shape and nothing else. `progress` is null whenever the backend has
// not reported a real number — the UI shows a stage label instead of
// inventing a percentage (no fake progress bars, spec §0.2).
// ============================================================================

import type { ServerExportJob } from '../../services/api-client';

export type StudioJobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface StudioJobOutput {
  id: string;
  kind: 'video' | 'image' | 'audio' | 'file';
  /** Fresh signed URL when the backend minted one for this read; else null. */
  url: string | null;
  label?: string;
}

export interface StudioJob {
  job_id: string;
  status: StudioJobStatus;
  /** 0–100, or null when no honest progress number exists yet. */
  progress: number | null;
  /** Whole credits charged for this job; null when not a paid job. */
  credit_cost: number | null;
  outputs: StudioJobOutput[];
  /** Failure reason on FAILED jobs; null otherwise. */
  error: string | null;
  /** Short human label for the job, e.g. "Export · mp4 1080p". */
  label?: string;
  /** Stage label for PROCESSING jobs without a numeric progress. */
  stage?: string | null;
}

/**
 * Map the one real job source that exists today — P0-4 export jobs from the
 * api-client — onto the unified studio shape. Parents feed JobStrip from
 * this; generation jobs join the same shape when CP-1's EditJob lands.
 */
export function jobFromExportJob(job: ServerExportJob): StudioJob {
  return {
    job_id: job.id,
    status: job.status,
    // Export progress is coarse but real (0 QUEUED → 10 → 70 → 100);
    // a QUEUED job has not started, so it reports no progress number.
    progress: job.status === 'QUEUED' ? null : job.progress,
    credit_cost: null, // exports are not credit-charged today — never invent a cost
    outputs:
      job.status === 'COMPLETED' && job.outputUrl
        ? [{ id: `${job.id}-output`, kind: 'video', url: job.outputUrl, label: `${job.format.toUpperCase()} export` }]
        : [],
    error: job.error,
    label: `Export · ${job.format} ${job.resolution}`,
    stage: job.status === 'PROCESSING' ? 'Rendering your export' : null,
  };
}
