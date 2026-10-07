'use client';

import { useState } from 'react';

/**
 * QuantGit User ID Creation — UI for claiming a unique QuantGit username.
 * 
 * Design principles (per user feedback: professional, not gamey):
 * - Clean, minimal modal inspired by GitHub's username claim flow
 * - Real-time availability checking with visual feedback
 * - Professional purple accent (#A855F7) matching QuantGit theme
 * - Clear value proposition: your ID across the Quant ecosystem
 */

interface QuantGitUserIdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (userId: string) => void;
  currentUserId?: string | null;
}

export function QuantGitUserIdModal({ isOpen, onClose, onCreate, currentUserId }: QuantGitUserIdModalProps) {
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  // NOTE: availability checking + claiming are DISABLED until the backend
  // endpoint (POST /api/quantgit/user-id) exists. We intentionally do NOT
  // simulate availability — a fake "available" badge would lie to users and
  // the claimed ID would be lost on reload (local-state only). The input keeps
  // client-side format validation so users can pre-pick a valid ID; the Claim
  // action stays disabled with a "Coming Soon" affordance.

  if (!isOpen) return null;

  const validateUserId = (id: string): string | null => {
    if (id.length < 3) return 'User ID must be at least 3 characters';
    if (id.length > 30) return 'User ID must be 30 characters or less';
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return 'Only letters, numbers, hyphens and underscores';
    if (/^[-_]/.test(id) || /[-_]$/.test(id)) return 'Cannot start or end with hyphen/underscore';
    return null;
  };

  const handleInputChange = (raw: string) => {
    const val = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    setUserId(val);
    // Validate eagerly so the user gets format feedback while typing.
    setError(val.length > 0 ? validateUserId(val) : null);
  };

  const isValid = userId.length >= 3 && validateUserId(userId) === null;

  const handleSubmit = () => {
    // Guard: the action is disabled in the UI, but never trust the UI alone.
    // Until the backend exists there is nothing truthful to submit.
    if (!isValid) return;
    onCreate(userId);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Create QuantGit User ID"
    >
      <div 
        className="w-full max-w-md rounded-2xl p-6"
        style={{ 
          background: '#131318',
          border: '1px solid rgba(168,85,247,0.2)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Create your QuantGit ID</h2>
            <p className="text-sm text-[#94A3B8] mt-1">
              Your unique identity across QuantGit and the Quant ecosystem
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#64748B] hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {currentUserId ? (
          <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)' }}>
            <p className="text-sm text-[#94A3B8]">Your current QuantGit ID</p>
            <p className="text-lg font-mono font-semibold text-[#A855F7] mt-1">@{currentUserId}</p>
          </div>
        ) : null}

        {/* Input */}
        <div className="mb-4">
          <label htmlFor="quantgit-userid" className="block text-sm font-medium text-[#E2E8F0] mb-2">
            Choose your User ID
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] font-mono">@</span>
            <input
              id="quantgit-userid"
              type="text"
              value={userId}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="your-username"
              className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-[#0D0D12] border border-[#232938] text-white placeholder-[#475569] font-mono text-sm focus:outline-none focus:border-[#A855F7]/60 focus:ring-1 focus:ring-[#A855F7]/30 transition-all"
              autoFocus
            />
          </div>
          {error ? (
            <p className="text-xs text-red-400 mt-2">{error}</p>
          ) : isValid ? (
            <p className="text-xs text-emerald-400 mt-2">✓ @{userId} looks valid — claimable once the service is live</p>
          ) : (
            <p className="text-xs text-[#64748B] mt-2">
              3-30 characters. Letters, numbers, hyphens and underscores only.
            </p>
          )}
        </div>

        {/* Coming-soon notice: honest about the missing backend */}
        <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)' }}>
          <p className="text-xs font-semibold text-[#A855F7] mb-1">Coming soon</p>
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            User ID claiming opens once the QuantGit identity service is live.
            Availability can't be checked yet — nothing here is reserved or stored.
          </p>
        </div>

        {/* Benefits */}
        <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs font-medium text-[#94A3B8] mb-2">Your ID unlocks:</p>
          <ul className="space-y-1.5">
            {[
              'Public profile at quantmail.in/@your-id',
              'Git operations via your-id@quantgit',
              'Cross-app identity (Mail, Drive, Calendar)',
            ].map((benefit) => (
              <li key={benefit} className="flex items-center gap-2 text-xs text-[#CBD5E1]">
                <svg className="size-3 text-[#A855F7] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-[#94A3B8] hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled
            aria-disabled="true"
            title="User ID claiming is coming soon — backend integration pending"
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all opacity-40 cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #A855F7, #7C3AED)',
              boxShadow: 'none'
            }}
          >
            Coming Soon
          </button>
        </div>
      </div>
    </div>
  );
}
