// ============================================================================
// QuantDrive Document Editor — Formatting Toolbar
// Gate N-G2: Bold, Italic, Strikethrough, Code, Link, and clean dark styling
// ============================================================================

import React, { useState } from 'react';
import type { BlockType } from './types';

interface FormattingToolbarProps {
  currentType: BlockType;
  onConvertType: (type: BlockType) => void;
  onFormatText: (format: 'bold' | 'italic' | 'strike' | 'code' | 'link') => void;
  onHighlightColor?: (color: string) => void;
}

const TYPE_LABELS: Record<BlockType, string> = {
  paragraph: 'Text',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  todo: 'To-do List',
  bullet: 'Bulleted List',
  numbered: 'Numbered List',
  code: 'Code Block',
  quote: 'Quote',
  callout: 'Callout',
  table: 'Table',
  divider: 'Divider',
};

const COLOR_OPTIONS = [
  { name: 'Default', value: 'inherit' },
  { name: 'Orange', value: '#FF8C42' },
  { name: 'Green', value: '#3FB950' },
  { name: 'Blue', value: '#58A6FF' },
  { name: 'Purple', value: '#BC8CFF' },
  { name: 'Red', value: '#F85149' },
];

export const FormattingToolbar: React.FC<FormattingToolbarProps> = ({
  currentType,
  onConvertType,
  onFormatText,
  onHighlightColor,
}) => {
  const [showTypeDropdown, setShowTypeDropdown] = useState<boolean>(false);
  const [showColorDropdown, setShowColorDropdown] = useState<boolean>(false);

  return (
    <div className="flex items-center gap-1 rounded-xl border border-[#30363D] bg-[#161B22] p-1 shadow-xl backdrop-blur-md">
      {/* Block type switcher */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setShowTypeDropdown(!showTypeDropdown);
            setShowColorDropdown(false);
          }}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-[#C9D1D9] hover:text-[#F0F6FC] hover:bg-[#21262D] transition-colors"
        >
          <span>{TYPE_LABELS[currentType] || 'Text'}</span>
          <svg
            className="w-3 h-3 text-[#8B949E]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showTypeDropdown && (
          <div className="absolute top-full left-0 mt-1.5 w-44 rounded-xl border border-[#30363D] bg-[#161B22] p-1 shadow-2xl z-50">
            {(
              [
                'paragraph',
                'h1',
                'h2',
                'h3',
                'todo',
                'bullet',
                'numbered',
                'quote',
                'callout',
                'code',
              ] as BlockType[]
            ).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  onConvertType(t);
                  setShowTypeDropdown(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors ${
                  currentType === t
                    ? 'bg-[#21262D] text-[#FF8C42] font-semibold'
                    : 'text-[#C9D1D9] hover:bg-[#21262D]/60 hover:text-[#F0F6FC]'
                }`}
              >
                <span>{TYPE_LABELS[t]}</span>
                {currentType === t && <span className="text-[#FF8C42]">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-[#30363D] mx-0.5" />

      {/* Bold button */}
      <button
        type="button"
        onClick={() => onFormatText('bold')}
        title="Bold (Ctrl+B)"
        className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs text-[#C9D1D9] hover:text-[#F0F6FC] hover:bg-[#21262D] transition-colors"
      >
        B
      </button>

      {/* Italic button */}
      <button
        type="button"
        onClick={() => onFormatText('italic')}
        title="Italic (Ctrl+I)"
        className="w-7 h-7 rounded-lg flex items-center justify-center italic text-xs text-[#C9D1D9] hover:text-[#F0F6FC] hover:bg-[#21262D] transition-colors"
      >
        I
      </button>

      {/* Strikethrough button */}
      <button
        type="button"
        onClick={() => onFormatText('strike')}
        title="Strikethrough (Ctrl+Shift+X)"
        className="w-7 h-7 rounded-lg flex items-center justify-center line-through text-xs text-[#C9D1D9] hover:text-[#F0F6FC] hover:bg-[#21262D] transition-colors"
      >
        S
      </button>

      {/* Inline code button */}
      <button
        type="button"
        onClick={() => onFormatText('code')}
        title="Inline Code (Ctrl+E)"
        className="w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs text-[#C9D1D9] hover:text-[#F0F6FC] hover:bg-[#21262D] transition-colors"
      >
        &lt;/&gt;
      </button>

      {/* Link button */}
      <button
        type="button"
        onClick={() => onFormatText('link')}
        title="Insert Link (Ctrl+K)"
        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs text-[#C9D1D9] hover:text-[#F0F6FC] hover:bg-[#21262D] transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
      </button>

      {/* Highlight color picker */}
      {onHighlightColor && (
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowColorDropdown(!showColorDropdown);
              setShowTypeDropdown(false);
            }}
            title="Highlight Color"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs text-[#C9D1D9] hover:text-[#F0F6FC] hover:bg-[#21262D] transition-colors"
          >
            <span className="w-3.5 h-3.5 rounded-full border border-[#30363D] bg-[#FF8C42]" />
          </button>

          {showColorDropdown && (
            <div className="absolute top-full right-0 mt-1.5 w-36 rounded-xl border border-[#30363D] bg-[#161B22] p-1.5 shadow-2xl z-50 space-y-1">
              <div className="text-[10px] font-semibold text-[#8B949E] px-2 py-0.5 uppercase tracking-wider">
                Highlight
              </div>
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => {
                    onHighlightColor(c.value);
                    setShowColorDropdown(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded-lg text-xs text-[#C9D1D9] hover:bg-[#21262D] transition-colors"
                >
                  <span
                    className="w-3 h-3 rounded-full border border-white/20 shrink-0"
                    style={{ backgroundColor: c.value === 'inherit' ? '#8B949E' : c.value }}
                  />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
