// ============================================================================
// QuantAI - Model Card Component
// ============================================================================

import type { AIModel } from '../types';

interface ModelCardProps {
  model: AIModel;
  onSelect: () => void;
  isSelected: boolean;
}

export function ModelCard({ model, onSelect, isSelected }: ModelCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-[20px] border p-4 transition-all min-h-[44px] ${
        isSelected
          ? 'border-[var(--quant-accent)] bg-[var(--quant-accent)]/10'
          : 'border-[var(--quant-border)] bg-[var(--quant-surface)] hover:border-[var(--quant-border-strong)]'
      } ${model.status === 'deprecated' ? 'opacity-60' : ''}`}
      aria-label={`${model.name} by ${model.provider}${isSelected ? ', selected' : ''}`}
      aria-pressed={isSelected}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-[var(--quant-foreground)] truncate">{model.name}</h3>
        <span className="text-xs text-[var(--quant-muted-foreground)] ml-2 flex-shrink-0">{model.provider}</span>
      </div>

      {/* Capabilities */}
      <div className="flex flex-wrap gap-1 mb-3" aria-label="Capabilities">
        {model.capabilities.map((cap) => (
          <span
            key={cap}
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[var(--quant-surface-hover)] text-[var(--quant-muted-foreground)]"
          >
            {cap}
          </span>
        ))}
      </div>

      {/* Specs */}
      <div className="grid grid-cols-3 gap-2 text-xs" aria-label="Model specifications">
        <div className="flex flex-col">
          <span className="text-[var(--quant-muted-foreground)]">Context</span>
          <span className="text-[var(--quant-foreground)] font-medium">{model.contextWindow / 1000}K</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[var(--quant-muted-foreground)]">Latency</span>
          <span className="text-[var(--quant-foreground)] font-medium">{model.latencyMs}ms</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[var(--quant-muted-foreground)]">Cost</span>
          <span className="text-[var(--quant-foreground)] font-medium">${model.costPer1kTokens.input}/1K in</span>
        </div>
      </div>

      {/* Fine-tuned Badge */}
      {model.isFineTuned && (
        <span className="inline-flex items-center mt-3 px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--quant-success)]/10 text-[var(--quant-success)] border border-[var(--quant-success)]/30">
          Fine-tuned
        </span>
      )}
    </button>
  );
}

export default ModelCard;
