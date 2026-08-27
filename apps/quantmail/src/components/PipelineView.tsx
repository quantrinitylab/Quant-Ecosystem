// ============================================================================
// QuantMail - Pipeline View Component
// CI/CD pipeline visualization
// ============================================================================

import React, { useState } from 'react';
import type { Build, WorkflowJob, WorkflowStep, WorkflowStatus } from '../types';
import { IconBan, IconCheck, IconClock, IconLoader, IconMinus, IconX } from './icons';

export interface PipelineViewProps {
  build: Build;
  onCancelBuild: () => void;
  onRetryBuild: () => void;
  onViewArtifacts: () => void;
  showLogs?: boolean;
}

/**
 * One glyph per status. Components rather than characters: the old map mixed
 * geometric shapes (◯ ◎ ⊘) with dingbats (✓ ✗), so the six states rendered at
 * six different optical weights depending on which font resolved each one.
 */
const StatusIcon: Record<WorkflowStatus, (props: { size?: number }) => React.ReactElement> = {
  pending: IconClock,
  running: IconLoader,
  success: IconCheck,
  failure: IconX,
  cancelled: IconBan,
  skipped: IconMinus,
};

const statusLabels: Record<WorkflowStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  success: 'Passed',
  failure: 'Failed',
  cancelled: 'Cancelled',
  skipped: 'Skipped',
};

export function PipelineView(props: PipelineViewProps): React.ReactElement {
  const { build, onCancelBuild, onRetryBuild, onViewArtifacts, showLogs } = props;

  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(
    new Set(build.jobs.map((j) => j.id)),
  );
  const [showLogPanel, setShowLogPanel] = useState(showLogs || false);

  const toggleJob = (jobId: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const formatDuration = (ms?: number): string => {
    if (!ms) return '-';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  const getOverallProgress = (): number => {
    const totalSteps = build.jobs.reduce((sum, j) => sum + j.steps.length, 0);
    if (totalSteps === 0) return 0;
    const completed = build.jobs.reduce(
      (sum, j) =>
        sum + j.steps.filter((s) => s.status === 'success' || s.status === 'failure').length,
      0,
    );
    return Math.round((completed / totalSteps) * 100);
  };

  return (
    <div className="pipeline-view">
      {/* Build Header */}
      <div className="pipeline-header">
        <div className="pipeline-title">
          <span className={`status-icon status-${build.status} inline-flex`}>
            {(() => {
              const Glyph = StatusIcon[build.status];
              return <Glyph size={14} />;
            })()}
          </span>
          <h3>Build #{build.number}</h3>
          <span className={`status-badge status-${build.status}`}>
            {statusLabels[build.status]}
          </span>
        </div>
        <div className="pipeline-meta">
          <span>
            Branch: <code>{build.branch}</code>
          </span>
          <span>
            Commit: <code>{build.commit.substring(0, 7)}</code>
          </span>
          <span>By: {build.author.name}</span>
          <span>Trigger: {build.trigger}</span>
          {build.duration && <span>Duration: {formatDuration(build.duration)}</span>}
        </div>
        <div className="pipeline-actions">
          {build.status === 'running' && (
            <button className="btn btn-sm btn-outline" onClick={onCancelBuild}>
              Cancel
            </button>
          )}
          {(build.status === 'failure' || build.status === 'cancelled') && (
            <button className="btn btn-sm btn-primary" onClick={onRetryBuild}>
              Retry
            </button>
          )}
          {build.artifacts.length > 0 && (
            <button className="btn btn-sm btn-outline" onClick={onViewArtifacts}>
              Artifacts ({build.artifacts.length})
            </button>
          )}
          <button
            className={`btn btn-sm btn-outline ${showLogPanel ? 'active' : ''}`}
            onClick={() => setShowLogPanel(!showLogPanel)}
          >
            Logs
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {build.status === 'running' && (
        <div className="pipeline-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${getOverallProgress()}%` }} />
          </div>
          <span className="progress-text">{getOverallProgress()}%</span>
        </div>
      )}

      {/* Pipeline visualization */}
      <div className="pipeline-jobs">
        {build.jobs.map((job, jobIndex) => (
          <div key={job.id} className={`pipeline-job job-${job.status}`}>
            {/* Job connector line */}
            {jobIndex > 0 && <div className="job-connector" />}

            {/* Job header */}
            <div className="job-header" onClick={() => toggleJob(job.id)}>
              <span className={`job-status-icon status-${job.status} inline-flex`}>
                {(() => {
                  const Glyph = StatusIcon[job.status];
                  return <Glyph size={13} />;
                })()}
              </span>
              <span className="job-name">{job.name}</span>
              <span className="job-runner">{job.runner}</span>
              {job.duration && <span className="job-duration">{formatDuration(job.duration)}</span>}
              <span className="job-expand">{expandedJobs.has(job.id) ? '▾' : '▸'}</span>
            </div>

            {/* Job steps */}
            {expandedJobs.has(job.id) && (
              <div className="job-steps">
                {job.steps.map((step, stepIndex) => (
                  <div key={stepIndex} className={`step-row step-${step.status}`}>
                    <span className={`step-status status-${step.status} inline-flex`}>
                      {(() => {
                        const Glyph = StatusIcon[step.status];
                        return <Glyph size={12} />;
                      })()}
                    </span>
                    <span className="step-name">{step.name}</span>
                    {step.duration && (
                      <span className="step-duration">{formatDuration(step.duration)}</span>
                    )}
                    {step.output && <pre className="step-output">{step.output}</pre>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Commit info */}
      <div className="pipeline-commit">
        <h4>Commit</h4>
        <p className="commit-message">{build.commitMessage}</p>
        <span className="commit-details">
          {build.commit.substring(0, 7)} on {build.branch}
        </span>
      </div>

      {/* Log panel */}
      {showLogPanel && (
        <div className="pipeline-logs">
          <div className="logs-header">
            <h4>Build Logs</h4>
            <button className="btn btn-sm btn-icon" onClick={() => setShowLogPanel(false)}>
              Close
            </button>
          </div>
          <pre className="logs-content">{build.logs || 'No logs available'}</pre>
        </div>
      )}
    </div>
  );
}

export default PipelineView;
