'use client';

// ============================================================================
// QuantGram (QuantNeon) — AccountSwitcherBottomSheet Component
// Forensic 98-Screen Instagram Parity (Task W39-G04)
// Multi-Account Switcher Bottom Sheet with Unread Badges & Add Account Flow
// ============================================================================

import React from 'react';
import type { AccountProfileItem } from '../features/profile/profile-matrix';

export interface AccountSwitcherBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: AccountProfileItem[];
  onSelectAccount: (accountId: string) => void;
  onAddAccount?: () => void;
}

export const AccountSwitcherBottomSheet: React.FC<AccountSwitcherBottomSheetProps> = ({
  isOpen,
  onClose,
  accounts,
  onSelectAccount,
  onAddAccount,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-label="Switch accounts"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg mx-auto bg-[#181818] border-t border-[#2B2B2B] rounded-t-3xl flex flex-col max-h-[70vh] shadow-2xl overflow-hidden text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle & Header */}
        <div className="pt-3 pb-2 px-4 flex flex-col items-center border-b border-[#2B2B2B] relative">
          <div className="w-10 h-1 bg-[#3A3A3A] rounded-full mb-3" />
          <h3 className="font-semibold text-sm">Switch accounts</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account switcher"
            className="absolute right-4 top-3 text-[#A8A8A8] hover:text-white transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* Accounts List */}
        <div className="p-3 space-y-2 overflow-y-auto">
          {accounts.map((acc) => (
            <button
              key={acc.id}
              type="button"
              onClick={() => {
                onSelectAccount(acc.id);
                onClose();
              }}
              className={`w-full flex items-center justify-between p-3 rounded-2xl transition-colors ${
                acc.isCurrent
                  ? 'bg-[#262626] border border-[#3A3A3A]'
                  : 'hover:bg-[#222222] border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative">
                  <img
                    src={acc.avatar}
                    alt={acc.username}
                    className="w-12 h-12 rounded-full object-cover border border-[#333]"
                  />
                  {acc.unreadCount && acc.unreadCount > 0 && !acc.isCurrent ? (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-[#181818]">
                      {acc.unreadCount > 9 ? '9+' : acc.unreadCount}
                    </span>
                  ) : null}
                </div>
                <div className="text-left min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm text-white truncate">
                      @{acc.username}
                    </span>
                    {acc.isVerified && <span className="text-xs text-[#0095F6]">✓</span>}
                  </div>
                  <p className="text-xs text-[#A8A8A8] truncate">{acc.displayName}</p>
                </div>
              </div>

              {acc.isCurrent && (
                <div className="w-5 h-5 rounded-full bg-[#0095F6] flex items-center justify-center text-white text-xs font-bold shrink-0">
                  ✓
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Add Account Action */}
        <div className="p-3 border-t border-[#2B2B2B] bg-[#121212]">
          <button
            type="button"
            onClick={() => {
              if (onAddAccount) onAddAccount();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#222222] hover:bg-[#2A2A2A] text-white text-xs font-semibold transition-colors"
          >
            <span className="text-sm font-bold">+</span>
            <span>Add Quant Account</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountSwitcherBottomSheet;
