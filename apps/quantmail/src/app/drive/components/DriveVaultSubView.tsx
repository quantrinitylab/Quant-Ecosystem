'use client';

import React, { useState } from 'react';
import { formatBytes } from '../../../lib/format-bytes';
import {
  VaultShieldIcon,
  PadlockIcon,
  CopyIcon,
  CheckIcon,
} from './DriveIcons';

export interface EncryptedVaultItem {
  id: string;
  name: string;
  cipherSize: number;
  cipherAlgorithm: string;
  sha256Checksum: string;
  encryptedAt: string;
}

export interface DriveVaultSubViewProps {
  items?: EncryptedVaultItem[];
}

export function DriveVaultSubView({ items = [] }: DriveVaultSubViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopySha256 = async (id: string, hash: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(hash);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      // fallback
    }
  };

  return (
    <div
      id="drive-panel-vault"
      role="tabpanel"
      aria-labelledby="drive-tab-vault"
      className="space-y-6"
    >
      {/* 1. Vault Status Card */}
      <div className="rounded-2xl border border-[#232938] bg-[#12151E] p-5 shadow-[0_4px_28px_rgba(0,0,0,0.4)]">
        <div className="flex items-center gap-3.5">
          <div className="size-12 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8] shrink-0 shadow-[0_0_16px_rgba(56,189,248,0.2)]">
            <VaultShieldIcon className="size-6" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-[#F8FAFC]">Vault</h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Lock files here to keep them separate from your main Drive.
              Client-side encryption is not available yet.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Vault Items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
            Vault Items ({items.length})
          </h4>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#232938] bg-[#12151E] px-6 py-12 text-center">
            <div className="size-10 rounded-xl bg-[#090A0E] border border-[#232938] flex items-center justify-center text-[#64748B]">
              <PadlockIcon className="size-5" />
            </div>
            <p className="text-sm font-semibold text-[#F8FAFC]">No vault items yet</p>
            <p className="text-xs text-[#94A3B8]">Lock a file to add it to your vault.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {items.map((item) => {
              const isCopied = copiedId === item.id;
              const truncatedHash = `${item.sha256Checksum.slice(0, 10)}...${item.sha256Checksum.slice(-8)}`;

              return (
                <div
                  key={item.id}
                  className="group relative flex flex-col justify-between p-4 rounded-xl border border-[#232938] bg-[#12151E] hover:border-[#38BDF8]/40 hover:bg-[#161A26] transition-all shadow-[0_2px_14px_rgba(0,0,0,0.3)] space-y-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="size-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                        <PadlockIcon className="size-4" />
                      </div>

                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30 uppercase tracking-wider">
                        {item.cipherAlgorithm}
                      </span>
                    </div>

                    <p className="text-xs font-bold text-[#F8FAFC] truncate group-hover:text-[#38BDF8] transition-colors">
                      {item.name}
                    </p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">
                      {formatBytes(item.cipherSize)} · Locked{' '}
                      {new Date(item.encryptedAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* SHA-256 Copy Chip */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#232938]">
                    <button
                      type="button"
                      aria-label={`Copy SHA-256 checksum for ${item.name}`}
                      onClick={(e) => handleCopySha256(item.id, item.sha256Checksum, e)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#090A0E] border border-[#232938] text-[11px] font-mono text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[#38BDF8]/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
                    >
                      {isCopied ? (
                        <>
                          <CheckIcon className="size-3 text-emerald-400 shrink-0" />
                          <span className="text-emerald-400 font-semibold">Checksum Copied!</span>
                        </>
                      ) : (
                        <>
                          <CopyIcon className="size-3 text-[#64748B] shrink-0" />
                          <span>SHA-256: {truncatedHash}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
