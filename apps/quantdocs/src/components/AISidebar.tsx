'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import { Button, LoadingState } from '@quant/shared-ui';

interface AIAction {
  id: string;
  label: string;
  icon: string;
}

const AI_ACTIONS: AIAction[] = [
  { id: 'rewrite', label: 'Rewrite', icon: '\u270E' },
  { id: 'summarize', label: 'Summarize', icon: '\u2211' },
  { id: 'translate', label: 'Translate', icon: '\u{1F310}' },
  { id: 'fix-grammar', label: 'Fix Grammar', icon: '\u2713' },
  { id: 'generate-diagram', label: 'Generate Diagram', icon: '\u25A6' },
];

interface AISidebarProps {
  onAction?: (actionId: string) => void;
}

export function AISidebar({ onAction }: AISidebarProps) {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const handleAction = (actionId: string) => {
    setActiveAction(actionId);
    setResult(null);
    onAction?.(actionId);
  };

  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: 'spring', ...spring.gentle }}
      className="w-72 lg:w-80 border-l border-[var(--quant-border)] flex flex-col h-full bg-[var(--quant-background)]"
      aria-label="AI assistant panel"
    >
      <div className="p-3 border-b border-[var(--quant-border)]">
        <h2 className="text-sm font-semibold">AI Assistant</h2>
      </div>

      <div className="p-3 space-y-2">
        <p className="text-xs text-[var(--quant-muted-foreground)] mb-3">
          Select an action to apply to the current document or selection.
        </p>
        {AI_ACTIONS.map((action, index) => (
          <motion.div
            key={action.id}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', ...spring.gentle, delay: index * 0.04 }}
          >
            <Button
              variant={activeAction === action.id ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => handleAction(action.id)}
              aria-label={action.label}
              className="w-full min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
            >
              <span className="mr-2" aria-hidden="true">
                {action.icon}
              </span>
              {action.label}
            </Button>
          </motion.div>
        ))}
      </div>

      {result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'spring', ...spring.gentle }}
          className="flex-1 overflow-y-auto p-3 border-t border-[var(--quant-border)]"
        >
          <h3 className="text-xs font-medium text-[var(--quant-muted-foreground)] mb-2">Result</h3>
          <div className="text-sm bg-[var(--quant-muted)] rounded-md p-3">{result}</div>
        </motion.div>
      )}

      {!result && activeAction && (
        <div className="flex-1 flex items-center justify-center p-3">
          <LoadingState text="Processing..." />
        </div>
      )}
    </motion.aside>
  );
}
