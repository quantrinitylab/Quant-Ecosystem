'use client';

import { useState, useEffect, useCallback } from 'react';
import { Modal, Button } from '@quant/shared-ui';
import type { ContactGroup } from '../../../types';

const PRESET_COLORS = [
  '#FF8C42',
  '#4E7BEE',
  '#10B981',
  '#EC4899',
  '#8B5CF6',
  '#F59E0B',
  '#06B6D4',
  '#64748B',
];

interface ContactGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  group?: ContactGroup | null;
  onSave: (data: { name: string; emails: string[]; color: string | null }) => Promise<void>;
  onDelete?: (groupId: string) => Promise<void>;
  isSaving?: boolean;
}

export function ContactGroupModal({
  isOpen,
  onClose,
  group,
  onSave,
  onDelete,
  isSaving = false,
}: ContactGroupModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>('#FF8C42');
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (group) {
      setName(group.name || '');
      setColor(group.color || '#FF8C42');
      setEmails(group.emails || []);
    } else {
      setName('');
      setColor('#FF8C42');
      setEmails([]);
    }
    setEmailInput('');
    setError(null);
  }, [group, isOpen]);

  const handleAddEmail = useCallback(() => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }
    if (emails.includes(trimmed)) {
      setEmailInput('');
      return;
    }
    if (emails.length >= 200) {
      setError('Group cannot exceed 200 members');
      return;
    }
    setEmails((prev) => [...prev, trimmed]);
    setEmailInput('');
    setError(null);
  }, [emailInput, emails]);

  const handleRemoveEmail = (emailToRemove: string) => {
    setEmails((prev) => prev.filter((e) => e !== emailToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddEmail();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Group name is required');
      return;
    }
    setError(null);
    try {
      await onSave({
        name: trimmedName,
        emails,
        color: color || null,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save group');
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={group ? 'Edit Contact Group' : 'Create Contact Group'}
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Group Name */}
        <div>
          <label className="block text-xs font-medium text-[#A1A4AC] mb-1.5">
            Group Name <span className="text-[#FF8C42]">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Core Engineering, VIP Clients, Investors"
            maxLength={60}
            required
            className="w-full rounded-xl border border-[#282C35] bg-[#16181D] px-3.5 py-2.5 text-sm text-[#F5F5F5] placeholder-[#6B6E76] focus:border-[#FF8C42] focus:outline-none focus:ring-1 focus:ring-[#FF8C42]"
          />
        </div>

        {/* Color Picker */}
        <div>
          <label className="block text-xs font-medium text-[#A1A4AC] mb-1.5">Badge Color</label>
          <div className="flex items-center gap-2.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full transition-transform ${
                  color === c ? 'scale-125 ring-2 ring-white/60' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </div>

        {/* Member Emails */}
        <div>
          <label className="block text-xs font-medium text-[#A1A4AC] mb-1.5">
            Members ({emails.length})
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add email address..."
              className="flex-1 rounded-xl border border-[#282C35] bg-[#16181D] px-3.5 py-2 text-xs text-[#F5F5F5] placeholder-[#6B6E76] focus:border-[#FF8C42] focus:outline-none focus:ring-1 focus:ring-[#FF8C42]"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAddEmail}
              disabled={!emailInput.trim()}
            >
              Add
            </Button>
          </div>

          {emails.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 rounded-xl bg-[#0D0E11] border border-[#282C35]">
              {emails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-[#1F2228] text-[#D1D5DB] border border-[#282C35]"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: color || '#FF8C42' }}
                  />
                  {email}
                  <button
                    type="button"
                    onClick={() => handleRemoveEmail(email)}
                    className="ml-0.5 text-[#6B6E76] hover:text-red-400 focus:outline-none"
                    title="Remove email"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#6B6E76] italic">
              No members added yet. Type an email address above and click Add or press Enter.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-[#282C35]">
          {group && onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDelete(group.id)}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              Delete Group
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={isSaving}>
              {isSaving ? 'Saving...' : group ? 'Save Changes' : 'Create Group'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
