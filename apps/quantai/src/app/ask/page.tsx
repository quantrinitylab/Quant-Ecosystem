'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AnimatedPage, AppShell, Sidebar } from '@quant/shared-ui';
import type { SidebarItem } from '@quant/shared-ui';
import { useModelSelector } from '../../hooks/useModelSelector';
import { PROVIDER_COLORS } from '../../types/models';

const SUGGESTION_CARDS = [
  { id: 'email', label: 'Summarize my unread emails', icon: '📧', color: '#EF4444' },
  { id: 'calendar', label: 'Schedule a meeting with...', icon: '📅', color: '#F59E0B' },
  { id: 'docs', label: 'Draft a document about...', icon: '📝', color: '#3B82F6' },
  { id: 'drive', label: 'Search my Drive for...', icon: '📂', color: '#10B981' },
  { id: 'analytics', label: 'Analyze my ad performance', icon: '📊', color: '#8B5CF6' },
  { id: 'social', label: 'Create a social post', icon: '📤', color: '#EC4899' },
];

const sidebarItems: SidebarItem[] = [
  { id: 'chat', label: 'Chat', icon: <span>💬</span>, href: '/' },
  { id: 'ask', label: 'Ask Quant', icon: <span>🚀</span>, active: true },
  { id: 'settings', label: 'Settings', icon: <span>⚙️</span> },
];

export default function AskQuantPage() {
  const { currentModel } = useModelSelector();
  const [query, setQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsSubmitting(true);
    // Placeholder: in future this routes to the agentic orchestration layer
    setTimeout(() => setIsSubmitting(false), 1000);
  };

  const handleSuggestionClick = (label: string) => {
    setQuery(label);
  };

  return (
    <AppShell
      sidebar={
        <Sidebar items={sidebarItems} header={<h2 className="text-lg font-semibold">QuantAI</h2>} />
      }
    >
      <AnimatedPage>
        <div className="flex flex-col items-center justify-center min-h-full p-6">
          {/* Model indicator */}
          <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--quant-surface)] border border-[var(--quant-border)] text-xs">
            <span>{currentModel.icon}</span>
            <span className="font-medium">{currentModel.name}</span>
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: PROVIDER_COLORS[currentModel.provider] }}
            />
          </div>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-center mb-10"
          >
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              Ask Quant
            </h1>
            <p className="mt-2 text-[var(--quant-text-secondary)] text-sm sm:text-base">
              Cross-app orchestration powered by AI
            </p>
          </motion.div>

          {/* Input */}
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            onSubmit={handleSubmit}
            className="w-full max-w-2xl mb-10"
          >
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask Quant anything across your ecosystem..."
                className="w-full px-5 py-4 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] text-base placeholder:text-[var(--quant-text-secondary)] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-sm"
              />
              <button
                type="submit"
                disabled={!query.trim() || isSubmitting}
                className="absolute right-3 top-1/2 -translate-y-1/2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors"
              >
                {isSubmitting ? 'Thinking...' : 'Ask'}
              </button>
            </div>
          </motion.form>

          {/* Suggestion cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl"
          >
            {SUGGESTION_CARDS.map((card) => (
              <button
                key={card.id}
                onClick={() => handleSuggestionClick(card.label)}
                className="flex items-center gap-3 p-4 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] hover:bg-[var(--quant-surface-hover)] hover:border-[var(--quant-primary)]/30 transition-all text-left group"
              >
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
                  style={{ backgroundColor: `${card.color}15` }}
                >
                  {card.icon}
                </span>
                <span className="text-sm font-medium group-hover:text-[var(--quant-primary)] transition-colors">
                  {card.label}
                </span>
              </button>
            ))}
          </motion.div>
        </div>
      </AnimatedPage>
    </AppShell>
  );
}
