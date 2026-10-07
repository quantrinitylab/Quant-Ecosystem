'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';

export interface Persona {
  id: string;
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
  isCustom?: boolean;
}

interface PersonaSelectorProps {
  personas: Persona[];
  activePersona: Persona | null;
  onSelect: (persona: Persona) => void;
  onCreateCustom: (persona: Omit<Persona, 'id'>) => void;
  className?: string;
}

const DEFAULT_PERSONAS: Persona[] = [
  {
    id: 'helpful-assistant',
    name: 'Helpful Assistant',
    icon: '🤖',
    description: 'General-purpose AI assistant. Balanced, informative, and friendly.',
    systemPrompt: 'You are a helpful, accurate, and friendly AI assistant.',
  },
  {
    id: 'creative-writer',
    name: 'Creative Writer',
    icon: '✍️',
    description: 'Excels at creative writing, brainstorming, and storytelling.',
    systemPrompt:
      'You are a creative writer who crafts engaging narratives and thinks imaginatively.',
  },
  {
    id: 'technical-expert',
    name: 'Technical Expert',
    icon: '💻',
    description: 'Deep technical knowledge. Code, architecture, and debugging.',
    systemPrompt:
      'You are a senior software engineer with deep technical expertise across multiple domains.',
  },
  {
    id: 'concise-responder',
    name: 'Concise Responder',
    icon: '⚡',
    description: 'Short, direct answers. No fluff, maximum clarity.',
    systemPrompt: 'You provide extremely concise responses. Be direct and brief.',
  },
];

const ICON_OPTIONS = [
  '🤖',
  '✍️',
  '💻',
  '⚡',
  '🧙',
  '🎨',
  '📊',
  '🔬',
  '🎯',
  '🧠',
  '📚',
  '🌐',
  '🛡️',
  '🚀',
  '🎵',
  '🔧',
];

export function PersonaSelector({
  personas: customPersonas,
  activePersona,
  onSelect,
  onCreateCustom,
  className = '',
}: PersonaSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSystemPrompt, setNewSystemPrompt] = useState('');
  const [newIcon, setNewIcon] = useState('🤖');

  const allPersonas = [...DEFAULT_PERSONAS, ...customPersonas];
  const current = activePersona || DEFAULT_PERSONAS[0];

  const handleSelect = useCallback(
    (persona: Persona) => {
      onSelect(persona);
      setIsOpen(false);
    },
    [onSelect],
  );

  const handleCreate = useCallback(() => {
    if (!newName.trim() || !newSystemPrompt.trim()) return;
    onCreateCustom({
      name: newName.trim(),
      icon: newIcon,
      description: newDescription.trim() || 'Custom persona',
      systemPrompt: newSystemPrompt.trim(),
      isCustom: true,
    });
    setNewName('');
    setNewDescription('');
    setNewSystemPrompt('');
    setNewIcon('🤖');
    setShowCreateForm(false);
  }, [newName, newDescription, newSystemPrompt, newIcon, onCreateCustom]);

  return (
    <div className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--quant-border)] hover:bg-[var(--quant-surface-hover)] transition-colors min-h-[36px]"
        aria-label="Select persona"
      >
        <span className="text-base">{current.icon}</span>
        <span className="text-xs font-medium text-[var(--foreground)] hidden sm:inline">
          {current.name}
        </span>
        <svg
          className={`w-3 h-3 text-[var(--quant-text-secondary)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ type: 'spring', ...spring.snappy }}
            className="absolute top-full left-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] shadow-xl z-50"
          >
            <div className="p-3 border-b border-[var(--quant-border)]">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Select Persona</h3>
              <p className="text-[11px] text-[var(--foreground-secondary)] mt-0.5">
                Choose how the AI should behave
              </p>
            </div>

            <div className="p-2 space-y-1">
              {allPersonas.map((persona) => (
                <button
                  key={persona.id}
                  onClick={() => handleSelect(persona)}
                  className={`w-full flex items-start gap-3 p-2.5 rounded-lg text-left transition-colors min-h-[44px] ${
                    current.id === persona.id
                      ? 'bg-[var(--quant-accent)]/10 border border-[var(--quant-accent)]/30'
                      : 'hover:bg-[var(--quant-surface-hover)]'
                  }`}
                >
                  <span className="text-xl flex-shrink-0 mt-0.5">{persona.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--foreground)] truncate">
                        {persona.name}
                      </span>
                      {persona.isCustom && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--quant-accent)]/20 text-[var(--quant-accent)] font-medium">
                          Custom
                        </span>
                      )}
                      {current.id === persona.id && (
                        <svg
                          className="w-3.5 h-3.5 text-[var(--quant-accent)] flex-shrink-0 ml-auto"
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
                    <p className="text-[11px] text-[var(--foreground-secondary)] mt-0.5 line-clamp-2">
                      {persona.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Create custom persona section */}
            <div className="border-t border-[var(--quant-border)] p-2">
              {!showCreateForm ? (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left hover:bg-[var(--quant-surface-hover)] transition-colors min-h-[44px]"
                >
                  <span className="text-base">➕</span>
                  <span className="text-sm font-medium text-[var(--quant-accent)]">
                    Create Custom Persona
                  </span>
                </button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 p-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex flex-wrap gap-1">
                      {ICON_OPTIONS.map((icon) => (
                        <button
                          key={icon}
                          onClick={() => setNewIcon(icon)}
                          className={`w-7 h-7 flex items-center justify-center rounded text-sm ${
                            newIcon === icon
                              ? 'bg-[var(--quant-accent)]/20 ring-1 ring-[var(--quant-accent)]'
                              : 'hover:bg-[var(--quant-surface-hover)]'
                          }`}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Persona name"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--quant-accent)]"
                    maxLength={50}
                  />
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Short description"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--quant-accent)]"
                  />
                  <textarea
                    value={newSystemPrompt}
                    onChange={(e) => setNewSystemPrompt(e.target.value)}
                    placeholder="System prompt (how should this persona behave?)"
                    rows={3}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--quant-accent)] resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreate}
                      disabled={!newName.trim() || !newSystemPrompt.trim()}
                      className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-[var(--quant-accent)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => setShowCreateForm(false)}
                      className="px-3 py-2 text-sm rounded-lg border border-[var(--quant-border)] hover:bg-[var(--quant-surface-hover)] transition-colors min-h-[44px]"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export { DEFAULT_PERSONAS };
export default PersonaSelector;
