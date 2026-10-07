// ============================================================================
// QuantAI - Model Management Page
// Models come from the real backend (GET /api/models). Only fields the backend
// returns are shown - no fabricated benchmark scores, costs, or latency figures.
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';

interface AIModel {
  id: string;
  name: string;
  provider?: string;
  version?: string;
  capabilities?: string[];
  description?: string;
  icon?: string;
  contextWindow?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  latencyMs?: number;
  maxContext?: number;
  isAvailable?: boolean;
  isDefault?: boolean;
}

const CAPABILITY_COLORS: Record<string, string> = {
  text: '#3b82f6',
  vision: '#8b5cf6',
  code: '#10b981',
  reasoning: '#f59e0b',
  'function-calling': '#ef4444',
  analysis: '#06b6d4',
  audio: '#ec4899',
  video: '#f97316',
  tools: '#14b8a6',
  creative: '#d946ef',
  multilingual: '#84cc16',
  multimodal: '#f43f5e',
};

export default function ModelsPage(): JSX.Element {
  const [models, setModels] = useState<AIModel[]>([]);
  const [defaultModel, setDefaultModel] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/models');
        const data = (await res.json().catch(() => ({}))) as {
          models?: AIModel[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || 'Could not load models');
        }
        const list = Array.isArray(data) ? (data as unknown as AIModel[]) : (data.models ?? []);
        if (!cancelled) {
          setModels(list);
          const def = list.find((m) => m.isDefault);
          if (def) setDefaultModel(def.id);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load models');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedModels = useMemo(() => {
    return [...models].sort((a, b) => a.name.localeCompare(b.name));
  }, [models]);

  const handleSetDefault = useCallback((modelId: string) => {
    setDefaultModel(modelId);
  }, []);

  if (error) {
    return (
      <div className="models-page error-state">
        <h2>Failed to load models</h2>
        <p>{error}</p>
        <button onClick={() => setError(null)}>Retry</button>
      </div>
    );
  }

  return (
    <div className="models-page">
      <header className="models-header">
        <h1>AI Models</h1>
      </header>

      {isLoading ? (
        <div className="loading-models">
          <p>Loading models...</p>
        </div>
      ) : sortedModels.length === 0 ? (
        <div className="empty-models">
          <p>No models available.</p>
        </div>
      ) : (
        <section className="models-grid">
          {sortedModels.map((model) => {
            const capabilities = model.capabilities || [];
            const context = model.maxContext ?? model.contextWindow;
            return (
              <div
                key={model.id}
                className={`model-card ${defaultModel === model.id ? 'is-default' : ''}`}
              >
                <div className="card-header">
                  <div className="model-identity">
                    <h3>
                      {model.icon && <span className="model-icon">{model.icon} </span>}
                      {model.name}
                    </h3>
                    {model.provider && <span className="model-provider">{model.provider}</span>}
                  </div>
                  {defaultModel === model.id && <span className="default-badge">Default</span>}
                </div>

                {model.description && <p className="model-description">{model.description}</p>}

                {capabilities.length > 0 && (
                  <div className="capabilities-list">
                    {capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="capability-badge"
                        style={{ backgroundColor: CAPABILITY_COLORS[cap] || '#6b7280' }}
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                )}

                <div className="model-stats">
                  {context !== undefined && (
                    <div className="stat-row">
                      <span className="stat-label">Context</span>
                      <span className="stat-value">{(context / 1000).toFixed(0)}K tokens</span>
                    </div>
                  )}
                  {model.version && (
                    <div className="stat-row">
                      <span className="stat-label">Version</span>
                      <span className="stat-value">{model.version}</span>
                    </div>
                  )}
                  {model.isAvailable !== undefined && (
                    <div className="stat-row">
                      <span className="stat-label">Status</span>
                      <span className="stat-value">
                        {model.isAvailable ? 'Available' : 'Unavailable'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="card-actions">
                  <button
                    className={`btn-set-default ${defaultModel === model.id ? 'current' : ''}`}
                    onClick={() => handleSetDefault(model.id)}
                    disabled={defaultModel === model.id}
                  >
                    {defaultModel === model.id ? '✓ Default' : 'Set Default'}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
