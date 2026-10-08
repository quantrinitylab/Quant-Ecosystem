'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import { useFocusTrap } from '@quant/shared-ui';

export interface FolderDraft {
  name: string;
  color?: string;
  filterType: 'contact' | 'keyword' | 'standard';
  filterValue?: string;
}

export interface AddFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (draft: FolderDraft) => void;
  existingContacts?: Array<{ name?: string; email: string }>;
}

const PRESET_COLORS = [
  { value: 'var(--quant-primary)', label: 'Molten Amber' },
  { value: '#38BDF8', label: 'Electric Blue' },
  { value: '#10B981', label: 'Emerald' },
  { value: '#A78BFA', label: 'Royal Violet' },
  { value: 'var(--quant-warning)', label: 'Solar Amber' },
  { value: '#FB7185', label: 'Rose Coral' },
];

export function AddFolderModal({
  isOpen,
  onClose,
  onSave,
  existingContacts = [],
}: AddFolderModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('var(--quant-primary)');
  const [filterType, setFilterType] = useState<'contact' | 'keyword' | 'standard'>('contact');
  const [filterValue, setFilterValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const modalRef = useFocusTrap<HTMLDivElement>({ active: isOpen, onEscape: onClose });
  const nameInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (isOpen) {
      setName('');
      setColor('var(--quant-primary)');
      setFilterType('contact');
      setFilterValue('');
      setError(null);
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please provide a folder name');
      nameInputRef.current?.focus();
      return;
    }
    onSave({
      name: trimmedName,
      color,
      filterType,
      filterValue: filterValue.trim() || undefined,
    });
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md bg-[var(--quant-surface)] border border-[var(--quant-surface-elevated)] rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-4 bg-[var(--quant-surface-elevated)] border-b border-[var(--quant-surface-elevated)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="size-9 rounded-xl flex items-center justify-center text-[var(--quant-surface)] shrink-0 shadow-sm"
              style={{ backgroundColor: color }}
            >
              <svg
                className="size-5 text-black"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                <line x1="12" y1="10" x2="12" y2="16" />
                <line x1="9" y1="13" x2="15" y2="13" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="text-sm font-bold text-white truncate">
                Add Custom Folder
              </h2>
              <p className="text-[11px] text-[var(--quant-muted-foreground)] truncate">
                Create a custom mailbox lens or contact filter
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-lg text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[var(--quant-surface-elevated)] flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
            aria-label="Close dialog"
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Folder Name */}
          <div className="space-y-1.5">
            <label htmlFor="folder-name-input" className="block text-xs font-semibold text-[#E2E8F0]">
              Folder Name <span className="text-[var(--quant-primary)]">*</span>
            </label>
            <input
              ref={nameInputRef}
              id="folder-name-input"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. VIP Clients, Invoices, Project Titan"
              className="w-full h-10 px-3 rounded-xl bg-[var(--quant-background)] border border-[var(--quant-surface-elevated)] text-xs text-white placeholder-[#717888] focus:border-[var(--quant-primary)] focus:ring-1 focus:ring-[var(--quant-primary)]/40 outline-none transition-all"
            />
          </div>

          {/* Color Accent Picker */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-[#E2E8F0]">Color Accent</span>
            <div className="flex items-center gap-2.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`size-7 rounded-full transition-transform flex items-center justify-center ${
                    color === c.value
                      ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[var(--quant-surface)]'
                      : 'hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                  aria-label={c.label}
                >
                  {color === c.value && (
                    <svg
                      className="size-3.5 text-black"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Filter Type Segmented Control */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-[#E2E8F0]">Filter Type</span>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[var(--quant-background)] border border-[var(--quant-surface-elevated)]">
              <button
                type="button"
                onClick={() => setFilterType('contact')}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                  filterType === 'contact'
                    ? 'bg-[var(--quant-primary)]/20 text-[var(--quant-primary)] font-semibold border border-[var(--quant-primary)]/40'
                    : 'text-[var(--quant-muted-foreground)] hover:text-white'
                }`}
              >
                Contact Book
              </button>
              <button
                type="button"
                onClick={() => setFilterType('keyword')}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                  filterType === 'keyword'
                    ? 'bg-[var(--quant-primary)]/20 text-[var(--quant-primary)] font-semibold border border-[var(--quant-primary)]/40'
                    : 'text-[var(--quant-muted-foreground)] hover:text-white'
                }`}
              >
                Keyword
              </button>
              <button
                type="button"
                onClick={() => setFilterType('standard')}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                  filterType === 'standard'
                    ? 'bg-[var(--quant-primary)]/20 text-[var(--quant-primary)] font-semibold border border-[var(--quant-primary)]/40'
                    : 'text-[var(--quant-muted-foreground)] hover:text-white'
                }`}
              >
                Standard
              </button>
            </div>
          </div>

          {/* Filter Value Input */}
          {filterType === 'contact' && (
            <div className="space-y-1.5">
              <label htmlFor="contact-filter-input" className="block text-xs font-semibold text-[#E2E8F0]">
                Contact Email or Domain (optional)
              </label>
              <input
                id="contact-filter-input"
                type="text"
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                placeholder="Leave blank for all saved contacts, or enter name/email"
                className="w-full h-10 px-3 rounded-xl bg-[var(--quant-background)] border border-[var(--quant-surface-elevated)] text-xs text-white placeholder-[#717888] focus:border-[var(--quant-primary)] focus:ring-1 focus:ring-[var(--quant-primary)]/40 outline-none transition-all"
              />
              {existingContacts.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1 max-h-20 overflow-y-auto">
                  {existingContacts.slice(0, 5).map((ct) => (
                    <button
                      key={ct.email}
                      type="button"
                      onClick={() => setFilterValue(ct.email)}
                      className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--quant-surface-elevated)] hover:bg-[var(--quant-surface-elevated)] text-[var(--quant-muted-foreground)] hover:text-white transition-colors"
                    >
                      {ct.name || ct.email}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {filterType === 'keyword' && (
            <div className="space-y-1.5">
              <label htmlFor="keyword-filter-input" className="block text-xs font-semibold text-[#E2E8F0]">
                Topic or Keyword Query
              </label>
              <input
                id="keyword-filter-input"
                type="text"
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                placeholder="e.g. invoice, receipt, proposal, urgency"
                className="w-full h-10 px-3 rounded-xl bg-[var(--quant-background)] border border-[var(--quant-surface-elevated)] text-xs text-white placeholder-[#717888] focus:border-[var(--quant-primary)] focus:ring-1 focus:ring-[var(--quant-primary)]/40 outline-none transition-all"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--quant-surface-elevated)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[var(--quant-surface-elevated)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[var(--quant-primary)] hover:bg-[var(--quant-primary-hover)] active:bg-[var(--brand-primary-pressed)] text-[var(--quant-background)] text-xs font-bold transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
            >
              Create Folder
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddFolderModal;
