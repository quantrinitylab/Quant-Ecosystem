// ============================================================================
// QuantMail - Pipeline Graph Component
// DAG visualization: stage nodes, status colors, connecting arrows, logs
// ============================================================================

import React, { useState, useCallback, useMemo } from 'react';

interface PipelineJob {
  id: string;
  name: string;
  status: 'success' | 'failed' | 'running' | 'pending' | 'skipped' | 'cancelled';
  duration: number;
  startedAt?: string;
  finishedAt?: string;
  logs: string[];
  runner?: string;
  retryCount: number;
}

interface PipelineStage {
  id: string;
  name: string;
  status: 'success' | 'failed' | 'running' | 'pending' | 'skipped';
  jobs: PipelineJob[];
  dependsOn: string[];
  duration: number;
  startedAt?: string;
}

interface PipelineGraphProps {
  stages: PipelineStage[];
  onJobClick?: (job: PipelineJob) => void;
  onStageRetry?: (stageId: string) => void;
  onJobCancel?: (jobId: string) => void;
  showLogs?: boolean;
  animated?: boolean;
}

const STATUS_STYLES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  success: { bg: '#d4edda', border: '#28a745', text: '#155724', icon: '\u2713' },
  failed: { bg: '#f8d7da', border: '#dc3545', text: '#721c24', icon: '\u2717' },
  running: { bg: '#cce5ff', border: '#0d6efd', text: '#004085', icon: '\u27F3' },
  pending: { bg: '#e2e3e5', border: '#6c757d', text: '#383d41', icon: '\u25CB' },
  skipped: { bg: '#f5f5f5', border: '#adb5bd', text: '#6c757d', icon: '\u23ED' },
  cancelled: { bg: '#fff3cd', border: '#ffc107', text: '#856404', icon: '\u25A0' },
};

const formatDuration = (seconds: number): string => {
  if (seconds < 1) return '<1s';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

export const PipelineGraph: React.FC<PipelineGraphProps> = ({
  stages,
  onJobClick,
  onStageRetry,
  onJobCancel,
  showLogs = false,
  animated = true
}) => {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<PipelineJob | null>(null);
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);

  const stageColumns = useMemo(() => {
    const columns: PipelineStage[][] = [];
    const placed = new Set<string>();
    const stageMap = new Map(stages.map(s => [s.id, s]));

    const getColumn = (stage: PipelineStage): number => {
      if (stage.dependsOn.length === 0) return 0;
      let maxDepCol = 0;
      for (const depId of stage.dependsOn) {
        const depStage = stageMap.get(depId);
        if (depStage) {
          maxDepCol = Math.max(maxDepCol, getColumn(depStage) + 1);
        }
      }
      return maxDepCol;
    };

    stages.forEach(stage => {
      const col = getColumn(stage);
      while (columns.length <= col) columns.push([]);
      columns[col].push(stage);
      placed.add(stage.id);
    });

    return columns;
  }, [stages]);

  const connections = useMemo(() => {
    const conns: { from: string; to: string; status: string }[] = [];
    stages.forEach(stage => {
      stage.dependsOn.forEach(depId => {
        const depStage = stages.find(s => s.id === depId);
        if (depStage) {
          conns.push({ from: depId, to: stage.id, status: stage.status });
        }
      });
    });
    return conns;
  }, [stages]);

  const totalDuration = useMemo(() => stages.reduce((sum, s) => sum + s.duration, 0), [stages]);

  const handleJobClick = useCallback((job: PipelineJob) => {
    setSelectedJob(job);
    if (onJobClick) onJobClick(job);
  }, [onJobClick]);

  const handleStageToggle = useCallback((stageId: string) => {
    setExpandedStage(prev => prev === stageId ? null : stageId);
  }, []);

  const overallStatus = useMemo(() => {
    if (stages.some(s => s.status === 'failed')) return 'failed';
    if (stages.some(s => s.status === 'running')) return 'running';
    if (stages.every(s => s.status === 'success' || s.status === 'skipped')) return 'success';
    return 'pending';
  }, [stages]);

  return (
    <div className="pipeline-graph">
      <div className="graph-header">
        <div className="pipeline-status-summary">
          <span className="overall-status" style={{ color: STATUS_STYLES[overallStatus].border }}>
            {STATUS_STYLES[overallStatus].icon} Pipeline {overallStatus}
          </span>
          <span className="total-duration">Total: {formatDuration(totalDuration)}</span>
          <span className="stage-count">{stages.length} stages, {stages.reduce((sum, s) => sum + s.jobs.length, 0)} jobs</span>
        </div>
      </div>

      <div className="graph-canvas">
        <div className="graph-columns">
          {stageColumns.map((column, colIdx) => (
            <div key={colIdx} className="graph-column">
              {colIdx > 0 && (
                <div className="connector-column">
                  {column.map(stage => (
                    <div key={`conn-${stage.id}`} className="connector-line">
                      <svg width="40" height="30" viewBox="0 0 40 30">
                        <line x1="0" y1="15" x2="40" y2="15" stroke={STATUS_STYLES[stage.status].border} strokeWidth="2" strokeDasharray={stage.status === 'pending' ? '4,4' : 'none'} />
                        <polygon points="35,10 40,15 35,20" fill={STATUS_STYLES[stage.status].border} />
                      </svg>
                    </div>
                  ))}
                </div>
              )}
              <div className="stage-column">
                {column.map(stage => {
                  const style = STATUS_STYLES[stage.status];
                  const isExpanded = expandedStage === stage.id;
                  const isHovered = hoveredStage === stage.id;
                  return (
                    <div
                      key={stage.id}
                      className={`stage-node ${isExpanded ? 'expanded' : ''} ${animated && stage.status === 'running' ? 'pulse' : ''}`}
                      style={{ borderColor: style.border, backgroundColor: isHovered ? style.bg : 'white' }}
                      onClick={() => handleStageToggle(stage.id)}
                      onMouseEnter={() => setHoveredStage(stage.id)}
                      onMouseLeave={() => setHoveredStage(null)}
                    >
                      <div className="stage-header" style={{ backgroundColor: style.bg }}>
                        <span className="stage-icon" style={{ color: style.border }}>{style.icon}</span>
                        <span className="stage-name" style={{ color: style.text }}>{stage.name}</span>
                        <span className="stage-duration">{formatDuration(stage.duration)}</span>
                      </div>
                      <div className="stage-jobs-mini">
                        {stage.jobs.map(job => (
                          <span key={job.id} className="job-dot" style={{ backgroundColor: STATUS_STYLES[job.status].border }} title={`${job.name}: ${job.status}`}></span>
                        ))}
                      </div>
                      {isExpanded && (
                        <div className="stage-details">
                          <div className="jobs-list">
                            {stage.jobs.map(job => {
                              const jobStyle = STATUS_STYLES[job.status];
                              return (
                                <div key={job.id} className="job-item" onClick={(e) => { e.stopPropagation(); handleJobClick(job); }} style={{ borderLeftColor: jobStyle.border }}>
                                  <div className="job-header">
                                    <span className="job-icon" style={{ color: jobStyle.border }}>{jobStyle.icon}</span>
                                    <span className="job-name">{job.name}</span>
                                    <span className="job-duration">{formatDuration(job.duration)}</span>
                                  </div>
                                  <div className="job-meta">
                                    {job.runner && <span className="job-runner">Runner: {job.runner}</span>}
                                    {job.retryCount > 0 && <span className="job-retry">Retry #{job.retryCount}</span>}
                                  </div>
                                  {job.status === 'running' && onJobCancel && (
                                    <button onClick={(e) => { e.stopPropagation(); onJobCancel(job.id); }} className="cancel-job-btn">Cancel</button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {stage.status === 'failed' && onStageRetry && (
                            <button onClick={(e) => { e.stopPropagation(); onStageRetry(stage.id); }} className="retry-stage-btn">Retry Stage</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showLogs && selectedJob && (
        <div className="job-logs-panel">
          <div className="logs-header">
            <h4>{selectedJob.name} - Logs</h4>
            <span className="job-status-badge" style={{ color: STATUS_STYLES[selectedJob.status].border }}>{STATUS_STYLES[selectedJob.status].icon} {selectedJob.status}</span>
            <button onClick={() => setSelectedJob(null)} className="close-logs">\u2715</button>
          </div>
          <pre className="logs-content">
            {selectedJob.logs.length === 0 ? (
              <span className="no-logs">No logs available for this job.</span>
            ) : (
              selectedJob.logs.map((line, i) => (
                <div key={i} className="log-line"><span className="log-num">{i + 1}</span><span className="log-text">{line}</span></div>
              ))
            )}
          </pre>
        </div>
      )}

      <div className="graph-legend">
        {Object.entries(STATUS_STYLES).map(([status, style]) => (
          <span key={status} className="legend-item"><span className="legend-dot" style={{ backgroundColor: style.border }}></span>{status}</span>
        ))}
      </div>
    </div>
  );
};

export default PipelineGraph;
