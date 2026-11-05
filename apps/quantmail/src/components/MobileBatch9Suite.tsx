'use client';

/**
 * MobileBatch9Suite — Reverse-Engineered Batch 9 (Final Batch) Suite:
 * - Flow #66: Onboarding Walkthrough (Welcome hero, zero-tracking privacy, age/country verification, name & parental guidelines)
 * - Flow #68: Plan & Subscription (Quant Workspace Basic vs Personal vs Family, features checklist, storage quotas)
 * - Flow #71: Removing a User (Calendar sharing permissions, Can View / Can Edit, remove user confirmation alert)
 * - Flow #72: Reordering Toolbar (Composer action bar customization, top pinned actions, reorder handles, reset)
 * - Flow #73: Reordering Apps (Mobile app drawer customization: Email, Calendar, Contacts pinned vs QuantDrive, Tasks, Note, Meet)
 * - Flow #76: Saving a File to QuantDrive (Attachment save sheet, folder picker: Documents, Reports, Shared, Recent, instant feedback)
 * - Flow #78: Scheduling an Event (Interactive timeline, conflict check, duration presets, Quanty Meet integration)
 * - Flow #79: Scheduling Do Not Disturb (DND schedule options: 1 hour, until tomorrow, during events, evenings, weekends)
 * - Flow #81: Searching Contacts (Contact directory with live search filter, direct actions: email, chat, schedule)
 * - Flow #82: Searching QuantMail (Universal search across Email, Events, Contacts, Files, swipe tip banner, top results)
 * - Flow #83: Searching Settings (Settings live filter: appearance, signature, automatic replies, notifications, accounts, passkeys)
 * - Flow #84: Send to QuantNote (Send email to QuantNote notebook & section picker with auth consent)
 * - Flow #88: Setting up Passkey (Biometric Face ID / Touch ID / QR setup with security verification)
 * - Flow #89: Setting up Account (Personal profile details, country/region, birthday, name, agreement consent)
 * - Flow #90: Settings Hub (Main iOS settings navigation, account cards, quick settings toggles)
 * - Flow #93: Storage (Storage breakdown bar: QuantDrive 2.7 GB, Mail 1.5 GB, Trash 0.6 GB, cleanup suggestions)
 * - Flow #94: Subscribe to Quant Workspace (Subscription tiers Basic $1.99, Personal $9.99, Family $12.99, free trial)
 * - Flow #96: Switching to Compact View (Density selector with tight single-line rows)
 * - Flow #97: Switching to Cozy View (Density selector with balanced 2-line layout)
 * - Flow #99: Turning off Notifications (Master push toggle, focused inbox scope, custom sound alerts)
 * - Flow #100: Turning off Quick Drafts (Quick access to drafts banner with turn off trigger)
 * - Flow #101: Reply within a Time Range (Out-of-office automated replies, start/end date, block & clear calendar)
 * - Flow #102: Updating an Email Type (Contact email type picker: Work, Personal, Other)
 * - Flow #103: Uploading a Contact Photo (Photo action sheet: Upload Photo, Take Photo, Delete Photo)
 * - Flow #105: Uploading Attachment via Camera (Camera viewfinder, Document / Photo / Whiteboard modes, shutter, attach)
 * - Flow #108: Uploading Attachment via Gallery (Photo album grid, multiple selection badges, image compression prompt)
 * - Flow #109: View a File (Full-screen PDF attachment preview, zoom, save to QuantDrive, share)
 * - Flow #110: Widgets (iOS Home & Lock screen widgets preview: Next Event Agenda, Unread Mail Counter)
 *
 * Strict Compliance:
 * - Mobile-first viewport (390×844 iOS @ 2x DPR)
 * - Dual-theme 1:1 support (White light / Black dark)
 * - Zero Competitor Naming (QuantMail, Quanty Meet, QuantDrive, Quant Tasks, QuantNote, Quant Workspace)
 */

import React, { useState } from 'react';

// ─── Inline SVG Helpers (Zero External Dependency) ───────────────────────────
const IconClose = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const IconCheck = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const IconCheckCircle = ({ className = 'w-8 h-8' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconChevronRight = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

const IconSearch = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const IconCamera = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const IconImage = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const IconFileText = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const IconShield = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const IconLock = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

const IconBell = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const IconBellOff = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
  </svg>
);

const IconFolder = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const IconTrash = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const IconCloud = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
  </svg>
);

const IconSliders = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
  </svg>
);

const IconSparkles = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const IconShare = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
  </svg>
);

/* =========================================================================
   Flow #66: MobileOnboardingWalkthroughView
   ========================================================================= */
export interface MobileOnboardingWalkthroughViewProps {
  onComplete?: () => void;
  onSkip?: () => void;
}

export const MobileOnboardingWalkthroughView: React.FC<MobileOnboardingWalkthroughViewProps> = ({
  onComplete,
  onSkip,
}) => {
  const [step, setStep] = useState<number>(0);
  const [country, setCountry] = useState('United States');
  const [day, setDay] = useState('18');
  const [month, setMonth] = useState('February');
  const [year, setYear] = useState('1995');
  const [firstName, setFirstName] = useState('Sam');
  const [lastName, setLastName] = useState('Lee');
  const [marketingConsent, setMarketingConsent] = useState(true);

  return (
    <div
      data-testid="onboarding-walkthrough-view"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-y-auto"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <span className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase">
          Step {step + 1} of 4
        </span>
        <button
          data-testid="onboarding-skip-btn"
          onClick={onSkip || onComplete}
          className="text-xs font-medium text-[var(--accent-primary)] hover:underline"
        >
          Skip
        </button>
      </div>

      {/* Step Contents */}
      <div className="flex-1 flex flex-col justify-center px-6 py-4">
        {step === 0 && (
          <div data-testid="onboarding-step-welcome" className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] flex items-center justify-center mb-6 shadow-sm">
              <IconSparkles className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Welcome to QuantMail</h1>
            <p className="text-sm text-[var(--text-muted)] max-w-xs leading-relaxed mb-8">
              An intelligent, unified workspace designed for focused communications, privacy, and speed.
            </p>
            <div className="w-full space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-left">
                <IconShield className="w-5 h-5 text-[var(--accent-primary)] shrink-0" />
                <div>
                  <div className="text-xs font-semibold">Zero-Tracking Security</div>
                  <div className="text-[11px] text-[var(--text-muted)]">Encrypted communications & biometric protection</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-left">
                <IconSparkles className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <div className="text-xs font-semibold">Quant AI Assistant</div>
                  <div className="text-[11px] text-[var(--text-muted)]">Smart prioritization, quick replies & search</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div data-testid="onboarding-step-account-details" className="flex flex-col text-left">
            <h2 className="text-xl font-bold mb-1">Add some details</h2>
            <p className="text-xs text-[var(--text-muted)] mb-5">
              Add your country/region and birthdate to help us apply age-appropriate security settings to your Quant account.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">Country/Region</label>
                <select
                  data-testid="onboarding-country-select"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm"
                >
                  <option value="United States">United States</option>
                  <option value="United Kingdom">United Kingdom</option>
                  <option value="India">India</option>
                  <option value="Germany">Germany</option>
                  <option value="Japan">Japan</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">Birthdate</label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    data-testid="onboarding-day-input"
                    type="text"
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                    placeholder="Day"
                    className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm text-center"
                  />
                  <select
                    data-testid="onboarding-month-select"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm text-center"
                  >
                    <option value="January">January</option>
                    <option value="February">February</option>
                    <option value="March">March</option>
                    <option value="April">April</option>
                    <option value="May">May</option>
                    <option value="June">June</option>
                  </select>
                  <input
                    data-testid="onboarding-year-input"
                    type="text"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="Year"
                    className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm text-center"
                  />
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                If a child is using this device, create a child account by entering your child's date of birth. A child account enables you to enforce parental controls and safety policies.
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div data-testid="onboarding-step-name" className="flex flex-col text-left">
            <h2 className="text-xl font-bold mb-1">Add your name</h2>
            <p className="text-xs text-[var(--text-muted)] mb-5">
              Add your name to personalize your Quant account across QuantMail and Quant Workspace.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">First name</label>
                <input
                  data-testid="onboarding-first-name-input"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">Last name</label>
                <input
                  data-testid="onboarding-last-name-input"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm"
                />
              </div>
              <label className="flex items-start gap-2.5 pt-2 cursor-pointer">
                <input
                  data-testid="onboarding-marketing-consent-checkbox"
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="mt-0.5 rounded text-[var(--accent-primary)]"
                />
                <span className="text-xs text-[var(--text-muted)] leading-tight">
                  I would like information, tips, and updates about Quant Workspace products and services.
                </span>
              </label>
              <p className="text-[11px] text-[var(--text-muted)]">
                By selecting Next, I agree to the Quant Services Agreement and Privacy Statement.
              </p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div data-testid="onboarding-step-complete" className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-6">
              <IconCheckCircle className="w-9 h-9" />
            </div>
            <h2 className="text-xl font-bold mb-2">You're all set!</h2>
            <p className="text-xs text-[var(--text-muted)] max-w-xs mb-6 leading-relaxed">
              Welcome aboard, {firstName}. Your inbox has been synchronized and configured for optimum performance.
            </p>
            <div className="w-full p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-left mb-4">
              <div className="font-semibold text-[var(--text-main)] mb-1">Quick Gestures:</div>
              <ul className="space-y-1.5 text-[var(--text-muted)]">
                <li>• Swipe right to archive or mark read</li>
                <li>• Swipe left to schedule or delete</li>
                <li>• Pull down to refresh your inbox</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Action Footer */}
      <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]">
        {step < 3 ? (
          <button
            data-testid="onboarding-next-btn"
            onClick={() => setStep(s => s + 1)}
            className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-semibold shadow-sm hover:opacity-95 transition-opacity"
          >
            Next
          </button>
        ) : (
          <button
            data-testid="onboarding-get-started-btn"
            onClick={onComplete}
            className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow-sm hover:bg-emerald-700 transition-colors"
          >
            Get Started
          </button>
        )}
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #68: MobilePlanDetailsSheet
   ========================================================================= */
export interface MobilePlanDetailsSheetProps {
  onClose?: () => void;
  onUpgrade?: () => void;
}

export const MobilePlanDetailsSheet: React.FC<MobilePlanDetailsSheetProps> = ({
  onClose,
  onUpgrade,
}) => {
  return (
    <div
      data-testid="plan-details-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-y-auto"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-base font-bold">Plan & Subscription</h2>
        <button
          data-testid="close-plan-details-btn"
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-[var(--bg-card)] text-[var(--text-muted)]"
        >
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Current Plan Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-[var(--accent-primary)]/15 to-[var(--bg-card)] border border-[var(--accent-primary)]/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)]">
              Current Plan
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[var(--accent-primary)] text-white font-medium">
              Active
            </span>
          </div>
          <div className="text-xl font-bold mb-1">Quant Workspace Basic</div>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            samlee.mobbin01@quantmail.com
          </p>
          <div className="text-xs text-[var(--text-muted)] mb-3">
            Renews on March 28, 2026 • $1.99 / month
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--border-subtle)] overflow-hidden">
            <div className="h-full bg-[var(--accent-primary)] w-[32%]" />
          </div>
          <div className="flex justify-between text-[11px] text-[var(--text-muted)] mt-1.5">
            <span>32 GB used</span>
            <span>100 GB cloud storage</span>
          </div>
        </div>

        {/* Plan Features Checklist */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 space-y-3">
          <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
            Included Benefits
          </div>
          {[
            'Ad-free QuantMail on all devices',
            '100 GB secure cloud storage across QuantDrive',
            'Full mobile offline sync & encrypted local cache',
            'Advanced spam, malware & phishing shielding',
            'Direct 24/7 priority customer support'
          ].map((benefit, i) => (
            <div key={i} className="flex items-center gap-2.5 text-xs">
              <IconCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{benefit}</span>
            </div>
          ))}
        </div>

        {/* Upgrade Card */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold">Need more storage or AI?</div>
            <div className="text-[11px] text-[var(--text-muted)]">Explore Quant Workspace Family with 6 TB & Quant AI Copilot</div>
          </div>
          <button
            data-testid="upgrade-plan-btn"
            onClick={onUpgrade}
            className="px-3 py-1.5 rounded-lg bg-[var(--accent-primary)] text-white text-xs font-semibold shrink-0"
          >
            Upgrade
          </button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #71: MobileCalendarShareRemoveUserSheet
   ========================================================================= */
export interface MobileCalendarShareRemoveUserSheetProps {
  userEmail?: string;
  onRemove?: () => void;
  onClose?: () => void;
}

export const MobileCalendarShareRemoveUserSheet: React.FC<MobileCalendarShareRemoveUserSheetProps> = ({
  userEmail = 'alexsmith.mobbin@quantmail.com',
  onRemove,
  onClose,
}) => {
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [details, setDetails] = useState(true);
  const [showConfirmAlert, setShowConfirmAlert] = useState(false);

  return (
    <div
      data-testid="calendar-share-remove-user-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)]"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-base font-bold truncate max-w-[260px]">{userEmail}</h2>
        <button
          data-testid="close-remove-user-btn"
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-[var(--bg-card)] text-[var(--text-muted)]"
        >
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          Calendar Permissions
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
          <button
            data-testid="perm-can-view-btn"
            onClick={() => setPermission('view')}
            className="w-full flex items-center justify-between p-3.5 text-xs text-left"
          >
            <div>
              <div className="font-semibold text-sm">Can View</div>
              <div className="text-[11px] text-[var(--text-muted)]">User can see events on this calendar</div>
            </div>
            {permission === 'view' && <IconCheck className="w-4 h-4 text-[var(--accent-primary)]" />}
          </button>

          <button
            data-testid="perm-can-edit-btn"
            onClick={() => setPermission('edit')}
            className="w-full flex items-center justify-between p-3.5 text-xs text-left"
          >
            <div>
              <div className="font-semibold text-sm">Can Edit</div>
              <div className="text-[11px] text-[var(--text-muted)]">User can create, modify and delete events</div>
            </div>
            {permission === 'edit' && <IconCheck className="w-4 h-4 text-[var(--accent-primary)]" />}
          </button>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 flex items-center justify-between">
          <div>
            <div className="font-semibold text-xs">Share All Details</div>
            <div className="text-[11px] text-[var(--text-muted)]">Show event titles, descriptions, and attendees</div>
          </div>
          <input
            data-testid="share-all-details-toggle"
            type="checkbox"
            checked={details}
            onChange={(e) => setDetails(e.target.checked)}
            className="rounded text-[var(--accent-primary)]"
          />
        </div>

        {/* Remove Button */}
        <button
          data-testid="trigger-remove-user-alert-btn"
          onClick={() => setShowConfirmAlert(true)}
          className="w-full py-3 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 text-xs font-semibold transition-colors mt-6"
        >
          Remove
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirmAlert && (
        <div
          data-testid="remove-user-confirm-alert"
          className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
        >
          <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-5 max-w-xs w-full text-center shadow-xl space-y-3">
            <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
              <IconTrash className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm">Remove {userEmail}?</h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              This person will no longer be able to view or edit this shared calendar.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                data-testid="cancel-remove-user-btn"
                onClick={() => setShowConfirmAlert(false)}
                className="py-2.5 rounded-lg border border-[var(--border-subtle)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                data-testid="confirm-remove-user-btn"
                onClick={() => {
                  setShowConfirmAlert(false);
                  onRemove?.();
                }}
                className="py-2.5 rounded-lg bg-red-600 text-white text-xs font-bold shadow-sm hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* =========================================================================
   Flow #72: MobileReorderToolbarSheet
   ========================================================================= */
export interface MobileReorderToolbarSheetProps {
  onClose?: () => void;
  onSave?: (items: string[]) => void;
}

export const MobileReorderToolbarSheet: React.FC<MobileReorderToolbarSheetProps> = ({
  onClose,
  onSave,
}) => {
  const defaultActions = ['Attachment', 'Camera', 'Schedule Send', 'Draft with Quant AI', 'Formatting', 'Calendar'];
  const moreActions = ['Importance', 'Preview'];
  const [pinned, setPinned] = useState<string[]>(defaultActions);
  const [extra, setExtra] = useState<string[]>(moreActions);

  const resetToDefault = () => {
    setPinned(defaultActions);
    setExtra(moreActions);
  };

  return (
    <div
      data-testid="reorder-toolbar-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-y-auto"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <button data-testid="close-reorder-toolbar-btn" onClick={onClose} className="p-1">
            <IconClose className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold">Customize actions</h2>
        </div>
        <button
          data-testid="reset-toolbar-btn"
          onClick={resetToDefault}
          className="text-xs text-[var(--accent-primary)] font-semibold"
        >
          Reset
        </button>
      </div>

      <div className="p-4 space-y-5 flex-1">
        {/* Pinned Toolbar Actions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Toolbar Actions (Top {pinned.length})
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] font-medium">
              +{pinned.length}
            </span>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
            {pinned.map((item, idx) => (
              <div
                key={item}
                data-testid={`toolbar-item-${idx}`}
                className="flex items-center justify-between p-3 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
                  <span className="font-medium">{item}</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--text-muted)]">
                  <button
                    data-testid={`move-down-toolbar-${idx}`}
                    onClick={() => {
                      if (idx < pinned.length - 1) {
                        const next = [...pinned];
                        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                        setPinned(next);
                      }
                    }}
                    className="p-1 hover:text-[var(--text-main)]"
                  >
                    ↓
                  </button>
                  <button
                    data-testid={`move-up-toolbar-${idx}`}
                    onClick={() => {
                      if (idx > 0) {
                        const next = [...pinned];
                        [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
                        setPinned(next);
                      }
                    }}
                    className="p-1 hover:text-[var(--text-main)]"
                  >
                    ↑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* More Actions */}
        <div>
          <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
            More Actions
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
            {extra.map((item) => (
              <div key={item} className="flex items-center justify-between p-3 text-xs">
                <span className="font-medium">{item}</span>
                <span className="text-[11px] text-[var(--text-muted)]">Available in overflow menu</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <button
          data-testid="save-toolbar-reorder-btn"
          onClick={() => {
            onSave?.(pinned);
            onClose?.();
          }}
          className="w-full py-2.5 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold"
        >
          Done
        </button>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #73: MobileReorderAppsSheet
   ========================================================================= */
export interface MobileReorderAppsSheetProps {
  onClose?: () => void;
  onSave?: (apps: string[]) => void;
}

export const MobileReorderAppsSheet: React.FC<MobileReorderAppsSheetProps> = ({
  onClose,
  onSave,
}) => {
  const [pinnedApps, setPinnedApps] = useState<string[]>(['Email', 'Calendar', 'Contacts']);
  const [moreApps, setMoreApps] = useState<string[]>(['Files', 'Quant Tasks', 'QuantNote', 'Quanty Meet']);

  return (
    <div
      data-testid="reorder-apps-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-y-auto"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <button data-testid="close-reorder-apps-btn" onClick={onClose} className="p-1">
            <IconClose className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold">Reorder Apps</h2>
        </div>
      </div>

      <div className="p-4 space-y-5 flex-1">
        <div>
          <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
            Pinned in Bottom Bar
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
            {pinnedApps.map((app, idx) => (
              <div
                key={app}
                data-testid={`pinned-app-${idx}`}
                className="flex items-center justify-between p-3.5 text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] flex items-center justify-center font-bold text-xs">
                    {app.slice(0, 2)}
                  </div>
                  <span className="font-semibold text-sm">{app}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    data-testid={`unpin-app-${idx}`}
                    onClick={() => {
                      setPinnedApps(pinnedApps.filter((_, i) => i !== idx));
                      setMoreApps([...moreApps, app]);
                    }}
                    className="text-xs text-[var(--text-muted)] hover:text-red-500"
                  >
                    Unpin
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
            More Apps
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
            {moreApps.map((app, idx) => (
              <div key={app} className="flex items-center justify-between p-3.5 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] flex items-center justify-center text-xs font-semibold">
                    {app.slice(0, 2)}
                  </div>
                  <span className="font-medium text-sm">{app}</span>
                </div>
                <button
                  data-testid={`pin-more-app-${idx}`}
                  onClick={() => {
                    setMoreApps(moreApps.filter((_, i) => i !== idx));
                    setPinnedApps([...pinnedApps, app]);
                  }}
                  className="text-xs text-[var(--accent-primary)] font-semibold"
                >
                  Pin
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <button
          data-testid="save-reorder-apps-btn"
          onClick={() => {
            onSave?.(pinnedApps);
            onClose?.();
          }}
          className="w-full py-2.5 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold"
        >
          Done
        </button>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #76: MobileSaveToQuantDriveSheet
   ========================================================================= */
export interface MobileSaveToQuantDriveSheetProps {
  fileName?: string;
  onSave?: (folder: string) => void;
  onClose?: () => void;
}

export const MobileSaveToQuantDriveSheet: React.FC<MobileSaveToQuantDriveSheetProps> = ({
  fileName = 'Q1 Performance Report.pdf',
  onSave,
  onClose,
}) => {
  const [selectedFolder, setSelectedFolder] = useState('Documents');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const folders = [
    { name: 'Documents', count: '14 items' },
    { name: 'Reports', count: '6 items' },
    { name: 'Shared with Me', count: '28 items' },
    { name: 'Recent Uploads', count: '3 items' },
  ];

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setSavedSuccess(true);
      setTimeout(() => {
        onSave?.(selectedFolder);
      }, 700);
    }, 600);
  };

  return (
    <div
      data-testid="save-to-quantdrive-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)]"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-base font-bold">Save to QuantDrive</h2>
        <button
          data-testid="close-save-quantdrive-btn"
          onClick={onClose}
          className="p-1 text-[var(--text-muted)]"
        >
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
        {/* File Info Chip */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
          <IconFileText className="w-6 h-6 text-red-500 shrink-0" />
          <div className="flex-1 truncate">
            <div className="text-xs font-semibold truncate">{fileName}</div>
            <div className="text-[11px] text-[var(--text-muted)]">PDF • 2 KB • samlee.mobbin01@quantmail.com</div>
          </div>
        </div>

        <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
          Select Destination Folder
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
          {folders.map(f => (
            <button
              key={f.name}
              data-testid={`select-folder-${f.name.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => setSelectedFolder(f.name)}
              className="w-full flex items-center justify-between p-3.5 text-left text-xs"
            >
              <div className="flex items-center gap-3">
                <IconFolder className="w-5 h-5 text-[var(--accent-primary)]" />
                <div>
                  <div className="font-semibold text-sm">{f.name}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">{f.count}</div>
                </div>
              </div>
              {selectedFolder === f.name && (
                <IconCheck className="w-4 h-4 text-[var(--accent-primary)] font-bold" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <button
          data-testid="confirm-save-quantdrive-btn"
          disabled={isSaving || savedSuccess}
          onClick={handleSave}
          className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <span>Saving to {selectedFolder}...</span>
          ) : savedSuccess ? (
            <span>Saved Successfully!</span>
          ) : (
            <span>Save here</span>
          )}
        </button>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #78: MobileCalendarDragDropSheet
   ========================================================================= */
export interface MobileCalendarDragDropSheetProps {
  onClose?: () => void;
  onSave?: () => void;
}

export const MobileCalendarDragDropSheet: React.FC<MobileCalendarDragDropSheetProps> = ({
  onClose,
  onSave,
}) => {
  const [selectedSlot, setSelectedSlot] = useState<'10am' | '2pm'>('10am');
  const [quantyMeetEnabled, setQuantyMeetEnabled] = useState(true);

  return (
    <div
      data-testid="calendar-drag-drop-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-y-auto"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <button data-testid="close-drag-drop-btn" onClick={onClose} className="p-1">
            <IconClose className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold">New Event</h2>
        </div>
        <button
          data-testid="save-drag-drop-event-btn"
          onClick={onSave || onClose}
          className="text-xs text-[var(--accent-primary)] font-bold"
        >
          Save
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Title Input */}
        <input
          data-testid="event-title-input"
          type="text"
          defaultValue="Daily standup"
          placeholder="Title"
          className="w-full p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm font-semibold"
        />

        {/* Interactive Time Slot Selector */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 space-y-2">
          <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
            Suggested Free Slots (Thursday, Feb 26)
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              data-testid="slot-10am-btn"
              onClick={() => setSelectedSlot('10am')}
              className={`p-3 rounded-lg border text-left text-xs transition-all ${
                selectedSlot === '10am'
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 font-bold'
                  : 'border-[var(--border-subtle)]'
              }`}
            >
              <div className="text-sm">10:00 AM - 10:30 AM</div>
              <div className="text-[11px] text-[var(--text-muted)] font-normal">Duration: 30 minutes</div>
              <div className="text-[11px] text-emerald-500 font-medium mt-1">All attendees free</div>
            </button>

            <button
              data-testid="slot-2pm-btn"
              onClick={() => setSelectedSlot('2pm')}
              className={`p-3 rounded-lg border text-left text-xs transition-all ${
                selectedSlot === '2pm'
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 font-bold'
                  : 'border-[var(--border-subtle)]'
              }`}
            >
              <div className="text-sm">2:00 PM - 3:00 PM</div>
              <div className="text-[11px] text-[var(--text-muted)] font-normal">Duration: 1 hour</div>
              <div className="text-[11px] text-amber-500 font-medium mt-1">Conflicts with Project Kickoff</div>
            </button>
          </div>
        </div>

        {/* Quanty Meet Meeting Switch */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] flex items-center justify-center font-bold text-xs">
              QM
            </div>
            <div>
              <div className="font-semibold text-xs">Quanty Meet Meeting</div>
              <div className="text-[11px] text-[var(--text-muted)]">Add automated video link & phone dial-in</div>
            </div>
          </div>
          <input
            data-testid="quanty-meet-toggle"
            type="checkbox"
            checked={quantyMeetEnabled}
            onChange={(e) => setQuantyMeetEnabled(e.target.checked)}
            className="rounded text-[var(--accent-primary)]"
          />
        </div>

        {/* Attendees row */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 text-xs space-y-2">
          <div className="font-semibold">People</div>
          <div className="flex flex-wrap gap-1.5">
            <span className="px-2.5 py-1 rounded-full bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[11px]">
              Ms Alex Smith
            </span>
            <span className="px-2.5 py-1 rounded-full bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[11px]">
              Sam Lee (optional)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #79: MobileDoNotDisturbSheet
   ========================================================================= */
export interface MobileDoNotDisturbSheetProps {
  onClose?: () => void;
  onSetDnd?: (option: string) => void;
}

export const MobileDoNotDisturbSheet: React.FC<MobileDoNotDisturbSheetProps> = ({
  onClose,
  onSetDnd,
}) => {
  const [selected, setSelected] = useState('1_hour');

  const options = [
    { id: '1_hour', title: 'For 1 hour', subtitle: 'Mutes notifications until 10:41 AM' },
    { id: 'until_tomorrow', title: 'Until tomorrow', subtitle: 'Resumes tomorrow morning at 8:00 AM' },
    { id: 'during_events', title: 'During events', subtitle: 'Automatically silenced while you have a calendar event' },
    { id: 'evenings', title: 'Evenings', subtitle: 'Active every day from 6:00 PM to 8:00 AM' },
    { id: 'weekends', title: 'Weekends', subtitle: 'All day Saturday and Sunday' },
  ];

  return (
    <div
      data-testid="do-not-disturb-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)]"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <IconBellOff className="w-5 h-5 text-amber-500" />
          <h2 className="text-base font-bold">Do Not Disturb</h2>
        </div>
        <button data-testid="close-dnd-btn" onClick={onClose} className="p-1">
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-3 flex-1 overflow-y-auto">
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Silence notifications from QuantMail and Quant Workspace while you focus.
        </p>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
          {options.map(opt => (
            <button
              key={opt.id}
              data-testid={`dnd-option-${opt.id}`}
              onClick={() => setSelected(opt.id)}
              className="w-full flex items-center justify-between p-3.5 text-left text-xs"
            >
              <div>
                <div className="font-semibold text-sm">{opt.title}</div>
                <div className="text-[11px] text-[var(--text-muted)]">{opt.subtitle}</div>
              </div>
              {selected === opt.id && <IconCheck className="w-4 h-4 text-[var(--accent-primary)] font-bold" />}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <button
          data-testid="apply-dnd-btn"
          onClick={() => {
            onSetDnd?.(selected);
            onClose?.();
          }}
          className="w-full py-2.5 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold"
        >
          Turn On
        </button>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #81: MobileSearchContactsSheet
   ========================================================================= */
export interface MobileSearchContactsSheetProps {
  onClose?: () => void;
  onSelectContact?: (contact: any) => void;
}

export const MobileSearchContactsSheet: React.FC<MobileSearchContactsSheetProps> = ({
  onClose,
  onSelectContact,
}) => {
  const [query, setQuery] = useState('');
  const allContacts = [
    { name: 'Ms Alex Smith', email: 'alexsmith.mobbin@quantmail.com', initials: 'AS' },
    { name: 'John Smith', email: 'jsmith@quantmail.com', initials: 'JS' },
    { name: 'Sarah Connor', email: 'sconnor@quantmail.com', initials: 'SC' },
  ];

  const filtered = allContacts.filter(
    c => c.name.toLowerCase().includes(query.toLowerCase()) || c.email.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      data-testid="search-contacts-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)]"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="relative flex-1">
          <div className="absolute left-3 top-2.5 text-[var(--text-muted)] pointer-events-none">
            <IconSearch className="w-4 h-4" />
          </div>
          <input
            data-testid="search-people-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-[var(--text-main)]"
          />
        </div>
        <button
          data-testid="cancel-search-contacts-btn"
          onClick={onClose}
          className="text-xs text-[var(--accent-primary)] font-semibold px-2"
        >
          Cancel
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
          All Contacts ({filtered.length})
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
          {filtered.map(contact => (
            <button
              key={contact.email}
              data-testid={`contact-row-${contact.initials.toLowerCase()}`}
              onClick={() => onSelectContact?.(contact)}
              className="w-full flex items-center justify-between p-3.5 text-left text-xs"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] flex items-center justify-center font-bold text-xs">
                  {contact.initials}
                </div>
                <div>
                  <div className="font-semibold text-sm">{contact.name}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">{contact.email}</div>
                </div>
              </div>
              <IconChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #82: MobileUniversalMailSearchSheet
   ========================================================================= */
export interface MobileUniversalMailSearchSheetProps {
  onClose?: () => void;
  onOpenItem?: (item: any) => void;
}

export const MobileUniversalMailSearchSheet: React.FC<MobileUniversalMailSearchSheetProps> = ({
  onClose,
  onOpenItem,
}) => {
  const [query, setQuery] = useState('Work');
  const [category, setCategory] = useState<'All' | 'Email' | 'People' | 'Files' | 'Event'>('All');
  const [showSwipeTip, setShowSwipeTip] = useState(true);

  const results = [
    {
      id: '1',
      sender: 'Alex Smith',
      subject: 'Follow-Up on Work',
      date: 'Wednesday',
      folder: 'Inbox',
      snippet: '...up regarding our recent work discussion. Please let me know if you have any updates...',
    },
    {
      id: '2',
      sender: 'Project Fortuna Team',
      subject: 'Work Roadmap & Schedule',
      date: 'Monday',
      folder: 'Inbox',
      snippet: 'Enclosed are the sprint priorities and work milestones for Q2...',
    },
    {
      id: '3',
      sender: 'Finance Ops',
      subject: 'Budgeting & Work Expenses',
      date: 'Last week',
      folder: 'Archive',
      snippet: 'Your expense report for Q1 has been reviewed and approved...',
    },
  ];

  return (
    <div
      data-testid="universal-mail-search-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)]"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="relative flex-1">
          <div className="absolute left-3 top-2.5 text-[var(--text-muted)] pointer-events-none">
            <IconSearch className="w-4 h-4" />
          </div>
          <input
            data-testid="universal-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Email, Events, Contacts, Files"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-[var(--text-main)]"
          />
        </div>
        <button
          data-testid="cancel-universal-search-btn"
          onClick={onClose}
          className="text-xs text-[var(--accent-primary)] font-semibold px-2"
        >
          Cancel
        </button>
      </div>

      {/* Categories Tabs */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[var(--border-subtle)] overflow-x-auto">
        {(['All', 'Email', 'People', 'Files', 'Event'] as const).map(tab => (
          <button
            key={tab}
            data-testid={`search-tab-${tab.toLowerCase()}`}
            onClick={() => setCategory(tab)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              category === tab
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-muted)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Swipe Tip Banner */}
      {showSwipeTip && (
        <div
          data-testid="swipe-tip-banner"
          className="mx-4 mt-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs flex items-center justify-between"
        >
          <span className="text-[11px] text-[var(--text-muted)] pr-2">
            💡 Swipe email items in search results for quick actions (archive, flag, delete), just like in your inbox.
          </span>
          <button onClick={() => setShowSwipeTip(false)} className="text-[var(--text-muted)] p-1">
            <IconClose className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Results List */}
      <div className="p-4 flex-1 overflow-y-auto space-y-3">
        <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
          Top Results ({results.length})
        </div>
        <div className="space-y-2">
          {results.map(r => (
            <div
              key={r.id}
              data-testid={`search-result-item-${r.id}`}
              onClick={() => onOpenItem?.(r)}
              className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] cursor-pointer hover:border-[var(--accent-primary)]/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-xs text-[var(--accent-primary)]">{r.sender}</span>
                <span className="text-[11px] text-[var(--text-muted)]">{r.date}</span>
              </div>
              <div className="font-medium text-xs text-[var(--text-main)] mb-1">{r.subject}</div>
              <div className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                {r.snippet}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #83: MobileSearchSettingsSheet
   ========================================================================= */
export interface MobileSearchSettingsSheetProps {
  onClose?: () => void;
  onSelectSetting?: (id: string) => void;
}

export const MobileSearchSettingsSheet: React.FC<MobileSearchSettingsSheetProps> = ({
  onClose,
  onSelectSetting,
}) => {
  const [query, setQuery] = useState('');
  const settingsItems = [
    { id: 'appearance', title: 'Display & Appearance', section: 'General' },
    { id: 'signature', title: 'Signature', section: 'Email' },
    { id: 'replies', title: 'Automatic Replies', section: 'Email' },
    { id: 'notifications', title: 'Notifications & Sounds', section: 'Preferences' },
    { id: 'accounts', title: 'Accounts & Storage', section: 'General' },
    { id: 'face_id', title: 'Face ID & Passkey Security', section: 'Privacy' },
  ];

  const filtered = settingsItems.filter(
    s => s.title.toLowerCase().includes(query.toLowerCase()) || s.section.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      data-testid="search-settings-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)]"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="relative flex-1">
          <div className="absolute left-3 top-2.5 text-[var(--text-muted)] pointer-events-none">
            <IconSearch className="w-4 h-4" />
          </div>
          <input
            data-testid="search-settings-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Quick Settings"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-[var(--text-main)]"
          />
        </div>
        <button
          data-testid="cancel-search-settings-btn"
          onClick={onClose}
          className="text-xs text-[var(--accent-primary)] font-semibold px-2"
        >
          Cancel
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
          Settings Matches ({filtered.length})
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
          {filtered.map(item => (
            <button
              key={item.id}
              data-testid={`setting-result-${item.id}`}
              onClick={() => onSelectSetting?.(item.id)}
              className="w-full flex items-center justify-between p-3.5 text-left text-xs"
            >
              <div>
                <div className="font-semibold text-sm">{item.title}</div>
                <div className="text-[11px] text-[var(--text-muted)]">{item.section}</div>
              </div>
              <IconChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #84: MobileSendToQuantNoteSheet
   ========================================================================= */
export interface MobileSendToQuantNoteSheetProps {
  emailSubject?: string;
  onClose?: () => void;
  onSend?: (notebook: string) => void;
}

export const MobileSendToQuantNoteSheet: React.FC<MobileSendToQuantNoteSheetProps> = ({
  emailSubject = 'Follow-Up on Work',
  onClose,
  onSend,
}) => {
  const [selectedNotebook, setSelectedNotebook] = useState('Work Notes');
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  const notebooks = [
    { name: 'Work Notes', section: 'General Discussions' },
    { name: 'Projects', section: 'Sprint Backlog' },
    { name: 'Personal Ideas', section: 'Daily Journal' },
  ];

  const handleSend = () => {
    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      setSentSuccess(true);
      setTimeout(() => onSend?.(selectedNotebook), 600);
    }, 600);
  };

  return (
    <div
      data-testid="send-to-quantnote-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)]"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-base font-bold">Send to QuantNote</h2>
        <button data-testid="close-quantnote-btn" onClick={onClose} className="p-1">
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
        <div className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs">
          <div className="text-[11px] text-[var(--text-muted)]">Subject</div>
          <div className="font-semibold text-sm mt-0.5">{emailSubject}</div>
        </div>

        <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
          Destination Notebook & Section
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
          {notebooks.map(nb => (
            <button
              key={nb.name}
              data-testid={`select-notebook-${nb.name.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => setSelectedNotebook(nb.name)}
              className="w-full flex items-center justify-between p-3.5 text-left text-xs"
            >
              <div>
                <div className="font-semibold text-sm">{nb.name}</div>
                <div className="text-[11px] text-[var(--text-muted)]">Section: {nb.section}</div>
              </div>
              {selectedNotebook === nb.name && <IconCheck className="w-4 h-4 text-[var(--accent-primary)] font-bold" />}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <button
          data-testid="confirm-send-quantnote-btn"
          disabled={isSending || sentSuccess}
          onClick={handleSend}
          className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold flex items-center justify-center gap-2"
        >
          {isSending ? 'Sending to QuantNote...' : sentSuccess ? 'Sent to QuantNote!' : 'Save Note'}
        </button>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #88: MobilePasskeySetupSheet
   ========================================================================= */
export interface MobilePasskeySetupSheetProps {
  onClose?: () => void;
  onSuccess?: () => void;
}

export const MobilePasskeySetupSheet: React.FC<MobilePasskeySetupSheetProps> = ({
  onClose,
  onSuccess,
}) => {
  const [method, setMethod] = useState<'biometric' | 'qr'>('biometric');
  const [isVerifying, setIsVerifying] = useState(false);
  const [complete, setComplete] = useState(false);

  const startVerification = () => {
    setIsVerifying(true);
    setTimeout(() => {
      setIsVerifying(false);
      setComplete(true);
      setTimeout(() => onSuccess?.(), 700);
    }, 700);
  };

  return (
    <div
      data-testid="passkey-setup-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)]"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-base font-bold">Setting up Passkey</h2>
        <button data-testid="close-passkey-btn" onClick={onClose} className="p-1">
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 flex-1 flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] flex items-center justify-center mb-2">
          <IconLock className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold">Sign in without passwords</h3>
        <p className="text-xs text-[var(--text-muted)] max-w-xs leading-relaxed">
          Your device creates a cryptographic passkey backed by Face ID or Touch ID. Fast, secure, and phishing-proof.
        </p>

        <div className="w-full space-y-2 pt-4">
          <button
            data-testid="passkey-method-biometric"
            onClick={() => setMethod('biometric')}
            className={`w-full p-3.5 rounded-xl border text-left text-xs flex items-center justify-between ${
              method === 'biometric' ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10' : 'border-[var(--border-subtle)]'
            }`}
          >
            <div>
              <div className="font-semibold text-sm">Face ID / Touch ID</div>
              <div className="text-[11px] text-[var(--text-muted)]">Recommended for this device</div>
            </div>
            {method === 'biometric' && <IconCheck className="w-4 h-4 text-[var(--accent-primary)] font-bold" />}
          </button>

          <button
            data-testid="passkey-method-qr"
            onClick={() => setMethod('qr')}
            className={`w-full p-3.5 rounded-xl border text-left text-xs flex items-center justify-between ${
              method === 'qr' ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10' : 'border-[var(--border-subtle)]'
            }`}
          >
            <div>
              <div className="font-semibold text-sm">Scan QR Code</div>
              <div className="text-[11px] text-[var(--text-muted)]">Save passkey to another phone or tablet</div>
            </div>
            {method === 'qr' && <IconCheck className="w-4 h-4 text-[var(--accent-primary)] font-bold" />}
          </button>
        </div>
      </div>

      <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <button
          data-testid="confirm-passkey-setup-btn"
          disabled={isVerifying || complete}
          onClick={startVerification}
          className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold flex items-center justify-center gap-2"
        >
          {isVerifying ? 'Verifying with Face ID...' : complete ? 'Passkey Created!' : 'Continue'}
        </button>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #89: MobileAccountDetailsSetupSheet
   ========================================================================= */
export interface MobileAccountDetailsSetupSheetProps {
  onClose?: () => void;
  onSave?: () => void;
}

export const MobileAccountDetailsSetupSheet: React.FC<MobileAccountDetailsSetupSheetProps> = ({
  onClose,
  onSave,
}) => {
  const [firstName, setFirstName] = useState('Sam');
  const [lastName, setLastName] = useState('Lee');
  const [country, setCountry] = useState('United States');

  return (
    <div
      data-testid="account-details-setup-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-y-auto"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-base font-bold">Account Profile</h2>
        <button data-testid="close-account-details-btn" onClick={onClose} className="p-1">
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
          <div className="w-12 h-12 rounded-full bg-[var(--accent-primary)] text-white flex items-center justify-center font-bold text-sm">
            {firstName.slice(0, 1)}{lastName.slice(0, 1)}
          </div>
          <div>
            <div className="font-bold text-sm">{firstName} {lastName}</div>
            <div className="text-xs text-[var(--text-muted)]">samlee.mobbin01@quantmail.com</div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">First Name</label>
            <input
              data-testid="account-first-name-input"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">Last Name</label>
            <input
              data-testid="account-last-name-input"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">Country/Region</label>
            <select
              data-testid="account-country-select"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm"
            >
              <option value="United States">United States</option>
              <option value="United Kingdom">United Kingdom</option>
              <option value="India">India</option>
            </select>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <button
          data-testid="save-account-details-btn"
          onClick={onSave || onClose}
          className="w-full py-2.5 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #90: MobileMainSettingsHubView
   ========================================================================= */
export interface MobileMainSettingsHubViewProps {
  onClose?: () => void;
  onNavigate?: (screen: string) => void;
}

export const MobileMainSettingsHubView: React.FC<MobileMainSettingsHubViewProps> = ({
  onClose,
  onNavigate,
}) => {
  return (
    <div
      data-testid="main-settings-hub-view"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-y-auto"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-base font-bold">Settings</h2>
        <button data-testid="close-settings-hub-btn" onClick={onClose} className="p-1">
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* User Card */}
        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
          <div className="w-12 h-12 rounded-full bg-[var(--accent-primary)] text-white flex items-center justify-center font-bold text-base">
            SL
          </div>
          <div className="flex-1 truncate">
            <div className="font-bold text-sm">Sam Lee</div>
            <div className="text-xs text-[var(--text-muted)] truncate">samlee.mobbin01@quantmail.com</div>
          </div>
        </div>

        {/* Quick Settings */}
        <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
          Quick Settings
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
          {[
            { id: 'appearance', label: 'Display & Appearance', icon: IconSliders },
            { id: 'notifications', label: 'Notifications & Sounds', icon: IconBell },
            { id: 'storage', label: 'Storage Quotas & Cleanup', icon: IconCloud },
            { id: 'passkey', label: 'Face ID & Passkey Security', icon: IconLock },
          ].map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                data-testid={`settings-nav-${item.id}`}
                onClick={() => onNavigate?.(item.id)}
                className="w-full flex items-center justify-between p-3.5 text-left text-xs"
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span className="font-medium text-sm">{item.label}</span>
                </div>
                <IconChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #93: MobileStorageBreakdownSheet
   ========================================================================= */
export interface MobileStorageBreakdownSheetProps {
  onClose?: () => void;
  onUpgrade?: () => void;
}

export const MobileStorageBreakdownSheet: React.FC<MobileStorageBreakdownSheetProps> = ({
  onClose,
  onUpgrade,
}) => {
  return (
    <div
      data-testid="storage-breakdown-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-y-auto"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-base font-bold">Storage</h2>
        <button data-testid="close-storage-sheet-btn" onClick={onClose} className="p-1">
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Usage Bar Card */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-sm">4.8 GB of 15 GB Used</span>
            <span className="text-[var(--text-muted)]">32%</span>
          </div>
          <div className="h-3 w-full rounded-full bg-[var(--border-subtle)] overflow-hidden flex">
            <div className="h-full bg-blue-500 w-[18%]" title="QuantDrive" />
            <div className="h-full bg-emerald-500 w-[10%]" title="Email" />
            <div className="h-full bg-amber-500 w-[4%]" title="Trash" />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] text-[var(--text-muted)]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Drive: 2.7 GB</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Mail: 1.5 GB</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Trash: 0.6 GB</span>
            </div>
          </div>
        </div>

        {/* Clean Up Suggestions */}
        <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
          Clean Up Suggestions
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
          <div className="p-3.5 flex items-center justify-between text-xs">
            <div>
              <div className="font-semibold text-sm">Empty Deleted Items</div>
              <div className="text-[11px] text-[var(--text-muted)]">Free up 610 MB from Trash</div>
            </div>
            <button data-testid="empty-trash-btn" className="px-3 py-1 rounded-lg bg-red-500/10 text-red-500 text-xs font-semibold">
              Empty
            </button>
          </div>
          <div className="p-3.5 flex items-center justify-between text-xs">
            <div>
              <div className="font-semibold text-sm">Large Attachments</div>
              <div className="text-[11px] text-[var(--text-muted)]">Review 12 files larger than 10 MB</div>
            </div>
            <button data-testid="review-attachments-btn" className="px-3 py-1 rounded-lg border border-[var(--border-subtle)] text-xs font-medium">
              Review
            </button>
          </div>
        </div>

        {/* Upgrade Callout */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-blue-600/15 to-purple-600/15 border border-blue-500/30 flex items-center justify-between">
          <div>
            <div className="font-bold text-xs">Get more storage</div>
            <div className="text-[11px] text-[var(--text-muted)]">Upgrade to Quant Workspace for 100 GB</div>
          </div>
          <button
            data-testid="storage-upgrade-btn"
            onClick={onUpgrade}
            className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-primary)] text-white text-xs font-semibold"
          >
            Upgrade
          </button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #94: MobileSubscribeWorkspaceSheet
   ========================================================================= */
export interface MobileSubscribeWorkspaceSheetProps {
  onClose?: () => void;
  onSubscribe?: (plan: string) => void;
}

export const MobileSubscribeWorkspaceSheet: React.FC<MobileSubscribeWorkspaceSheetProps> = ({
  onClose,
  onSubscribe,
}) => {
  const [selectedPlan, setSelectedPlan] = useState<'basic' | 'personal' | 'family'>('basic');

  const plans = [
    { id: 'basic', name: 'Basic', price: '$1.99 / mo', desc: '100 GB cloud storage, Ad-free QuantMail for 1 person' },
    { id: 'personal', name: 'Personal', price: '$9.99 / mo', desc: '1 TB storage, Quant AI Copilot & premium apps for 1 person' },
    { id: 'family', name: 'Family', price: '$12.99 / mo', desc: '6 TB total storage (1 TB/person) for up to 6 people' },
  ];

  return (
    <div
      data-testid="subscribe-workspace-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-y-auto"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-base font-bold">Subscribe to Quant Workspace</h2>
        <button data-testid="close-subscribe-sheet-btn" onClick={onClose} className="p-1">
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        <div className="space-y-3">
          {plans.map(p => (
            <button
              key={p.id}
              data-testid={`plan-option-${p.id}`}
              onClick={() => setSelectedPlan(p.id as any)}
              className={`w-full p-4 rounded-xl border text-left text-xs transition-all ${
                selectedPlan === p.id
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 shadow-sm'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-card)]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm">Quant Workspace {p.name}</span>
                <span className="font-bold text-xs text-[var(--accent-primary)]">{p.price}</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{p.desc}</p>
            </button>
          ))}
        </div>

        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          By clicking 'Get Quant Workspace', you agree to recurring monthly payments. Cancel anytime in Apple Account settings before next billing date.
        </p>
      </div>

      <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <button
          data-testid="start-subscription-btn"
          onClick={() => {
            onSubscribe?.(selectedPlan);
            onClose?.();
          }}
          className="w-full py-3 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold shadow-sm"
        >
          Get Quant Workspace {selectedPlan.toUpperCase()}
        </button>
      </div>
    </div>
  );
};

/* =========================================================================
   Flows #96 & #97: MobileDensitySelectorSheet
   ========================================================================= */
export interface MobileDensitySelectorSheetProps {
  currentDensity?: 'roomy' | 'cozy' | 'compact';
  onSelectDensity?: (density: 'roomy' | 'cozy' | 'compact') => void;
  onClose?: () => void;
}

export const MobileDensitySelectorSheet: React.FC<MobileDensitySelectorSheetProps> = ({
  currentDensity = 'roomy',
  onSelectDensity,
  onClose,
}) => {
  const [density, setDensity] = useState<'roomy' | 'cozy' | 'compact'>(currentDensity);

  const handleSelect = (d: 'roomy' | 'cozy' | 'compact') => {
    setDensity(d);
    onSelectDensity?.(d);
  };

  return (
    <div
      data-testid="density-selector-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-y-auto"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-base font-bold">Mail Density</h2>
        <button data-testid="close-density-btn" onClick={onClose} className="p-1">
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
          Appearance Density
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
          <button
            data-testid="density-option-roomy"
            onClick={() => handleSelect('roomy')}
            className="w-full flex items-center justify-between p-3.5 text-left text-xs"
          >
            <div>
              <div className="font-semibold text-sm">Roomy</div>
              <div className="text-[11px] text-[var(--text-muted)]">Default multi-line preview with contact avatars</div>
            </div>
            {density === 'roomy' && <IconCheck className="w-4 h-4 text-[var(--accent-primary)] font-bold" />}
          </button>

          <button
            data-testid="density-option-cozy"
            onClick={() => handleSelect('cozy')}
            className="w-full flex items-center justify-between p-3.5 text-left text-xs"
          >
            <div>
              <div className="font-semibold text-sm">Cozy</div>
              <div className="text-[11px] text-[var(--text-muted)]">Balanced 2-line preview for swift skimming</div>
            </div>
            {density === 'cozy' && <IconCheck className="w-4 h-4 text-[var(--accent-primary)] font-bold" />}
          </button>

          <button
            data-testid="density-option-compact"
            onClick={() => handleSelect('compact')}
            className="w-full flex items-center justify-between p-3.5 text-left text-xs"
          >
            <div>
              <div className="font-semibold text-sm">Compact</div>
              <div className="text-[11px] text-[var(--text-muted)]">Tight single-line rows for maximum information density</div>
            </div>
            {density === 'compact' && <IconCheck className="w-4 h-4 text-[var(--accent-primary)] font-bold" />}
          </button>
        </div>

        {/* Live Preview Card */}
        <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-2">
          <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            Preview ({density})
          </div>
          <div
            data-testid="density-preview-card"
            className={`border border-[var(--border-subtle)] rounded-lg p-2.5 bg-[var(--bg-app)] ${
              density === 'compact' ? 'py-1 text-xs' : density === 'cozy' ? 'py-2 text-xs' : 'py-3 text-xs'
            }`}
          >
            <div className="flex items-center justify-between font-semibold">
              <span>Alex Smith</span>
              <span className="text-[10px] text-[var(--text-muted)]">8:16 PM</span>
            </div>
            <div className="font-medium text-[11px] truncate">Follow-Up on Work</div>
            {density !== 'compact' && (
              <div className="text-[10px] text-[var(--text-muted)] line-clamp-1">
                Hi Sam, I wanted to follow up regarding our recent work discussion...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #99: MobileTurnOffNotificationsSheet
   ========================================================================= */
export interface MobileTurnOffNotificationsSheetProps {
  onClose?: () => void;
}

export const MobileTurnOffNotificationsSheet: React.FC<MobileTurnOffNotificationsSheetProps> = ({
  onClose,
}) => {
  const [allowNotifications, setAllowNotifications] = useState(true);
  const [notifyFrom, setNotifyFrom] = useState<'focused' | 'all'>('focused');
  const [sound, setSound] = useState('Default');

  return (
    <div
      data-testid="turn-off-notifications-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-y-auto"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-base font-bold">Notifications & Sounds</h2>
        <button data-testid="close-notifications-sheet-btn" onClick={onClose} className="p-1">
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Master Toggle */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm">Allow Notifications</div>
            <div className="text-[11px] text-[var(--text-muted)]">Deliver push alerts for new emails & calendar invites</div>
          </div>
          <input
            data-testid="allow-notifications-toggle"
            type="checkbox"
            checked={allowNotifications}
            onChange={(e) => setAllowNotifications(e.target.checked)}
            className="rounded text-[var(--accent-primary)]"
          />
        </div>

        {allowNotifications && (
          <>
            <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Notification Scope
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
              <button
                data-testid="notify-scope-focused"
                onClick={() => setNotifyFrom('focused')}
                className="w-full flex items-center justify-between p-3.5 text-left text-xs"
              >
                <div>
                  <div className="font-semibold text-sm">Focused Inbox Only</div>
                  <div className="text-[11px] text-[var(--text-muted)]">Only receive notifications for high priority messages</div>
                </div>
                {notifyFrom === 'focused' && <IconCheck className="w-4 h-4 text-[var(--accent-primary)] font-bold" />}
              </button>

              <button
                data-testid="notify-scope-all"
                onClick={() => setNotifyFrom('all')}
                className="w-full flex items-center justify-between p-3.5 text-left text-xs"
              >
                <div>
                  <div className="font-semibold text-sm">All Accounts & Folders</div>
                  <div className="text-[11px] text-[var(--text-muted)]">Notify on all incoming mail</div>
                </div>
                {notifyFrom === 'all' && <IconCheck className="w-4 h-4 text-[var(--accent-primary)] font-bold" />}
              </button>
            </div>

            <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Sound Alerts
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 flex items-center justify-between text-xs">
              <span className="font-medium">Sound for New Email</span>
              <select
                data-testid="sound-selector"
                value={sound}
                onChange={(e) => setSound(e.target.value)}
                className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] text-xs"
              >
                <option value="Default">Default</option>
                <option value="Chime">Chime</option>
                <option value="None">None</option>
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #100: MobileQuickDraftsBannerSheet
   ========================================================================= */
export interface MobileQuickDraftsBannerSheetProps {
  onTurnOff?: () => void;
  onClose?: () => void;
}

export const MobileQuickDraftsBannerSheet: React.FC<MobileQuickDraftsBannerSheetProps> = ({
  onTurnOff,
  onClose,
}) => {
  return (
    <div
      data-testid="quick-drafts-banner-sheet"
      className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-lg space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">Quick access to drafts</h3>
        <button data-testid="close-quick-drafts-btn" onClick={onClose} className="p-1 text-[var(--text-muted)]">
          <IconClose className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
        When you close a draft, you can get back to it from here, or as usual, from your Drafts folder.
      </p>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          data-testid="turn-off-quick-drafts-btn"
          onClick={() => {
            onTurnOff?.();
            onClose?.();
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-500/10"
        >
          Turn Off
        </button>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #101: MobileOutOfOfficeTimeRangeSheet
   ========================================================================= */
export interface MobileOutOfOfficeTimeRangeSheetProps {
  onClose?: () => void;
  onSave?: () => void;
}

export const MobileOutOfOfficeTimeRangeSheet: React.FC<MobileOutOfOfficeTimeRangeSheetProps> = ({
  onClose,
  onSave,
}) => {
  const [enabled, setEnabled] = useState(true);
  const [blockCalendar, setBlockCalendar] = useState(true);

  return (
    <div
      data-testid="out-of-office-time-range-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-y-auto"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-base font-bold">Reply Within a Time Range</h2>
        <button data-testid="close-ooo-btn" onClick={onClose} className="p-1">
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm">Reply Within a Time Range</div>
            <div className="text-[11px] text-[var(--text-muted)]">Send automated responses only during selected dates</div>
          </div>
          <input
            data-testid="reply-time-range-toggle"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded text-[var(--accent-primary)]"
          />
        </div>

        {enabled && (
          <>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
              <div className="p-3.5 flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)] font-medium">Start Time</span>
                <span className="font-semibold">12:00 PM, Fri, 27 Feb</span>
              </div>
              <div className="p-3.5 flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)] font-medium">End Time</span>
                <span className="font-semibold">12:00 PM, Sat, 28 Feb</span>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 flex items-center justify-between">
              <div>
                <div className="font-semibold text-xs">Block My Calendar</div>
                <div className="text-[11px] text-[var(--text-muted)]">Creates an event for this period showing you as Out of Office</div>
              </div>
              <input
                data-testid="block-calendar-toggle"
                type="checkbox"
                checked={blockCalendar}
                onChange={(e) => setBlockCalendar(e.target.checked)}
                className="rounded text-[var(--accent-primary)]"
              />
            </div>
          </>
        )}
      </div>

      <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <button
          data-testid="save-ooo-btn"
          onClick={onSave || onClose}
          className="w-full py-2.5 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold"
        >
          Save
        </button>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #102: MobileContactEmailTypeSheet
   ========================================================================= */
export interface MobileContactEmailTypeSheetProps {
  currentType?: string;
  onSelect?: (type: string) => void;
  onClose?: () => void;
}

export const MobileContactEmailTypeSheet: React.FC<MobileContactEmailTypeSheetProps> = ({
  currentType = 'Work',
  onSelect,
  onClose,
}) => {
  const [selected, setSelected] = useState(currentType);
  const types = ['Work', 'Personal', 'Other'];

  return (
    <div
      data-testid="contact-email-type-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)]"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-base font-bold">Email type</h2>
        <button data-testid="close-email-type-btn" onClick={onClose} className="p-1">
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 flex-1">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)]">
          {types.map(t => (
            <button
              key={t}
              data-testid={`email-type-option-${t.toLowerCase()}`}
              onClick={() => {
                setSelected(t);
                onSelect?.(t);
                onClose?.();
              }}
              className="w-full flex items-center justify-between p-3.5 text-left text-xs"
            >
              <span className="font-semibold text-sm">{t}</span>
              {selected === t && <IconCheck className="w-4 h-4 text-[var(--accent-primary)] font-bold" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #103: MobileContactPhotoUploadSheet
   ========================================================================= */
export interface MobileContactPhotoUploadSheetProps {
  onClose?: () => void;
  onPhotoSelected?: (photoUrl: string) => void;
}

export const MobileContactPhotoUploadSheet: React.FC<MobileContactPhotoUploadSheetProps> = ({
  onClose,
  onPhotoSelected,
}) => {
  return (
    <div
      data-testid="contact-photo-upload-sheet"
      className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl space-y-3"
    >
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
        <h3 className="font-bold text-sm">Contact photo</h3>
        <button data-testid="close-photo-sheet-btn" onClick={onClose} className="p-1 text-[var(--text-muted)]">
          <IconClose className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1">
        <button
          data-testid="upload-photo-btn"
          onClick={() => {
            onPhotoSelected?.('/avatars/sample.jpg');
            onClose?.();
          }}
          className="w-full flex items-center gap-3 p-3 text-left text-xs font-semibold rounded-lg hover:bg-[var(--bg-app)]"
        >
          <IconImage className="w-4 h-4 text-[var(--accent-primary)]" />
          <span>Upload Photo</span>
        </button>

        <button
          data-testid="take-photo-btn"
          onClick={() => {
            onPhotoSelected?.('/avatars/camera.jpg');
            onClose?.();
          }}
          className="w-full flex items-center gap-3 p-3 text-left text-xs font-semibold rounded-lg hover:bg-[var(--bg-app)]"
        >
          <IconCamera className="w-4 h-4 text-[var(--accent-primary)]" />
          <span>Take a Photo</span>
        </button>

        <button
          data-testid="delete-photo-btn"
          onClick={() => {
            onPhotoSelected?.('');
            onClose?.();
          }}
          className="w-full flex items-center gap-3 p-3 text-left text-xs font-semibold rounded-lg text-red-500 hover:bg-red-500/10"
        >
          <IconTrash className="w-4 h-4" />
          <span>Delete Photo</span>
        </button>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #105: MobileComposerCameraSheet
   ========================================================================= */
export interface MobileComposerCameraSheetProps {
  onClose?: () => void;
  onAttachPhoto?: (photo: any) => void;
}

export const MobileComposerCameraSheet: React.FC<MobileComposerCameraSheetProps> = ({
  onClose,
  onAttachPhoto,
}) => {
  const [mode, setMode] = useState<'DOCUMENT' | 'PHOTO' | 'WHITEBOARD'>('PHOTO');
  const [captured, setCaptured] = useState(false);

  return (
    <div
      data-testid="composer-camera-sheet"
      className="flex flex-col h-full w-full bg-black text-white"
    >
      {/* Top Controls */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/60 z-10">
        <button data-testid="close-camera-btn" onClick={onClose} className="p-1">
          <IconClose className="w-6 h-6 text-white" />
        </button>
        <span className="text-xs font-semibold tracking-wider">{mode}</span>
        <div className="w-6" />
      </div>

      {/* Viewfinder Preview */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-neutral-900">
        {captured ? (
          <div data-testid="camera-captured-preview" className="relative w-full h-full flex items-center justify-center">
            <div className="w-64 h-80 rounded-xl bg-neutral-800 border-2 border-white/40 flex items-center justify-center p-4 text-center">
              <div>
                <IconCheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <div className="text-sm font-bold">Photo Captured</div>
                <div className="text-xs text-neutral-400 mt-1">Ready to review and attach</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-72 h-96 border border-white/30 rounded-2xl flex items-center justify-center text-xs text-neutral-400">
            Center document or photo inside frame
          </div>
        )}
      </div>

      {/* Bottom Mode Selector & Shutter */}
      <div className="p-6 bg-black flex flex-col items-center gap-4 z-10">
        <div className="flex items-center gap-6 text-xs font-semibold tracking-wider text-neutral-400">
          {(['DOCUMENT', 'PHOTO', 'WHITEBOARD'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={mode === m ? 'text-amber-400 font-bold' : ''}
            >
              {m}
            </button>
          ))}
        </div>

        {captured ? (
          <div className="flex items-center gap-4 w-full">
            <button
              data-testid="retake-camera-btn"
              onClick={() => setCaptured(false)}
              className="flex-1 py-3 rounded-xl bg-neutral-800 text-xs font-semibold"
            >
              Retake
            </button>
            <button
              data-testid="finish-attach-camera-btn"
              onClick={() => {
                onAttachPhoto?.({ name: 'Real_Estate_Photo.jpg', size: '1.2 MB' });
                onClose?.();
              }}
              className="flex-1 py-3 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold"
            >
              Finish & Attach
            </button>
          </div>
        ) : (
          <button
            data-testid="shutter-btn"
            onClick={() => setCaptured(true)}
            className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center hover:scale-95 transition-transform"
          >
            <div className="w-12 h-12 rounded-full bg-white" />
          </button>
        )}
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #108: MobileComposerGallerySheet
   ========================================================================= */
export interface MobileComposerGallerySheetProps {
  onClose?: () => void;
  onAttachImages?: (images: string[]) => void;
}

export const MobileComposerGallerySheet: React.FC<MobileComposerGallerySheetProps> = ({
  onClose,
  onAttachImages,
}) => {
  const [selected, setSelected] = useState<number[]>([1, 2]);
  const [showCompressionPrompt, setShowCompressionPrompt] = useState(false);

  const toggleSelect = (id: number) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div
      data-testid="composer-gallery-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-y-auto"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-base font-bold">Real Estate ({selected.length} Photos)</h2>
        <button data-testid="close-gallery-btn" onClick={onClose} className="p-1">
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 flex-1">
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(id => (
            <div
              key={id}
              data-testid={`gallery-thumb-${id}`}
              onClick={() => toggleSelect(id)}
              className={`relative aspect-square rounded-xl border-2 overflow-hidden cursor-pointer flex items-center justify-center bg-[var(--bg-card)] ${
                selected.includes(id) ? 'border-[var(--accent-primary)]' : 'border-[var(--border-subtle)]'
              }`}
            >
              <div className="text-xs font-semibold text-[var(--text-muted)]">Photo #{id}</div>
              {selected.includes(id) && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[var(--accent-primary)] text-white flex items-center justify-center font-bold text-xs shadow-sm">
                  ✓
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <button
          data-testid="add-gallery-photos-btn"
          onClick={() => setShowCompressionPrompt(true)}
          className="w-full py-2.5 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold"
        >
          Attach {selected.length} Selected
        </button>
      </div>

      {/* Compression Prompt Modal */}
      {showCompressionPrompt && (
        <div
          data-testid="image-compression-modal"
          className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
        >
          <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-5 max-w-xs w-full text-center shadow-xl space-y-3">
            <h3 className="font-bold text-sm">Reduce size of images on this message?</h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Reducing image size conserves data and helps the recipient download attachments faster.
            </p>
            <div className="space-y-2 pt-2">
              <button
                data-testid="reduce-image-size-btn"
                onClick={() => {
                  setShowCompressionPrompt(false);
                  onAttachImages?.(selected.map(s => `Photo_${s}.jpg`));
                  onClose?.();
                }}
                className="w-full py-2.5 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold"
              >
                Reduce image size
              </button>
              <button
                data-testid="keep-original-size-btn"
                onClick={() => {
                  setShowCompressionPrompt(false);
                  onAttachImages?.(selected.map(s => `Photo_${s}_original.jpg`));
                  onClose?.();
                }}
                className="w-full py-2.5 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold"
              >
                Keep original size
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* =========================================================================
   Flow #109: MobileAttachmentFilePreviewModal
   ========================================================================= */
export interface MobileAttachmentFilePreviewModalProps {
  fileName?: string;
  fileSize?: string;
  onClose?: () => void;
  onSaveToQuantDrive?: () => void;
}

export const MobileAttachmentFilePreviewModal: React.FC<MobileAttachmentFilePreviewModalProps> = ({
  fileName = 'Q1 Performance Report.pdf',
  fileSize = '2 KB',
  onClose,
  onSaveToQuantDrive,
}) => {
  return (
    <div
      data-testid="file-preview-modal"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)]"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2 truncate pr-2">
          <IconFileText className="w-5 h-5 text-red-500 shrink-0" />
          <h2 className="text-sm font-bold truncate">{fileName}</h2>
        </div>
        <button data-testid="close-file-preview-btn" onClick={onClose} className="p-1">
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 flex-1 flex flex-col items-center justify-center overflow-y-auto">
        <div className="w-full max-w-xs p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-sm space-y-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
            <IconFileText className="w-7 h-7" />
          </div>
          <div>
            <div className="font-bold text-sm">{fileName}</div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">PDF Document • {fileSize}</div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] text-left text-[11px] text-[var(--text-muted)] leading-relaxed">
            Preview: Q1 performance milestones, enterprise ARR revenue charts, customer satisfaction metrics (CSAT 98%).
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-card)] grid grid-cols-2 gap-2">
        <button
          data-testid="save-file-preview-to-quantdrive-btn"
          onClick={onSaveToQuantDrive}
          className="py-2.5 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold flex items-center justify-center gap-1.5"
        >
          <IconCloud className="w-4 h-4" />
          <span>Save to QuantDrive</span>
        </button>
        <button
          data-testid="share-file-preview-btn"
          onClick={onClose}
          className="py-2.5 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold flex items-center justify-center gap-1.5"
        >
          <IconShare className="w-4 h-4" />
          <span>Share</span>
        </button>
      </div>
    </div>
  );
};

/* =========================================================================
   Flow #110: MobileWidgetsPreviewSheet
   ========================================================================= */
export interface MobileWidgetsPreviewSheetProps {
  onClose?: () => void;
}

export const MobileWidgetsPreviewSheet: React.FC<MobileWidgetsPreviewSheetProps> = ({
  onClose,
}) => {
  return (
    <div
      data-testid="widgets-preview-sheet"
      className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-y-auto"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-base font-bold">Widgets Gallery</h2>
        <button data-testid="close-widgets-btn" onClick={onClose} className="p-1">
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        <p className="text-xs text-[var(--text-muted)]">
          Add QuantMail widgets to your iOS Home Screen or Lock Screen for quick glanceable access.
        </p>

        {/* Widget 1: Agenda */}
        <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold">Next Event Widget</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] font-semibold">
              Medium
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-xs">
            <div className="flex items-center justify-between font-bold text-sm mb-1">
              <span>Friday, 27 Feb</span>
              <span className="text-xs text-[var(--accent-primary)]">Now</span>
            </div>
            <div className="font-semibold text-xs">Project Fortuna: Kick-off Meeting</div>
            <div className="text-[11px] text-[var(--text-muted)]">11:00 AM • 1 hr • Quanty Meet</div>
          </div>
        </div>

        {/* Widget 2: Unread Counter & Quick Compose */}
        <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold">Mail Glance Widget</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 font-semibold">
              Small
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] flex items-center justify-between text-xs">
            <div>
              <div className="text-2xl font-black text-[var(--accent-primary)]">3</div>
              <div className="text-[11px] text-[var(--text-muted)] font-medium">Unread in Focused</div>
            </div>
            <div className="w-9 h-9 rounded-full bg-[var(--accent-primary)] text-white flex items-center justify-center font-bold text-xs shadow-sm">
              +
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
