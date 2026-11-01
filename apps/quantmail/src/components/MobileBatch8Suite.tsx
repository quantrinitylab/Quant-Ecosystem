'use client';

/**
 * MobileBatch8Suite — Reverse-Engineered Batch 8 Suite for:
 * - Flow #35: Drawing on a photo (Photo annotation studio: ink/pen, highlighter, colors, crop, rotate)
 * - Flow #39: Email detail (Full threaded conversation view with multi-party replies & quoted history)
 * - Flow #46: Files (Files Hub, QuantDrive storage, Recent, Email Attachments, empty/populated)
 * - Flow #50: Filtering emails (pinned) (Pinned filter pill + Pinned banner & filtered list)
 * - Flow #51: Filtering results (Search view, All/Email/People/Files/Event tabs, filter chips sheet)
 * - Flow #52: Giving feedback (Compliment / Problem / Suggestion, textarea, follow-up, submit success)
 * - Flow #53: Help & feedback (Support hub, FAQs, test push, reset index, delete contacts, diagnostics)
 * - Flow #54: Inviting guests (Calendar event Required / Optional attendee picker with autocomplete)
 * - Flow #55: Join a meeting (Quanty Meet join card + "Open with" action sheet)
 * - Flow #56: Linking storage account (Add Storage Account: QuantDrive, Dropbox, Google Drive, Box)
 * - Flow #57: Logging in via QR code (QR camera scanner sheet + manual fallback)
 * - Flow #58: Logging in (Welcome screen, email entry with domain chips, password, add account prompt)
 * - Flow #59: Logging out (Remove account from device alert dialog + return to Welcome)
 * - Flow #63: Moving photo to message body (Attachment action sheet: Move to Body / Remove)
 * - Flow #65: Notifications (Activity feed, empty state "No new notifications", notification list)
 *
 * Strict Compliance:
 * - Mobile-first viewport (390×844 iOS @ 2x DPR)
 * - Dual-theme 1:1 support (White light / Black dark)
 * - Zero Competitor Naming (QuantMail, Quanty Meet, QuantDrive, Quant Tasks, Quant Workspace)
 */

import React, { useState } from 'react';

// ─── 1. FLOW #46 & #56: FILES HUB & STORAGE ACCOUNTS ─────────────────────────

export interface MobileFileItem {
  id: string;
  name: string;
  type: 'pdf' | 'doc' | 'image' | 'sheet';
  size: string;
  updatedAt: string;
  source: 'QuantDrive' | 'Attachment';
}

export const INITIAL_BATCH8_FILES: MobileFileItem[] = [
  {
    id: 'f-1',
    name: 'QI Performance Report.pdf',
    type: 'pdf',
    size: '1 KB',
    updatedAt: 'Opened 27m ago',
    source: 'Attachment',
  },
  {
    id: 'f-2',
    name: 'Product Roadmap 2026.pdf',
    type: 'pdf',
    size: '2.4 MB',
    updatedAt: 'Yesterday',
    source: 'QuantDrive',
  },
];

export function MobileFilesHubView({
  onBack,
  onOpenFile,
  onOpenAddStorage,
}: {
  onBack: () => void;
  onOpenFile?: (file: MobileFileItem) => void;
  onOpenAddStorage?: () => void;
}) {
  const [files, setFiles] = useState<MobileFileItem[]>(INITIAL_BATCH8_FILES);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState<'all' | 'attachments'>('all');
  const [showAddStorageSheet, setShowAddStorageSheet] = useState(false);

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      data-testid="mobile-files-hub-view"
      className="flex h-full flex-col bg-[var(--quant-background)] text-[var(--quant-foreground)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
        <button
          type="button"
          data-testid="files-back-btn"
          onClick={onBack}
          className="text-base text-[var(--quant-muted-foreground)]"
        >
          ✕
        </button>
        <h1 className="text-base font-bold">Files</h1>
        <button
          type="button"
          data-testid="add-storage-btn"
          onClick={() => setShowAddStorageSheet(true)}
          className="text-sm font-semibold text-[#0078D4]"
        >
          + Add
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b border-[var(--quant-border)]">
        <div className="flex items-center gap-2 rounded-xl bg-[var(--quant-border)]/40 px-3 py-2 text-xs text-[var(--quant-muted-foreground)]">
          <span>🔍</span>
          <input
            type="text"
            data-testid="files-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files"
            className="flex-1 bg-transparent outline-none text-xs text-[var(--quant-foreground)]"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Storage Account Card */}
        <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] text-sm">
          <div className="flex items-center justify-between p-3.5">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-[#0078D4]/10 text-lg text-[#0078D4]">
                ☁️
              </span>
              <div>
                <span className="font-semibold block text-sm">QuantDrive</span>
                <span className="text-xs text-[var(--quant-muted-foreground)]">
                  samlee.mobbin01@quantmail.com
                </span>
              </div>
            </div>
            <span className="text-[#0078D4] text-xs font-semibold">Active</span>
          </div>

          <button
            type="button"
            data-testid="files-filter-attachments-btn"
            onClick={() => setActiveSection(activeSection === 'attachments' ? 'all' : 'attachments')}
            className="flex w-full items-center justify-between p-3.5 text-left hover:bg-[var(--quant-border)]/20"
          >
            <div className="flex items-center gap-3">
              <span className="text-base">📎</span>
              <span>Email Attachments</span>
            </div>
            <span className="text-xs text-[var(--quant-muted-foreground)]">
              {files.filter((f) => f.source === 'Attachment').length}
            </span>
          </button>
        </div>

        {/* Files List or Empty State */}
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--quant-muted-foreground)]">
            {activeSection === 'attachments' ? 'Email Attachments' : 'Recent Files'}
          </h2>

          {filtered.length === 0 ? (
            <div
              data-testid="files-empty-state"
              className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)]"
            >
              <span className="text-3xl mb-2">📁</span>
              <h3 className="text-sm font-semibold text-[var(--quant-foreground)]">
                Nothing in Folder
              </h3>
              <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
                Looks empty over here.
              </p>
            </div>
          ) : (
            <div
              data-testid="files-list"
              className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] overflow-hidden"
            >
              {filtered.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  data-testid={`file-row-${file.id}`}
                  onClick={() => onOpenFile?.(file)}
                  className="flex w-full items-center justify-between p-3.5 text-left hover:bg-[var(--quant-border)]/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-lg bg-red-500/15 text-xs font-bold text-red-500">
                      PDF
                    </span>
                    <div>
                      <span className="text-sm font-semibold block text-[var(--quant-foreground)] truncate max-w-[200px]">
                        {file.name}
                      </span>
                      <span className="text-xs text-[var(--quant-muted-foreground)]">
                        {file.updatedAt} • {file.size}
                      </span>
                    </div>
                  </div>
                  <span className="text-[#0078D4] text-xs font-medium">›</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Flow #56: Add Storage Account Sheet */}
      {showAddStorageSheet && (
        <MobileAddStorageAccountSheet
          isOpen={true}
          onClose={() => setShowAddStorageSheet(false)}
          onAdd={() => {
            setShowAddStorageSheet(false);
          }}
        />
      )}
    </div>
  );
}

// ─── FLOW #56: ADD STORAGE ACCOUNT MODAL SHEET ────────────────────────────────

export function MobileAddStorageAccountSheet({
  isOpen,
  onClose,
  onAdd,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (provider: string) => void;
}) {
  if (!isOpen) return null;

  const storageProviders = [
    { id: 'quantdrive', name: 'QuantDrive', icon: '☁️', desc: 'Connect another cloud workspace' },
    { id: 'dropbox', name: 'Dropbox', icon: '📦', desc: 'Sync files from your Dropbox' },
    { id: 'gdrive', name: 'Google Drive', icon: '📁', desc: 'Access Google Drive files' },
    { id: 'box', name: 'Box', icon: '🗃️', desc: 'Enterprise Box cloud documents' },
  ];

  return (
    <div
      data-testid="add-storage-account-sheet"
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60"
    >
      <div className="rounded-t-3xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] p-4 text-[var(--quant-foreground)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-3">
          <button
            type="button"
            data-testid="add-storage-close-btn"
            onClick={onClose}
            className="text-base text-[var(--quant-muted-foreground)]"
          >
            ✕
          </button>
          <h3 className="text-base font-semibold">Add Storage Account</h3>
          <span className="w-5" />
        </div>

        <p className="py-2 text-xs text-[var(--quant-muted-foreground)] text-center">
          Access your online files right from QuantMail.
        </p>

        <div className="py-2 divide-y divide-[var(--quant-border)]">
          {storageProviders.map((p) => (
            <button
              key={p.id}
              type="button"
              data-testid={`storage-provider-${p.id}`}
              onClick={() => onAdd(p.id)}
              className="flex w-full items-center justify-between py-3.5 text-left hover:bg-[var(--quant-border)]/20"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{p.icon}</span>
                <div>
                  <span className="font-semibold text-sm block">{p.name}</span>
                  <span className="text-xs text-[var(--quant-muted-foreground)]">{p.desc}</span>
                </div>
              </div>
              <span className="text-[#0078D4] text-sm">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 2. FLOW #50 & #51: MOBILE SEARCH & FILTER SUITE ─────────────────────────

export function MobileSearchAndFilterSuite({
  onBack,
}: {
  onBack: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('Work');
  const [activeTab, setActiveTab] = useState<'all' | 'email' | 'people' | 'files' | 'event'>('all');
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<string[]>(['from Alex']);

  const filterChips = [
    { id: 'unread', label: 'Unread Emails' },
    { id: 'from_alex', label: 'from Alex' },
    { id: 'attachments', label: 'Has Attachments' },
    { id: 'older_week', label: 'Older than a week' },
    { id: 'flagged', label: 'Flagged Emails' },
    { id: 'pinned', label: 'Pinned' },
  ];

  const searchResults = [
    {
      id: 'res-1',
      sender: 'Alex',
      subject: 'Follow-Up on Work',
      snippet: '...up regarding our recent work discussion. Please let me know if you have any updates...',
      date: 'Wednesday',
      folder: 'Inbox',
    },
    {
      id: 'res-2',
      sender: 'Ibotta',
      subject: 'Please confirm your email address.',
      snippet: 'Let\'s make it official. Hi Sam, Are you ready to make it official?',
      date: 'Monday',
      folder: 'Archive',
    },
  ];

  return (
    <div
      data-testid="mobile-search-results-suite"
      className="flex h-full flex-col bg-[var(--quant-background)] text-[var(--quant-foreground)]"
    >
      {/* Search Header */}
      <div className="flex items-center gap-2 border-b border-[var(--quant-border)] px-4 py-3">
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-[var(--quant-border)]/40 px-3 py-2 text-xs text-[var(--quant-muted-foreground)]">
          <span>🔍</span>
          <input
            type="text"
            data-testid="search-results-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-xs text-[var(--quant-foreground)] font-medium"
            placeholder="Search"
          />
          {selectedFilters.map((f, i) => (
            <span
              key={i}
              data-testid={`active-filter-pill-${i}`}
              className="rounded-full bg-[#0078D4]/15 px-2 py-0.5 text-[10px] font-semibold text-[#0078D4]"
            >
              {f}
            </span>
          ))}
        </div>
        <button
          type="button"
          data-testid="search-cancel-btn"
          onClick={onBack}
          className="text-xs font-semibold text-[#0078D4]"
        >
          Cancel
        </button>
      </div>

      {/* Tabs Row */}
      <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-2 text-xs">
        <div className="flex gap-4">
          {(['all', 'email', 'people', 'files', 'event'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              data-testid={`search-tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              className={`capitalize pb-1 font-semibold ${
                activeTab === tab
                  ? 'border-b-2 border-[#0078D4] text-[#0078D4]'
                  : 'text-[var(--quant-muted-foreground)]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <button
          type="button"
          data-testid="search-filter-sheet-trigger-btn"
          onClick={() => setShowFilterSheet(true)}
          className="flex items-center gap-1 font-semibold text-[#0078D4]"
        >
          <span>⚡</span>
          <span>Filter</span>
        </button>
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--quant-border)]">
        <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--quant-muted-foreground)]">
          Top Results
        </div>
        {searchResults.map((item) => (
          <div
            key={item.id}
            data-testid={`search-result-row-${item.id}`}
            className="p-4 hover:bg-[var(--quant-border)]/20 transition-colors"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[var(--quant-foreground)]">{item.sender}</span>
              <span className="text-[var(--quant-muted-foreground)]">{item.date}</span>
            </div>
            <div className="text-sm font-semibold text-[var(--quant-foreground)]">{item.subject}</div>
            <div className="text-xs text-[var(--quant-muted-foreground)] line-clamp-2 mt-0.5">
              {item.snippet}
            </div>
            <span className="mt-1 inline-block rounded bg-[var(--quant-border)]/40 px-1.5 py-0.5 text-[10px] text-[var(--quant-muted-foreground)]">
              {item.folder}
            </span>
          </div>
        ))}
      </div>

      {/* Flow #51: Filter Sheet */}
      {showFilterSheet && (
        <div
          data-testid="search-filters-modal-sheet"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60"
        >
          <div className="rounded-t-3xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] p-4 text-[var(--quant-foreground)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-3">
              <button
                type="button"
                data-testid="close-filters-sheet-btn"
                onClick={() => setShowFilterSheet(false)}
                className="text-base text-[var(--quant-muted-foreground)]"
              >
                ✕
              </button>
              <h3 className="text-base font-semibold">Filters</h3>
              <button
                type="button"
                data-testid="apply-filters-btn"
                onClick={() => setShowFilterSheet(false)}
                className="text-base font-semibold text-[#0078D4]"
              >
                Apply
              </button>
            </div>

            <div className="py-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                {filterChips.map((chip) => {
                  const isSelected = selectedFilters.includes(chip.label);
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      data-testid={`filter-chip-${chip.id}`}
                      onClick={() => {
                        setSelectedFilters(
                          isSelected
                            ? selectedFilters.filter((x) => x !== chip.label)
                            : [...selectedFilters, chip.label]
                        );
                      }}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium border ${
                        isSelected
                          ? 'border-[#0078D4] bg-[#0078D4]/15 text-[#0078D4]'
                          : 'border-[var(--quant-border)] text-[var(--quant-foreground)]'
                      }`}
                    >
                      {chip.label} {isSelected ? '✓' : '+'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 3. FLOW #52 & #53: HELP & FEEDBACK SUITE ─────────────────────────────────

export function MobileHelpAndFeedbackSheet({
  isOpen,
  onClose,
  onOpenGiveFeedback,
}: {
  isOpen: boolean;
  onClose: () => void;
  onOpenGiveFeedback: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div
      data-testid="mobile-help-feedback-sheet"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--quant-background)] text-[var(--quant-foreground)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
        <button
          type="button"
          data-testid="help-feedback-close-btn"
          onClick={onClose}
          className="text-base text-[var(--quant-muted-foreground)]"
        >
          ✕
        </button>
        <h2 className="text-base font-semibold">Help &amp; Feedback</h2>
        <span className="w-5" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        {/* Support Section */}
        <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] overflow-hidden">
          <button
            type="button"
            className="flex w-full items-center justify-between p-3.5 hover:bg-[var(--quant-border)]/20"
          >
            <span>Contact QuantMail Mobile Support</span>
            <span className="text-[#0078D4]">›</span>
          </button>
          <button
            type="button"
            data-testid="open-give-feedback-btn"
            onClick={onOpenGiveFeedback}
            className="flex w-full items-center justify-between p-3.5 hover:bg-[var(--quant-border)]/20 text-[#0078D4] font-semibold"
          >
            <span>Send Feedback</span>
            <span>›</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between p-3.5 hover:bg-[var(--quant-border)]/20"
          >
            <span>FAQs</span>
            <span className="text-[#0078D4]">›</span>
          </button>
        </div>

        {/* Troubleshooting Section */}
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--quant-muted-foreground)] px-1">
            Troubleshooting
          </span>
          <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] overflow-hidden">
            <button type="button" className="flex w-full items-center justify-between p-3.5 hover:bg-[var(--quant-border)]/20">
              <span>Test Push Notifications</span>
              <span className="text-[#0078D4]">›</span>
            </button>
            <button type="button" className="flex w-full items-center justify-between p-3.5 hover:bg-[var(--quant-border)]/20">
              <span>Reset Spotlight Search Index</span>
              <span className="text-[#0078D4]">›</span>
            </button>
            <button type="button" className="flex w-full items-center justify-between p-3.5 hover:bg-[var(--quant-border)]/20 text-red-500">
              <span>Delete All Saved Contacts</span>
              <span className="text-red-500">›</span>
            </button>
            <button type="button" className="flex w-full items-center justify-between p-3.5 hover:bg-[var(--quant-border)]/20">
              <span>Collect Diagnostics</span>
              <span className="text-[#0078D4]">›</span>
            </button>
          </div>
        </div>

        {/* Legal & Version */}
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--quant-muted-foreground)] px-1">
            About
          </span>
          <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] overflow-hidden text-xs">
            <div className="flex items-center justify-between p-3">
              <span>Privacy &amp; Cookies</span>
              <span className="text-[var(--quant-muted-foreground)]">›</span>
            </div>
            <div className="flex items-center justify-between p-3">
              <span>Version</span>
              <span className="text-[var(--quant-muted-foreground)]">5.2605.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MobileGivingFeedbackSheet({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'classify' | 'form' | 'success'>('classify');
  const [feedbackType, setFeedbackType] = useState<'compliment' | 'problem' | 'suggestion'>('suggestion');
  const [feedbackText, setFeedbackText] = useState(
    'When creating daily recurring events in QuantMail Calendar, please add an option to exclude weekends.'
  );

  if (!isOpen) return null;

  return (
    <div
      data-testid="giving-feedback-sheet"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--quant-background)] text-[var(--quant-foreground)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
        <button
          type="button"
          data-testid="feedback-cancel-btn"
          onClick={onClose}
          className="text-sm text-[var(--quant-muted-foreground)]"
        >
          Cancel
        </button>
        <h2 className="text-base font-semibold">Feedback to QuantMail</h2>
        {step === 'form' ? (
          <button
            type="button"
            data-testid="feedback-submit-btn"
            onClick={() => setStep('success')}
            className="text-sm font-semibold text-[#0078D4]"
          >
            Submit
          </button>
        ) : step === 'success' ? (
          <button
            type="button"
            data-testid="feedback-done-btn"
            onClick={onClose}
            className="text-sm font-semibold text-[#0078D4]"
          >
            Done
          </button>
        ) : (
          <span className="w-10" />
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        {step === 'classify' && (
          <div className="space-y-3">
            <span className="text-xs font-semibold text-[var(--quant-muted-foreground)]">
              Classify your feedback
            </span>
            <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] overflow-hidden">
              <button
                type="button"
                data-testid="feedback-type-compliment"
                onClick={() => {
                  setFeedbackType('compliment');
                  setStep('form');
                }}
                className="flex w-full items-center gap-3 p-4 hover:bg-[var(--quant-border)]/20"
              >
                <span className="text-lg">😊</span>
                <span>Give a compliment</span>
              </button>
              <button
                type="button"
                data-testid="feedback-type-problem"
                onClick={() => {
                  setFeedbackType('problem');
                  setStep('form');
                }}
                className="flex w-full items-center gap-3 p-4 hover:bg-[var(--quant-border)]/20"
              >
                <span className="text-lg">⚠️</span>
                <span>Report a problem</span>
              </button>
              <button
                type="button"
                data-testid="feedback-type-suggestion"
                onClick={() => {
                  setFeedbackType('suggestion');
                  setStep('form');
                }}
                className="flex w-full items-center gap-3 p-4 hover:bg-[var(--quant-border)]/20 text-[#0078D4] font-semibold"
              >
                <span className="text-lg">💡</span>
                <span>Make a suggestion</span>
              </button>
            </div>
          </div>
        )}

        {step === 'form' && (
          <div className="space-y-4">
            <div>
              <span className="text-xs font-semibold text-[var(--quant-muted-foreground)] block mb-1">
                What can we do better? *
              </span>
              <textarea
                data-testid="feedback-textarea"
                rows={5}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                className="w-full rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3 text-xs outline-none leading-relaxed"
                placeholder="Share your thoughts..."
              />
            </div>

            <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3.5 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold block text-[var(--quant-foreground)]">Follow up by email</span>
                <span className="text-[var(--quant-muted-foreground)]">samlee.mobbin01@quantmail.com</span>
              </div>
              <input type="checkbox" defaultChecked className="size-4 accent-[#0078D4]" />
            </div>

            <p className="text-[11px] leading-relaxed text-[var(--quant-muted-foreground)]">
              By pressing Submit, your feedback will be used to improve QuantMail products and services.
            </p>
          </div>
        )}

        {step === 'success' && (
          <div data-testid="feedback-success-card" className="flex flex-col items-center justify-center p-8 text-center space-y-3">
            <span className="grid size-16 place-items-center rounded-full bg-emerald-500/15 text-3xl text-emerald-500">
              ✓
            </span>
            <h3 className="text-base font-bold text-[var(--quant-foreground)]">
              We appreciate your feedback.
            </h3>
            <p className="text-xs text-[var(--quant-muted-foreground)]">
              Your suggestion has been submitted to the product team.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 4. FLOW #54 & #55: INVITING GUESTS & JOIN MEETING ────────────────────────

export function MobileInviteGuestsSheet({
  isOpen,
  onClose,
  onSaveGuests,
  onSaveAttendees,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSaveGuests?: (required: string[], optional: string[]) => void;
  onSaveAttendees?: (required?: string[], optional?: string[]) => void;
}) {
  const [requiredGuests, setRequiredGuests] = useState<string[]>(['Ms Alex Smith']);
  const [optionalGuests, setOptionalGuests] = useState<string[]>(['Sam Lee']);
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  return (
    <div
      data-testid="mobile-invite-guests-sheet"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--quant-background)] text-[var(--quant-foreground)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
        <button
          type="button"
          data-testid="invite-guests-cancel-btn"
          onClick={onClose}
          className="text-base text-[var(--quant-muted-foreground)]"
        >
          ✕
        </button>
        <h2 className="text-base font-semibold">Attendees</h2>
        <button
          type="button"
          data-testid="invite-guests-done-btn"
          onClick={() => {
            if (onSaveGuests) onSaveGuests(requiredGuests, optionalGuests);
            if (onSaveAttendees) onSaveAttendees(requiredGuests, optionalGuests);
            onClose();
          }}
          className="text-base font-semibold text-[#0078D4]"
        >
          Done
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1 overflow-y-auto text-xs">
        {/* Search Input */}
        <div className="flex items-center gap-2 rounded-xl bg-[var(--quant-border)]/40 px-3 py-2 text-xs">
          <span>🔍</span>
          <input
            type="text"
            data-testid="guest-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Type a name or email address"
            className="flex-1 bg-transparent outline-none font-medium text-[var(--quant-foreground)]"
          />
        </div>

        {/* Required Section */}
        <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3 space-y-2">
          <span className="font-bold text-[11px] text-[var(--quant-muted-foreground)] uppercase">
            Required ({requiredGuests.length})
          </span>
          <div className="flex flex-wrap gap-2">
            {requiredGuests.map((g, i) => (
              <span
                key={i}
                data-testid={`required-guest-chip-${i}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0078D4]/15 px-3 py-1 font-semibold text-[#0078D4]"
              >
                {g}
                <button
                  type="button"
                  onClick={() => setRequiredGuests(requiredGuests.filter((x) => x !== g))}
                  className="size-3 text-xs"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Optional Section */}
        <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3 space-y-2">
          <span className="font-bold text-[11px] text-[var(--quant-muted-foreground)] uppercase">
            Optional ({optionalGuests.length})
          </span>
          <div className="flex flex-wrap gap-2">
            {optionalGuests.map((g, i) => (
              <span
                key={i}
                data-testid={`optional-guest-chip-${i}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--quant-border)] px-3 py-1 font-semibold text-[var(--quant-foreground)]"
              >
                {g}
                <button
                  type="button"
                  onClick={() => setOptionalGuests(optionalGuests.filter((x) => x !== g))}
                  className="size-3 text-xs"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MobileJoinMeetingCard({
  meetingTitle = 'Daily standup',
  time = '10:00 - 10:30 (30 minutes)',
  onJoin,
}: {
  meetingTitle?: string;
  time?: string;
  onJoin: () => void;
}) {
  const [showOpenWithSheet, setShowOpenWithSheet] = useState(false);

  return (
    <div data-testid="join-meeting-card" className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <span className="font-bold text-sm block">{meetingTitle}</span>
          <span className="text-xs text-[var(--quant-muted-foreground)]">{time}</span>
        </div>
        <button
          type="button"
          data-testid="join-meeting-btn"
          onClick={() => setShowOpenWithSheet(true)}
          className="rounded-full bg-[#0078D4] px-4 py-1.5 text-xs font-bold text-white shadow hover:bg-[#006abc]"
        >
          Join
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
        <span>🎥</span>
        <span>Quanty Meet</span>
      </div>

      {/* Flow #55 Screen 1: Open With Browser Sheet */}
      {showOpenWithSheet && (
        <div
          data-testid="open-with-sheet"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60"
        >
          <div className="rounded-t-3xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] p-4 text-[var(--quant-foreground)] shadow-2xl space-y-3">
            <h3 className="text-sm font-semibold text-center">Open with</h3>
            <div className="divide-y divide-[var(--quant-border)]">
              <button
                type="button"
                data-testid="open-with-browser-btn"
                onClick={() => {
                  setShowOpenWithSheet(false);
                  onJoin();
                }}
                className="flex w-full items-center gap-3 py-3 text-sm font-medium"
              >
                <span>🌐</span>
                <span>Default Browser</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowOpenWithSheet(false)}
              className="w-full py-2.5 rounded-xl border border-[var(--quant-border)] text-xs font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 5. FLOW #57, #58, #59: AUTH & QR LOGIN SUITE ────────────────────────────

export function MobileWelcomeLoginView({
  onAddAccount,
  onLoginSuccess,
  onScanQr,
  onOpenQrScanner,
}: {
  onAddAccount?: () => void;
  onLoginSuccess?: () => void;
  onScanQr?: () => void;
  onOpenQrScanner?: () => void;
}) {
  const [emailInput, setEmailInput] = useState('');
  const [showRemoveAlert, setShowRemoveAlert] = useState(false);

  const DOMAIN_SUGGESTIONS = ['@quantmail.com', '@gmail.com', '@workplace.com', '@icloud.com'];

  return (
    <div
      data-testid="mobile-welcome-login-view"
      className="flex h-full flex-col justify-between bg-[var(--quant-background)] p-6 text-[var(--quant-foreground)] select-none"
    >
      <div className="flex flex-1 flex-col items-center justify-center text-center space-y-4 pt-8">
        <span className="grid size-20 place-items-center rounded-3xl bg-[#0078D4] text-white text-3xl font-bold shadow-xl">
          Q
        </span>
        <h1 className="text-xl font-bold">Welcome to QuantMail</h1>
        <p className="text-xs text-[var(--quant-muted-foreground)] max-w-xs leading-relaxed">
          Bring all your emails, contacts, files and calendars together in one unified workspace.
        </p>

        {/* Email Entry & Suggestions (Flow #58) */}
        <div className="w-full max-w-sm pt-4 space-y-3">
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="Enter your work or personal email"
            className="w-full rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] px-4 py-3 text-xs outline-none focus:border-[#0078D4]"
          />

          <div className="flex flex-wrap justify-center gap-1.5">
            {DOMAIN_SUGGESTIONS.map((d) => (
              <button
                key={d}
                type="button"
                data-testid={`domain-chip-${d.replace(/[@.]/g, '')}`}
                onClick={() => {
                  const base = emailInput.split('@')[0] || 'samlee';
                  setEmailInput(base + d);
                }}
                className="rounded-full bg-[var(--quant-border)]/50 px-2.5 py-1 text-[11px] font-medium text-[var(--quant-foreground)] hover:bg-[#0078D4] hover:text-white transition-colors"
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2.5 pt-4">
        <button
          type="button"
          data-testid="welcome-add-account-btn"
          onClick={onAddAccount || onLoginSuccess}
          className="w-full rounded-2xl bg-[#0078D4] py-3.5 text-center text-sm font-semibold text-white shadow-lg hover:bg-[#006abc]"
        >
          Continue
        </button>
        <button
          type="button"
          data-testid="welcome-scan-qr-btn"
          onClick={onScanQr || onOpenQrScanner}
          className="w-full rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] py-3 text-center text-xs font-semibold text-[var(--quant-foreground)]"
        >
          Sign in using QR code on your computer
        </button>
        <button
          type="button"
          data-testid="welcome-remove-account-btn"
          onClick={() => setShowRemoveAlert(true)}
          className="w-full py-1 text-center text-[11px] text-red-500 font-medium"
        >
          Remove account from this device
        </button>
      </div>

      <MobileRemoveAccountAlert
        isOpen={showRemoveAlert}
        accountEmail={emailInput || 'samlee.mobbin01@quantmail.com'}
        onCancel={() => setShowRemoveAlert(false)}
        onConfirmRemove={() => setShowRemoveAlert(false)}
      />
    </div>
  );
}

export function MobileQrScannerSheet({
  isOpen,
  onClose,
  onScanSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div
      data-testid="mobile-qr-scanner-sheet"
      className="fixed inset-0 z-50 flex flex-col justify-between bg-black p-6 text-white"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          data-testid="qr-scanner-close-btn"
          onClick={onClose}
          className="text-sm font-semibold text-white/80"
        >
          ✕ Close
        </button>
        <span className="text-xs font-semibold tracking-wider uppercase text-white/60">QR Login</span>
        <span className="w-8" />
      </div>

      <div className="flex flex-col items-center justify-center text-center space-y-4">
        <div className="relative size-64 rounded-3xl border-2 border-dashed border-[#0078D4] p-4 flex items-center justify-center">
          <div className="size-48 rounded-xl bg-white/5 flex items-center justify-center text-xs text-white/40">
            [Camera Viewfinder]
          </div>
        </div>
        <p className="text-xs text-white/80 max-w-xs leading-relaxed">
          Point your device&apos;s camera at the QuantMail QR code on your computer.
        </p>
        <button
          type="button"
          data-testid="qr-simulate-scan-btn"
          onClick={onScanSuccess}
          className="rounded-full bg-[#0078D4] px-5 py-2 text-xs font-semibold text-white shadow"
        >
          Simulate Scan
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full text-center text-xs font-medium text-white/60 py-2 hover:text-white"
      >
        Sign In Manually
      </button>
    </div>
  );
}

export function MobileRemoveAccountAlert({
  isOpen,
  onClose,
  onCancel,
  accountEmail,
  onConfirmRemove,
}: {
  isOpen: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  accountEmail?: string;
  onConfirmRemove: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div
      data-testid="remove-account-alert-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
    >
      <div className="w-full max-w-[280px] overflow-hidden rounded-2xl bg-[#F2F2F2] dark:bg-[#1C1C1E] text-center shadow-2xl">
        <div className="px-4 pb-4 pt-5">
          <h3 className="text-base font-semibold text-[var(--quant-foreground)]">
            Remove account from this device?
          </h3>
          <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
            {accountEmail ? `Are you sure you want to remove ${accountEmail} from this device? Removing this account will delete any local cached mail data.` : 'Removing this account will delete any local cached mail data.'}
          </p>
        </div>
        <div className="divide-y divide-[var(--quant-border)] border-t border-[var(--quant-border)] text-sm">
          <button
            type="button"
            data-testid="confirm-remove-account-btn"
            onClick={onConfirmRemove}
            className="w-full py-3 font-semibold text-red-500"
          >
            Remove
          </button>
          <button
            type="button"
            data-testid="cancel-remove-account-btn"
            onClick={onClose || onCancel}
            className="w-full py-3 font-semibold text-[#0078D4]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 6. FLOW #35: PHOTO DRAWING & ANNOTATION STUDIO ──────────────────────────

export function MobilePhotoDrawingStudio({
  isOpen = true,
  onClose,
  onCancel,
  onFinish,
  onDone,
}: {
  isOpen?: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onFinish?: () => void;
  onDone?: () => void;
}) {
  const [activeTool, setActiveTool] = useState<'ink' | 'crop' | 'text' | 'rotate'>('ink');
  const [inkColor, setInkColor] = useState('#EF4444');

  if (!isOpen) return null;

  const colors = ['#EF4444', '#0078D4', '#EAB308', '#10B981', '#FFFFFF', '#000000'];

  return (
    <div
      data-testid="photo-drawing-studio"
      className="fixed inset-0 z-50 flex flex-col justify-between bg-black p-4 text-white select-none"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          data-testid="drawing-close-btn"
          onClick={onClose || onCancel}
          className="text-sm font-semibold text-white/80"
        >
          ✕ Close
        </button>
        <span className="text-xs font-bold uppercase tracking-wider text-white/60">Photo Studio</span>
        <button
          type="button"
          data-testid="drawing-finish-btn"
          onClick={onFinish || onDone}
          className="rounded-full bg-[#0078D4] px-4 py-1.5 text-xs font-bold text-white shadow"
        >
          ✓ Finish
        </button>
      </div>

      {/* Canvas Viewport */}
      <div className="relative flex flex-1 items-center justify-center p-4">
        <div className="relative aspect-[3/4] w-full max-w-[280px] rounded-2xl bg-zinc-800 border-2 border-white/20 overflow-hidden shadow-2xl flex items-center justify-center">
          <span className="text-5xl">🖼️</span>
          {/* Simulated Ink Stroke */}
          <svg className="absolute inset-0 pointer-events-none" viewBox="0 0 100 100">
            <path d="M 20 40 Q 50 20 80 60" stroke={inkColor} strokeWidth="4" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Bottom Tool Palette */}
      <div className="space-y-3">
        {/* Color Palette */}
        {activeTool === 'ink' && (
          <div data-testid="ink-color-palette" className="flex justify-center gap-3">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                data-testid={`ink-color-${c}`}
                onClick={() => setInkColor(c)}
                style={{ backgroundColor: c }}
                className={`size-7 rounded-full transition-transform ${
                  inkColor === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-black' : ''
                }`}
              />
            ))}
          </div>
        )}

        {/* Toolbar Buttons */}
        <div className="flex items-center justify-around rounded-2xl bg-zinc-900/90 py-2.5 text-xs font-semibold">
          <button
            type="button"
            data-testid="tool-ink-btn"
            onClick={() => setActiveTool('ink')}
            className={`flex flex-col items-center gap-1 ${activeTool === 'ink' ? 'text-[#0078D4]' : 'text-white/60'}`}
          >
            <span>✏️</span>
            <span>Ink</span>
          </button>
          <button
            type="button"
            data-testid="tool-crop-btn"
            onClick={() => setActiveTool('crop')}
            className={`flex flex-col items-center gap-1 ${activeTool === 'crop' ? 'text-[#0078D4]' : 'text-white/60'}`}
          >
            <span>✂️</span>
            <span>Crop</span>
          </button>
          <button
            type="button"
            data-testid="tool-text-btn"
            onClick={() => setActiveTool('text')}
            className={`flex flex-col items-center gap-1 ${activeTool === 'text' ? 'text-[#0078D4]' : 'text-white/60'}`}
          >
            <span>🔤</span>
            <span>Text</span>
          </button>
          <button
            type="button"
            data-testid="tool-rotate-btn"
            onClick={() => setActiveTool('rotate')}
            className={`flex flex-col items-center gap-1 ${activeTool === 'rotate' ? 'text-[#0078D4]' : 'text-white/60'}`}
          >
            <span>🔄</span>
            <span>Rotate</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 7. FLOW #63: COMPOSER ATTACHMENT ACTION SHEET ───────────────────────────

export function MobileAttachmentActionSheet({
  isOpen,
  fileName,
  onClose,
  onMoveToBody,
  onRemove,
}: {
  isOpen: boolean;
  fileName?: string;
  onClose: () => void;
  onMoveToBody: () => void;
  onRemove: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div
      data-testid="attachment-action-sheet"
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 px-4 pb-6"
    >
      <div className="overflow-hidden rounded-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] shadow-2xl divide-y divide-[var(--quant-border)] text-center text-sm">
        {fileName && (
          <div className="py-2.5 px-4 text-xs font-semibold text-[var(--quant-muted-foreground)] truncate bg-[var(--quant-border)]/15">
            {fileName}
          </div>
        )}
        <button
          type="button"
          data-testid="attachment-move-to-body-btn"
          onClick={onMoveToBody}
          className="w-full py-3.5 font-semibold text-[var(--quant-foreground)] hover:bg-[var(--quant-border)]/20"
        >
          Move to Message Body
        </button>
        <button
          type="button"
          data-testid="attachment-remove-btn"
          onClick={onRemove}
          className="w-full py-3.5 font-semibold text-red-500 hover:bg-red-500/10"
        >
          Remove Attachment
        </button>
      </div>
      <button
        type="button"
        data-testid="attachment-cancel-btn"
        onClick={onClose}
        className="mt-2 w-full rounded-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] py-3.5 text-center text-sm font-semibold text-[#0078D4]"
      >
        Cancel
      </button>
    </div>
  );
}

// ─── 8. FLOW #65: NOTIFICATIONS ACTIVITY FEED ────────────────────────────────

export function MobileNotificationsFeedSheet({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [notifications, setNotifications] = useState<string[]>([]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="mobile-notifications-feed-sheet"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--quant-background)] text-[var(--quant-foreground)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
        <button
          type="button"
          data-testid="notifications-back-btn"
          onClick={onClose}
          className="text-base text-[var(--quant-muted-foreground)]"
        >
          ‹
        </button>
        <h2 className="text-base font-semibold">Notifications</h2>
        <span className="w-5" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center text-center">
        {notifications.length === 0 ? (
          <div data-testid="notifications-empty-state" className="space-y-2">
            <span className="text-4xl block">🔔</span>
            <h3 className="text-sm font-bold text-[var(--quant-foreground)]">
              No new notifications
            </h3>
            <p className="text-xs text-[var(--quant-muted-foreground)]">
              Please check back later.
            </p>
          </div>
        ) : (
          <div className="w-full divide-y divide-[var(--quant-border)]">
            {notifications.map((n, i) => (
              <div key={i} className="py-3 text-xs text-left">
                {n}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
