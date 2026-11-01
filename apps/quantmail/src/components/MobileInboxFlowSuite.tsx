'use client';

/**
 * MobileInboxFlowSuite — Mobile-first (390×844) Inbox, Filter Dropdown Sheet,
 * Left Account/Folder Drawer + Add Account Action Sheet, Send Availability
 * Time-Slot Picker, and Photo Attachment Filter/Text Studio.
 * Supports both White (Light Mode) and Black (Dark Mode) 1:1.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  MobileDeletedFolderView,
  MobileEmailDetailView,
  MobileFolderEditSheet,
} from './MobileFolderAndEmailActionsSuite';
import { MobileCalendarFlowSuite } from './MobileCalendarFlowSuite';
import {
  MobileComposerSheet,
  MobileQuickDraftsStack,
  MobileDraftsFolderView,
  MobileSentFolderView,
  MobilePrintEmailSheet,
  MobileReportConcernSheet,
  MobileReportPhishingDialog,
  DraftEmailItem,
} from './MobileComposerAndDraftsSuite';
import {
  MobileContactsHubView,
  MobileContactDetailView,
  MobileCreateContactSheet,
  MobileProfileIconCustomizerSheet,
  MobileAutomaticRepliesSheet,
  MobileContactRecord,
  INITIAL_BATCH7_CONTACTS,
} from './MobileContactsAndTasksSuite';
import {
  MobileFilesHubView,
  MobileSearchAndFilterSuite,
  MobileHelpAndFeedbackSheet,
  MobileGivingFeedbackSheet,
  MobileWelcomeLoginView,
  MobileQrScannerSheet,
  MobilePhotoDrawingStudio,
  MobileNotificationsFeedSheet,
} from './MobileBatch8Suite';

export type MobileInboxFilterKey =
  | 'all'
  | 'unread'
  | 'flagged'
  | 'pinned'
  | 'categorised'
  | 'to_me'
  | 'has_files'
  | 'mentions_me';

export type MobileInboxSubScreen =
  | 'inbox'
  | 'empty_inbox'
  | 'drawer_add_account'
  | 'add_account_form'
  | 'send_availability'
  | 'photo_filter_studio'
  | 'folder_edit'
  | 'deleted_folder'
  | 'email_detail'
  | 'calendar'
  | 'composer'
  | 'quick_drafts'
  | 'drafts_folder'
  | 'sent_folder'
  | 'print_email'
  | 'report_concern'
  | 'report_phishing'
  | 'contacts_hub'
  | 'contact_detail'
  | 'create_contact'
  | 'auto_replies'
    | 'auto_replies'
  | 'profile_icon'
  | 'files_hub'
  | 'search_results'
  | 'help_feedback'
  | 'give_feedback'
  | 'welcome_login'
  | 'qr_scanner'
  | 'photo_drawing'
  | 'notifications_feed';

export type PhotoFilterPreset = 'none' | 'process' | 'sepia' | 'chrome' | 'mono';

export interface MobileInboxEmailItem {
  id: string;
  sender: string;
  avatarText: string;
  avatarBg: string;
  dateLabel: string;
  subject: string;
  preview: string;
  unread?: boolean;
  flagged?: boolean;
  pinned?: boolean;
  categorised?: string;
  toMe?: boolean;
  hasFiles?: boolean;
  mentionsMe?: boolean;
  tab: 'focused' | 'other';
}

export const INITIAL_MOBILE_EMAILS: readonly MobileInboxEmailItem[] = [
  {
    id: 'm-1',
    sender: 'Faire',
    avatarText: 'F',
    avatarBg: '#EC4899',
    dateLabel: '17/11/25',
    subject: 'You have $5000 to use with 60-day p...',
    preview: 'Grow your business with flexible payment terms.',
    unread: false,
    flagged: true,
    pinned: true,
    categorised: 'VIP Partner',
    toMe: true,
    hasFiles: false,
    mentionsMe: false,
    tab: 'focused',
  },
  {
    id: 'm-2',
    sender: 'Rotten Tomatoes',
    avatarText: 'RT',
    avatarBg: '#9A5B4A',
    dateLabel: '10/9/25',
    subject: '🍅 This Week On RT',
    preview: 'Top scores, trending takes, and what’s Fresh (or Rotten) this week on Rotten Tomatoes....',
    unread: true,
    flagged: true,
    pinned: false,
    categorised: 'Newsletter',
    toMe: true,
    hasFiles: true,
    mentionsMe: true,
    tab: 'focused',
  },
  {
    id: 'm-3',
    sender: 'QuantTrinity Cloud',
    avatarText: 'M',
    avatarBg: '#22C55E',
    dateLabel: '4/9/25',
    subject: 'Updates to our terms of use',
    preview: 'Hello, You’re receiving this email because we are updating the QuantWorkplace Services Agree...',
    unread: false,
    flagged: true,
    pinned: false,
    toMe: true,
    hasFiles: true,
    mentionsMe: false,
    tab: 'focused',
  },
  {
    id: 'm-4',
    sender: 'TheFork',
    avatarText: 'T',
    avatarBg: '#A18A00',
    dateLabel: '23/12/25',
    subject: 'Booking canceled: La Vittoria Ciro e Carmin...',
    preview: 'Learn about what happens next',
    unread: false,
    flagged: false,
    pinned: true,
    toMe: true,
    hasFiles: false,
    mentionsMe: false,
    tab: 'focused',
  },
  {
    id: 'm-5',
    sender: 'Booking.com',
    avatarText: 'B',
    avatarBg: '#92400E',
    dateLabel: '16/12/25',
    subject: 'Welcome to Booking.com!',
    preview: 'Welcome to Booking.com! There’s a lot of the world out there to explore—and your next...',
    unread: false,
    flagged: false,
    pinned: false,
    toMe: false,
    hasFiles: false,
    mentionsMe: false,
    tab: 'focused',
  },
];

export const FILTER_OPTIONS: ReadonlyArray<{
  key: Exclude<MobileInboxFilterKey, 'all'>;
  label: string;
}> = [
  { key: 'unread', label: 'Unread' },
  { key: 'flagged', label: 'Flagged' },
  { key: 'pinned', label: 'Pinned' },
  { key: 'categorised', label: 'Categorised' },
  { key: 'to_me', label: 'To Me' },
  { key: 'has_files', label: 'Has Files' },
  { key: 'mentions_me', label: 'Mentions Me' },
];

export const PHOTO_FILTER_PRESETS: ReadonlyArray<{
  id: PhotoFilterPreset;
  label: string;
  cssFilter: string;
}> = [
  { id: 'none', label: 'None', cssFilter: 'none' },
  { id: 'process', label: 'Process', cssFilter: 'hue-rotate(155deg) saturate(1.45) contrast(1.08)' },
  { id: 'sepia', label: 'Sepia', cssFilter: 'sepia(0.88) contrast(1.08) brightness(0.95)' },
  { id: 'chrome', label: 'Chrome', cssFilter: 'contrast(1.28) saturate(1.2)' },
  { id: 'mono', label: 'Mono', cssFilter: 'grayscale(1) contrast(1.15)' },
];

export interface AvailabilitySlotItem {
  id: string;
  label: string;
  hourLabel: string;
}

export const AVAILABLE_TIME_SLOTS: readonly AvailabilitySlotItem[] = [
  { id: 'slot-1430', label: '2:30 PM - 3:00 PM', hourLabel: '2 PM' },
  { id: 'slot-1530', label: '3:30 PM - 4:00 PM', hourLabel: '3 PM' },
  { id: 'slot-1630', label: '4:30 PM - 5:00 PM', hourLabel: '4 PM' },
];

function FilterOptionIcon({ filterKey }: { filterKey: Exclude<MobileInboxFilterKey, 'all'> }) {
  switch (filterKey) {
    case 'unread':
      return (
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      );
    case 'flagged':
      return (
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" x2="4" y1="22" y2="15" />
        </svg>
      );
    case 'pinned':
      return (
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <line x1="12" x2="12" y1="17" y2="22" />
          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
        </svg>
      );
    case 'categorised':
      return (
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
          <path d="M7 7h.01" />
        </svg>
      );
    case 'to_me':
      return (
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case 'has_files':
      return (
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      );
    case 'mentions_me':
      return (
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="4" />
          <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
        </svg>
      );
  }
}

export function MobileInboxFlowSuite() {
  const [subScreen, setSubScreen] = useState<MobileInboxSubScreen>('inbox');
  const [activeTab, setActiveTab] = useState<'focused' | 'other'>('focused');
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<MobileInboxFilterKey>('all');

  // Flow #22, #20, #23, #29, #44: Contacts & Batch 7 State
  const [contacts, setContacts] = useState<MobileContactRecord[]>(INITIAL_BATCH7_CONTACTS);
  const [selectedContact, setSelectedContact] = useState<MobileContactRecord>(INITIAL_BATCH7_CONTACTS[0]);
  const [contactDeletedToast, setContactDeletedToast] = useState(false);
  const [userProfileIcon, setUserProfileIcon] = useState('SL');

  // Flow #11: Add another account state
  const [showAddAccountActionSheet, setShowAddAccountActionSheet] = useState(true);
  const [addAccountEmail, setAddAccountEmail] = useState('');

  // Flow #12: Send Availability state
  const [selectedDayNum, setSelectedDayNum] = useState<number>(27);
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>(['slot-1430', 'slot-1530']);

  // Flows #5, #8, #29: Photo Filter, Text & Crop Studio state
  const [photoFilter, setPhotoFilter] = useState<PhotoFilterPreset>('none');
  const [showFilterStrip, setShowFilterStrip] = useState<boolean>(true);
  const [photoOverlayText, setPhotoOverlayText] = useState<string>('');
  const [editingPhotoText, setEditingPhotoText] = useState<boolean>(false);
  const [isCroppingPhoto, setIsCroppingPhoto] = useState<boolean>(false);

  // Flow #32: Deleted email toast banner state in Inbox
  const [inboxDeletedToast, setInboxDeletedToast] = useState<boolean>(false);
  const [inboxSentToast, setInboxSentToast] = useState<boolean>(false);
  const [inboxReportedToast, setInboxReportedToast] = useState<boolean>(false);
  const [selectedDraftForEdit, setSelectedDraftForEdit] = useState<DraftEmailItem | null>(null);
  const [isReplyMode, setIsReplyMode] = useState<boolean>(false);

  const filteredEmails = useMemo(() => {
    return INITIAL_MOBILE_EMAILS.filter((item) => {
      if (item.tab !== activeTab) return false;
      switch (activeFilter) {
        case 'unread':
          return Boolean(item.unread);
        case 'flagged':
          return Boolean(item.flagged);
        case 'pinned':
          return Boolean(item.pinned);
        case 'categorised':
          return Boolean(item.categorised);
        case 'to_me':
          return Boolean(item.toMe);
        case 'has_files':
          return Boolean(item.hasFiles);
        case 'mentions_me':
          return Boolean(item.mentionsMe);
        default:
          return true;
      }
    });
  }, [activeTab, activeFilter]);

  const activeFilterLabel = useMemo(() => {
    if (activeFilter === 'all') return 'Filter';
    return FILTER_OPTIONS.find((f) => f.key === activeFilter)?.label ?? 'Filter';
  }, [activeFilter]);

  // ─── BATCH 4 SUB-SCREENS: Folder Edit, Deleted Folder, Email Detail ────────
  if (subScreen === 'folder_edit') {
    return <MobileFolderEditSheet onClose={() => setSubScreen('inbox')} />;
  }

  if (subScreen === 'deleted_folder') {
    return <MobileDeletedFolderView onGoToInbox={() => setSubScreen('inbox')} />;
  }

  if (subScreen === 'email_detail') {
    return (
      <MobileEmailDetailView
        onBack={() => setSubScreen('inbox')}
        onDeleteEmail={() => {
          setInboxDeletedToast(true);
          setSubScreen('inbox');
        }}
        onOpenReply={() => {
          setIsReplyMode(true);
          setSubScreen('composer');
        }}
        onOpenPrint={() => setSubScreen('print_email')}
        onOpenReport={() => setSubScreen('report_concern')}
        onOpenPhishing={() => setSubScreen('report_phishing')}
      />
    );
  }

  // ─── BATCH 6 SUB-SCREENS: Composer, Quick Drafts, Drafts, Sent, Print, Report ──
  if (subScreen === 'composer') {
    return (
      <MobileComposerSheet
        isOpen={true}
        onClose={() => {
          setIsReplyMode(false);
          setSelectedDraftForEdit(null);
          setSubScreen('inbox');
        }}
        isReply={isReplyMode}
        initialTo={selectedDraftForEdit?.recipient || ''}
        initialSubject={selectedDraftForEdit?.subject || ''}
        initialBody={selectedDraftForEdit?.preview || ''}
        onSendSuccess={() => {
          setIsReplyMode(false);
          setSelectedDraftForEdit(null);
          setInboxSentToast(true);
          setTimeout(() => setInboxSentToast(false), 3000);
          setSubScreen('inbox');
        }}
      />
    );
  }

  // ─── BATCH 8 SUB-SCREENS: Files, Search, Help, Login, Drawing, Notifications ──
  if (subScreen === 'files_hub') {
    return <MobileFilesHubView onBack={() => setSubScreen('inbox')} />;
  }

  if (subScreen === 'search_results') {
    return <MobileSearchAndFilterSuite onBack={() => setSubScreen('inbox')} />;
  }

  if (subScreen === 'help_feedback') {
    return (
      <MobileHelpAndFeedbackSheet
        isOpen={true}
        onClose={() => setSubScreen('inbox')}
        onOpenGiveFeedback={() => setSubScreen('give_feedback')}
      />
    );
  }

  if (subScreen === 'give_feedback') {
    return (
      <MobileGivingFeedbackSheet
        isOpen={true}
        onClose={() => setSubScreen('inbox')}
      />
    );
  }

  if (subScreen === 'welcome_login') {
    return (
      <MobileWelcomeLoginView
        onLoginSuccess={() => setSubScreen('inbox')}
        onOpenQrScanner={() => setSubScreen('qr_scanner')}
      />
    );
  }

  if (subScreen === 'qr_scanner') {
    return (
      <MobileQrScannerSheet
        isOpen={true}
        onClose={() => setSubScreen('welcome_login')}
        onScanSuccess={() => setSubScreen('inbox')}
      />
    );
  }

  if (subScreen === 'photo_drawing') {
    return (
      <MobilePhotoDrawingStudio
        onDone={() => setSubScreen('inbox')}
        onCancel={() => setSubScreen('inbox')}
      />
    );
  }

  if (subScreen === 'notifications_feed') {
    return (
      <MobileNotificationsFeedSheet
        isOpen={true}
        onClose={() => setSubScreen('inbox')}
      />
    );
  }

  if (subScreen === 'quick_drafts') {
    return (
      <MobileQuickDraftsStack
        isOpen={true}
        onClose={() => setSubScreen('inbox')}
        onSelectDraft={(draft) => {
          setSelectedDraftForEdit(draft);
          setIsReplyMode(false);
          setSubScreen('composer');
        }}
        onTurnOff={() => setSubScreen('inbox')}
      />
    );
  }

  if (subScreen === 'drafts_folder') {
    return (
      <MobileDraftsFolderView
        onBack={() => setSubScreen('inbox')}
        onGoToInbox={() => setSubScreen('inbox')}
        onOpenDraft={(draft) => {
          setSelectedDraftForEdit(draft);
          setIsReplyMode(false);
          setSubScreen('composer');
        }}
      />
    );
  }

  if (subScreen === 'sent_folder') {
    return (
      <MobileSentFolderView
        onBack={() => setSubScreen('inbox')}
        onGoToInbox={() => setSubScreen('inbox')}
      />
    );
  }

  if (subScreen === 'print_email') {
    return (
      <MobilePrintEmailSheet
        isOpen={true}
        onClose={() => setSubScreen('email_detail')}
      />
    );
  }

  if (subScreen === 'report_concern') {
    return (
      <MobileReportConcernSheet
        isOpen={true}
        onClose={() => setSubScreen('email_detail')}
        onSubmitReport={() => {
          setInboxReportedToast(true);
          setTimeout(() => setInboxReportedToast(false), 3000);
          setSubScreen('inbox');
        }}
      />
    );
  }

  if (subScreen === 'report_phishing') {
    return (
      <MobileReportPhishingDialog
        isOpen={true}
        onClose={() => setSubScreen('email_detail')}
        onConfirm={() => {
          setInboxReportedToast(true);
          setTimeout(() => setInboxReportedToast(false), 3000);
          setSubScreen('inbox');
        }}
      />
    );
  }

  // ─── BATCH 7 SUB-SCREENS: Contacts, Profile Icon, Automatic Replies ───
  if (subScreen === 'contacts_hub') {
    return (
      <div className="relative h-full">
        <MobileContactsHubView
          onBack={() => setSubScreen('inbox')}
          onOpenContact={(ct) => {
            setSelectedContact(ct);
            setSubScreen('contact_detail');
          }}
          onNewContact={() => setSubScreen('create_contact')}
        />
        {contactDeletedToast && (
          <div
            data-testid="contact-deleted-toast"
            className="fixed bottom-6 left-4 right-4 z-50 rounded-xl bg-[#252525] px-4 py-3 text-center text-sm font-medium text-white shadow-xl animate-fade-in"
          >
            Contact Deleted
          </div>
        )}
      </div>
    );
  }

  if (subScreen === 'contact_detail') {
    return (
      <MobileContactDetailView
        contact={selectedContact}
        onBack={() => setSubScreen('contacts_hub')}
        onEdit={() => setSubScreen('create_contact')}
        onDelete={() => {
          setContacts(contacts.filter((c) => c.id !== selectedContact.id));
          setContactDeletedToast(true);
          setTimeout(() => setContactDeletedToast(false), 3000);
          setSubScreen('contacts_hub');
        }}
        onToggleFavorite={() => {
          const updated = { ...selectedContact, favorite: !selectedContact.favorite };
          setSelectedContact(updated);
          setContacts(contacts.map((c) => (c.id === updated.id ? updated : c)));
        }}
      />
    );
  }

  if (subScreen === 'create_contact') {
    return (
      <MobileCreateContactSheet
        isOpen={true}
        onClose={() => setSubScreen('contacts_hub')}
        onSave={(newCt) => {
          setContacts([newCt, ...contacts]);
          setSelectedContact(newCt);
          setSubScreen('contact_detail');
        }}
      />
    );
  }

  if (subScreen === 'auto_replies') {
    return (
      <MobileAutomaticRepliesSheet
        isOpen={true}
        onClose={() => setSubScreen('inbox')}
        onSave={() => {
          setSubScreen('inbox');
        }}
      />
    );
  }

  if (subScreen === 'profile_icon') {
    return (
      <MobileProfileIconCustomizerSheet
        isOpen={true}
        onClose={() => setSubScreen('inbox')}
        onSelectIcon={(icon) => {
          setUserProfileIcon(icon);
          setSubScreen('inbox');
        }}
      />
    );
  }

  // ─── BATCH 5 SUB-SCREEN: Mobile Calendar Suite (Flows #15, #95, #18, #26, #77, #80, #43, #36, #16, #42, #91, #104) ──
  if (subScreen === 'calendar') {
    return <MobileCalendarFlowSuite onBackToEmail={() => setSubScreen('inbox')} />;
  }

  // ─── FLOW #5, #8, #29: Photo Attachment Filter, Text & Crop Studio ─────────
  if (subScreen === 'photo_filter_studio') {
    if (isCroppingPhoto) {
      return (
        <div
          data-testid="mobile-photo-crop-studio"
          className="fixed inset-0 z-50 flex flex-col justify-between bg-black px-5 py-8 text-white select-none"
        >
          <div className="h-4" />

          {/* Crop Bounding Box with 4 corner dots + 4 mid-edge pills (Flow #29 Screen 2) */}
          <div className="relative mx-auto flex h-[430px] w-full max-w-[335px] items-center justify-center border-[1.5px] border-white">
            {/* 4 Corner Handles */}
            <span className="absolute -left-1.5 -top-1.5 size-3 rounded-full bg-white" />
            <span className="absolute -right-1.5 -top-1.5 size-3 rounded-full bg-white" />
            <span className="absolute -bottom-1.5 -left-1.5 size-3 rounded-full bg-white" />
            <span className="absolute -bottom-1.5 -right-1.5 size-3 rounded-full bg-white" />
            {/* 4 Edge Pill Handles */}
            <span className="absolute -top-1 left-1/2 h-1.5 w-6 -translate-x-1/2 rounded-full bg-white" />
            <span className="absolute -bottom-1 left-1/2 h-1.5 w-6 -translate-x-1/2 rounded-full bg-white" />
            <span className="absolute -left-1 top-1/2 h-6 w-1.5 -translate-y-1/2 rounded-full bg-white" />
            <span className="absolute -right-1 top-1/2 h-6 w-1.5 -translate-y-1/2 rounded-full bg-white" />

            {/* Right Floating Rotate & Aspect Ratio Pill */}
            <div className="absolute -right-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-4 rounded-2xl bg-[#27272A]/95 px-3 py-3.5 text-white shadow-xl">
              <button
                type="button"
                aria-label="Rotate photo"
                className="grid size-8 place-items-center text-sm"
              >
                🔄
              </button>
              <button
                type="button"
                aria-label="Crop aspect ratio"
                className="grid size-8 place-items-center text-sm"
              >
                ⊡
              </button>
            </div>
          </div>

          {/* Bottom Thumbnail Strip + ✕ Cancel / ✓ Apply */}
          <div className="space-y-5">
            <div className="flex items-center justify-center gap-3">
              <div className="h-16 w-12 rounded-lg border-2 border-[#0078D4] bg-zinc-950" />
              <div className="grid h-16 w-12 place-items-center rounded-lg border border-dashed border-zinc-400 text-sm">
                📷
              </div>
            </div>

            <div className="flex items-center justify-between px-2">
              <button
                type="button"
                aria-label="Cancel crop"
                onClick={() => setIsCroppingPhoto(false)}
                className="inline-flex size-11 items-center justify-center text-xl text-white"
              >
                ✕
              </button>
              <button
                type="button"
                data-testid="photo-crop-apply-btn"
                aria-label="Apply crop"
                onClick={() => setIsCroppingPhoto(false)}
                className="inline-flex size-11 items-center justify-center rounded-xl bg-[#0078D4] text-lg font-bold text-white shadow-lg"
              >
                ✓
              </button>
            </div>
          </div>
        </div>
      );
    }

    const activePreset =
      PHOTO_FILTER_PRESETS.find((p) => p.id === photoFilter) ?? PHOTO_FILTER_PRESETS[0]!;
    return (
      <div
        data-testid="mobile-photo-filter-studio"
        className="fixed inset-0 z-50 flex flex-col justify-between bg-black text-white select-none"
      >
        {/* Top Back Button */}
        <div className="flex items-center justify-between px-4 pt-4">
          <button
            type="button"
            aria-label="Back from photo studio"
            onClick={() => setSubScreen('inbox')}
            className="inline-flex size-10 items-center justify-center rounded-full text-white hover:bg-white/10"
          >
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <div className="flex gap-2">
            { PHOTO_FILTER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                data-testid={`quick-filter-${preset.id}`}
                onClick={() => setPhotoFilter(preset.id)}
                className="sr-only"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Center Portrait Canvas + Floating Vertical Tool Pill */}
        <div className="relative mx-auto flex w-full max-w-[360px] flex-1 items-center justify-center px-3">
          <div
            data-testid="photo-studio-canvas"
            style={{ filter: activePreset.cssFilter }}
            className="relative aspect-square w-full overflow-hidden rounded-sm bg-[#78756e] shadow-2xl transition-all"
          >
            {/* Stylized high-contrast portrait silhouette matching Reference Flow #5 */}
            <svg viewBox="0 0 300 300" className="h-full w-full">
              <rect width="300" height="300" fill="#7c7970" />
              <ellipse cx="150" cy="145" rx="74" ry="92" fill="#18181b" />
              <ellipse cx="150" cy="138" rx="46" ry="58" fill="#d6b89e" />
              <path d="M104 115 C115 70, 185 70, 196 115 C205 160, 200 220, 190 245 L110 245 C100 220, 95 160, 104 115 Z" fill="#18181b" opacity="0.22" />
              {/* Eyes, brows, smile */}
              <path d="M124 122 Q134 117 142 121" stroke="#27272a" strokeWidth="3" fill="none" />
              <path d="M158 121 Q166 117 176 122" stroke="#27272a" strokeWidth="3" fill="none" />
              <circle cx="133" cy="129" r="3.5" fill="#18181b" />
              <circle cx="167" cy="129" r="3.5" fill="#18181b" />
              <path d="M136 160 Q150 168 165 159" stroke="#9a5b52" strokeWidth="3.5" fill="none" strokeLinecap="round" />
              <path d="M70 300 C78 230, 222 230, 230 300 Z" fill="#0c0d0e" />
            </svg>

            {photoOverlayText && (
              <div
                data-testid="photo-overlay-text-badge"
                className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-lg bg-black/65 px-3 py-2 text-center text-lg font-bold text-white"
              >
                {photoOverlayText}
              </div>
            )}
          </div>

          {/* Right Floating Tool Pill: Crop | Draw | Text A | Expand */}
          <div className="absolute right-5 top-1/2 flex -translate-y-1/2 flex-col items-center gap-4 rounded-2xl bg-[#27272A]/90 px-2.5 py-3.5 text-white shadow-xl backdrop-blur-md">
            <button
              type="button"
              data-testid="photo-tool-crop-btn"
              aria-label="Crop photo"
              onClick={() => setIsCroppingPhoto(true)}
              className="grid size-8 place-items-center rounded-lg hover:bg-white/10"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2v14a2 2 0 0 0 2 2h14" />
                <path d="M18 22V8a2 2 0 0 0-2-2H2" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Draw on photo"
              className="grid size-8 place-items-center rounded-lg hover:bg-white/10"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7c3-2 6-2 9 0s6 2 9 0" />
                <path d="M5 13c3-2 6-2 9 0s6 2 9 0" />
                <path d="M7 19c3-2 5-2 8 0" />
              </svg>
            </button>
            <button
              type="button"
              data-testid="photo-tool-text-btn"
              aria-label="Add text to photo"
              onClick={() => setEditingPhotoText((prev) => !prev)}
              className="grid size-8 place-items-center rounded-lg text-base font-serif font-bold hover:bg-white/10"
            >
              A
            </button>
            <button
              type="button"
              aria-label="More photo tools"
              className="grid size-8 place-items-center rounded-lg hover:bg-white/10"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Optional Text Input Bar (Flow #8 — Adding a text) */}
        {editingPhotoText && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-zinc-900 px-3 py-2">
            <input
              type="text"
              data-testid="photo-text-input"
              value={photoOverlayText}
              onChange={(e) => setPhotoOverlayText(e.target.value)}
              placeholder="Type caption text…"
              className="flex-1 bg-transparent text-sm text-white placeholder-zinc-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setEditingPhotoText(false)}
              className="rounded-lg bg-[#0078D4] px-3 py-1 text-xs font-semibold text-white"
            >
              Done
            </button>
          </div>
        )}

        {/* Bottom Filter Thumbnail Strip OR Bottom Action Bar */}
        <div className="space-y-4 px-4 pb-6">
          {showFilterStrip && (
            <div
              data-testid="photo-filter-strip"
              className="flex items-center justify-between gap-2 overflow-x-auto pb-1"
            >
              {PHOTO_FILTER_PRESETS.map((preset) => {
                const selected = photoFilter === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`photo-filter-option-${preset.id}`}
                    onClick={() => setPhotoFilter(preset.id)}
                    className={`relative flex h-20 w-18 flex-none flex-col justify-end overflow-hidden rounded-lg border-2 transition-all ${
                      selected ? 'border-[#0078D4]' : 'border-transparent'
                    }`}
                  >
                    <div
                      style={{ filter: preset.cssFilter }}
                      className="absolute inset-0 bg-[#7c7970] flex items-center justify-center"
                    >
                      <div className="size-10 rounded-full bg-[#d6b89e]" />
                    </div>
                    <span className="relative z-10 w-full bg-black/65 py-0.5 text-center text-[11px] font-medium text-white">
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Bottom Controls: Filters | Reorder | Add more + ✓ Finish */}
          <div className="flex items-center justify-around text-xs text-zinc-200">
            <button
              type="button"
              data-testid="photo-toggle-filters-btn"
              onClick={() => setShowFilterStrip((prev) => !prev)}
              className="flex flex-col items-center gap-1"
            >
              <span className="text-base">◐</span>
              <span>Filters</span>
            </button>
            <button type="button" className="flex flex-col items-center gap-1 opacity-60">
              <span className="text-base">⊞</span>
              <span>Reorder</span>
            </button>
            <button type="button" className="flex flex-col items-center gap-1">
              <span className="text-base">📷</span>
              <span>Add more</span>
            </button>
          </div>

          <button
            type="button"
            data-testid="photo-finish-btn"
            onClick={() => setSubScreen('inbox')}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0078D4] py-3.5 text-sm font-medium text-white shadow-lg"
          >
            <span>✓</span>
            <span>Finish</span>
          </button>
        </div>
      </div>
    );
  }

  // ─── FLOW #12: Send Availability (Adding available time slots) ─────────────
  if (subScreen === 'send_availability') {
    const weekDays = [
      { dow: 'S', num: 22 },
      { dow: 'M', num: 23 },
      { dow: 'T', num: 24 },
      { dow: 'W', num: 25 },
      { dow: 'T', num: 26 },
      { dow: 'F', num: 27 },
      { dow: 'S', num: 28 },
    ];

    return (
      <div
        data-testid="mobile-send-availability-sheet"
        className="fixed inset-0 z-50 flex flex-col bg-[var(--quant-card)] text-[var(--quant-foreground)]"
      >
        {/* Top helper prompt */}
        <p className="pt-3 text-center text-xs text-[var(--quant-muted-foreground)]">
          Tap the time slots you&apos;re available
        </p>

        {/* Sheet Header: ✕ | Send Availability | ✓ */}
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
          <button
            type="button"
            aria-label="Close Send Availability"
            onClick={() => setSubScreen('inbox')}
            className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-muted-foreground)]"
          >
            ✕
          </button>
          <h1 className="text-base font-semibold text-[var(--quant-foreground)]">
            Send Availability
          </h1>
          <button
            type="button"
            aria-label="Confirm Availability"
            data-testid="confirm-availability-btn"
            onClick={() => setSubScreen('inbox')}
            className={`inline-flex size-8 items-center justify-center rounded-lg ${
              selectedSlotIds.length > 0
                ? 'text-[#0078D4]'
                : 'text-[var(--quant-muted-foreground)] opacity-40'
            }`}
          >
            ✓
          </button>
        </div>

        {/* 7-Day Week Strip */}
        <div className="border-b border-[var(--quant-border)] px-4 py-2.5">
          <div className="grid grid-cols-7 text-center text-[11px] text-[var(--quant-muted-foreground)]">
            {weekDays.map((d) => (
              <div key={`${d.dow}-${d.num}`} className="flex flex-col items-center gap-1.5">
                <span>{d.dow}</span>
                <button
                  type="button"
                  onClick={() => setSelectedDayNum(d.num)}
                  className={`grid size-8 place-items-center rounded-full text-sm font-medium ${
                    selectedDayNum === d.num
                      ? 'bg-[#0078D4] text-white'
                      : 'text-[var(--quant-foreground)]'
                  }`}
                >
                  {d.num}
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-xs font-medium text-[var(--quant-foreground)]">
            Friday, {selectedDayNum} February 2026
          </p>
        </div>

        {/* Hourly Schedule Grid */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--quant-border)]">
          {[
            { hour: '9 AM', event: null, slotId: null },
            { hour: '10 AM', event: 'Daily standup', slotId: null },
            { hour: '11 AM', event: 'Project Fortuna: Kick-off Meeting', slotId: null },
            { hour: '12 PM', event: 'Lunch', slotId: null },
            { hour: '1 PM', event: 'Pack merchandise', slotId: null },
            { hour: '2 PM', event: null, slotId: 'slot-1430', slotLabel: '2:30 PM - 3:00 PM' },
            { hour: '3 PM', event: null, slotId: 'slot-1530', slotLabel: '3:30 PM - 4:00 PM', isNow: true },
            { hour: '5 PM', event: null, slotId: 'slot-1630', slotLabel: '4:30 PM - 5:00 PM' },
            { hour: '6 PM', event: null, slotId: null },
            { hour: '7 PM', event: null, slotId: null },
          ].map((row) => {
            const slotSelected = row.slotId ? selectedSlotIds.includes(row.slotId) : false;
            return (
              <div key={row.hour} className="relative flex min-h-13 items-stretch">
                <div className="w-16 flex-none pr-2 pt-2 text-right text-[11px] text-[var(--quant-muted-foreground)]">
                  {row.isNow ? (
                    <span className="font-semibold text-[#0078D4]">3:53 PM</span>
                  ) : (
                    row.hour
                  )}
                </div>
                <div className="relative flex-1 border-l border-[var(--quant-border)] bg-[var(--quant-surface)]/40 p-1.5">
                  {row.event && (
                    <div className="rounded bg-[var(--quant-border)]/50 px-2.5 py-2 text-xs text-[var(--quant-muted-foreground)]">
                      {row.event}
                    </div>
                  )}

                  {row.slotId && (
                    <button
                      type="button"
                      data-testid={`availability-slot-${row.slotId}`}
                      onClick={() => {
                        const id = row.slotId!;
                        setSelectedSlotIds((prev) =>
                          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                        );
                      }}
                      className={`mt-1 flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                        slotSelected
                          ? 'bg-[#0078D4] text-white'
                          : 'border border-dashed border-[#0078D4]/40 text-[#0078D4]'
                      }`}
                    >
                      <span>{row.slotLabel}</span>
                      {slotSelected && <span>✕</span>}
                    </button>
                  )}

                  {row.isNow && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-1 flex items-center">
                      <span className="-ml-1 size-2 rounded-full bg-[#0078D4]" />
                      <span className="h-0.5 flex-1 bg-[#0078D4]" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── FLOW #11 (Screen 1): Left Account/Folder Drawer + Add Account Sheet ───
  if (subScreen === 'drawer_add_account') {
    return (
      <div
        data-testid="mobile-drawer-add-account"
        className="fixed inset-0 z-50 flex bg-[var(--quant-background)] text-[var(--quant-foreground)]"
      >
        {/* Left Account Rail */}
        <div className="flex w-16 flex-col items-center gap-4 border-r border-[var(--quant-border)] bg-[var(--quant-surface)] pt-4">
          <div className="grid size-11 place-items-center rounded-full border-2 border-[#0078D4] bg-[#EC4899] text-sm font-semibold text-white">
            SL
          </div>
          <button
            type="button"
            data-testid="drawer-rail-add-account-btn"
            aria-label="Add another account"
            onClick={() => setShowAddAccountActionSheet(true)}
            className="relative grid size-11 place-items-center rounded-full bg-[var(--quant-border)] text-[var(--quant-muted-foreground)]"
          >
            <span>✉️</span>
            <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-[#0078D4] text-[10px] font-bold text-white">
              +
            </span>
          </button>
        </div>

        {/* Folder List Pane */}
        <div className="flex-1 bg-[var(--quant-card)] p-4">
          <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-3">
            <div>
              <p className="text-base font-semibold text-[var(--quant-foreground)]">QuantMail</p>
              <p className="text-xs text-[var(--quant-muted-foreground)]">
                alexsmith@quantrinity.in
              </p>
            </div>
            <span className="text-lg text-[var(--quant-muted-foreground)]">⏰</span>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs font-medium text-[var(--quant-muted-foreground)]">
            <span>Folders</span>
            <button
              type="button"
              data-testid="drawer-edit-folders-btn"
              aria-label="Edit folders"
              onClick={() => setSubScreen('folder_edit')}
              className="text-sm text-[var(--quant-muted-foreground)] hover:text-[#0078D4]"
            >
              ✎
            </button>
          </div>

          <div className="mt-2 space-y-1">
            {[
              { name: 'Inbox', count: 6, active: true },
              { name: 'Archive', count: null, active: false },
              { name: 'Drafts', count: 1, active: false },
              { name: 'Sent', count: null, active: false },
              { name: 'Deleted', count: 3, active: false },
              { name: 'Conversation History', count: null, active: false },
              { name: 'Junk', count: null, active: false },
            ].map((folder) => (
              <button
                key={folder.name}
                type="button"
                data-testid={`drawer-folder-${folder.name.toLowerCase().replace(/\s+/g, '-')}-btn`}
                onClick={() => {
                  if (folder.name === 'Deleted') {
                    setSubScreen('deleted_folder');
                  } else if (folder.name === 'Drafts') {
                    setSubScreen('drafts_folder');
                  } else if (folder.name === 'Sent') {
                    setSubScreen('sent_folder');
                  } else {
                    setSubScreen('inbox');
                  }
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ${
                  folder.active
                    ? 'font-medium text-[#0078D4]'
                    : 'text-[var(--quant-foreground)]'
                }`}
              >
                <span>{folder.name}</span>
                {folder.count !== null && (
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs ${
                      folder.active
                        ? 'bg-[#0078D4]/15 text-[#0078D4]'
                        : 'bg-[var(--quant-surface)] text-[var(--quant-muted-foreground)]'
                    }`}
                  >
                    {folder.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Bottom iOS Action Sheet Overlay (Add Email Account | Create New Account | Cancel) */}
        {showAddAccountActionSheet && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/45 p-3">
            <div className="overflow-hidden rounded-2xl bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] shadow-2xl">
              <button
                type="button"
                data-testid="action-sheet-add-email-account"
                onClick={() => setSubScreen('add_account_form')}
                className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="text-lg text-[#0078D4]">✉️</span>
                <div>
                  <p className="text-sm font-medium text-[var(--quant-foreground)]">
                    Add Email Account
                  </p>
                  <p className="text-xs text-[var(--quant-muted-foreground)]">
                    QuantMail, Gmail, Exchange, iCloud...
                  </p>
                </div>
              </button>
              <Link
                href="/register"
                className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="text-xl font-light text-[#0078D4]">+</span>
                <div>
                  <p className="text-sm font-medium text-[var(--quant-foreground)]">
                    Create New Account
                  </p>
                  <p className="text-xs text-[var(--quant-muted-foreground)]">
                    Free email and calendar
                  </p>
                </div>
              </Link>
            </div>

            <button
              type="button"
              onClick={() => setSubScreen('inbox')}
              className="mt-2 w-full rounded-2xl bg-[var(--quant-card)] py-3.5 text-center text-sm font-semibold text-[#0078D4] shadow-xl"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── FLOW #11 (Screen 2): Full-Screen Add Account Form ─────────────────────
  if (subScreen === 'add_account_form') {
    const hasEmail = addAccountEmail.trim().length > 0;
    return (
      <div
        data-testid="mobile-add-account-form-sheet"
        className="fixed inset-0 z-50 flex flex-col bg-[var(--quant-card)] px-4 pt-3 text-[var(--quant-foreground)]"
      >
        <div className="relative flex items-center justify-center border-b border-[var(--quant-border)] pb-3">
          <button
            type="button"
            aria-label="Close Add Account"
            onClick={() => setSubScreen('inbox')}
            className="absolute left-0 inline-flex size-8 items-center justify-center text-[var(--quant-muted-foreground)]"
          >
            ✕
          </button>
          <h1 className="text-base font-semibold text-[var(--quant-foreground)]">Add Account</h1>
        </div>

        <div className="mx-auto w-full max-w-[320px] space-y-5 pt-8 text-center">
          <p className="text-sm text-[var(--quant-muted-foreground)]">
            Enter your work or personal email
          </p>

          <input
            type="email"
            value={addAccountEmail}
            onChange={(e) => setAddAccountEmail(e.target.value)}
            placeholder="Email Address"
            className="w-full border-b border-[var(--quant-border)] bg-transparent pb-2.5 text-base text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:border-[#0078D4] focus:outline-none"
          />

          <div className="space-y-3 pt-2">
            <button
              type="button"
              disabled={!hasEmail}
              onClick={() => setSubScreen('inbox')}
              className={`w-full rounded-xl py-3.5 text-sm font-medium ${
                hasEmail
                  ? 'bg-[#0078D4] text-white'
                  : 'bg-[#C8C6C4] text-white dark:bg-[#27272A] dark:text-zinc-200'
              }`}
            >
              Add Account
            </button>

            <Link
              href="/register"
              className="block w-full rounded-xl border border-[#0078D4] py-3.5 text-center text-sm font-medium text-[#0078D4]"
            >
              Create New Account
            </Link>
          </div>

          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 pt-2 text-xs font-medium text-[#0078D4]"
          >
            <span>⊞</span>
            <span>Sign in using the QR code on your computer</span>
          </button>
        </div>
      </div>
    );
  }

  // ─── MAIN MOBILE INBOX SCREEN (Flows #40, #47, #48, #49) ──────────────────
  const isEmptyMode = subScreen === 'empty_inbox';

  return (
    <div
      data-testid="mobile-inbox-flow-suite"
      className="fixed inset-0 z-50 flex flex-col justify-between bg-[var(--quant-card)] text-[var(--quant-foreground)]"
    >
      {/* Top Mobile Inbox Header (Blue #0078D4 in Light mode, Black/Elevated in Dark mode) */}
      <header className="bg-[#0078D4] dark:bg-[#0B0F17] px-4 pb-3 pt-3 text-white shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="mobile-inbox-avatar-btn"
              aria-label="Open account and folder drawer"
              onClick={() => {
                setShowAddAccountActionSheet(true);
                setSubScreen('drawer_add_account');
              }}
              className="grid size-8 place-items-center rounded-full bg-[#EC4899] text-xs font-semibold text-white"
            >
              SL
            </button>
            <h1 className="text-xl font-bold tracking-tight text-white">Inbox</h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="mobile-inbox-empty-toggle"
              aria-label="Toggle empty inbox state"
              onClick={() =>
                setSubScreen((prev) => (prev === 'empty_inbox' ? 'inbox' : 'empty_inbox'))
              }
              className="inline-flex size-8 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </button>
            <Link
              href="/search"
              aria-label="Search mail"
              className="inline-flex size-8 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Row 2: [ Focused | Other ] Segmented Pill + Filter Button */}
        <div className="mt-3 flex items-center justify-between">
          <div className="inline-flex rounded-full bg-black/25 p-0.5">
            <button
              type="button"
              data-testid="mobile-tab-focused"
              onClick={() => setActiveTab('focused')}
              className={`rounded-full px-4 py-1 text-xs font-semibold transition-colors ${
                activeTab === 'focused'
                  ? 'bg-white text-[#0078D4] dark:bg-[#0078D4] dark:text-white'
                  : 'text-white/90'
              }`}
            >
              Focused
            </button>
            <button
              type="button"
              data-testid="mobile-tab-other"
              onClick={() => setActiveTab('other')}
              className={`rounded-full px-4 py-1 text-xs font-semibold transition-colors ${
                activeTab === 'other'
                  ? 'bg-white text-[#0078D4] dark:bg-[#0078D4] dark:text-white'
                  : 'text-white/90'
              }`}
            >
              Other
            </button>
          </div>

          <button
            type="button"
            data-testid="mobile-inbox-filter-btn"
            onClick={() => setFilterOpen((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-white transition-colors ${
              activeFilter !== 'all' ? 'bg-black/25' : 'hover:bg-white/10'
            }`}
          >
            {activeFilter === 'flagged' ? (
              <FilterOptionIcon filterKey="flagged" />
            ) : activeFilter === 'pinned' ? (
              <FilterOptionIcon filterKey="pinned" />
            ) : (
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" x2="20" y1="6" y2="6" />
                <line x1="7" x2="17" y1="12" y2="12" />
                <line x1="10" x2="14" y1="18" y2="18" />
              </svg>
            )}
            <span>{activeFilterLabel}</span>
          </button>
        </div>
      </header>

      {/* Filter Dropdown Sheet (Flows #47, #48, #49) */}
      {filterOpen && (
        <div
          data-testid="mobile-inbox-filter-sheet"
          className="absolute inset-x-0 top-[96px] bottom-0 z-40 bg-black/45"
          onClick={() => setFilterOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] shadow-2xl"
          >
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                data-testid={`mobile-filter-option-${opt.key}`}
                onClick={() => {
                  setActiveFilter((prev) => (prev === opt.key ? 'all' : opt.key));
                  setFilterOpen(false);
                }}
                className="flex min-h-12 w-full items-center gap-4 px-5 py-3 text-left text-sm text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
              >
                <span className="text-[var(--quant-muted-foreground)]">
                  <FilterOptionIcon filterKey={opt.key} />
                </span>
                <span className="font-normal">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Area: Either Empty Hot-Air Balloon State OR Message List */}
      {isEmptyMode || filteredEmails.length === 0 ? (
        <div
          data-testid="mobile-inbox-empty-state"
          className="flex flex-1 flex-col items-center justify-center px-6 text-center"
        >
          {/* Hot-Air Balloon Illustration matching Flow #40 Email 0.png */}
          <svg viewBox="0 0 180 180" className="size-40">
            <ellipse cx="52" cy="58" rx="22" ry="11" fill="#E5E7EB" />
            <ellipse cx="136" cy="70" rx="20" ry="9" fill="#F3F4F6" />
            <circle cx="90" cy="74" r="42" fill="#60A5FA" />
            <path d="M48 74 H132 V86 H48 Z" fill="#FBBF24" />
            <line x1="65" y1="110" x2="78" y2="136" stroke="#3B82F6" strokeWidth="2.5" />
            <line x1="115" y1="110" x2="102" y2="136" stroke="#3B82F6" strokeWidth="2.5" />
            <line x1="90" y1="116" x2="90" y2="136" stroke="#3B82F6" strokeWidth="2.5" />
            <rect x="74" y="136" width="32" height="22" rx="4" fill="#FCD34D" />
          </svg>
          <h2 className="mt-3 text-base font-semibold text-[var(--quant-foreground)]">
            Nothing Left to Read
          </h2>
          <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
            Enjoy your empty inbox.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-[var(--quant-border)] px-4 py-2 text-xs font-medium text-[var(--quant-muted-foreground)]">
            2025
          </div>

          <div className="divide-y divide-[var(--quant-border)]">
            {filteredEmails.map((mail) => (
              <div
                key={mail.id}
                role="button"
                tabIndex={0}
                data-testid={`mobile-email-row-${mail.id}`}
                onClick={() => setSubScreen('email_detail')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSubScreen('email_detail');
                  }
                }}
                className={`relative flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors ${
                  mail.flagged
                    ? 'bg-[#FDFBF2] dark:bg-[#11151F]'
                    : 'bg-[var(--quant-card)]'
                }`}
              >
                {/* Unread blue dot */}
                {mail.unread && (
                  <span
                    aria-label="Unread"
                    className="absolute left-1.5 top-8 size-2 rounded-full bg-[#0078D4]"
                  />
                )}

                {/* Sender Avatar */}
                <span
                  style={{ backgroundColor: mail.avatarBg }}
                  className="grid size-10 flex-none place-items-center rounded-full text-xs font-semibold text-white"
                >
                  {mail.avatarText}
                </span>

                {/* Message Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`truncate text-sm ${
                        mail.unread ? 'font-bold' : 'font-medium'
                      } text-[var(--quant-foreground)]`}
                    >
                      {mail.sender}
                    </p>
                    <span className="flex-none text-xs text-[var(--quant-muted-foreground)]">
                      {mail.dateLabel}
                    </span>
                  </div>

                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p
                      className={`truncate text-xs ${
                        mail.unread ? 'font-semibold' : 'font-normal'
                      } text-[var(--quant-foreground)]`}
                    >
                      {mail.subject}
                    </p>
                    {mail.flagged && (
                      <span aria-label="Flagged" className="flex-none text-xs text-red-500">
                        🚩
                      </span>
                    )}
                  </div>

                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--quant-muted-foreground)]">
                    {mail.preview}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flow #32: Deleted Email Toast Banner ("Deleted | Undo") */}
      {inboxDeletedToast && (
        <div
          data-testid="inbox-deleted-toast"
          className="fixed inset-x-3 bottom-28 z-40 flex items-center justify-between rounded-xl bg-[#DCEAF7] dark:bg-[#1E293B] px-4 py-3.5 text-sm font-medium text-[#004578] dark:text-[#60A5FA] shadow-lg"
        >
          <span>Deleted</span>
          <button
            type="button"
            onClick={() => setInboxDeletedToast(false)}
            className="font-semibold text-[#004578] dark:text-[#60A5FA]"
          >
            Undo
          </button>
        </div>
      )}

      {/* Flow #86 & #74 & #85: Email Sent Toast Banner */}
      {inboxSentToast && (
        <div
          data-testid="inbox-email-sent-toast"
          className="fixed inset-x-3 bottom-28 z-40 flex items-center gap-2 rounded-xl bg-[#DCEAF7] dark:bg-[#1E293B] px-4 py-3.5 text-sm font-medium text-[#004578] dark:text-[#60A5FA] shadow-lg"
        >
          <span className="text-[#0078D4] font-bold">✓</span>
          <span>Email Sent</span>
        </div>
      )}

      {/* Flow #75: Reported Toast Banner ("Reported | Undo") */}
      {inboxReportedToast && (
        <div
          data-testid="inbox-reported-toast"
          className="fixed inset-x-3 bottom-28 z-40 flex items-center justify-between rounded-xl bg-[#DCEAF7] dark:bg-[#1E293B] px-4 py-3.5 text-sm font-medium text-[#004578] dark:text-[#60A5FA] shadow-lg"
        >
          <span>Reported</span>
          <button
            type="button"
            onClick={() => setInboxReportedToast(false)}
            className="font-semibold text-[#004578] dark:text-[#60A5FA]"
          >
            Undo
          </button>
        </div>
      )}

      {/* Floating Bottom-Right Quick Actions Pill: [ Folders | Deleted | Availability | Photo Studio | Compose ] */}
      <div className="fixed bottom-16 right-4 z-30 flex items-center gap-1.5 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] px-2.5 py-2 shadow-xl">
        <button
          type="button"
          data-testid="open-folder-edit-btn"
          aria-label="Edit folders"
          onClick={() => setSubScreen('folder_edit')}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
        >
          📁
        </button>
        <button
          type="button"
          data-testid="open-deleted-folder-btn"
          aria-label="Open deleted folder"
          onClick={() => setSubScreen('deleted_folder')}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
        >
          🗑️
        </button>
        <button
          type="button"
          data-testid="open-mobile-calendar-btn"
          aria-label="Open mobile calendar"
          onClick={() => setSubScreen('calendar')}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
        >
          📆
        </button>
        <button
          type="button"
          data-testid="open-send-availability-btn"
          aria-label="Send availability"
          onClick={() => setSubScreen('send_availability')}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
        >
          📅
        </button>
        <button
          type="button"
          data-testid="open-photo-studio-btn"
          aria-label="Open photo filter studio"
          onClick={() => setSubScreen('photo_filter_studio')}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
        >
          🖼️
        </button>
        <button
          type="button"
          data-testid="open-quick-drafts-btn"
          aria-label="Open quick drafts"
          onClick={() => setSubScreen('quick_drafts')}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
          title="Quick Drafts Access"
        >
          🗂️
        </button>
        <button
          type="button"
          data-testid="open-drafts-folder-btn"
          aria-label="Open drafts folder"
          onClick={() => setSubScreen('drafts_folder')}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
          title="Drafts Folder"
        >
          📝
        </button>
        <button
          type="button"
          data-testid="open-sent-folder-btn"
          aria-label="Open sent folder"
          onClick={() => setSubScreen('sent_folder')}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
          title="Sent Folder"
        >
          📤
        </button>
        <button
          type="button"
          data-testid="open-contacts-hub-btn"
          aria-label="Open contacts hub"
          onClick={() => setSubScreen('contacts_hub')}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
          title="Contacts Hub"
        >
          👥
        </button>
        <button
          type="button"
          data-testid="open-auto-replies-btn"
          aria-label="Open automatic replies"
          onClick={() => setSubScreen('auto_replies')}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
          title="Automatic Replies"
        >
          ✈️
        </button>
        <button
          type="button"
          data-testid="open-profile-icon-btn"
          aria-label="Open profile icon customizer"
          onClick={() => setSubScreen('profile_icon')}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
          title="Profile Icon"
        >
          🎨
        </button>
                <button
          type="button"
          data-testid="open-files-hub-btn"
          aria-label="Open files hub"
          onClick={() => setSubScreen('files_hub')}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
          title="Files Hub"
        >
          📁
        </button>
        <button
          type="button"
          data-testid="open-search-suite-btn"
          aria-label="Open search suite"
          onClick={() => setSubScreen('search_results')}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
          title="Search & Filters"
        >
          🔍
        </button>
        <button
          type="button"
          data-testid="open-help-btn"
          aria-label="Open help and feedback"
          onClick={() => setSubScreen('help_feedback')}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
          title="Help & Feedback"
        >
          ❓
        </button>
        <button
          type="button"
          data-testid="open-drawing-studio-btn"
          aria-label="Open photo drawing studio"
          onClick={() => setSubScreen('photo_drawing')}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
          title="Photo Drawing"
        >
          ✏️
        </button>
                <button
          type="button"
          data-testid="open-notifications-btn"
          aria-label="Open notifications feed"
          onClick={() => setSubScreen('notifications_feed')}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
          title="Notifications"
        >
          🔔
        </button>
        <button
          type="button"
          data-testid="open-welcome-login-btn"
          aria-label="Open welcome login"
          onClick={() => setSubScreen('welcome_login')}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
          title="Login / Auth"
        >
          🔐
        </button>
        <button
          type="button"
          data-testid="open-mobile-composer-btn"
          aria-label="Compose new email"
          onClick={() => {
            setIsReplyMode(false);
            setSelectedDraftForEdit(null);
            setSubScreen('composer');
          }}
          className="inline-flex size-8 items-center justify-center rounded-lg bg-[#0078D4] text-white hover:bg-[#006abc] transition-colors"
          title="Compose Email"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      </div>

      {/* Bottom 3-Tab Navigation Bar: Email | Calendar | Apps */}
      <nav
        aria-label="Mobile primary navigation"
        className="flex items-center justify-around border-t border-[var(--quant-border)] bg-[var(--quant-card)] py-2 text-[11px]"
      >
        <button
          type="button"
          onClick={() => setSubScreen('inbox')}
          className="flex flex-col items-center gap-0.5 font-medium text-[#0078D4]"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4.2-8 5-8-5V6l8 5 8-5v2.2Z" />
          </svg>
          <span>Email</span>
        </button>
        <button
          type="button"
          data-testid="bottom-nav-calendar-btn"
          onClick={() => setSubScreen('calendar')}
          className="flex flex-col items-center gap-0.5 text-[var(--quant-muted-foreground)] hover:text-[#0078D4]"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect width="18" height="18" x="3" y="4" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          <span>Calendar</span>
        </button>
        <button
          type="button"
          data-testid="bottom-nav-contacts-btn"
          onClick={() => setSubScreen('contacts_hub')}
          className="flex flex-col items-center gap-0.5 text-[var(--quant-muted-foreground)] hover:text-[#0078D4]"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect width="7" height="7" x="3" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="14" rx="1" />
            <rect width="7" height="7" x="3" y="14" rx="1" />
          </svg>
          <span>Apps</span>
        </button>
      </nav>
    </div>
  );
}
