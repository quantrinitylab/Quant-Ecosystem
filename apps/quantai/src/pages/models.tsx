// ============================================================================
// QuantAI - Model Management Page
// Model cards grid, capability badges, cost/latency display, comparison table,
// benchmark scores, "Set Default" button
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';

interface AIModel {
  id: string;
  name: string;
  provider: string;
  version: string;
  capabilities: string[];
  costPer1kInput: number;
  costPer1kOutput: number;
  latencyMs: number;
  maxContext: number;
  benchmarks: Record<string, number>;
  isAvailable: boolean;
  releaseDate: string;
}

interface BenchmarkCategory {
  id: string;
  name: string;
  description: string;
}

const MODELS: AIModel[] = [
  {
    id: 'gpt-4', name: 'GPT-4 Turbo', provider: 'OpenAI', version: '4-turbo-2024-01',
    capabilities: ['text', 'vision', 'code', 'reasoning', 'function-calling'],
    costPer1kInput: 0.01, costPer1kOutput: 0.03, latencyMs: 850, maxContext: 128000,
    benchmarks: { mmlu: 86.4, humaneval: 87.1, math: 52.9, reasoning: 89.3, creativity: 82.0 },
    isAvailable: true, releaseDate: '2024-01-25'
  },
  {
    id: 'claude-3', name: 'Claude 3 Opus', provider: 'Anthropic', version: '3-opus-20240229',
    capabilities: ['text', 'vision', 'code', 'reasoning', 'analysis'],
    costPer1kInput: 0.015, costPer1kOutput: 0.075, latencyMs: 1200, maxContext: 200000,
    benchmarks: { mmlu: 86.8, humaneval: 84.9, math: 60.1, reasoning: 91.2, creativity: 88.5 },
    isAvailable: true, releaseDate: '2024-03-04'
  },
  {
    id: 'llama-3', name: 'Llama 3 70B', provider: 'Meta', version: '3-70b-instruct',
    capabilities: ['text', 'code', 'reasoning'],
    costPer1kInput: 0.0008, costPer1kOutput: 0.0008, latencyMs: 400, maxContext: 8192,
    benchmarks: { mmlu: 82.0, humaneval: 81.7, math: 48.5, reasoning: 80.1, creativity: 75.3 },
    isAvailable: true, releaseDate: '2024-04-18'
  },
  {
    id: 'gemini-pro', name: 'Gemini Pro 1.5', provider: 'Google', version: '1.5-pro',
    capabilities: ['text', 'vision', 'code', 'reasoning', 'audio', 'video'],
    costPer1kInput: 0.007, costPer1kOutput: 0.021, latencyMs: 600, maxContext: 1000000,
    benchmarks: { mmlu: 85.9, humaneval: 79.2, math: 58.5, reasoning: 87.8, creativity: 84.2 },
    isAvailable: true, releaseDate: '2024-05-14'
  },
  {
    id: 'mistral', name: 'Mistral Large', provider: 'Mistral AI', version: 'large-2402',
    capabilities: ['text', 'code', 'reasoning', 'function-calling'],
    costPer1kInput: 0.004, costPer1kOutput: 0.012, latencyMs: 550, maxContext: 32000,
    benchmarks: { mmlu: 81.2, humaneval: 78.4, math: 45.0, reasoning: 79.5, creativity: 77.8 },
    isAvailable: true, releaseDate: '2024-02-26'
  },
];

const BENCHMARKS: BenchmarkCategory[] = [
  { id: 'mmlu', name: 'MMLU', description: 'Massive Multitask Language Understanding' },
  { id: 'humaneval', name: 'HumanEval', description: 'Code generation accuracy' },
  { id: 'math', name: 'MATH', description: 'Mathematical reasoning' },
  { id: 'reasoning', name: 'Reasoning', description: 'Logical reasoning tasks' },
  { id: 'creativity', name: 'Creativity', description: 'Creative writing quality' },
];

const CAPABILITY_COLORS: Record<string, string> = {
  text: '#3b82f6',
  vision: '#8b5cf6',
  code: '#10b981',
  reasoning: '#f59e0b',
  'function-calling': '#ef4444',
  analysis: '#06b6d4',
  audio: '#ec4899',
  video: '#f97316',
};

export default function ModelsPage(): JSX.Element {
  const [models] = useState<AIModel[]>(MODELS);
  const [defaultModel, setDefaultModel] = useState<string>('gpt-4');
  const [comparisonSelection, setComparisonSelection] = useState<string[]>(['gpt-4', 'claude-3']);
  const [benchmarks] = useState<BenchmarkCategory[]>(BENCHMARKS);
  const [showComparison, setShowComparison] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'name' | 'cost' | 'latency' | 'context'>('name');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const sortedModels = useMemo(() => {
    return [...models].sort((a, b) => {
      switch (sortBy) {
        case 'cost': return a.costPer1kInput - b.costPer1kInput;
        case 'latency': return a.latencyMs - b.latencyMs;
        case 'context': return b.maxContext - a.maxContext;
        default: return a.name.localeCompare(b.name);
      }
    });
  }, [models, sortBy]);

  const comparedModels = useMemo(() => {
    return models.filter(m => comparisonSelection.includes(m.id));
  }, [models, comparisonSelection]);

  const handleSetDefault = useCallback((modelId: string) => {
    setDefaultModel(modelId);
  }, []);

  const handleToggleComparison = useCallback((modelId: string) => {
    setComparisonSelection(prev => {
      if (prev.includes(modelId)) {
        return prev.filter(id => id !== modelId);
      }
      if (prev.length >= 4) return prev;
      return [...prev, modelId];
    });
  }, []);

  const getLatencyColor = useCallback((latency: number) => {
    if (latency < 500) return '#10b981';
    if (latency < 1000) return '#f59e0b';
    return '#ef4444';
  }, []);

  const getLatencyWidth = useCallback((latency: number) => {
    const maxLatency = 1500;
    return Math.min((latency / maxLatency) * 100, 100);
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
        <div className="header-controls">
          <div className="sort-control">
            <label>Sort by:</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
              <option value="name">Name</option>
              <option value="cost">Cost (low to high)</option>
              <option value="latency">Latency (fast to slow)</option>
              <option value="context">Context Window</option>
            </select>
          </div>
          <button
            className={`btn-compare ${showComparison ? 'active' : ''}`}
            onClick={() => setShowComparison(!showComparison)}
          >
            📊 Compare ({comparisonSelection.length})
          </button>
        </div>
      </header>

      <section className="models-grid">
        {sortedModels.map(model => (
          <div key={model.id} className={`model-card ${defaultModel === model.id ? 'is-default' : ''}`}>
            <div className="card-header">
              <div className="model-identity">
                <h3>{model.name}</h3>
                <span className="model-provider">{model.provider}</span>
              </div>
              {defaultModel === model.id && (
                <span className="default-badge">Default</span>
              )}
            </div>

            <div className="capabilities-list">
              {model.capabilities.map(cap => (
                <span
                  key={cap}
                  className="capability-badge"
                  style={{ backgroundColor: CAPABILITY_COLORS[cap] || '#6b7280' }}
                >
                  {cap}
                </span>
              ))}
            </div>

            <div className="model-stats">
              <div className="stat-row">
                <span className="stat-label">Cost (input)</span>
                <span className="stat-value">${model.costPer1kInput}/1K tokens</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Cost (output)</span>
                <span className="stat-value">${model.costPer1kOutput}/1K tokens</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Latency</span>
                <div className="latency-bar-wrapper">
                  <div
                    className="latency-bar"
                    style={{
                      width: `${getLatencyWidth(model.latencyMs)}%`,
                      backgroundColor: getLatencyColor(model.latencyMs),
                    }}
                  />
                  <span className="latency-value">{model.latencyMs}ms</span>
                </div>
              </div>
              <div className="stat-row">
                <span className="stat-label">Context</span>
                <span className="stat-value">{(model.maxContext / 1000).toFixed(0)}K tokens</span>
              </div>
            </div>

            <div className="card-actions">
              <button
                className={`btn-set-default ${defaultModel === model.id ? 'current' : ''}`}
                onClick={() => handleSetDefault(model.id)}
                disabled={defaultModel === model.id}
              >
                {defaultModel === model.id ? '✓ Default' : 'Set Default'}
              </button>
              <label className="compare-check">
                <input
                  type="checkbox"
                  checked={comparisonSelection.includes(model.id)}
                  onChange={() => handleToggleComparison(model.id)}
                />
                Compare
              </label>
            </div>
          </div>
        ))}
      </section>

      {showComparison && comparedModels.length >= 2 && (
        <section className="comparison-section">
          <h2>Model Comparison</h2>
          <div className="comparison-table-wrapper">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  {comparedModels.map(m => (
                    <th key={m.id}>{m.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Provider</td>
                  {comparedModels.map(m => <td key={m.id}>{m.provider}</td>)}
                </tr>
                <tr>
                  <td>Context Window</td>
                  {comparedModels.map(m => <td key={m.id}>{(m.maxContext / 1000).toFixed(0)}K</td>)}
                </tr>
                <tr>
                  <td>Input Cost</td>
                  {comparedModels.map(m => <td key={m.id}>${m.costPer1kInput}</td>)}
                </tr>
                <tr>
                  <td>Output Cost</td>
                  {comparedModels.map(m => <td key={m.id}>${m.costPer1kOutput}</td>)}
                </tr>
                <tr>
                  <td>Latency</td>
                  {comparedModels.map(m => <td key={m.id}>{m.latencyMs}ms</td>)}
                </tr>
                <tr>
                  <td>Vision</td>
                  {comparedModels.map(m => <td key={m.id}>{m.capabilities.includes('vision') ? '✓' : '✗'}</td>)}
                </tr>
                <tr>
                  <td>Code</td>
                  {comparedModels.map(m => <td key={m.id}>{m.capabilities.includes('code') ? '✓' : '✗'}</td>)}
                </tr>
                {benchmarks.map(bench => (
                  <tr key={bench.id}>
                    <td>{bench.name}</td>
                    {comparedModels.map(m => (
                      <td key={m.id}>
                        <span className="bench-score">{m.benchmarks[bench.id]?.toFixed(1) || 'N/A'}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="benchmarks-section">
        <h2>Benchmark Scores</h2>
        <div className="benchmarks-chart">
          {benchmarks.map(bench => (
            <div key={bench.id} className="benchmark-row">
              <div className="bench-label">
                <span className="bench-name">{bench.name}</span>
                <span className="bench-desc">{bench.description}</span>
              </div>
              <div className="bench-bars">
                {models.map(model => (
                  <div key={model.id} className="bench-bar-item">
                    <div
                      className="bench-bar"
                      style={{ width: `${model.benchmarks[bench.id] || 0}%` }}
                      title={`${model.name}: ${model.benchmarks[bench.id]}`}
                    />
                    <span className="bench-model-label">{model.name.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
