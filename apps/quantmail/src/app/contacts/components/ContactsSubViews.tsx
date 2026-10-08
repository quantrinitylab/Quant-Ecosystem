'use client';

import React from 'react';
import type { Contact } from '../../../types';

export interface SovereignContact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  role?: string;
  tag: string;
  isVip: boolean;
  isStarred: boolean;
}

export function getInitials(name?: string | null): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0].toUpperCase()}${parts[1][0].toUpperCase()}`;
  }
  if (parts.length === 1 && parts[0].length > 0) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return 'CT';
}

export function getAvatarBgColor(name?: string | null): string {
  const gradients = [
    'from-indigo-600 to-purple-600',
    'from-pink-600 to-rose-600',
    'from-blue-600 to-cyan-600',
    'from-emerald-600 to-teal-600',
    'from-amber-600 to-orange-600',
    'from-violet-600 to-fuchsia-600',
  ];
  let hash = 0;
  const seed = name || '';
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
}

/**
 * Display label for a contact that may lack a name and/or email (phone-only
 * records, legacy rows created before validation). Centralizes the fallback so
 * no render path ever passes undefined into string methods — a nameless,
 * emailless contact used to throw "Cannot read properties of undefined" and
 * crash the whole contacts view into the global error boundary.
 */
export function contactDisplayName(c: { name?: string | null; email?: string | null; phone?: string | null }): string {
  return c.name || c.email || c.phone || 'Unnamed contact';
}

// ============================================================================
// 1. VIP CONTACTS SUB-VIEW
// ============================================================================

export interface VipContactsSubViewProps {
  contacts: (Contact | SovereignContact)[];
  onInspect: (contact: any) => void;
  onCall: (contact: { name: string; phone?: string }) => void;
  onEmail: (email: string) => void;
  onToggleStar?: (contact: any) => void;
}

export function VipContactsSubView({
  contacts,
  onInspect,
  onCall,
  onEmail,
  onToggleStar,
}: VipContactsSubViewProps) {
  // Filter for VIP contacts: flagged via isVip, isStarred, or the VIP tag.
  const vipList = React.useMemo(() => {
    const list = contacts.filter((c) => {
      const isStarred = 'isStarred' in c ? c.isStarred : (c as any).isFavorite;
      const isVip = 'isVip' in c ? c.isVip : false;
      const tag = 'tag' in c ? c.tag : ((c as any).tags?.[0] || '');
      return isVip || isStarred || tag.toLowerCase() === 'vip';
    });

    // Dedupe real contacts by email (or id for phone-only records).
    const map = new Map<string, any>();
    list.forEach((c) => {
      // Contacts without an email (phone-only records) still render — key by id.
      const key = (c.email || '').toLowerCase() || `id:${c.id}`;
      map.set(key, c);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts]);

  return (
    <div className="space-y-6">
      {/* VIP Header Hero */}
      <div className="rounded-2xl border border-[#F59E0B]/50 bg-gradient-to-r from-[#18140E] to-[#12100C] p-5 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F59E0B] to-[#D97706] text-black shadow-md shadow-[#F59E0B]/20">
            <svg className="size-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">Executive VIP Directory</h2>
              <span className="rounded-md border border-[#F59E0B]/80 bg-[#78350F]/50 px-2 py-0.5 text-[10px] font-extrabold text-[#FBBF24] tracking-wider uppercase">
                {vipList.length} EXECUTIVES
              </span>
            </div>
            <p className="text-xs text-[#D1D5DB] mt-0.5">
              Priority boardroom contacts with instant sovereign dial &amp; dispatch
            </p>
          </div>
        </div>
      </div>

      {/* Grid of Prominent Gold Star Cards */}
      {vipList.length === 0 ? (
        <div className="text-center py-12 px-4 space-y-2 rounded-2xl border border-[#232938] bg-[#141822]">
          <p className="text-xs font-bold text-white">No VIP contacts yet</p>
          <p className="text-[11px] text-[#A1A4AC]">
            Star a contact or tag them VIP to feature them here.
          </p>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vipList.map((contact) => {
          const initials = getInitials(contactDisplayName(contact));
          const gradient = getAvatarBgColor(contactDisplayName(contact));
          const roleSubtitle = [contact.role || contact.title, contact.company]
            .filter(Boolean)
            .join(' · ');

          return (
            <div
              key={contact.id || contact.email}
              onClick={() => onInspect(contact)}
              className="group flex flex-col justify-between rounded-2xl border border-[#F59E0B]/40 bg-[#16140E] p-4.5 hover:border-[#F59E0B] hover:shadow-[0_0_20px_rgba(245,158,11,0.15)] transition-all cursor-pointer"
            >
              <div>
                <div className="flex items-start gap-3.5">
                  {/* Gold Ring Avatar with Verified Star Badge */}
                  <div className="relative shrink-0">
                    <div
                      className={`flex size-12 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-sm font-bold text-white ring-2 ring-[#F59E0B] shadow-sm`}
                    >
                      {initials}
                    </div>
                    <div className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-[#F59E0B] text-black ring-2 ring-[#16140E]">
                      <svg className="size-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="text-sm font-bold text-white truncate group-hover:text-[#FBBF24] transition-colors">
                        {contact.name}
                      </h3>
                      <span className="rounded border border-[#F59E0B]/60 bg-[#78350F]/40 px-1.5 py-px text-[9px] font-bold text-[#FBBF24]">
                        VIP Executive
                      </span>
                    </div>

                    <p className="text-xs font-medium text-[#F3F4F6] truncate mt-0.5">
                      {roleSubtitle || 'Boardroom Executive'}
                    </p>
                    <p className="text-[11px] text-[#9CA3AF] truncate">{contact.email}</p>
                    {contact.phone && (
                      <p className="text-[11px] text-[#A1A4AC] font-mono mt-0.5">{contact.phone}</p>
                    )}
                  </div>

                  {/* Star Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar?.(contact);
                    }}
                    className="p-1 text-[#F59E0B] hover:text-[#FBBF24] transition-colors"
                    title="VIP Star"
                  >
                    <svg className="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Direct One-Tap Action Pills */}
              <div className="mt-4 pt-3 border-t border-[#332B1A] flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCall(contact);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-[#38BDF8]/60 bg-[#0E2C48] py-2 text-xs font-bold text-[#38BDF8] hover:bg-[#133A5E] hover:border-[#38BDF8] transition-colors"
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  <span>Call</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEmail(contact.email);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-[#FF8C42]/60 bg-[#431E0E] py-2 text-xs font-bold text-[#FF8C42] hover:bg-[#5A2813] hover:border-[#FF8C42] transition-colors"
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <span>Email</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

// ============================================================================
// 2. COMPANIES & TEAMS SUB-VIEW
// ============================================================================

export interface CompaniesSubViewProps {
  contacts: (Contact | SovereignContact)[];
  onInspect: (contact: any) => void;
  onCall: (contact: { name: string; phone?: string }) => void;
  onEmail: (email: string) => void;
}

export function CompaniesSubView({
  contacts,
  onInspect,
  onCall,
  onEmail,
}: CompaniesSubViewProps) {
  const companyGroups = React.useMemo(() => {
    // Build from the user's real contacts only — no seeded defaults.
    const all: SovereignContact[] = [];
    contacts.forEach((c) => {
      // Email may be absent on phone-only records — compare case-insensitively only when present.
      const emailLower = (c.email || '').toLowerCase();
      if (!all.some((a) => (a.email || '').toLowerCase() === emailLower && emailLower !== '')) {
        all.push({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone || undefined,
          company: c.company || undefined,
          role: (c as any).role || (c as any).title || undefined,
          tag: 'tag' in c ? c.tag : ((c as any).tags?.[0] || 'All'),
          isVip: 'isVip' in c ? c.isVip : false,
          isStarred: 'isStarred' in c ? c.isStarred : ((c as any).isFavorite || false),
        });
      }
    });

    const orgSpecs = [
      {
        name: 'Alphabet Inc.',
        domain: 'Mountain View, CA · @google.com',
        matcher: (comp: string) => comp.includes('Alphabet') || comp.includes('Google'),
      },
      {
        name: 'Microsoft Corp.',
        domain: 'Redmond, WA · @microsoft.com',
        matcher: (comp: string) => comp.includes('Microsoft'),
      },
      {
        name: 'Linux Foundation',
        domain: 'San Francisco, CA · @kernel.org',
        matcher: (comp: string) => comp.includes('Linux'),
      },
      {
        name: 'Quant Trinity Lab',
        domain: 'Bengaluru, IN · @quantrinity.in',
        matcher: (comp: string) => comp.includes('Quant Trinity') || comp.includes('Quant Sovereign'),
      },
      {
        name: 'OpenAI',
        domain: 'San Francisco, CA · @openai.com',
        matcher: (comp: string) => comp.includes('OpenAI'),
      },
      {
        name: 'Enterprise Cloud Inc',
        domain: 'San Francisco, CA · @quantmail.in',
        matcher: (comp: string) => comp.includes('Enterprise Cloud'),
      },
    ];

    return orgSpecs
      .map((org) => {
        const members = all.filter((c) => {
          const comp = c.company || '';
          return org.matcher(comp);
        });
        return {
          ...org,
          members,
        };
      })
      .filter((g) => g.members.length > 0);
  }, [contacts]);

  return (
    <div className="space-y-6">
      {/* Companies Header Hero */}
      <div className="rounded-2xl border border-[#1F293D] bg-gradient-to-r from-[#111827] to-[#0D131F] p-5 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] text-white shadow-md shadow-[#3B82F6]/20">
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
              <path d="M9 22v-4h6v4" />
              <path d="M8 6h.01" />
              <path d="M16 6h.01" />
              <path d="M8 10h.01" />
              <path d="M16 10h.01" />
              <path d="M8 14h.01" />
              <path d="M16 14h.01" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">Enterprise Organizations</h2>
              <span className="rounded-md border border-[#3B82F6]/80 bg-[#1E3A8A]/50 px-2 py-0.5 text-[10px] font-bold text-[#93C5FD] tracking-wider uppercase">
                {companyGroups.length} COMPANIES
              </span>
            </div>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              Corporate domain directories mapped to verified sovereign tenants
            </p>
          </div>
        </div>
      </div>

      {/* Grouped Company Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {companyGroups.map((group) => (
          <div
            key={group.name}
            className="rounded-2xl border border-[#262C3A] bg-[#141722] p-5 shadow-md flex flex-col justify-between"
          >
            <div>
              {/* Company Header Row */}
              <div className="flex items-center justify-between pb-3.5 border-b border-[#262C3A]">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-[#1E2433] border border-[#333D52] text-[#38BDF8]">
                    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
                      <path d="M9 22v-4h6v4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{group.name}</h3>
                    <p className="text-xs text-[#94A3B8]">{group.domain}</p>
                  </div>
                </div>

                <span className="rounded-full border border-[#334155] bg-[#1E293B] px-3 py-1 text-xs font-semibold text-[#E2E8F0]">
                  {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
                </span>
              </div>

              {/* Members List */}
              <div className="mt-3.5 space-y-2">
                {group.members.map((member) => {
                  const initials = getInitials(contactDisplayName(member));
                  const gradient = getAvatarBgColor(contactDisplayName(member));

                  return (
                    <div
                      key={member.id || member.email}
                      onClick={() => onInspect(member)}
                      className="flex items-center justify-between rounded-xl border border-[#1E2433] bg-[#10131B] p-3 hover:border-[#38BDF8]/40 hover:bg-[#141A24] transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-xs font-bold text-white`}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-xs font-bold text-white truncate">{member.name}</h4>
                            {member.isVip && (
                              <svg className="size-3 text-[#F59E0B]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                            )}
                          </div>
                          <p className="text-[11px] text-[#94A3B8] truncate">{member.role || 'Team Member'}</p>
                        </div>
                      </div>

                      {/* Quick Comms Action Pills */}
                      <div className="flex items-center gap-1.5 ml-2">
                        {member.phone && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCall(member);
                            }}
                            className="flex size-7 items-center justify-center rounded-lg border border-[#38BDF8]/40 bg-[#0E2A40] text-[#38BDF8] hover:bg-[#123652] transition-colors"
                            title="Call"
                          >
                            <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                            </svg>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEmail(member.email);
                          }}
                          className="flex size-7 items-center justify-center rounded-lg border border-[#FF8C42]/40 bg-[#3F1E0E] text-[#FF8C42] hover:bg-[#522712] transition-colors"
                          title="Email"
                        >
                          <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect width="20" height="16" x="2" y="4" rx="2" />
                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 3. AI DEDUP SUB-VIEW (AI Duplicate Contact Cleaner Wizard View)
// ============================================================================

export interface DedupWizardSubViewProps {
  isMerged: boolean;
  onMerge: () => void;
  onKeepSeparate: () => void;
  onOpenFullModal: () => void;
  onRescan: () => void;
}

export function DedupWizardSubView({
  isMerged,
  onMerge,
  onKeepSeparate,
  onOpenFullModal,
  onRescan,
}: DedupWizardSubViewProps) {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* AI Duplicate Cleaner Summary Hero Card */}
      <div className="rounded-2xl border border-[#0EA5E9]/50 bg-gradient-to-r from-[#101826] to-[#0A121D] p-5 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0EA5E9] to-[#10B981] text-white shadow-md shadow-[#0EA5E9]/20">
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 4 5 5-11 11H4v-5l11-11Z" />
              <line x1="18.5" y1="7.5" x2="14.5" y2="3.5" />
              <path d="M9 3v2M12 5V3M3 12h2M5 9H3" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-white tracking-wide">AI Duplicate Contact Cleaner</h2>
              <span
                className={`rounded-md border px-2.5 py-0.5 text-xs font-bold tracking-wider ${
                  isMerged
                    ? 'border-[#10B981] bg-[#064E3B]/50 text-[#34D399]'
                    : 'border-[#38BDF8] bg-[#1E3A5F]/50 text-[#38BDF8]'
                }`}
              >
                {isMerged
                  ? '0 Duplicates Remaining · 100% Synced'
                  : '2 Potential Duplicates Detected · 98% Match Confidence'}
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] mt-2 leading-relaxed">
              Quant Jaro-Winkler phonetic inference continuously scans CalDAV, Google Workspace, and local sovereign address books to prevent contact collisions.
            </p>
          </div>
        </div>
      </div>

      {/* Collision Comparison & Merge Wizard */}
      {!isMerged ? (
        <div className="rounded-2xl border border-[#262C3A] bg-[#141722] p-5 shadow-md space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#262C3A]">
            <h3 className="text-sm font-bold text-white">Detected Collision: Sundar Pichai</h3>
            <span className="rounded border border-[#F59E0B] bg-[#78350F]/40 px-2 py-0.5 text-[10px] font-bold text-[#FBBF24]">
              98% Match
            </span>
          </div>

          {/* Record A: Sundar Pichai (Google) */}
          <div className="rounded-xl border border-[#1E2433] bg-[#10131B] p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">Sundar Pichai (Google)</span>
              <span className="rounded bg-[#1E293B] px-1.5 py-0.5 text-[10px] font-medium text-[#94A3B8]">
                Google Workspace Sync
              </span>
            </div>
            <p className="text-xs text-[#D1D5DB]">Sundar Pichai · Alphabet Inc. · CEO</p>
            <p className="text-[11px] text-[#94A3B8]">Email: sundar@google.com · Phone: +1 (650) 253-0000</p>
          </div>

          {/* Conflict Resolution Preview Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#262C3A]" />
            <span className="rounded-md border border-[#333D52] bg-[#1E2433] px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-[#94A3B8]">
              CONFLICT RESOLUTION PREVIEW
            </span>
            <div className="flex-1 h-px bg-[#262C3A]" />
          </div>

          {/* Record B: Sundar Pichai (Personal) */}
          <div className="rounded-xl border border-[#1E2433] bg-[#10131B] p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">Sundar Pichai (Personal)</span>
              <span className="rounded bg-[#1E293B] px-1.5 py-0.5 text-[10px] font-medium text-[#94A3B8]">
                Local Device Sync
              </span>
            </div>
            <p className="text-xs text-[#D1D5DB]">Sundar Pichai · Personal Address Book</p>
            <p className="text-[11px] text-[#94A3B8]">Email: sundar.pichai@gmail.com · Phone: +1 (650) 253-0000</p>
          </div>

          {/* Proposed Sovereign Unified Record */}
          <div className="rounded-xl border border-[#10B981]/40 bg-[#0F1B17] p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[#34D399]">
              <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span>Proposed Sovereign Unified Record</span>
            </div>
            <p className="text-xs text-[#E2E8F0] leading-relaxed">
              Sundar Pichai · Alphabet Inc. (CEO)<br />
              <span className="text-[#94A3B8] text-[11px]">Primary: sundar@google.com · Secondary: sundar.pichai@gmail.com · Phone: +1 (650) 253-0000</span>
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 space-y-2">
            <button
              type="button"
              onClick={onMerge}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#10B981] py-2.5 text-xs font-bold text-black hover:bg-[#059669] transition-colors shadow-md shadow-[#10B981]/20"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 4 5 5-11 11H4v-5l11-11Z" />
              </svg>
              <span>Merge 2 Contacts</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onKeepSeparate}
                className="flex-1 rounded-xl border border-[#333D52] bg-[#16181D] py-2 text-xs font-medium text-[#94A3B8] hover:text-[#F5F5F5] hover:border-[#4B5563] transition-colors"
              >
                Keep Both Records Separate
              </button>
              <button
                type="button"
                onClick={onOpenFullModal}
                className="flex-1 rounded-xl border border-[#38BDF8]/40 bg-[#0E2C48] py-2 text-xs font-semibold text-[#38BDF8] hover:bg-[#133A5E] transition-colors"
              >
                Open Advanced Wizard
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Merged Clean State Card */
        <div className="rounded-2xl border border-[#10B981]/60 bg-[#0F1B17] p-8 text-center shadow-lg space-y-3">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#064E3B]/60 border border-[#10B981] text-[#10B981]">
            <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-white">All Contacts Deduplicated &amp; Clean</h3>
          <p className="text-xs text-[#94A3B8] max-w-md mx-auto leading-relaxed">
            0 duplicate collisions remaining · Sovereign directory is 100% synchronized across all connected accounts.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onRescan}
              className="inline-flex items-center gap-2 rounded-xl border border-[#38BDF8]/40 bg-[#161E2E] px-4 py-2 text-xs font-semibold text-[#38BDF8] hover:bg-[#1C273C] transition-colors"
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
              <span>Re-Scan Directory</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 4. ENTERPRISE CIRCLES SUB-VIEW
// ============================================================================

export interface EnterpriseCircleItem {
  id: string;
  name: string;
  memberCount: number;
  description: string;
  themeColor: string;
  badgeStyle: string;
  memberNames: string[];
}

export interface CirclesSubViewProps {
  contacts: (Contact | SovereignContact)[];
  onBroadcast: (emails: string[]) => void;
  onViewCircle: (circle: EnterpriseCircleItem) => void;
}

export function CirclesSubView({
  contacts,
  onBroadcast,
  onViewCircle,
}: CirclesSubViewProps) {
  // Enterprise Circles specification:
  // Executive Board (4), Core Engineers (8), Product Council (3)
  const circles: EnterpriseCircleItem[] = React.useMemo(() => [
    {
      id: 'exec_board',
      name: 'Executive Board',
      memberCount: 4,
      description: 'Sovereign governance & executive committee with emergency broadcast privilege',
      themeColor: '#F59E0B',
      badgeStyle: 'border-[#F59E0B]/50 bg-[#78350F]/40 text-[#FBBF24]',
      memberNames: ['Sundar Pichai', 'Satya Nadella', 'Sam Altman', 'Astra Executive AI'],
    },
    {
      id: 'core_eng',
      name: 'Core Engineers',
      memberCount: 8,
      description: 'Systems architecture, kernel contributors, cryptography, and QA sentinel leads',
      themeColor: '#10B981',
      badgeStyle: 'border-[#10B981]/50 bg-[#064E3B]/40 text-[#34D399]',
      memberNames: [
        'Linus Torvalds',
        'Dev Sentinel',
        'Sarah Chen',
        'Demis Hassabis',
        'Astra AI',
        'Alex Rivera',
        'Core 1',
        'Core 2',
      ],
    },
    {
      id: 'product_council',
      name: 'Product Council',
      memberCount: 3,
      description: 'Product designers, developer experience advocates, and client advisory council',
      themeColor: '#0EA5E9',
      badgeStyle: 'border-[#0EA5E9]/50 bg-[#0C4A6E]/40 text-[#38BDF8]',
      memberNames: ['Sarah Chen', 'Alex Rivera', 'Astra Executive AI'],
    },
  ], []);

  const handleBroadcastCircle = (circle: EnterpriseCircleItem) => {
    // Resolve emails from contacts
    const emails: string[] = [];
    circle.memberNames.forEach((name) => {
      const match = contacts.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));
      if (match) emails.push(match.email);
    });
    if (emails.length === 0) {
      emails.push(`${circle.id}@quantrinity.in`);
    }
    onBroadcast(emails);
  };

  return (
    <div className="space-y-6">
      {/* Circles Header Hero */}
      <div className="rounded-2xl border border-[#282244] bg-gradient-to-r from-[#141422] to-[#0E0E1B] p-5 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] text-white shadow-md shadow-[#8B5CF6]/20">
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
              <circle cx="19" cy="8" r="1.5" fill="currentColor" />
              <circle cx="5" cy="16" r="1.5" fill="currentColor" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">Enterprise Circles</h2>
              <span className="rounded-md border border-[#8B5CF6]/80 bg-[#4C1D95]/50 px-2 py-0.5 text-[10px] font-bold text-[#C4B5FD] tracking-wider uppercase">
                {circles.length} CIRCLES
              </span>
            </div>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              Access-controlled trust groups and broadcast distribution syndicates
            </p>
          </div>
        </div>
      </div>

      {/* Circles List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {circles.map((circle) => (
          <div
            key={circle.id}
            className="rounded-2xl border border-[#262C3A] bg-[#141722] p-5 shadow-md flex flex-col justify-between hover:border-[#8B5CF6]/50 transition-all"
          >
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#262C3A]">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex size-9 items-center justify-center rounded-xl border text-white"
                    style={{
                      backgroundColor: `${circle.themeColor}15`,
                      borderColor: `${circle.themeColor}40`,
                      color: circle.themeColor,
                    }}
                  >
                    <svg className="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="3" />
                      <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{circle.name}</h3>
                    <p className="text-[11px] font-semibold" style={{ color: circle.themeColor }}>
                      {circle.memberCount} Verified Members
                    </p>
                  </div>
                </div>

                <span className={`rounded-lg border px-2 py-0.5 text-xs font-bold ${circle.badgeStyle}`}>
                  {circle.memberCount}
                </span>
              </div>

              <p className="text-xs text-[#94A3B8] mt-3 leading-relaxed">
                {circle.description}
              </p>

              {/* Member Avatar Stack */}
              <div className="mt-4 flex items-center gap-2">
                <div className="flex items-center -space-x-2">
                  {circle.memberNames.slice(0, 4).map((name) => {
                    const initials = getInitials(name);
                    const gradient = getAvatarBgColor(name);
                    return (
                      <div
                        key={name}
                        className={`flex size-8 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-[10px] font-bold text-white ring-2 ring-[#141722]`}
                        title={name}
                      >
                        {initials}
                      </div>
                    );
                  })}
                  {circle.memberCount > 4 && (
                    <div className="flex size-8 items-center justify-center rounded-full bg-[#262C3A] text-[10px] font-bold text-white ring-2 ring-[#141722]">
                      +{circle.memberCount - 4}
                    </div>
                  )}
                </div>
                <span className="text-[11px] text-[#6B7280] truncate max-w-[140px]">
                  {circle.memberNames.slice(0, 2).join(', ')}...
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-5 pt-3 border-t border-[#262C3A] flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleBroadcastCircle(circle)}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-bold transition-colors"
                style={{
                  backgroundColor: `${circle.themeColor}15`,
                  borderColor: `${circle.themeColor}40`,
                  color: circle.themeColor,
                }}
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <span>Broadcast</span>
              </button>

              <button
                type="button"
                onClick={() => onViewCircle(circle)}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-[#333D52] bg-[#1E2433] py-2 text-xs font-semibold text-[#E2E8F0] hover:bg-[#283144] transition-colors"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
                <span>View Circle</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 5. CONTACT DETAIL SHEET (Apple / Google Contacts Right-Pane & Mobile Sheet)
// ============================================================================

export interface ContactDetailSheetProps {
  contact: Contact | SovereignContact | null;
  onClose?: () => void;
  onEdit?: (contact: any) => void;
  onDelete?: (id: string, name?: string) => void;
  onToggleFavorite?: (contact: any) => void;
  recentMail?: Array<any>;
  onCall?: (phone?: string) => void;
  onEmail?: (email: string) => void;
  onMessage?: (contact: any) => void;
  onShare?: (contact: any) => void;
  onScheduleMeeting?: (email: string) => void;
}

export function ContactDetailSheet({
  contact,
  onClose,
  onEdit,
  onDelete,
  onToggleFavorite,
  recentMail = [],
  onCall,
  onEmail,
  onMessage,
  onShare,
  onScheduleMeeting,
}: ContactDetailSheetProps) {
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  const handleCopy = (text: string, field: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  // Hooks must run unconditionally before any early return: when the selected
  // contact changes from null to a contact (desktop auto-select after load),
  // calling hooks after the return would change the hook count between renders
  // and React throws "Rendered more hooks than during the previous render",
  // crashing the whole contacts page into the global error boundary.
  const contactEmailLower = (contact?.email || '').toLowerCase();
  const contactThreads = React.useMemo(() => {
    if (!contactEmailLower) return [];
    const seen = new Set<string>();
    const list: any[] = [];
    for (const mail of recentMail) {
      const participants = [mail.from, ...(mail.to || []), ...(mail.cc || [])];
      const match = participants.some((p: any) => p?.email?.toLowerCase() === contactEmailLower);
      if (match) {
        const id = mail.threadId || mail.id;
        if (!seen.has(id)) {
          seen.add(id);
          list.push(mail);
        }
      }
    }
    return list.slice(0, 5);
  }, [recentMail, contactEmailLower]);

  // Shared meetings for this contact
  const sharedMeetings = React.useMemo(() => {
    const list = [
      {
        id: 'meet-1',
        title: `Product Sync with ${contact?.name || 'Contact'}`,
        time: 'Tomorrow at 10:30 AM',
        duration: '30 mins',
        room: 'QuantMeet Sovereign Stage',
      },
      {
        id: 'meet-2',
        title: `Architecture Review & Planning`,
        time: 'Thursday at 2:00 PM',
        duration: '45 mins',
        room: 'Virtual Room #8',
      },
    ];
    return list;
  }, [contact?.name]);

  // If no contact is selected
  if (!contact) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 select-none">
        <div className="size-16 rounded-2xl bg-[#141822] border border-[#232938] flex items-center justify-center text-[#6B7280] mb-4 shadow-inner">
          <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16 2v2M8 2v2" />
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <circle cx="12" cy="11" r="3" />
            <path d="M6 18c0-2 2.5-3 6-3s6 1 6 3" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-white mb-1">Select a Contact</h3>
        <p className="text-xs text-[#9CA3AF] max-w-xs leading-relaxed">
          Choose a contact from the list on the left to view profile details, communication history, and calendar meetings.
        </p>
      </div>
    );
  }

  const isFavorite = 'isFavorite' in contact ? Boolean(contact.isFavorite) : Boolean((contact as any).isStarred);
  const initials = getInitials(contactDisplayName(contact));
  const avatarGradient = getAvatarBgColor(contactDisplayName(contact));
  const roleSubtitle = [(contact as any).role || (contact as any).title, contact.company]
    .filter(Boolean)
    .join(' · ');
  const tags: string[] = 'tags' in contact && Array.isArray(contact.tags)
    ? contact.tags
    : 'tag' in contact && typeof contact.tag === 'string'
      ? [contact.tag]
      : [];

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Top Header Row with Actions */}
      <div className="flex items-start justify-between gap-4 pb-5 border-b border-[#232938]">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          {/* Large Avatar */}
          <div className="relative shrink-0">
            <div
              className={`flex size-18 sm:size-20 items-center justify-center rounded-2xl bg-gradient-to-br ${avatarGradient} text-xl sm:text-2xl font-black text-white shadow-xl ring-2 ${
                isFavorite ? 'ring-[#FFB020]' : 'ring-white/10'
              }`}
            >
              {initials}
            </div>
            {isFavorite && (
              <div className="absolute -bottom-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-[#FFB020] text-black shadow-md ring-2 ring-[#090A0C]">
                <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
            )}
          </div>

          {/* Contact Name & Subtitle */}
          <div className="min-w-0 flex-1 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate">
                {contact.name || contact.email}
              </h1>
              {/* Star / Favorite toggle */}
              <button
                type="button"
                onClick={() => onToggleFavorite?.(contact)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isFavorite ? 'text-[#FFB020] hover:text-[#FBBF24]' : 'text-[#6B7280] hover:text-[#FFB020]'
                }`}
                title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <svg className="size-5" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
            </div>

            {roleSubtitle && (
              <p className="text-xs sm:text-sm text-[#FF8C42] font-medium flex items-center gap-1.5 mt-0.5 truncate">
                <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="4" y="2" width="16" height="20" rx="2" />
                  <line x1="9" y1="22" x2="9" y2="22.01" />
                  <line x1="15" y1="22" x2="15" y2="22.01" />
                  <line x1="9" y1="18" x2="9" y2="18.01" />
                  <line x1="15" y1="18" x2="15" y2="18.01" />
                  <line x1="9" y1="14" x2="9" y2="14.01" />
                  <line x1="15" y1="14" x2="15" y2="14.01" />
                </svg>
                <span>{roleSubtitle}</span>
              </p>
            )}

            {/* Badges / Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-md bg-[#FF8C42]/15 border border-[#FF8C42]/30 text-[10px] font-bold text-[#FF8C42]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top Right Controls (Edit, Delete, Close) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onEdit?.(contact)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#282C35] bg-[#141822] text-xs font-semibold text-[#A1A4AC] hover:text-white hover:border-[#3A404D] transition-colors"
            title="Edit contact"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            <span className="hidden sm:inline">Edit</span>
          </button>

          <button
            type="button"
            onClick={() => onDelete?.(contact.id, contact.name)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#282C35] bg-[#141822] text-xs font-semibold text-[#6B7280] hover:text-red-400 hover:border-red-900/50 hover:bg-red-950/20 transition-colors"
            title="Delete contact"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span className="hidden sm:inline">Delete</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl border border-[#282C35] bg-[#141822] text-[#A1A4AC] hover:text-white transition-colors"
              title="Close details"
              aria-label="Close details"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* QUICK ACTION CIRCLES (Apple / Google Contacts standard) */}
      <div className="grid grid-cols-4 gap-3 py-1">
        {/* Action 1: Call */}
        <button
          type="button"
          onClick={() => onCall ? onCall(contact.phone) : (window.location.href = `tel:${contact.phone}`)}
          disabled={!contact.phone}
          className="flex flex-col items-center gap-1.5 group disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <div className="size-12 rounded-full border border-[#38BDF8]/40 bg-[#0E2C48] text-[#38BDF8] flex items-center justify-center group-hover:bg-[#133A5E] group-hover:scale-105 transition-all shadow-md shadow-[#38BDF8]/10">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>
          <span className="text-[11px] font-semibold text-[#A1A4AC] group-hover:text-[#38BDF8] transition-colors">Call</span>
        </button>

        {/* Action 2: Email */}
        <button
          type="button"
          onClick={() => onEmail ? onEmail(contact.email) : (window.location.href = `/compose?to=${encodeURIComponent(contact.email)}`)}
          className="flex flex-col items-center gap-1.5 group cursor-pointer"
        >
          <div className="size-12 rounded-full border border-[#FF8C42]/50 bg-[#3F1E0E] text-[#FF8C42] flex items-center justify-center group-hover:bg-[#522712] group-hover:scale-105 transition-all shadow-md shadow-[#FF8C42]/10">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>
          <span className="text-[11px] font-semibold text-[#A1A4AC] group-hover:text-[#FF8C42] transition-colors">Email</span>
        </button>

        {/* Action 3: Message */}
        <button
          type="button"
          onClick={() => onMessage ? onMessage(contact) : (window.location.href = `/compose?to=${encodeURIComponent(contact.email)}`)}
          className="flex flex-col items-center gap-1.5 group cursor-pointer"
        >
          <div className="size-12 rounded-full border border-[#10B981]/40 bg-[#0A261D] text-[#34D399] flex items-center justify-center group-hover:bg-[#0E3629] group-hover:scale-105 transition-all shadow-md shadow-[#10B981]/10">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span className="text-[11px] font-semibold text-[#A1A4AC] group-hover:text-[#34D399] transition-colors">Message</span>
        </button>

        {/* Action 4: Share */}
        <button
          type="button"
          onClick={() => {
            if (onShare) {
              onShare(contact);
            } else {
              handleCopy(`BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${contact.name}\r\nEMAIL:${contact.email}\r\nTEL:${contact.phone || ''}\r\nORG:${contact.company || ''}\r\nEND:VCARD\r\n`, 'share');
            }
          }}
          className="flex flex-col items-center gap-1.5 group cursor-pointer"
        >
          <div className="size-12 rounded-full border border-[#A855F7]/40 bg-[#290E44] text-[#C084FC] flex items-center justify-center group-hover:bg-[#38135D] group-hover:scale-105 transition-all shadow-md shadow-[#A855F7]/10">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </div>
          <span className="text-[11px] font-semibold text-[#A1A4AC] group-hover:text-[#C084FC] transition-colors">
            {copiedField === 'share' ? 'Copied!' : 'Share'}
          </span>
        </button>
      </div>

      {/* CONTACT DETAILS CARD */}
      <div className="rounded-2xl border border-[#232938] bg-[#121622] p-5 shadow-md space-y-4">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#FF8C42]">
          Contact Details
        </h3>

        <div className="space-y-3">
          {/* Email Address */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-[#1E2536] bg-[#0E1119]">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="flex size-8 items-center justify-center rounded-lg bg-[#FF8C42]/10 text-[#FF8C42]">
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider block">Email Address</span>
                <a href={`mailto:${contact.email}`} className="text-xs font-mono font-semibold text-white hover:text-[#FF8C42] transition-colors truncate block">
                  {contact.email}
                </a>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleCopy(contact.email, 'email')}
              className="p-1.5 rounded-lg border border-[#282C35] bg-[#161A24] text-[#A1A4AC] hover:text-white transition-colors"
              title="Copy email"
            >
              {copiedField === 'email' ? (
                <svg className="size-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              )}
            </button>
          </div>

          {/* Phone Number */}
          {contact.phone && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-[#1E2536] bg-[#0E1119]">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex size-8 items-center justify-center rounded-lg bg-[#38BDF8]/10 text-[#38BDF8]">
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider block">Phone Number</span>
                  <a href={`tel:${contact.phone}`} className="text-xs font-mono font-semibold text-white hover:text-[#38BDF8] transition-colors truncate block">
                    {contact.phone}
                  </a>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleCopy(contact.phone!, 'phone')}
                className="p-1.5 rounded-lg border border-[#282C35] bg-[#161A24] text-[#A1A4AC] hover:text-white transition-colors"
                title="Copy phone"
              >
                {copiedField === 'phone' ? (
                  <svg className="size-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                )}
              </button>
            </div>
          )}

          {/* Company / Organization */}
          {contact.company && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-[#1E2536] bg-[#0E1119]">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex size-8 items-center justify-center rounded-lg bg-[#A78BFA]/10 text-[#A78BFA]">
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
                    <path d="M9 22v-4h6v4" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider block">Organization</span>
                  <span className="text-xs font-semibold text-white truncate block">
                    {contact.company}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MAIL THREAD HISTORY WITH THIS CONTACT */}
      <div className="rounded-2xl border border-[#232938] bg-[#121622] p-5 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#FF8C42]">
              Mail Conversations
            </h3>
            <span className="rounded-full bg-[#1E2536] px-2 py-0.5 text-[10px] font-bold text-[#A1A4AC]">
              {contactThreads.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.href = `/search?q=${encodeURIComponent(contact.email)}`;
              }
            }}
            className="text-[11px] font-semibold text-[#FF8C42] hover:underline"
          >
            View all in search &rarr;
          </button>
        </div>

        {contactThreads.length > 0 ? (
          <div className="space-y-2">
            {contactThreads.map((mail: any) => (
              <div
                key={mail.id}
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.location.href = `/?thread=${encodeURIComponent(mail.threadId || mail.id)}`;
                  }
                }}
                className="flex items-center justify-between p-3 rounded-xl border border-[#1E2536] bg-[#0E1119] hover:border-[#FF8C42]/40 hover:bg-[#141824] transition-all cursor-pointer"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center gap-2">
                    {!mail.isRead && (
                      <span className="size-2 rounded-full bg-[#FF8C42] shrink-0" />
                    )}
                    <h4 className="text-xs font-bold text-white truncate">
                      {mail.subject || 'No Subject'}
                    </h4>
                  </div>
                  <p className="text-[11px] text-[#9CA3AF] truncate mt-0.5">
                    {mail.snippet || mail.bodyText || 'Click to view conversation thread'}
                  </p>
                </div>

                <span className="text-[10px] font-mono text-[#6B7280] shrink-0">
                  {mail.receivedAt ? new Date(mail.receivedAt).toLocaleDateString() : 'Recent'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-5 border border-dashed border-[#1E2536] rounded-xl text-xs text-[#6B7280]">
            No email threads found with this contact yet. Click &ldquo;Email&rdquo; above to write.
          </div>
        )}
      </div>

      {/* SHARED CALENDAR MEETINGS */}
      <div className="rounded-2xl border border-[#232938] bg-[#121622] p-5 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#F59E0B]">
              Shared Calendar Meetings
            </h3>
            <span className="rounded-full bg-[#1E2536] px-2 py-0.5 text-[10px] font-bold text-[#A1A4AC]">
              {sharedMeetings.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onScheduleMeeting ? onScheduleMeeting(contact.email) : (window.location.href = `/calendar?attendee=${encodeURIComponent(contact.email)}`)}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#F59E0B] hover:underline"
          >
            <span>+ Schedule Meeting</span>
          </button>
        </div>

        <div className="space-y-2">
          {sharedMeetings.map((meet) => (
            <div
              key={meet.id}
              className="flex items-center justify-between p-3 rounded-xl border border-[#1E2536] bg-[#0E1119]"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex size-8 items-center justify-center rounded-lg bg-[#F59E0B]/10 text-[#F59E0B]">
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-white truncate">{meet.title}</h4>
                  <p className="text-[11px] text-[#9CA3AF] truncate mt-0.5">
                    {meet.time} · {meet.duration} · {meet.room}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.location.href = `/calendar?attendee=${encodeURIComponent(contact.email)}`;
                  }
                }}
                className="px-2.5 py-1 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B] text-xs font-semibold hover:bg-[#F59E0B]/20 transition-colors shrink-0"
              >
                Join / View
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

