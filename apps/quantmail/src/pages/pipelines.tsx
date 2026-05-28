// ============================================================================
// QuantMail - Pipelines Page (Full Rewrite)
// CI/CD view: pipeline list, YAML editor, workflow DAG, build logs, env vars
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { sanitizeCodeHighlight } from '@quant/shared-ui';

interface Pipeline {
  id: string;
  name: string;
  status: 'success' | 'failed' | 'running' | 'pending' | 'cancelled';
  branch: string;
  commit: { sha: string; message: string; author: string };
  duration: number;
  startedAt: string;
  finishedAt?: string;
  stages: PipelineStage[];
  triggeredBy: string;
  workflowFile: string;
}

interface PipelineStage {
  id: string;
  name: string;
  status: 'success' | 'failed' | 'running' | 'pending' | 'skipped';
  duration: number;
  jobs: PipelineJob[];
  dependsOn: string[];
}

interface PipelineJob {
  id: string;
  name: string;
  status: 'success' | 'failed' | 'running' | 'pending' | 'skipped';
  duration: number;
  logs: string[];
  runner: string;
}

interface EnvVariable {
  key: string;
  value: string;
  isSecret: boolean;
  environment: string;
}

interface PipelinesPageProps {
  repoId?: string;
}

const STATUS_COLORS: Record<string, string> = {
  success: '#28a745',
  failed: '#dc3545',
  running: '#0d6efd',
  pending: '#6c757d',
  cancelled: '#ffc107',
  skipped: '#adb5bd',
};

const STATUS_ICONS: Record<string, string> = {
  success: '\u2713',
  failed: '\u2717',
  running: '\u27F3',
  pending: '\u25CB',
  cancelled: '\u25A0',
  skipped: '\u25CB',
};

export const PipelinesPage: React.FC<PipelinesPageProps> = ({ repoId }) => {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [activeView, setActiveView] = useState<'list' | 'yaml' | 'dag' | 'logs' | 'env'>('list');
  const [yamlContent, setYamlContent] = useState<string>('');
  const [yamlEditing, setYamlEditing] = useState<boolean>(false);
  const [yamlSaving, setYamlSaving] = useState<boolean>(false);
  const [selectedJob, setSelectedJob] = useState<PipelineJob | null>(null);
  const [envVars, setEnvVars] = useState<EnvVariable[]>([]);
  const [newEnvKey, setNewEnvKey] = useState<string>('');
  const [newEnvValue, setNewEnvValue] = useState<string>('');
  const [newEnvSecret, setNewEnvSecret] = useState<boolean>(false);
  const [newEnvEnvironment, setNewEnvEnvironment] = useState<string>('production');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterBranch, setFilterBranch] = useState<string>('');
  const [triggering, setTriggering] = useState<boolean>(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const fetchPipelines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterBranch) params.set('branch', filterBranch);
      const response = await fetch(`/api/ci-cd/pipelines?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!response.ok) throw new Error('Failed to fetch pipelines');
      const data = await response.json();
      setPipelines(data.pipelines || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pipelines');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterBranch]);

  const fetchYamlConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/ci-cd/config', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (response.ok) {
        const data = await response.json();
        setYamlContent(
          data.content ||
            '# Pipeline configuration\nstages:\n  - build\n  - test\n  - deploy\n\nbuild:\n  stage: build\n  script:\n    - npm install\n    - npm run build\n  artifacts:\n    paths:\n      - dist/\n\ntest:\n  stage: test\n  script:\n    - npm run test\n  coverage: /Coverage: (\\d+\\.\\d+)%/\n\ndeploy_staging:\n  stage: deploy\n  script:\n    - npm run deploy:staging\n  environment:\n    name: staging\n  only:\n    - develop\n\ndeploy_production:\n  stage: deploy\n  script:\n    - npm run deploy:production\n  environment:\n    name: production\n  only:\n    - main\n  when: manual',
        );
      }
    } catch (err) {
      console.error('Failed to fetch YAML:', err);
    }
  }, []);

  const fetchEnvVars = useCallback(async () => {
    try {
      const response = await fetch('/api/ci-cd/env-vars', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (response.ok) {
        const data = await response.json();
        setEnvVars(data.variables || []);
      }
    } catch (err) {
      console.error('Failed to fetch env vars:', err);
    }
  }, []);

  useEffect(() => {
    fetchPipelines();
  }, [fetchPipelines]);
  useEffect(() => {
    if (activeView === 'yaml') fetchYamlConfig();
    if (activeView === 'env') fetchEnvVars();
  }, [activeView, fetchYamlConfig, fetchEnvVars]);

  useEffect(() => {
    if (selectedJob && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [selectedJob]);

  const handleTriggerPipeline = useCallback(async (branch: string) => {
    setTriggering(true);
    try {
      const response = await fetch('/api/ci-cd/pipelines/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ branch }),
      });
      if (!response.ok) throw new Error('Failed to trigger pipeline');
      const newPipeline = await response.json();
      setPipelines((prev) => [newPipeline, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger pipeline');
    } finally {
      setTriggering(false);
    }
  }, []);

  const handleSaveYaml = useCallback(async () => {
    setYamlSaving(true);
    try {
      const response = await fetch('/api/ci-cd/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ content: yamlContent }),
      });
      if (!response.ok) throw new Error('Failed to save configuration');
      setYamlEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setYamlSaving(false);
    }
  }, [yamlContent]);

  const handleAddEnvVar = useCallback(async () => {
    if (!newEnvKey.trim()) return;
    try {
      const response = await fetch('/api/ci-cd/env-vars', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          key: newEnvKey,
          value: newEnvValue,
          isSecret: newEnvSecret,
          environment: newEnvEnvironment,
        }),
      });
      if (response.ok) {
        const newVar = await response.json();
        setEnvVars((prev) => [...prev, newVar]);
        setNewEnvKey('');
        setNewEnvValue('');
        setNewEnvSecret(false);
      }
    } catch (err) {
      console.error('Failed to add env var:', err);
    }
  }, [newEnvKey, newEnvValue, newEnvSecret, newEnvEnvironment]);

  const handleDeleteEnvVar = useCallback(async (key: string) => {
    try {
      await fetch(`/api/ci-cd/env-vars/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setEnvVars((prev) => prev.filter((v) => v.key !== key));
    } catch (err) {
      console.error('Failed to delete env var:', err);
    }
  }, []);

  const handleCancelPipeline = useCallback(async (pipelineId: string) => {
    try {
      await fetch(`/api/ci-cd/pipelines/${pipelineId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setPipelines((prev) =>
        prev.map((p) => (p.id === pipelineId ? { ...p, status: 'cancelled' as const } : p)),
      );
    } catch (err) {
      console.error('Failed to cancel pipeline:', err);
    }
  }, []);

  const handleRetryPipeline = useCallback(async (pipelineId: string) => {
    try {
      const response = await fetch(`/api/ci-cd/pipelines/${pipelineId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (response.ok) {
        const retried = await response.json();
        setPipelines((prev) => [retried, ...prev]);
      }
    } catch (err) {
      console.error('Failed to retry pipeline:', err);
    }
  }, []);

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const renderAnsiLog = (line: string): string => {
    return line
      .replace(/\x1b\[32m/g, '<span style="color:#28a745">')
      .replace(/\x1b\[31m/g, '<span style="color:#dc3545">')
      .replace(/\x1b\[33m/g, '<span style="color:#ffc107">')
      .replace(/\x1b\[36m/g, '<span style="color:#17a2b8">')
      .replace(/\x1b\[1m/g, '<span style="font-weight:bold">')
      .replace(/\x1b\[0m/g, '</span>')
      .replace(/\x1b\[\d+m/g, '');
  };

  const filteredPipelines = useMemo(() => pipelines, [pipelines]);

  if (error && pipelines.length === 0) {
    return (
      <div className="pipelines-error">
        <h2>Failed to Load Pipelines</h2>
        <p>{error}</p>
        <button onClick={fetchPipelines}>Retry</button>
      </div>
    );
  }

  return (
    <div className="pipelines-page">
      <header className="pipelines-header">
        <h1>CI/CD Pipelines</h1>
        <div className="header-actions">
          <button
            onClick={() => handleTriggerPipeline('main')}
            disabled={triggering}
            className="trigger-btn"
          >
            {triggering ? 'Triggering...' : 'Run Pipeline'}
          </button>
        </div>
      </header>

      <nav className="pipeline-views">
        <button
          onClick={() => setActiveView('list')}
          className={activeView === 'list' ? 'active' : ''}
        >
          Pipelines
        </button>
        <button
          onClick={() => setActiveView('yaml')}
          className={activeView === 'yaml' ? 'active' : ''}
        >
          Configuration
        </button>
        <button
          onClick={() => setActiveView('dag')}
          className={activeView === 'dag' ? 'active' : ''}
        >
          Workflow DAG
        </button>
        <button
          onClick={() => setActiveView('logs')}
          className={activeView === 'logs' ? 'active' : ''}
        >
          Build Logs
        </button>
        <button
          onClick={() => setActiveView('env')}
          className={activeView === 'env' ? 'active' : ''}
        >
          Environment
        </button>
      </nav>

      {activeView === 'list' && (
        <div className="pipeline-list-view">
          <div className="pipeline-filters">
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="success">Passed</option>
              <option value="failed">Failed</option>
              <option value="running">Running</option>
              <option value="pending">Pending</option>
            </select>
            <input
              type="text"
              placeholder="Filter by branch..."
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
            />
          </div>
          {loading ? (
            <div className="loading-state">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="pipeline-skeleton"></div>
              ))}
            </div>
          ) : filteredPipelines.length === 0 ? (
            <div className="empty-state">
              <h3>No pipelines found</h3>
              <p>Run your first pipeline to see results here.</p>
            </div>
          ) : (
            <div className="pipeline-items">
              {filteredPipelines.map((pipeline) => (
                <div
                  key={pipeline.id}
                  className="pipeline-item"
                  onClick={() => {
                    setSelectedPipeline(pipeline);
                    setActiveView('dag');
                  }}
                >
                  <div
                    className="pipeline-status"
                    style={{ color: STATUS_COLORS[pipeline.status] }}
                  >
                    <span className="status-icon">{STATUS_ICONS[pipeline.status]}</span>
                  </div>
                  <div className="pipeline-info">
                    <div className="pipeline-name">{pipeline.name}</div>
                    <div className="pipeline-meta">
                      <span className="pipeline-branch">{pipeline.branch}</span>
                      <span className="pipeline-commit" title={pipeline.commit.message}>
                        {pipeline.commit.sha.slice(0, 7)}
                      </span>
                      <span className="pipeline-trigger">by {pipeline.triggeredBy}</span>
                    </div>
                  </div>
                  <div className="pipeline-stages-mini">
                    {pipeline.stages.map((stage) => (
                      <span
                        key={stage.id}
                        className="stage-dot"
                        style={{ backgroundColor: STATUS_COLORS[stage.status] }}
                        title={`${stage.name}: ${stage.status}`}
                      ></span>
                    ))}
                  </div>
                  <div className="pipeline-timing">
                    <span className="pipeline-duration">{formatDuration(pipeline.duration)}</span>
                    <span className="pipeline-date">
                      {new Date(pipeline.startedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="pipeline-actions">
                    {pipeline.status === 'running' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelPipeline(pipeline.id);
                        }}
                      >
                        Cancel
                      </button>
                    )}
                    {pipeline.status === 'failed' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetryPipeline(pipeline.id);
                        }}
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeView === 'yaml' && (
        <div className="yaml-editor-view">
          <div className="yaml-toolbar">
            <span className="yaml-filename">.quantmail-ci.yml</span>
            {yamlEditing ? (
              <>
                <button onClick={handleSaveYaml} disabled={yamlSaving}>
                  {yamlSaving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setYamlEditing(false)}>Cancel</button>
              </>
            ) : (
              <button onClick={() => setYamlEditing(true)}>Edit</button>
            )}
          </div>
          <div className="yaml-editor">
            <div className="line-numbers">
              {yamlContent.split('\n').map((_, i) => (
                <div key={i} className="line-num">
                  {i + 1}
                </div>
              ))}
            </div>
            {yamlEditing ? (
              <textarea
                className="yaml-textarea"
                value={yamlContent}
                onChange={(e) => setYamlContent(e.target.value)}
                spellCheck={false}
              />
            ) : (
              <pre className="yaml-display">
                <code>{yamlContent}</code>
              </pre>
            )}
          </div>
        </div>
      )}

      {activeView === 'dag' && selectedPipeline && (
        <div className="dag-view">
          <h2>Workflow: {selectedPipeline.name}</h2>
          <div className="dag-graph">
            {selectedPipeline.stages.map((stage, idx) => (
              <div key={stage.id} className="dag-stage">
                {idx > 0 && (
                  <div className="dag-connector">
                    <div className="connector-line"></div>
                    <div className="connector-arrow">&#x2192;</div>
                  </div>
                )}
                <div className="dag-node" style={{ borderColor: STATUS_COLORS[stage.status] }}>
                  <div
                    className="node-header"
                    style={{ backgroundColor: STATUS_COLORS[stage.status] }}
                  >
                    <span className="node-status">{STATUS_ICONS[stage.status]}</span>
                    <span className="node-name">{stage.name}</span>
                  </div>
                  <div className="node-jobs">
                    {stage.jobs.map((job) => (
                      <div
                        key={job.id}
                        className="node-job"
                        onClick={() => {
                          setSelectedJob(job);
                          setActiveView('logs');
                        }}
                      >
                        <span style={{ color: STATUS_COLORS[job.status] }}>
                          {STATUS_ICONS[job.status]}
                        </span>
                        <span>{job.name}</span>
                        <span className="job-duration">{formatDuration(job.duration)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="node-duration">{formatDuration(stage.duration)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeView === 'logs' && (
        <div className="logs-view">
          <div className="logs-sidebar">
            <h3>Jobs</h3>
            {selectedPipeline?.stages
              .flatMap((s) => s.jobs)
              .map((job) => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className={`job-select ${selectedJob?.id === job.id ? 'active' : ''}`}
                >
                  <span style={{ color: STATUS_COLORS[job.status] }}>
                    {STATUS_ICONS[job.status]}
                  </span>
                  {job.name}
                </button>
              ))}
          </div>
          <div className="logs-content" ref={logContainerRef}>
            {selectedJob ? (
              <>
                <div className="log-header">
                  <h3>{selectedJob.name}</h3>
                  <span className="log-runner">Runner: {selectedJob.runner}</span>
                  <span className="log-duration">{formatDuration(selectedJob.duration)}</span>
                </div>
                <pre className="log-output">
                  {selectedJob.logs.map((line, i) => (
                    <div key={i} className="log-line">
                      <span className="log-line-num">{i + 1}</span>
                      <span
                        className="log-line-content"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeCodeHighlight(renderAnsiLog(line)),
                        }}
                      ></span>
                    </div>
                  ))}
                </pre>
              </>
            ) : (
              <div className="empty-state">
                <p>Select a job to view its logs.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === 'env' && (
        <div className="env-vars-view">
          <h2>Environment Variables</h2>
          <div className="add-env-form">
            <input
              type="text"
              placeholder="KEY"
              value={newEnvKey}
              onChange={(e) => setNewEnvKey(e.target.value.toUpperCase())}
            />
            <input
              type={newEnvSecret ? 'password' : 'text'}
              placeholder="Value"
              value={newEnvValue}
              onChange={(e) => setNewEnvValue(e.target.value)}
            />
            <select
              value={newEnvEnvironment}
              onChange={(e) => setNewEnvEnvironment(e.target.value)}
            >
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
              <option value="all">All</option>
            </select>
            <label className="secret-toggle">
              <input
                type="checkbox"
                checked={newEnvSecret}
                onChange={(e) => setNewEnvSecret(e.target.checked)}
              />{' '}
              Secret
            </label>
            <button onClick={handleAddEnvVar} disabled={!newEnvKey.trim()}>
              Add
            </button>
          </div>
          <table className="env-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
                <th>Environment</th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {envVars.map((v) => (
                <tr key={v.key}>
                  <td className="env-key">
                    <code>{v.key}</code>
                  </td>
                  <td className="env-value">{v.isSecret ? '********' : v.value}</td>
                  <td>{v.environment}</td>
                  <td>{v.isSecret ? 'Secret' : 'Variable'}</td>
                  <td>
                    <button onClick={() => handleDeleteEnvVar(v.key)} className="delete-btn">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PipelinesPage;
