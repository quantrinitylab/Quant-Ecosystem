// ============================================================================
// Quant Ecosystem - Universal Command Palette (Cmd+K / Ctrl+K)
// ============================================================================

import React, { useState, useEffect, useRef, useTransition } from 'react';
import type { SearchScope, FederatedSearchResult, QuickActionItem } from './types';
import { CORE_QUANT_APPS } from './constants';
import { FederatedSearchEngine } from './FederatedSearchEngine';

export interface UniversalCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  initialScope?: SearchScope;
}

const SCOPES: { id: SearchScope; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: '✦' },
  { id: 'mail', label: 'Mail', icon: '✉' },
  { id: 'gram', label: 'Reels & Gram', icon: '📸' },
  { id: 'ai', label: 'QuantAI', icon: '✨' },
  { id: 'chat', label: 'Chats', icon: '💬' },
  { id: 'drive', label: 'Drive Files', icon: '📁' },
  { id: 'actions', label: 'Commands', icon: '⚡' },
];

export const UniversalCommandPalette: React.FC<UniversalCommandPaletteProps> = ({
  isOpen,
  onClose,
  initialScope = 'all',
}) => {
  const [query, setQuery] = useState('');
  const [activeScope, setActiveScope] = useState<SearchScope>(initialScope);
  const [results, setResults] = useState<FederatedSearchResult[]>([]);
  const [actions, setActions] = useState<QuickActionItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [, startTransition] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      performSearch(query, activeScope);
    }
  }, [isOpen, activeScope]);

  // Execute sub-10ms search
  const performSearch = async (searchTerm: string, scope: SearchScope) => {
    const engine = FederatedSearchEngine.getInstance();
    const res = await engine.search(searchTerm, scope);
    startTransition(() => {
      setResults(res.results);
      setActions(res.actions);
      setElapsedMs(res.elapsedMs);
      setSelectedIndex(0);
    });
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    performSearch(val, activeScope);
  };

  const handleSelectScope = (scope: SearchScope) => {
    setActiveScope(scope);
    performSearch(query, scope);
  };

  const totalItems = actions.length + results.length;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (totalItems || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + (totalItems || 1)) % (totalItems || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executeSelectedItem();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        // Cycle scopes
        const currentIdx = SCOPES.findIndex((s) => s.id === activeScope);
        const nextItem = SCOPES[(currentIdx + 1) % SCOPES.length];
        if (nextItem) {
          handleSelectScope(nextItem.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, totalItems, actions, results, activeScope]);

  const executeSelectedItem = () => {
    if (selectedIndex < actions.length) {
      const act = actions[selectedIndex];
      if (act) {
        act.execute();
        onClose();
      }
    } else {
      const resIdx = selectedIndex - actions.length;
      const res = results[resIdx];
      if (res) {
        window.location.href = res.actionUrl;
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  const selectedItem =
    selectedIndex < actions.length
      ? { type: 'action' as const, data: actions[selectedIndex] }
      : { type: 'result' as const, data: results[selectedIndex - actions.length] };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Universal Command Palette"
    >
      <div
        className="w-full max-w-4xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header Bar */}
        <div className="flex items-center px-4 py-3 border-b border-gray-200 dark:border-gray-800 gap-3">
          <svg
            className="w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" strokeWidth={2} />
            <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth={2} />
          </svg>

          <input
            ref={inputRef}
            type="text"
            placeholder="Search mail, reels, files, chats, AI canvas or type commands..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className="flex-1 bg-transparent text-gray-900 dark:text-white text-base placeholder-gray-400 outline-none"
          />

          {/* Sub-10ms Benchmark Badge */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-[11px] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>{elapsedMs}ms</span>
          </div>

          <kbd className="px-2 py-1 text-[10px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 rounded border border-gray-200 dark:border-gray-700 shadow-xs">
            ESC
          </kbd>
        </div>

        {/* Filter Scope Pills */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-100 dark:border-gray-800/80 bg-gray-50/50 dark:bg-gray-900/50 overflow-x-auto text-xs">
          {SCOPES.map((scope) => (
            <button
              key={scope.id}
              onClick={() => handleSelectScope(scope.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeScope === scope.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'
              }`}
            >
              <span>{scope.icon}</span>
              <span>{scope.label}</span>
            </button>
          ))}
        </div>

        {/* Two-Pane Body: Results (Left) + Rich Preview (Right) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-gray-100 dark:divide-gray-800">
          {/* Left Column: Interactive Result List */}
          <div ref={listRef} className="md:col-span-7 overflow-y-auto p-2 space-y-1">
            {/* Quick Actions Group */}
            {actions.length > 0 && (
              <div className="mb-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 px-3 py-1 block">
                  Quick Actions
                </span>
                {actions.map((act, idx) => {
                  const isSelected = selectedIndex === idx;
                  const appMeta = CORE_QUANT_APPS[act.app];

                  return (
                    <div
                      key={act.id}
                      onClick={() => {
                        act.execute();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 ring-1 ring-blue-200 dark:ring-blue-800'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800/60 text-gray-800 dark:text-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                          style={{
                            backgroundColor: `${appMeta.accentColor}20`,
                            color: appMeta.accentColor,
                          }}
                        >
                          ⚡
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{act.title}</p>
                          <p className="text-[10px] text-gray-400 truncate">{act.description}</p>
                        </div>
                      </div>
                      {act.shortcut && (
                        <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
                          {act.shortcut}
                        </kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Federated Results Group */}
            {results.length > 0 && (
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 px-3 py-1 block">
                  Ecosystem Results ({results.length})
                </span>
                {results.map((res, idx) => {
                  const globalIdx = actions.length + idx;
                  const isSelected = selectedIndex === globalIdx;
                  const appMeta = CORE_QUANT_APPS[res.app];

                  return (
                    <div
                      key={res.id}
                      onClick={() => {
                        window.location.href = res.actionUrl;
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 ring-1 ring-blue-200 dark:ring-blue-800'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800/60 text-gray-800 dark:text-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {res.thumbnailUrl ? (
                          <img
                            src={res.thumbnailUrl}
                            alt=""
                            className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{
                              backgroundColor: `${appMeta.accentColor}20`,
                              color: appMeta.accentColor,
                            }}
                          >
                            {appMeta.name.charAt(5) || 'Q'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold truncate">{res.title}</span>
                            <span
                              className="text-[9px] px-1 py-0.2 rounded font-medium uppercase"
                              style={{
                                backgroundColor: `${appMeta.accentColor}15`,
                                color: appMeta.accentColor,
                              }}
                            >
                              {appMeta.name}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                            {res.subtitle}
                          </p>
                        </div>
                      </div>

                      <span className="text-[10px] text-gray-400 flex-shrink-0">Jump ↵</span>
                    </div>
                  );
                })}
              </div>
            )}

            {totalItems === 0 && (
              <div className="p-8 text-center text-gray-400 text-xs">
                No ecosystem matches found for &quot;{query}&quot;. Try searching Mail, Reels, or
                Chats.
              </div>
            )}
          </div>

          {/* Right Column: Contextual Preview Pane */}
          <div className="hidden md:flex md:col-span-5 p-4 flex-col justify-between bg-gray-50/50 dark:bg-gray-900/30">
            {selectedItem?.type === 'result' && selectedItem.data ? (
              <div className="space-y-3">
                <span className="text-[10px] font-bold tracking-wider uppercase text-gray-400">
                  Quick Preview
                </span>
                <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {selectedItem.data.title}
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {selectedItem.data.subtitle}
                  </p>

                  {selectedItem.data.thumbnailUrl && (
                    <div className="mt-2.5 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                      <img
                        src={selectedItem.data.thumbnailUrl}
                        alt="Preview"
                        className="w-full h-32 object-cover"
                      />
                    </div>
                  )}

                  {selectedItem.data.tags && (
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {selectedItem.data.tags.map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 text-[9px] rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : selectedItem?.type === 'action' && selectedItem.data ? (
              <div className="space-y-3">
                <span className="text-[10px] font-bold tracking-wider uppercase text-gray-400">
                  Command Details
                </span>
                <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {selectedItem.data.title}
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {selectedItem.data.description}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-[11px] text-gray-400">Target App:</span>
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                      {CORE_QUANT_APPS[selectedItem.data.app].name}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center text-gray-400 text-xs">
                Select an item to view preview
              </div>
            )}

            {/* Palette Footer Shortcuts */}
            <div className="pt-3 border-t border-gray-200 dark:border-gray-800 text-[10px] text-gray-400 flex items-center justify-between">
              <span>↑↓ Navigate</span>
              <span>Tab Filter</span>
              <span>↵ Open</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
