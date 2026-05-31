'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import type { AIModel } from '../types/models';
import { PROVIDER_COLORS } from '../types/models';

interface ModelSelectorProps {
  currentModel: AIModel;
  models: AIModel[];
  onSelect: (modelId: string) => void;
  className?: string;
}

function formatContextWindow(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(0)}M`;
  return `${(tokens / 1000).toFixed(0)}K`;
}

export function ModelSelector({
  currentModel,
  models,
  onSelect,
  className = '',
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--quant-border)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] transition-colors text-sm min-h-[44px]"
        aria-label="Select AI model"
        aria-expanded={isOpen}
      >
        <span className="text-base">{currentModel.icon}</span>
        <span className="font-medium text-[var(--foreground)]">{currentModel.name}</span>
        <motion.svg
          className="w-3.5 h-3.5 text-[var(--foreground-secondary)]"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: 'spring', ...spring.stiff }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ type: 'spring', ...spring.stiff }}
            className="absolute top-full left-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-[var(--quant-border)] bg-[var(--surface-elevated)] shadow-lg z-50"
          >
            <div className="p-2 space-y-1">
              {models.map((model) => (
                <motion.button
                  key={model.id}
                  onClick={() => {
                    onSelect(model.id);
                    setIsOpen(false);
                  }}
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: 'spring', ...spring.snappy }}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    model.id === currentModel.id
                      ? 'bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30'
                      : 'hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{model.icon}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-[var(--foreground)]">
                            {model.name}
                          </span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white"
                            style={{ backgroundColor: PROVIDER_COLORS[model.provider] }}
                          >
                            {model.provider}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">
                          {model.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--foreground-secondary)]">
                        {formatContextWindow(model.contextWindow)}
                      </span>
                      {model.id === currentModel.id && (
                        <svg
                          className="w-4 h-4 text-[var(--brand-primary)]"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2 ml-8">
                    {model.capabilities.slice(0, 4).map((cap) => (
                      <span
                        key={cap}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-hover)] text-[var(--foreground-secondary)]"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ModelSelector;
