'use client';

import { IdentityAvatar } from './IdentityAvatar';
import type { ContactSuggestion } from '../types';

/**
 * The "+" mention picker list shared by all three composers (EmailComposer,
 * DockedComposer, ThreadComposer). Purely presentational: the trigger
 * detection lives in `lib/plus-mentions.ts`, the keyboard state in
 * `hooks/usePlusMention.ts`.
 *
 * Styling follows the QuantMail composer rules — pure black surface, Mail
 * orange accent for the active row, no divider lines (rows are separated by
 * gap only). `onMouseDown` (not onClick) so picking never blurs the body
 * textarea and loses the caret.
 */
export function PlusMentionDropdown({
  suggestions,
  activeIndex,
  onSelect,
  onHover,
  placement = 'below',
}: {
  suggestions: ContactSuggestion[];
  activeIndex: number;
  onSelect: (contact: ContactSuggestion) => void;
  onHover: (index: number) => void;
  /** 'below' hangs under the textarea (full composers); 'above' floats over
   * the chat bar (ThreadComposer, pinned to the viewport bottom). */
  placement?: 'below' | 'above';
}) {
  if (suggestions.length === 0) return null;
  return (
    <div
      role="listbox"
      aria-label="Mention a contact"
      className={`absolute z-50 max-h-56 w-full min-w-[260px] overflow-y-auto rounded-2xl border border-[#3A404D]/80 bg-black p-1.5 shadow-2xl ${
        placement === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'
      }`}
    >
      {suggestions.map((suggestion, index) => (
        <div
          key={suggestion.email}
          role="option"
          aria-selected={index === activeIndex}
          className={`flex cursor-pointer items-center gap-2.5 rounded-xl p-2 text-xs transition-colors ${
            index === activeIndex
              ? 'bg-[#F97316]/20 text-white'
              : 'hover:bg-[#F97316]/10 text-[#9BA0AA]'
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(suggestion);
          }}
          onMouseEnter={() => onHover(index)}
        >
          <IdentityAvatar name={suggestion.name || suggestion.email} size="sm" />
          <div className="flex min-w-0 flex-col">
            {suggestion.name && (
              <span className="truncate font-bold text-white">{suggestion.name}</span>
            )}
            <span className="truncate font-mono text-[11px] text-[#9BA0AA]">
              {suggestion.email}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
