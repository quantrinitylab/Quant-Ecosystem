// ============================================================================
// Shared UI - AI Suggestion Component
// ============================================================================

import React from 'react';

export interface AISuggestionProps {
  suggestions: string[];
  title?: string;
  onSelect: (suggestion: string) => void;
  onDismiss?: () => void;
  variant?: 'inline' | 'floating' | 'card';
  className?: string;
}

export const AISuggestion: React.FC<AISuggestionProps> = ({
  suggestions,
  title = 'AI Suggestions',
  onSelect,
  onDismiss,
  variant = 'inline',
  className = '',
}) => {
  if (suggestions.length === 0) return null;

  const variantStyles: Record<string, string> = {
    inline: 'bg-blue-50 border border-blue-100 rounded-lg p-3',
    floating: 'bg-white border border-gray-200 rounded-xl shadow-lg p-4',
    card: 'bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4',
  };

  return (
    <div className={`${variantStyles[variant]} ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">&#10024;</span>
          <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">{title}</span>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 p-0.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            onClick={() => onSelect(suggestion)}
            className="px-3 py-1.5 text-sm bg-white border border-blue-200 text-blue-700 rounded-full hover:bg-blue-100 hover:border-blue-300 transition-colors"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
};
