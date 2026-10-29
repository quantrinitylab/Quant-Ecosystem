// ============================================================================
// QuantCooks Studio — JobStrip (spec §0.2)
//
// The one async surface for every studio: a slim strip docked above the
// composer rendering the unified job shape { job_id, status, progress,
// credit_cost, outputs[] }. This component fetches nothing and invents
// nothing — parents pass real jobs in (today: export jobs via
// jobFromExportJob). Failed jobs always show the real reason and the
// auto-refund note, per the standing credits rule.
// ============================================================================

import React from 'react';
import type { StudioJob } from '../../lib/studio/jobs';

export interface JobStripProps {
  jobs: StudioJob[];
  onRetry?: (job: StudioJob) => void;
  onOpenOutput?: (job: StudioJob, outputId: string) => void;
}

function JobRow({ job, onRetry, onOpenOutput }: { job: StudioJob } & Omit<JobStripProps, 'jobs'>) {
  return (
    <li className="studio-job" data-testid={`job-${job.job_id}`} data-status={job.status}>
      <span className="studio-job-label">{job.label ?? 'Job'}</span>

      {job.status === 'QUEUED' && <span className="studio-job-state">Queued — waiting for a worker</span>}

      {job.status === 'PROCESSING' &&
        (typeof job.progress === 'number' ? (
          <span className="studio-job-state">
            <progress max={100} value={job.progress} aria-label="Job progress" /> {job.progress}%
          </span>
        ) : (
          <span className="studio-job-state">{job.stage ?? 'Working on it…'}</span>
        ))}

      {job.status === 'COMPLETED' && (
        <span className="studio-job-state">
          Done
          {job.outputs.map((output) => (
            <button
              key={output.id}
              type="button"
              className="studio-job-output"
              onClick={() => onOpenOutput?.(job, output.id)}
            >
              {output.label ?? 'Open result'}
            </button>
          ))}
        </span>
      )}

      {job.status === 'FAILED' && (
        <span className="studio-job-state studio-job-failed">
          <span className="studio-job-error">{job.error ?? 'This job failed.'}</span>{' '}
          <span className="studio-job-refund">
            {typeof job.credit_cost === 'number' && job.credit_cost > 0
              ? 'Refunded — the credits for this job were returned to your balance.'
              : 'No credits were charged for this job.'}
          </span>
          {onRetry && (
            <button type="button" className="studio-job-retry" onClick={() => onRetry(job)}>
              Retry
            </button>
          )}
        </span>
      )}

      {typeof job.credit_cost === 'number' && <span className="studio-job-cost">{job.credit_cost} credits</span>}
    </li>
  );
}

export const JobStrip: React.FC<JobStripProps> = ({ jobs, onRetry, onOpenOutput }) => {
  if (jobs.length === 0) {
    return (
      <div className="studio-jobstrip studio-jobstrip-empty" data-testid="jobstrip-empty">
        No jobs yet — when you generate or export something, its progress will appear here.
      </div>
    );
  }
  return (
    <ul className="studio-jobstrip" data-testid="jobstrip" aria-label="Your jobs">
      {jobs.map((job) => (
        <JobRow key={job.job_id} job={job} onRetry={onRetry} onOpenOutput={onOpenOutput} />
      ))}
    </ul>
  );
};

export default JobStrip;
