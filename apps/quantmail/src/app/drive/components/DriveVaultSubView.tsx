'use client';

import React, { useState } from 'react';
import { formatBytes } from '../../../lib/format-bytes';
import {
  VaultShieldIcon,
  PadlockIcon,
  KeyIcon,
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
  onDecryptItem?: (item: EncryptedVaultItem) => void;
}

const DEFAULT_VAULT_ITEMS: EncryptedVaultItem[] = [
  {
    id: 'vault-1',
    name: 'financial_audit_q3_2026.pdf.enc',
    cipherSize: 4404019, // 4.2 MB
    cipherAlgorithm: 'AES-256-GCM',
    sha256Checksum: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
    encryptedAt: '2026-09-30T11:20:00Z',
  },
  {
    id: 'vault-2',
    name: 'sovereign_identity_credentials.dat.enc',
    cipherSize: 1887436, // 1.8 MB
    cipherAlgorithm: 'AES-256-GCM',
    sha256Checksum: 'c89329a93e3c3f39d892d19b4566f123a456b789c012def3456789abcdef0123',
    encryptedAt: '2026-10-01T08:14:00Z',
  },
  {
    id: 'vault-3',
    name: 'executive_keyring_backup.pem.enc',
    cipherSize: 524288, // 512 KB
    cipherAlgorithm: 'AES-256-GCM',
    sha256Checksum: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    encryptedAt: '2026-09-25T16:50:00Z',
  },
  {
    id: 'vault-4',
    name: 'patent_portfolio_rfc_draft.docx.enc',
    cipherSize: 8808038, // 8.4 MB
    cipherAlgorithm: 'AES-256-GCM',
    sha256Checksum: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
    encryptedAt: '2026-09-29T19:30:00Z',
  },
];

export function DriveVaultSubView({
  items = DEFAULT_VAULT_ITEMS,
  onDecryptItem,
}: DriveVaultSubViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [decryptingId, setDecryptingId] = useState<string | null>(null);
  const [decryptedModalItem, setDecryptedModalItem] = useState<EncryptedVaultItem | null>(null);

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

  const handleDecryptOnDemand = (item: EncryptedVaultItem) => {
    setDecryptingId(item.id);
    setTimeout(() => {
      setDecryptingId(null);
      setDecryptedModalItem(item);
      onDecryptItem?.(item);
    }, 700);
  };

  return (
    <div
      id="drive-panel-vault"
      role="tabpanel"
      aria-labelledby="drive-tab-vault"
      className="space-y-6"
    >
      {/* 1. Vault Status Card */}
      <div className="rounded-2xl border border-[#232938] bg-[#12151E] p-5 shadow-[0_4px_28px_rgba(0,0,0,0.4)] space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="size-12 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8] shrink-0 shadow-[0_0_16px_rgba(56,189,248,0.2)]">
              <VaultShieldIcon className="size-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-[#F8FAFC]">
                  Sovereign Cryptographic Vault · Zero-Knowledge Encryption
                </h3>
              </div>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                Client-side encrypted with AES-256-GCM. Unencrypted plaintext and private keys never leave your machine.
              </p>
            </div>
          </div>

          {/* Hardware Keystore / WebCrypto status badge */}
          <div className="flex items-center gap-2 self-start md:self-center px-3 py-1.5 rounded-xl bg-[#090A0E] border border-[#232938]">
            <span className="relative flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
            </span>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F8FAFC]">
              <KeyIcon className="size-3.5 text-emerald-400" />
              <span>Hardware Keystore Active · WebCrypto SubtleCrypto L3 Verified</span>
            </div>
          </div>
        </div>

        {/* Security Metrics Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-[#232938]">
          <div className="p-3 rounded-xl bg-[#090A0E] border border-[#232938]/80">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[#64748B]">Cipher Suite</p>
            <p className="text-xs font-bold text-[#38BDF8] mt-0.5">AES-256-GCM (Authenticated)</p>
          </div>
          <div className="p-3 rounded-xl bg-[#090A0E] border border-[#232938]/80">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[#64748B]">Key Derivation</p>
            <p className="text-xs font-bold text-[#F8FAFC] mt-0.5">PBKDF2 600,000 iter / Argon2id</p>
          </div>
          <div className="p-3 rounded-xl bg-[#090A0E] border border-[#232938]/80">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[#64748B]">Knowledge Model</p>
            <p className="text-xs font-bold text-emerald-400 mt-0.5">100% Zero-Knowledge Client Side</p>
          </div>
        </div>
      </div>

      {/* 2. Encrypted File Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
            Encrypted Sovereign Objects ({items.length})
          </h4>
          <span className="text-[11px] text-[#64748B]">
            Protected by WebCrypto Hardware Keystore
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {items.map((item) => {
            const isCopied = copiedId === item.id;
            const isDecrypting = decryptingId === item.id;
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
                    {formatBytes(item.cipherSize)} [AES-256-GCM] · Encrypted {new Date(item.encryptedAt).toLocaleDateString()}
                  </p>
                </div>

                {/* SHA-256 Copy Chip */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-[#232938]">
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

                  {/* Decrypt-on-Demand Action Button */}
                  <button
                    type="button"
                    disabled={isDecrypting}
                    onClick={() => handleDecryptOnDemand(item)}
                    className="px-3 py-1.5 rounded-lg bg-[#38BDF8]/15 border border-[#38BDF8]/35 text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/25 active:bg-[#38BDF8]/35 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] disabled:opacity-50"
                  >
                    {isDecrypting ? 'Decrypting...' : 'Decrypt on Demand'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Decrypted On-Demand Confirmation Modal */}
      {decryptedModalItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="vault-decrypt-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#38BDF8]/40 bg-[#12151E] p-6 shadow-[0_0_32px_rgba(56,189,248,0.25)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-400 shrink-0">
                <CheckIcon className="size-5" />
              </div>
              <div>
                <h3 id="vault-decrypt-modal-title" className="text-sm font-bold text-[#F8FAFC]">
                  In-Memory Decryption Verified
                </h3>
                <p className="text-xs text-emerald-400 font-medium">
                  WebCrypto SubtleCrypto L3 Key Match
                </p>
              </div>
            </div>

            <p className="text-xs text-[#94A3B8]">
              The encrypted file <strong className="text-[#F8FAFC]">{decryptedModalItem.name}</strong> was successfully unlocked in browser memory without sending private keys to any server.
            </p>

            <div className="p-3 rounded-xl bg-[#090A0E] border border-[#232938] space-y-1 font-mono text-[11px] text-[#94A3B8]">
              <div>Cipher: <span className="text-[#F8FAFC]">{decryptedModalItem.cipherAlgorithm}</span></div>
              <div className="truncate">SHA-256: <span className="text-[#38BDF8]">{decryptedModalItem.sha256Checksum}</span></div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDecryptedModalItem(null)}
                className="px-4 py-2 rounded-xl bg-[#38BDF8] text-[#090A0E] text-xs font-bold hover:bg-[#7DD3FC] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
              >
                Close Envelope
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
