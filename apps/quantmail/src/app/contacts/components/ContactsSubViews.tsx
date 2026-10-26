'use client';

import React from 'react';
import type { Contact, CompanyGroup, SearchEmailRequest } from '../../../types';
import { sanitizeSnippetText } from '../../../lib/threading';
import { apiClient } from '../../../services/api-client';
import { Avatar } from '@quant/shared-ui';

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

/**
 * Locked per-app accent: Contacts = amber (see design tokens — Mail orange,
 * Calendar blue, Drive green, Contacts amber, QuantGit purple). Avatar
 * gradients in the contacts surface MUST stay inside the amber family; the old
 * rainbow palette (indigo/purple, pink/rose, blue/cyan, emerald/teal,
 * violet/fuchsia) broke the lock. The hash keeps avatars deterministic per
 * contact so the same contact always renders the same gradient.
 */
export function getAvatarBgColor(name?: string | null): string {
  const gradients = [
    'from-amber-600 to-orange-600',
    'from-yellow-600 to-amber-600',
    'from-amber-500 to-yellow-600',
    'from-orange-600 to-amber-700',
    'from-amber-700 to-orange-800',
    'from-yellow-500 to-orange-600',
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

/**
 * SIA-P2-10: mail-row date rendered the same way as the inbox thread view
 * (ConversationalThreadView's formatDayDivider) — "Today"/"Yesterday"/
 * weekday/"Oct 8" — instead of the bare toLocaleDateString() "10/9/2026"
 * style that clashed with the inbox.
 */
export function formatContactMailDate(value?: string | Date | null): string {
  if (!value) return 'Recent';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recent';
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const thatDay = new Date(date);
  thatDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - thatDay.getTime()) / 86_400_000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

// ============================================================================
// 2. COMPANIES & TEAMS SUB-VIEW
// ============================================================================

export interface CompaniesSubViewProps {
  /**
   * Page-scoped contact list, grouped client-side. Legacy path — kept for
   * callers/tests that group a known list.
   */
  contacts?: (Contact | SovereignContact)[];
  /**
   * Server-aggregated groups across ALL of the user's contacts
   * (`GET /contacts/companies`). When provided, the client-side grouping
   * from `contacts` is skipped: grouping from a paginated page silently
   * dropped companies whose members all sat on other pages and undercounted
   * members, while the header copy read as complete.
   */
  groups?: CompanyGroup[];
  onInspect: (contact: any) => void;
  onCall: (contact: { name: string; phone?: string }) => void;
  onEmail: (email: string) => void;
}

export function CompaniesSubView({
  contacts = [],
  groups,
  onInspect,
  onCall,
  onEmail,
}: CompaniesSubViewProps) {
  // True only for the server-aggregated path: the header copy must say the
  // groups span the whole address book, not just the loaded page.
  const isWholeAddressBook = groups !== undefined;

  const companyGroups = React.useMemo(() => {
    if (groups) {
      // Server-aggregated across all contacts — normalize to the
      // SovereignContact shape the member card renders.
      return groups.map((g) => ({
        name: g.name,
        subtitle: g.subtitle,
        members: g.members.map(
          (m): SovereignContact => ({
            id: m.id,
            name: m.name,
            email: m.email,
            phone: m.phone || undefined,
            company: m.company || undefined,
            role: undefined,
            tag: m.tags?.[0] || 'All',
            isVip: m.isFavorite || false,
            isStarred: m.isFavorite || false,
          }),
        ),
      }));
    }

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

    // Group by the contact's own `company` field — nothing is seeded, matched by
    // substring rules, or looked up anywhere. Companies that appear here exist
    // only because the user's contacts say they work there.
    // (Named groupMap, not groups: the `groups` prop is in scope above.)
    const groupMap = new Map<string, { name: string; members: SovereignContact[] }>();
    all.forEach((c) => {
      const raw = (c.company || '').trim();
      if (!raw) return; // no company on the record — nothing honest to group by
      const key = raw.toLowerCase();
      const existing = groupMap.get(key);
      if (existing) {
        existing.members.push(c);
      } else {
        groupMap.set(key, { name: raw, members: [c] });
      }
    });

    return [...groupMap.values()]
      .map((g) => {
        // Subtitle is derived from the members' own email addresses: the most
        // common email domain in the group. Never an invented HQ or domain.
        const domainCounts = new Map<string, number>();
        g.members.forEach((m) => {
          const email = (m.email || '').trim();
          const at = email.lastIndexOf('@');
          if (at > 0) {
            const domain = email.slice(at + 1).toLowerCase();
            if (domain) domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
          }
        });
        let commonDomain = '';
        domainCounts.forEach((count, domain) => {
          if (count > (domainCounts.get(commonDomain) || 0)) commonDomain = domain;
        });
        return { ...g, subtitle: commonDomain ? `@${commonDomain}` : undefined };
      })
      .sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name));
  }, [contacts, groups]);

  return (
    <div className="space-y-6">
      {/* Companies Header Hero */}
      <div className="rounded-2xl border border-[#1F293D] bg-gradient-to-r from-[#111827] to-[#0D131F] p-5 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--app-accent)] to-[color-mix(in_srgb,var(--app-accent),black_30%)] text-white shadow-md shadow-[color-mix(in_srgb,var(--app-accent)_20%,transparent)]">
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
              <h2 className="text-base font-bold text-white tracking-wide">Companies</h2>
              {companyGroups.length > 0 && (
                <span className="rounded-md border border-[color-mix(in_srgb,var(--app-accent)_80%,transparent)] bg-[color-mix(in_srgb,var(--app-accent)_30%,black)]/50 px-2 py-0.5 text-[10px] font-bold text-[var(--app-accent)] tracking-wider uppercase">
                  {companyGroups.length} COMPANIES
                </span>
              )}
            </div>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              {isWholeAddressBook
                ? 'Grouped from the organization fields across all your contacts — no directories, no external claims'
                : 'Grouped from the organization fields in your own contacts — no directories, no external claims'}
            </p>
          </div>
        </div>
      </div>

      {/* Grouped Company Cards */}
      {companyGroups.length === 0 ? (
        <div className="rounded-2xl border border-[#262C3A] bg-[#0B0E14] p-8 text-center">
          <p className="text-sm font-semibold text-[#E2E8F0]">No company data yet</p>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Add an organization to your contacts and they will be grouped here automatically.
          </p>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {companyGroups.map((group) => (
          <div
            key={group.name}
            className="rounded-2xl border border-[#262C3A] bg-[var(--quant-surface-elevated)] p-5 shadow-md flex flex-col justify-between"
          >
            <div>
              {/* Company Header Row */}
              <div className="flex items-center justify-between pb-3.5 border-b border-[#262C3A]">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-[#1E2433] border border-[#333D52] text-[var(--app-accent)]">
                    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
                      <path d="M9 22v-4h6v4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{group.name}</h3>
                    {group.subtitle && (
                      <p className="text-xs text-[#94A3B8]">{group.subtitle}</p>
                    )}
                  </div>
                </div>

                <span className="rounded-full border border-[#334155] bg-[var(--quant-surface-elevated)] px-3 py-1 text-xs font-semibold text-[#E2E8F0]">
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
                      className="flex items-center justify-between rounded-xl border border-[#1E2433] bg-[#10131B] p-3 hover:border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] hover:bg-[#141A24] transition-all cursor-pointer"
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
                              <svg className="size-3 text-[var(--quant-warning)]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                            )}
                          </div>
                          {member.role && (
                            <p className="text-[11px] text-[#94A3B8] truncate">{member.role}</p>
                          )}
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
                            className="flex size-7 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] bg-[#3F1E0E] text-[var(--app-accent)] hover:bg-[#522712] transition-colors"
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
                          className="flex size-7 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] bg-[#3F1E0E] text-[var(--app-accent)] hover:bg-[#522712] transition-colors"
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
      )}
    </div>
  );
}

// ============================================================================
// 3. DEDUP SUB-VIEW (Duplicate Contact Cleaner Wizard View)
// ============================================================================

export interface DedupCollisionRecord {
  id: string;
  name: string;
  sourceLabel: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface DedupCollisionPair {
  id: string;
  recordA: DedupCollisionRecord;
  recordB: DedupCollisionRecord;
  /** 0-100. Rendered only when supplied by a real detection source — never invented. */
  matchConfidence?: number;
  /**
   * Every record this collision's merge will touch, primary first.
   * handleDedupMerge merges the WHOLE duplicate cluster (not just the two
   * previewed records), so the wizard renders all of these and the merge
   * button counts them — the button copy must match the real merge scope.
   * Populated by loadDedupPairs from the full cluster. When absent (older
   * callers / tests), the wizard falls back to [recordA, recordB].
   */
  allRecords?: DedupCollisionRecord[];
}

export interface DedupWizardSubViewProps {
  isMerged: boolean;
  /**
   * Real duplicate candidates from an actual detection pass. When empty or
   * undefined the honest clean state renders — this component never invents
   * collisions, names, or match-confidence numbers.
   */
  collisions?: DedupCollisionPair[];
  onMerge: (collisionId?: string) => void;
  onKeepSeparate: (collisionId?: string) => void;
  onOpenFullModal: (collisionId?: string) => void;
  onRescan: () => void;
}

export function DedupWizardSubView({
  isMerged,
  collisions,
  onMerge,
  onKeepSeparate,
  onOpenFullModal,
  onRescan,
}: DedupWizardSubViewProps) {
  const activeCollisions = isMerged ? [] : (collisions ?? []);
  const collision = activeCollisions[0];
  const remaining = activeCollisions.length;

  // qm-dedup-cluster: the merge touches the WHOLE duplicate cluster, not just
  // the two previewed records — render every record that will be merged and
  // count them on the button so the copy matches the real merge scope.
  const mergeRecords: DedupCollisionRecord[] =
    collision?.allRecords && collision.allRecords.length > 0
      ? collision.allRecords
      : collision
        ? [collision.recordA, collision.recordB]
        : [];
  const primaryRec = mergeRecords[0] ?? collision?.recordA;
  const restRecs = mergeRecords.slice(1);
  const mergeCount = mergeRecords.length;
  // Mirror the backend merge semantics (contact.service.ts mergeContacts):
  // the primary survives; phone/company fill from duplicates only when the
  // primary lacks them. Never invent fields the merge does not keep.
  const previewCompany =
    primaryRec?.company ?? restRecs.find((r) => r.company)?.company ?? null;
  const previewPhone =
    primaryRec?.phone || restRecs.find((r) => r.phone)?.phone || null;
  const previewEmails = mergeRecords
    .map((r, i) =>
      r.email
        ? `${i === 0 ? 'Primary' : i === 1 ? 'Secondary' : `Duplicate ${i + 1}`}: ${r.email}`
        : null,
    )
    .filter((s): s is string => Boolean(s));
  const previewDetailLine =
    [...previewEmails, previewPhone ? `Phone: ${previewPhone}` : null]
      .filter(Boolean)
      .join(' · ') || 'No contact details to merge';

  const renderCollisionRecord = (record: DedupCollisionRecord) => (
    <div className="rounded-xl border border-[#1E2433] bg-[#10131B] p-3.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-white">{record.name}</span>
        <span className="rounded bg-[var(--quant-surface-elevated)] px-1.5 py-0.5 text-[10px] font-medium text-[#94A3B8]">
          {record.sourceLabel}
        </span>
      </div>
      <p className="text-xs text-[#D1D5DB]">
        {record.name}
        {record.company ? ` · ${record.company}` : ''}
      </p>
      <p className="text-[11px] text-[#94A3B8]">
        {[
          record.email ? `Email: ${record.email}` : null,
          record.phone ? `Phone: ${record.phone}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'No contact details'}
      </p>
    </div>
  );
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Duplicate Cleaner Summary Hero Card */}
      <div className="rounded-2xl border border-[color-mix(in_srgb,var(--app-accent)_50%,transparent)] bg-gradient-to-r from-[#101826] to-[#0A121D] p-5 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--app-accent)] to-[color-mix(in_srgb,var(--app-accent),black_30%)] text-white shadow-md shadow-[color-mix(in_srgb,var(--app-accent)_20%,transparent)]">
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 4 5 5-11 11H4v-5l11-11Z" />
              <line x1="18.5" y1="7.5" x2="14.5" y2="3.5" />
              <path d="M9 3v2M12 5V3M3 12h2M5 9H3" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-white tracking-wide">Duplicate Contact Cleaner</h2>
              <span
                className={`rounded-md border px-2.5 py-0.5 text-xs font-bold tracking-wider ${
                  remaining === 0
                    ? 'border-[color-mix(in_srgb,var(--app-accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--app-accent)_12%,transparent)] text-[var(--app-accent)]'
                    : 'border-[color-mix(in_srgb,var(--app-accent)_80%,transparent)] bg-[color-mix(in_srgb,var(--app-accent)_25%,black)]/50 text-[var(--app-accent)]'
                }`}
              >
                {remaining === 0
                  ? 'No duplicates detected'
                  : `${remaining} Potential Duplicate${remaining === 1 ? '' : 's'} Detected${
                      collision?.matchConfidence != null ? ` · ${collision.matchConfidence}% Match Confidence` : ''
                    }`}
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] mt-2 leading-relaxed">
              Review possible duplicate contacts side by side and merge them into a single record.
            </p>
          </div>
        </div>
      </div>

      {/* Collision Comparison & Merge Wizard */}
      {collision ? (
        <div className="rounded-2xl border border-[#262C3A] bg-[var(--quant-surface-elevated)] p-5 shadow-md space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#262C3A]">
            <h3 className="text-sm font-bold text-white">Detected Collision: {collision.recordA.name}</h3>
            {collision.matchConfidence != null && (
              <span className="rounded border border-[var(--quant-warning)] bg-[#78350F]/40 px-2 py-0.5 text-[10px] font-bold text-[#FBBF24]">
                {collision.matchConfidence}% Match
              </span>
            )}
          </div>

          {primaryRec && renderCollisionRecord(primaryRec)}

          {/* Conflict Resolution Preview Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#262C3A]" />
            <span className="rounded-md border border-[#333D52] bg-[#1E2433] px-2.5 py-0.5 text-[var(--q-type-xs)] font-extrabold uppercase tracking-wider text-[#94A3B8]">
              CONFLICT RESOLUTION PREVIEW
            </span>
            <div className="flex-1 h-px bg-[#262C3A]" />
          </div>

          {restRecs.map((record) => (
            <React.Fragment key={record.id}>{renderCollisionRecord(record)}</React.Fragment>
          ))}

          {/* Proposed Unified Record — aggregated over every record in the merge scope */}
          <div className="rounded-xl border border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--app-accent)_8%,transparent)] p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--app-accent)]">
              <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span>Proposed Unified Record</span>
            </div>
            <p className="text-xs text-[#E2E8F0] leading-relaxed">
              {primaryRec?.name ?? collision.recordA.name}
              {previewCompany ? ` · ${previewCompany}` : ''}
              <br />
              <span className="text-[#94A3B8] text-[11px]">{previewDetailLine}</span>
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 space-y-2">
            <button
              type="button"
              onClick={() => onMerge(collision.id)}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--app-accent)] py-2.5 text-xs font-bold text-black hover:bg-[var(--app-accent-hover)] transition-colors shadow-md shadow-[color-mix(in_srgb,var(--app-accent)_20%,transparent)]"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 4 5 5-11 11H4v-5l11-11Z" />
              </svg>
              <span>
                Merge {mergeCount} Contact{mergeCount === 1 ? '' : 's'}
              </span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onKeepSeparate(collision.id)}
                className="flex-1 rounded-xl border border-[#333D52] bg-[var(--quant-surface-elevated)] py-2 text-xs font-medium text-[#94A3B8] hover:text-[var(--quant-foreground)] hover:border-[#4B5563] transition-colors"
              >
                Keep These Records Separate
              </button>
              <button
                type="button"
                onClick={() => onOpenFullModal(collision.id)}
                className="flex-1 rounded-xl border border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--app-accent)_8%,transparent)] py-2 text-xs font-semibold text-[var(--app-accent)] hover:bg-[color-mix(in_srgb,var(--app-accent)_14%,transparent)] transition-colors"
              >
                Open Advanced Wizard
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Honest Clean State Card — rendered when no real collisions exist */
        <div className="rounded-2xl border border-[color-mix(in_srgb,var(--app-accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--app-accent)_6%,transparent)] p-8 text-center shadow-lg space-y-3">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--app-accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--app-accent)_60%,transparent)] text-[var(--app-accent)]">
            <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-white">All Contacts Deduplicated &amp; Clean</h3>
          <p className="text-xs text-[#94A3B8] max-w-md mx-auto leading-relaxed">
            No duplicate collisions to review right now.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onRescan}
              className="inline-flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--app-accent)_8%,transparent)] px-4 py-2 text-xs font-semibold text-[var(--app-accent)] hover:bg-[color-mix(in_srgb,var(--app-accent)_14%,transparent)] transition-colors"
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

export interface CirclesSubViewProps {
  // QM-SCREEN-012 R2: intentionally prop-less. The circles-list branch was
  // dead (no caller ever passed circles) and `onViewCircle` was toast-only,
  // so both are deleted. If circles are ever wired for real, they get a new
  // data-driven branch here — never invented copy.
  readonly _empty?: never;
}

/**
 * The honest empty state for the no-groups view. Renders no circles because
 * the user has none — the "Enterprise Circles" grid and its
 * "Access-controlled trust groups and broadcast distribution syndicates"
 * copy were unreachable invented UI and are deleted.
 */
export function CirclesSubView(_props: CirclesSubViewProps = {}) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#262C3A] bg-[var(--quant-surface-elevated)] p-8 text-center shadow-md space-y-3">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#1E2433] border border-[#333D52] text-[var(--app-accent)]">
          <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
            <circle cx="19" cy="8" r="1.5" fill="currentColor" />
            <circle cx="5" cy="16" r="1.5" fill="currentColor" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-white">No circles yet</h3>
        <p className="text-xs text-[#94A3B8] max-w-md mx-auto leading-relaxed">
          Create a contact group to start a circle for one-tap broadcasts.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// 5. CONTACT DETAIL SHEET (Apple / Google Contacts Right-Pane & Mobile Sheet)
// ============================================================================

export interface SharedCalendarMeeting {
  id: string;
  title: string;
  time: string;
  duration?: string;
  room?: string;
}

export interface ContactDetailSheetProps {
  contact: Contact | SovereignContact | null;
  onClose?: () => void;
  onEdit?: (contact: any) => void;
  onDelete?: (id: string, name?: string) => void;
  onToggleFavorite?: (contact: any) => void;
  /**
   * Real shared meetings with this contact. When empty or undefined the honest
   * empty state renders — meetings are never invented.
   */
  meetings?: SharedCalendarMeeting[];
  onCall?: (phone?: string) => void;
  onEmail?: (email: string) => void;
  onMessage?: (contact: any) => void;
  onShare?: (contact: any) => void;
  onScheduleMeeting?: (email: string) => void;
}

/**
 * QM-SCREEN-012 R2: the two /emails/search parameter objects behind the
 * contact detail sheet's "Mail Conversations" section.
 *
 * They use the structured `from`/`to` query params (ANDed server-side by
 * EmailService.search) with the bare email as the free-text `q` the route
 * schema requires. The previous version stuffed `from:`/`to:` operators into
 * `q` instead — EmailService.search never parses operators, so Postgres did a
 * literal contains for the string "from:alice@x.com", which can never match a
 * real address, and the sheet always showed "No email threads found".
 */
export function contactThreadSearchParams(
  contactEmailLower: string,
): [Partial<SearchEmailRequest>, Partial<SearchEmailRequest>] {
  return [
    { query: contactEmailLower, from: contactEmailLower, pageSize: 20 },
    { query: contactEmailLower, to: contactEmailLower, pageSize: 20 },
  ];
}

export function ContactDetailSheet({
  contact,
  onClose,
  onEdit,
  onDelete,
  onToggleFavorite,
  meetings,
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
  // The backend `avatar` column holds a URL string when set; SovereignContact
  // rows never have one, so this is the honest fallback to initials.
  const contactAvatarUrl = (contact as Contact | null)?.avatar || null;

  // P1 QM-SCREEN-012 fix 2: "Mail Conversations" used to filter `recentMail`
  // (the first INBOX page only) — page-one-only and outbound-blind. It now
  // searches real mail twice: once for mail FROM the contact, once for mail TO
  // them (which covers sent), then dedupes by thread, sorts newest-first and
  // caps at 20. The empty state only renders after both searches complete, so
  // "no threads" is never claimed before the search actually ran.
  const [threadSearch, setThreadSearch] = React.useState<{ searched: boolean; mails: any[] }>({
    searched: false,
    mails: [],
  });

  React.useEffect(() => {
    setThreadSearch({ searched: false, mails: [] });
    if (!contactEmailLower) {
      setThreadSearch({ searched: true, mails: [] });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [inboundParams, outboundParams] = contactThreadSearchParams(contactEmailLower);
        const [inbound, outbound] = await Promise.all([
          apiClient.searchEmails(inboundParams),
          apiClient.searchEmails(outboundParams),
        ]);
        const seen = new Set<string>();
        const merged: any[] = [];
        for (const res of [inbound, outbound]) {
          const items = res.success && Array.isArray(res.data) ? res.data : [];
          for (const mail of items) {
            const id = String(mail.threadId || mail.id || '');
            if (!id || seen.has(id)) continue;
            seen.add(id);
            merged.push(mail);
          }
        }
        merged.sort(
          (a, b) =>
            new Date(b.receivedAt || b.date || 0).getTime() -
            new Date(a.receivedAt || a.date || 0).getTime(),
        );
        if (!cancelled) setThreadSearch({ searched: true, mails: merged.slice(0, 20) });
      } catch {
        // A failed search is an honest "searched, found nothing we could
        // load" — never a fabricated list, never a silent hang.
        if (!cancelled) setThreadSearch({ searched: true, mails: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactEmailLower]);

  const contactThreads = threadSearch.mails;
  const threadsSearched = threadSearch.searched;

  // Shared meetings for this contact — only real, caller-supplied meetings.
  // The previously hardcoded "Product Sync / Architecture Review" entries
  // (fabricated times and rooms for every contact) are deleted.
  const sharedMeetings: SharedCalendarMeeting[] = meetings ?? [];

  // If no contact is selected
  if (!contact) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 select-none">
        <div className="size-16 rounded-2xl bg-[var(--quant-surface-elevated)] border border-[#232938] flex items-center justify-center text-[#6B7280] mb-4 shadow-inner">
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
          {/* Large Avatar: real photo when the contact has one, honest
              initials+gradient fallback when not — never a fake face. */}
          <div className="relative shrink-0">
            {contactAvatarUrl ? (
              <div
                className={`size-18 sm:size-20 overflow-hidden rounded-2xl shadow-xl ring-2 ${
                  isFavorite ? 'ring-[#FFB020]' : 'ring-white/10'
                }`}
              >
                <Avatar
                  src={contactAvatarUrl}
                  name={contactDisplayName(contact)}
                  size="xl"
                  shape="rounded"
                  className="!size-full !rounded-2xl"
                />
              </div>
            ) : (
              <div
                className={`flex size-18 sm:size-20 items-center justify-center rounded-2xl bg-gradient-to-br ${avatarGradient} text-xl sm:text-2xl font-black text-white shadow-xl ring-2 ${
                  isFavorite ? 'ring-[#FFB020]' : 'ring-white/10'
                }`}
              >
                {initials}
              </div>
            )}
            {isFavorite && (
              <div className="absolute -bottom-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-[#FFB020] text-black shadow-md ring-2 ring-[var(--quant-background)]">
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
              <p className="text-xs sm:text-sm text-[var(--app-accent)] font-medium flex items-center gap-1.5 mt-0.5 truncate">
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
                    className="px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--app-accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--app-accent)_30%,transparent)] text-[10px] font-bold text-[var(--app-accent)]"
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] text-xs font-semibold text-[var(--quant-muted-foreground)] hover:text-white hover:border-[#3A404D] transition-colors"
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] text-xs font-semibold text-[#6B7280] hover:text-red-400 hover:border-red-900/50 hover:bg-red-950/20 transition-colors"
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
              className="p-1.5 rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] text-[var(--quant-muted-foreground)] hover:text-white transition-colors"
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
          <div className="size-12 rounded-full border border-[color-mix(in_srgb,var(--app-accent)_50%,transparent)] bg-[#3F1E0E] text-[var(--app-accent)] flex items-center justify-center group-hover:bg-[#522712] group-hover:scale-105 transition-all shadow-md shadow-[color-mix(in_srgb,var(--app-accent)_10%,transparent)]">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>
          <span className="text-[11px] font-semibold text-[var(--quant-muted-foreground)] group-hover:text-[var(--app-accent)] transition-colors">Call</span>
        </button>

        {/* Action 2: Email */}
        {/*
          Phone-only / legacy contacts may have no email (the Contact type
          declares email as required, but rows created before validation and
          phone-only records exist at runtime — see contactDisplayName). Guard
          here so a missing address disables the action instead of navigating
          to "/compose?to=undefined".
        */}
        <button
          type="button"
          onClick={() => {
            if (!contact.email) return;
            if (onEmail) onEmail(contact.email);
            else window.location.href = `/compose?to=${encodeURIComponent(contact.email)}`;
          }}
          disabled={!contact.email}
          className="flex flex-col items-center gap-1.5 group disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <div className="size-12 rounded-full border border-[color-mix(in_srgb,var(--app-accent)_50%,transparent)] bg-[#3F1E0E] text-[var(--app-accent)] flex items-center justify-center group-hover:bg-[#522712] group-hover:scale-105 transition-all shadow-md shadow-[color-mix(in_srgb,var(--app-accent)_10%,transparent)]">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>
          <span className="text-[11px] font-semibold text-[var(--quant-muted-foreground)] group-hover:text-[var(--app-accent)] transition-colors">Email</span>
        </button>

        {/* Action 3: Message */}
        {/*
          "Message" semantics are a parked user decision (open: whether Message
          opens chat vs the mail composer). Until decided, keep Message behavior
          identical to Email — but only when an email exists, so a missing
          address disables the action instead of navigating to
          "/compose?to=undefined". Do NOT invent a chat routing here.
        */}
        <button
          type="button"
          onClick={() => {
            if (!contact.email) return;
            if (onMessage) onMessage(contact);
            else window.location.href = `/compose?to=${encodeURIComponent(contact.email)}`;
          }}
          disabled={!contact.email}
          className="flex flex-col items-center gap-1.5 group disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <div className="size-12 rounded-full border border-[color-mix(in_srgb,var(--app-accent)_50%,transparent)] bg-[#3F1E0E] text-[var(--app-accent)] flex items-center justify-center group-hover:bg-[#522712] group-hover:scale-105 transition-all shadow-md shadow-[color-mix(in_srgb,var(--app-accent)_10%,transparent)]">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span className="text-[11px] font-semibold text-[var(--quant-muted-foreground)] group-hover:text-[var(--app-accent)] transition-colors">Message</span>
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
          <div className="size-12 rounded-full border border-[color-mix(in_srgb,var(--app-accent)_50%,transparent)] bg-[#3F1E0E] text-[var(--app-accent)] flex items-center justify-center group-hover:bg-[#522712] group-hover:scale-105 transition-all shadow-md shadow-[color-mix(in_srgb,var(--app-accent)_10%,transparent)]">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </div>
          <span className="text-[11px] font-semibold text-[var(--quant-muted-foreground)] group-hover:text-[var(--app-accent)] transition-colors">
            {copiedField === 'share' ? 'Copied!' : 'Share'}
          </span>
        </button>
      </div>

      {/* CONTACT DETAILS CARD */}
      <div className="rounded-2xl border border-[#232938] bg-[var(--quant-surface)] p-5 shadow-md space-y-4">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-[var(--app-accent)]">
          Contact Details
        </h3>

        <div className="space-y-3">
          {/* Email Address — omitted entirely for phone-only / legacy contacts
              with no email, so no "mailto:undefined" anchor can render.
              (Matches the Phone Number row's conditional pattern below.) */}
          {contact.email && (
          <div className="flex items-center justify-between p-3 rounded-xl border border-[#1E2536] bg-[var(--quant-surface-subtle)]">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="flex size-8 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] text-[var(--app-accent)]">
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider block">Email Address</span>
                <a href={`mailto:${contact.email}`} className="text-xs font-mono font-semibold text-white hover:text-[var(--app-accent)] transition-colors truncate block">
                  {contact.email}
                </a>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleCopy(contact.email, 'email')}
              className="p-1.5 rounded-lg border border-[var(--quant-surface-elevated)] bg-[#161A24] text-[var(--quant-muted-foreground)] hover:text-white transition-colors"
              title="Copy email"
            >
              {copiedField === 'email' ? (
                <svg className="size-3.5 text-[var(--app-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

          {/* Phone Number */}
          {contact.phone && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-[#1E2536] bg-[var(--quant-surface-subtle)]">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex size-8 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] text-[var(--app-accent)]">
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider block">Phone Number</span>
                  <a href={`tel:${contact.phone}`} className="text-xs font-mono font-semibold text-white hover:text-[var(--app-accent)] transition-colors truncate block">
                    {contact.phone}
                  </a>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleCopy(contact.phone!, 'phone')}
                className="p-1.5 rounded-lg border border-[var(--quant-surface-elevated)] bg-[#161A24] text-[var(--quant-muted-foreground)] hover:text-white transition-colors"
                title="Copy phone"
              >
                {copiedField === 'phone' ? (
                  <svg className="size-3.5 text-[var(--app-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
            <div className="flex items-center justify-between p-3 rounded-xl border border-[#1E2536] bg-[var(--quant-surface-subtle)]">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex size-8 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] text-[var(--app-accent)]">
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
      <div className="rounded-2xl border border-[#232938] bg-[var(--quant-surface)] p-5 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[var(--app-accent)]">
              Mail Conversations
            </h3>
            <span className="rounded-full bg-[#1E2536] px-2 py-0.5 text-[10px] font-bold text-[var(--quant-muted-foreground)]">
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
            className="text-[11px] font-semibold text-[var(--app-accent)] hover:underline"
          >
            View all in search &rarr;
          </button>
        </div>

        {!threadsSearched ? (
          <div className="text-center py-5 border border-dashed border-[#1E2536] rounded-xl text-xs text-[#6B7280]">
            Searching mail for this contact&hellip;
          </div>
        ) : contactThreads.length > 0 ? (
          <div className="space-y-2">
            {contactThreads.map((mail: any) => (
              <div
                key={mail.id}
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.location.href = `/?thread=${encodeURIComponent(mail.threadId || mail.id)}`;
                  }
                }}
                className="flex items-center justify-between p-3 rounded-xl border border-[#1E2536] bg-[var(--quant-surface-subtle)] hover:border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] hover:bg-[#141824] transition-all cursor-pointer"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center gap-2">
                    {!mail.isRead && (
                      <span className="size-2 rounded-full bg-[var(--app-accent)] shrink-0" />
                    )}
                    <h4 className="text-xs font-bold text-white truncate">
                      {mail.subject || 'No Subject'}
                    </h4>
                  </div>
                  <p className="text-[11px] text-[#9CA3AF] truncate mt-0.5">
                    {sanitizeSnippetText(mail.snippet || mail.bodyText) ||
                      'Click to view conversation thread'}
                  </p>
                </div>

                <span className="text-[10px] font-mono text-[#6B7280] shrink-0">
                  {formatContactMailDate(mail.receivedAt)}
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
      <div className="rounded-2xl border border-[#232938] bg-[var(--quant-surface)] p-5 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[var(--quant-warning)]">
              Shared Calendar Meetings
            </h3>
            <span className="rounded-full bg-[#1E2536] px-2 py-0.5 text-[10px] font-bold text-[var(--quant-muted-foreground)]">
              {sharedMeetings.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onScheduleMeeting ? onScheduleMeeting(contact.email) : (window.location.href = `/calendar?attendee=${encodeURIComponent(contact.email || '')}`)}
            className="flex items-center gap-1 text-[11px] font-semibold text-[var(--quant-warning)] hover:underline"
          >
            <span>+ Schedule Meeting</span>
          </button>
        </div>

        {sharedMeetings.length > 0 ? (
          <div className="space-y-2">
            {sharedMeetings.map((meet) => (
            <div
              key={meet.id}
              className="flex items-center justify-between p-3 rounded-xl border border-[#1E2536] bg-[var(--quant-surface-subtle)]"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--quant-warning)]/10 text-[var(--quant-warning)]">
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
                    window.location.href = `/calendar?attendee=${encodeURIComponent(contact.email || '')}`;
                  }
                }}
                className="px-2.5 py-1 rounded-lg border border-[var(--quant-warning)]/30 bg-[var(--quant-warning)]/10 text-[var(--quant-warning)] text-xs font-semibold hover:bg-[var(--quant-warning)]/20 transition-colors shrink-0"
              >
                Join / View
              </button>
            </div>
          ))}
          </div>
        ) : (
          <div className="text-center py-5 border border-dashed border-[#1E2536] rounded-xl text-xs text-[#6B7280]">
            No shared meetings found with this contact yet. Click &ldquo;+ Schedule Meeting&rdquo; above to create one.
          </div>
        )}
      </div>
    </div>
  );
}

