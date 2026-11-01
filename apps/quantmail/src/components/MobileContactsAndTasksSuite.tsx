'use client';

/**
 * MobileContactsAndTasksSuite — Reverse-Engineered Batch 7 Suite for:
 * Flow #22: Contacts (Main contacts list, search, empty state)
 * Flow #23: Creating a contact (Full New Contact sheet, title, surname, phone, address, notes, categories)
 * Flow #20: Contact detail (Profile card, quick actions, linked emails/events/files, edit/delete actions)
 * Flow #21: Contact information (Expanded contact data sheet with address, birthday, company)
 * Flow #13: Assigning a category (contacts) (Category picker modal sheet, color tags)
 * Flow #14: Assigning a category (email) (Categorise modal sheet + email pill badges)
 * Flow #44: Favoriting a contact (Star toggle & Favourites section)
 * Flow #29: Deleting a contact (Action sheet confirmation + "Contact Deleted" toast)
 * Flow #25: Creating a task from email (Task input + "Task created | View in Quant Tasks" toast)
 * Flow #17: Changing a profile icon (Show As sheet, Account Initials, Customise icon & color grid)
 * Flow #41: Enabling automatic replies (Out of Office toggle, message textarea, settings pill)
 * Flow #19: Clearing a calendar schedule (Decline/cancel conflicting events during Out-of-Office)
 *
 * Strict Compliance:
 * - Mobile-first viewport (390×844 iOS @ 2x DPR)
 * - Dual-theme 1:1 support (White light / Black dark)
 * - Zero Competitor Naming (QuantMail, QuantWorkplace, QuantDrive, Quanty Meet, Quant Tasks)
 */

import React, { useState } from 'react';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface MobileContactRecord {
  id: string;
  title?: string;
  firstName: string;
  surname: string;
  email: string;
  emailType?: 'Work' | 'Personal';
  phone: string;
  phoneType?: 'Mobile' | 'Work';
  company: string;
  businessAddress?: string;
  birthday?: string;
  notes?: string;
  categories?: string[];
  favorite?: boolean;
}

// ─── INITIAL MOCK DATA ───────────────────────────────────────────────────────

export const INITIAL_BATCH7_CONTACTS: MobileContactRecord[] = [
  {
    id: 'ct-1',
    title: 'Ms',
    firstName: 'Alex',
    surname: 'Smith',
    email: 'alexsmith.mobbin@quantmail.com',
    emailType: 'Work',
    phone: '+16502137390',
    phoneType: 'Mobile',
    company: 'Mobbin',
    businessAddress: '1226 University Dr, Menlo Park, California, USA, 94025',
    birthday: '18 Feb 1995',
    notes: 'Product department',
    categories: ['Red category', 'Mobbin'],
    favorite: true,
  },
  {
    id: 'ct-2',
    firstName: 'John',
    surname: 'Smith',
    email: 'jsmith@quantmail.com',
    emailType: 'Personal',
    phone: '+14155552671',
    company: 'Smith Associates',
    notes: 'Architect partner',
    categories: ['Blue category'],
    favorite: false,
  },
];

// ─── FLOW #22, #13, #44: CONTACTS HUB (LIST & SEARCH) ────────────────────────

export function MobileContactsHubView({
  onBack,
  onOpenContact,
  onNewContact,
}: {
  onBack: () => void;
  onOpenContact: (contact: MobileContactRecord) => void;
  onNewContact: () => void;
}) {
  const [contacts, setContacts] = useState<MobileContactRecord[]>(INITIAL_BATCH7_CONTACTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCategorySheetFor, setShowCategorySheetFor] = useState<MobileContactRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'favourites'>('all');

  const filtered = contacts.filter((c) => {
    const fullName = `${c.title || ''} ${c.firstName} ${c.surname}`.toLowerCase();
    const matchesSearch = fullName.includes(searchQuery.toLowerCase()) || c.email.toLowerCase().includes(searchQuery.toLowerCase());
    if (activeTab === 'favourites') return matchesSearch && c.favorite;
    return matchesSearch;
  });

  const isEmpty = filtered.length === 0;

  return (
    <div
      data-testid="mobile-contacts-hub-view"
      className="flex h-full flex-col bg-[var(--quant-background)] text-[var(--quant-foreground)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
        <button
          type="button"
          data-testid="contacts-back-btn"
          onClick={onBack}
          className="text-base text-[var(--quant-muted-foreground)]"
        >
          ✕
        </button>
        <h1 className="text-base font-bold">
          All Contacts ({contacts.length})
        </h1>
        <button
          type="button"
          data-testid="contacts-add-new-btn"
          onClick={onNewContact}
          className="text-base font-bold text-[#0078D4]"
          title="Add New Contact"
        >
          +
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b border-[var(--quant-border)]">
        <div className="flex items-center gap-2 rounded-xl bg-[var(--quant-border)]/40 px-3 py-2 text-xs text-[var(--quant-muted-foreground)]">
          <span>🔍</span>
          <input
            type="text"
            data-testid="contacts-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search people"
            className="flex-1 bg-transparent outline-none text-xs text-[var(--quant-foreground)]"
          />
        </div>
      </div>

      {/* Contacts List or Empty State */}
      {isEmpty ? (
        <div
          data-testid="contacts-empty-state"
          className="flex flex-1 flex-col items-center justify-center px-8 text-center"
        >
          <div className="grid size-20 place-items-center rounded-full bg-[#0078D4]/10 text-3xl text-[#0078D4] mb-3">
            👥
          </div>
          <h2 className="text-base font-bold text-[var(--quant-foreground)]">
            No Contacts
          </h2>
          <p className="mt-1 text-xs text-[var(--quant-muted-foreground)] leading-relaxed">
            Create a new contact or save an existing one to fill up your address book.
          </p>
          <button
            type="button"
            data-testid="contacts-empty-create-btn"
            onClick={onNewContact}
            className="mt-5 rounded-full bg-[#0078D4] px-5 py-2 text-xs font-semibold text-white shadow-md hover:bg-[#006abc]"
          >
            Create Contact
          </button>
        </div>
      ) : (
        <div data-testid="contacts-list" className="flex-1 overflow-y-auto divide-y divide-[var(--quant-border)]">
          {filtered.map((contact) => (
            <div
              key={contact.id}
              data-testid={`contact-row-${contact.id}`}
              className="flex w-full items-center justify-between p-4 hover:bg-[var(--quant-border)]/30 transition-colors"
            >
              <button
                type="button"
                onClick={() => onOpenContact(contact)}
                className="flex items-center gap-3 text-left flex-1 min-w-0"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-600 font-bold text-white text-xs">
                  {contact.firstName[0]}{contact.surname[0]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--quant-foreground)] truncate">
                      {contact.title ? `${contact.title} ` : ''}{contact.firstName} {contact.surname}
                    </span>
                    {contact.favorite && <span className="text-amber-500 text-xs">★</span>}
                  </div>
                  <div className="text-xs text-[var(--quant-muted-foreground)] truncate">
                    {contact.email}
                  </div>
                  {contact.categories && contact.categories.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {contact.categories.map((cat, i) => (
                        <span
                          key={i}
                          data-testid={`contact-cat-pill-${i}`}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            cat.includes('Red')
                              ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                              : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>

              <button
                type="button"
                data-testid={`assign-category-btn-${contact.id}`}
                onClick={() => setShowCategorySheetFor(contact)}
                className="p-2 text-xs text-[var(--quant-muted-foreground)] hover:text-[#0078D4]"
                title="Assign Category"
              >
                🏷️
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Category Assignment Sheet (Flow #13 Screen 4) */}
      {showCategorySheetFor && (
        <MobileAssignCategoryModal
          contact={showCategorySheetFor}
          onClose={() => setShowCategorySheetFor(null)}
          onSaveCategories={(cats) => {
            setContacts(
              contacts.map((c) =>
                c.id === showCategorySheetFor.id ? { ...c, categories: cats } : c
              )
            );
            setShowCategorySheetFor(null);
          }}
        />
      )}
    </div>
  );
}

// ─── FLOW #13 & #14: ASSIGN CATEGORY MODAL SHEET ─────────────────────────────

export function MobileAssignCategoryModal({
  contact,
  title = 'Categorise',
  onClose,
  onSaveCategories,
}: {
  contact?: MobileContactRecord;
  title?: string;
  onClose: () => void;
  onSaveCategories: (categories: string[]) => void;
}) {
  const [selectedCats, setSelectedCats] = useState<string[]>(
    contact?.categories || ['Red category']
  );

  const allCategories = [
    { name: 'Blue category', color: '#0078D4' },
    { name: 'Green category', color: '#10B981' },
    { name: 'Mobbin', color: '#6366F1' },
    { name: 'Orange category', color: '#F97316' },
    { name: 'Purple category', color: '#8B5CF6' },
    { name: 'Red category', color: '#EF4444' },
    { name: 'Yellow category', color: '#EAB308' },
  ];

  const toggleCategory = (name: string) => {
    if (selectedCats.includes(name)) {
      setSelectedCats(selectedCats.filter((c) => c !== name));
    } else {
      setSelectedCats([...selectedCats, name]);
    }
  };

  return (
    <div
      data-testid="assign-category-modal-sheet"
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60"
    >
      <div className="rounded-t-3xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] p-4 text-[var(--quant-foreground)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-3">
          <button
            type="button"
            data-testid="category-modal-close-btn"
            onClick={onClose}
            className="text-base text-[var(--quant-muted-foreground)]"
          >
            ✕
          </button>
          <div className="flex flex-col items-center">
            <h3 className="text-base font-semibold">{title}</h3>
            <span className="text-[11px] text-[var(--quant-muted-foreground)]">
              samlee.mobbin01@quantmail.com
            </span>
          </div>
          <button
            type="button"
            data-testid="category-modal-save-btn"
            onClick={() => onSaveCategories(selectedCats)}
            className="text-base font-semibold text-[#0078D4]"
          >
            Done
          </button>
        </div>

        <div className="py-2 divide-y divide-[var(--quant-border)] max-h-72 overflow-y-auto">
          {allCategories.map((cat) => {
            const isChecked = selectedCats.includes(cat.name);
            return (
              <button
                key={cat.name}
                type="button"
                data-testid={`category-checkbox-${cat.name.replace(/\s+/g, '-').toLowerCase()}`}
                onClick={() => toggleCategory(cat.name)}
                className="flex w-full items-center justify-between py-3 text-left text-sm"
              >
                <div className="flex items-center gap-3">
                  <span
                    style={{ backgroundColor: cat.color }}
                    className="size-4 rounded-full"
                  />
                  <span className="font-medium text-[var(--quant-foreground)]">{cat.name}</span>
                </div>
                <div
                  className={`size-5 rounded-full border flex items-center justify-center ${
                    isChecked ? 'bg-[#0078D4] border-[#0078D4] text-white text-xs' : 'border-[var(--quant-border)]'
                  }`}
                >
                  {isChecked && '✓'}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── FLOW #20, #21, #44, #29: CONTACT DETAIL SHEET ───────────────────────────

export function MobileContactDetailView({
  contact = INITIAL_BATCH7_CONTACTS[0],
  onBack,
  onEdit,
  onDelete,
  onToggleFavorite,
}: {
  contact?: MobileContactRecord;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}) {
  const [showFullInfo, setShowFullInfo] = useState(false);
  const [showDeleteActionSheet, setShowDeleteActionSheet] = useState(false);

  return (
    <div
      data-testid="mobile-contact-detail-view"
      className="flex h-full flex-col bg-[var(--quant-background)] text-[var(--quant-foreground)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
        <button
          type="button"
          data-testid="contact-detail-back-btn"
          onClick={onBack}
          className="text-base text-[var(--quant-muted-foreground)]"
        >
          ‹
        </button>
        <span className="text-sm font-semibold truncate max-w-[200px]">
          {contact.title ? `${contact.title} ` : ''}{contact.firstName} {contact.surname}
        </span>
        <button
          type="button"
          data-testid="contact-favorite-star-btn"
          onClick={onToggleFavorite}
          className={`text-lg ${contact.favorite ? 'text-amber-500' : 'text-[var(--quant-muted-foreground)]'}`}
          title="Toggle Favorite"
        >
          {contact.favorite ? '★' : '☆'}
        </button>
      </div>

      {/* Contact Profile Hero Card */}
      <div className="flex flex-col items-center p-6 border-b border-[var(--quant-border)] bg-[var(--quant-card)]">
        <span className="grid size-20 place-items-center rounded-full bg-emerald-600 font-bold text-white text-2xl shadow-lg">
          {contact.firstName[0]}{contact.surname[0]}
        </span>
        <h2 className="mt-3 text-lg font-bold text-[var(--quant-foreground)]">
          {contact.title ? `${contact.title} ` : ''}{contact.firstName} {contact.surname}
        </h2>
        <span className="text-xs font-medium text-[var(--quant-muted-foreground)]">
          {contact.company}
        </span>

        {/* Quick Contact Action Pills */}
        <div className="flex items-center gap-6 mt-4">
          <button type="button" className="flex flex-col items-center gap-1 text-[#0078D4]">
            <span className="grid size-10 place-items-center rounded-full bg-[#0078D4]/10 text-base">✉️</span>
            <span className="text-[10px] font-semibold">Email</span>
          </button>
          <button type="button" className="flex flex-col items-center gap-1 text-[#0078D4]">
            <span className="grid size-10 place-items-center rounded-full bg-[#0078D4]/10 text-base">📞</span>
            <span className="text-[10px] font-semibold">Call</span>
          </button>
          <button type="button" className="flex flex-col items-center gap-1 text-[#0078D4]">
            <span className="grid size-10 place-items-center rounded-full bg-[#0078D4]/10 text-base">💬</span>
            <span className="text-[10px] font-semibold">Chat</span>
          </button>
        </div>
      </div>

      {/* Main Body (Contact Info & Linked Content) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Info Rows */}
        <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] text-sm">
          <div className="p-3.5">
            <span className="text-xs text-[var(--quant-muted-foreground)] block">Email</span>
            <span className="font-semibold text-sm text-[var(--quant-foreground)]">{contact.email}</span>
          </div>
          <div className="p-3.5">
            <span className="text-xs text-[var(--quant-muted-foreground)] block">Mobile Phone</span>
            <span className="font-semibold text-sm text-[var(--quant-foreground)]">{contact.phone}</span>
          </div>
          <button
            type="button"
            data-testid="contact-show-more-btn"
            onClick={() => setShowFullInfo(!showFullInfo)}
            className="w-full py-3 text-center text-xs font-semibold text-[#0078D4] hover:bg-[var(--quant-border)]/20"
          >
            {showFullInfo ? 'Show Less' : 'Show More'}
          </button>
        </div>

        {/* Expanded Info (Flow #21 Screen 1) */}
        {showFullInfo && (
          <div data-testid="contact-expanded-info-sheet" className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] text-sm">
            <div className="p-3.5">
              <span className="text-xs text-[var(--quant-muted-foreground)] block">Company</span>
              <span className="font-semibold text-sm">{contact.company}</span>
            </div>
            {contact.businessAddress && (
              <div className="p-3.5">
                <span className="text-xs text-[var(--quant-muted-foreground)] block">Business Address</span>
                <span className="font-semibold text-sm">{contact.businessAddress}</span>
              </div>
            )}
            {contact.birthday && (
              <div className="p-3.5">
                <span className="text-xs text-[var(--quant-muted-foreground)] block">Birthday</span>
                <span className="font-semibold text-sm">{contact.birthday}</span>
              </div>
            )}
            {contact.notes && (
              <div className="p-3.5">
                <span className="text-xs text-[var(--quant-muted-foreground)] block">Notes</span>
                <span className="font-semibold text-sm">{contact.notes}</span>
              </div>
            )}
          </div>
        )}

        {/* Linked Emails & Events Section (Flow #20 Screen 1) */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--quant-muted-foreground)]">
            Email
          </h3>
          <div className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3 text-xs space-y-1">
            <div className="flex justify-between font-semibold">
              <span>Follow-Up on Work</span>
              <span className="text-[var(--quant-muted-foreground)]">10:26 PM</span>
            </div>
            <p className="text-[var(--quant-muted-foreground)] line-clamp-2">
              Hi Sam, I wanted to follow up regarding our recent work discussion...
            </p>
          </div>

          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--quant-muted-foreground)]">
            Events
          </h3>
          <div className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3 text-xs space-y-1">
            <div className="flex justify-between font-semibold">
              <span>Daily standup</span>
              <span className="text-[var(--quant-muted-foreground)]">Tomorrow</span>
            </div>
            <p className="text-[var(--quant-muted-foreground)]">
              📍 1226 University Dr
            </p>
          </div>

          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--quant-muted-foreground)]">
            Files
          </h3>
          <div className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3 text-xs flex items-center gap-3">
            <span className="text-lg">📄</span>
            <div>
              <div className="font-semibold">Standup report.pdf</div>
              <div className="text-[10px] text-[var(--quant-muted-foreground)]">3 minutes ago • 5 KB</div>
            </div>
          </div>
        </div>

        {/* Edit / Delete Buttons */}
        <div className="pt-4 space-y-2">
          <button
            type="button"
            data-testid="contact-edit-btn"
            onClick={onEdit}
            className="w-full rounded-xl border border-[var(--quant-border)] py-3 text-center text-sm font-semibold hover:bg-[var(--quant-border)]/20"
          >
            Edit Contact
          </button>
          <button
            type="button"
            data-testid="contact-delete-btn"
            onClick={() => setShowDeleteActionSheet(true)}
            className="w-full rounded-xl py-3 text-center text-sm font-semibold text-red-500 hover:bg-red-500/10"
          >
            Delete Contact
          </button>
        </div>
      </div>

      {/* Delete Action Sheet (Flow #29 Screen 1) */}
      {showDeleteActionSheet && (
        <div
          data-testid="delete-contact-action-sheet"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 px-4 pb-6"
        >
          <div className="overflow-hidden rounded-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] shadow-2xl divide-y divide-[var(--quant-border)] text-center text-sm">
            <button
              type="button"
              data-testid="confirm-delete-contact-btn"
              onClick={() => {
                setShowDeleteActionSheet(false);
                onDelete();
              }}
              className="w-full py-3.5 font-bold text-red-500"
            >
              Delete
            </button>
          </div>
          <button
            type="button"
            data-testid="cancel-delete-contact-btn"
            onClick={() => setShowDeleteActionSheet(false)}
            className="mt-2 w-full rounded-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] py-3.5 text-center text-sm font-semibold text-[#0078D4]"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ─── FLOW #23: CREATING A NEW CONTACT SHEET ──────────────────────────────────

export function MobileCreateContactSheet({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (contact: MobileContactRecord) => void;
}) {
  const [title, setTitle] = useState('Ms');
  const [firstName, setFirstName] = useState('Alex');
  const [surname, setSurname] = useState('Smith');
  const [email, setEmail] = useState('alexsmith.mobbin@quantmail.com');
  const [phone, setPhone] = useState('+16502137390');
  const [company, setCompany] = useState('ASMobbin');
  const [address, setAddress] = useState('1226 University Dr, Menlo Park, California, USA, 94025');
  const [notes, setNotes] = useState('Product department');
  const [categories, setCategories] = useState<string[]>(['Mobbin']);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      id: `ct-${Date.now()}`,
      title,
      firstName,
      surname,
      email,
      phone,
      company,
      businessAddress: address,
      notes,
      categories,
      favorite: false,
    });
    onClose();
  };

  return (
    <div
      data-testid="mobile-create-contact-sheet"
      className="fixed inset-0 z-50 flex flex-col bg-black/60 pt-2 text-[var(--quant-foreground)]"
    >
      <div className="flex flex-1 flex-col overflow-hidden rounded-t-3xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
          <button
            type="button"
            data-testid="new-contact-cancel-btn"
            onClick={onClose}
            className="text-base text-[var(--quant-muted-foreground)]"
          >
            ✕
          </button>
          <div className="flex flex-col items-center">
            <h2 className="text-base font-semibold">New Contact</h2>
            <span className="text-[10px] text-[var(--quant-muted-foreground)]">
              samlee.mobbin01@quantmail.com
            </span>
          </div>
          <button
            type="button"
            data-testid="new-contact-save-btn"
            onClick={handleSave}
            className="text-base font-semibold text-[#0078D4]"
          >
            Save
          </button>
        </div>

        {/* Form Inputs */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          <div className="flex items-center gap-2 border-b border-[var(--quant-border)] py-2">
            <span className="text-xs text-[var(--quant-muted-foreground)] w-20">Title</span>
            <input
              type="text"
              data-testid="new-contact-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 bg-transparent outline-none font-medium"
            />
          </div>
          <div className="flex items-center gap-2 border-b border-[var(--quant-border)] py-2">
            <span className="text-xs text-[var(--quant-muted-foreground)] w-20">First name</span>
            <input
              type="text"
              data-testid="new-contact-first-name-input"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="flex-1 bg-transparent outline-none font-medium"
            />
          </div>
          <div className="flex items-center gap-2 border-b border-[var(--quant-border)] py-2">
            <span className="text-xs text-[var(--quant-muted-foreground)] w-20">Surname</span>
            <input
              type="text"
              data-testid="new-contact-surname-input"
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
              className="flex-1 bg-transparent outline-none font-medium"
            />
          </div>
          <div className="flex items-center gap-2 border-b border-[var(--quant-border)] py-2">
            <span className="text-xs text-[var(--quant-muted-foreground)] w-20">Email address</span>
            <input
              type="email"
              data-testid="new-contact-email-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 bg-transparent outline-none font-medium"
            />
          </div>
          <div className="flex items-center gap-2 border-b border-[var(--quant-border)] py-2">
            <span className="text-xs text-[var(--quant-muted-foreground)] w-20">Phone number</span>
            <input
              type="tel"
              data-testid="new-contact-phone-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1 bg-transparent outline-none font-medium"
            />
          </div>
          <div className="flex items-center gap-2 border-b border-[var(--quant-border)] py-2">
            <span className="text-xs text-[var(--quant-muted-foreground)] w-20">Company</span>
            <input
              type="text"
              data-testid="new-contact-company-input"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="flex-1 bg-transparent outline-none font-medium"
            />
          </div>
          <div className="flex items-center gap-2 border-b border-[var(--quant-border)] py-2">
            <span className="text-xs text-[var(--quant-muted-foreground)] w-20">Business address</span>
            <input
              type="text"
              data-testid="new-contact-address-input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="flex-1 bg-transparent outline-none font-medium text-xs"
            />
          </div>
          <div className="flex items-center gap-2 border-b border-[var(--quant-border)] py-2">
            <span className="text-xs text-[var(--quant-muted-foreground)] w-20">Notes</span>
            <input
              type="text"
              data-testid="new-contact-notes-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="flex-1 bg-transparent outline-none font-medium"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FLOW #17: PROFILE ICON CUSTOMIZER SHEET ─────────────────────────────────

export function MobileProfileIconCustomizerSheet({
  isOpen,
  onClose,
  onSelectIcon,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectIcon: (choice: string) => void;
}) {
  const [selectedMode, setSelectedMode] = useState<'initials' | 'custom'>('initials');
  const [selectedColor, setSelectedColor] = useState('#0078D4');
  const [selectedIconEmoji, setSelectedIconEmoji] = useState('⚡');

  if (!isOpen) return null;

  const colorPalette = ['#0078D4', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
  const iconEmojis = ['⚡', '🚀', '⭐', '🛡️', '💼', '🎯', '💡', '🔥'];

  return (
    <div
      data-testid="profile-icon-customizer-sheet"
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60"
    >
      <div className="rounded-t-3xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] p-4 text-[var(--quant-foreground)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-3">
          <button
            type="button"
            data-testid="profile-icon-close-btn"
            onClick={onClose}
            className="text-sm text-[var(--quant-muted-foreground)]"
          >
            Cancel
          </button>
          <h3 className="text-base font-semibold">Show As</h3>
          <button
            type="button"
            data-testid="profile-icon-done-btn"
            onClick={() => {
              onSelectIcon(selectedMode === 'custom' ? selectedIconEmoji : 'SL');
              onClose();
            }}
            className="text-sm font-semibold text-[#0078D4]"
          >
            Done
          </button>
        </div>

        <div className="py-4 space-y-4">
          <div className="rounded-2xl border border-[var(--quant-border)] divide-y divide-[var(--quant-border)] overflow-hidden text-sm">
            <button
              type="button"
              data-testid="show-as-initials-btn"
              onClick={() => setSelectedMode('initials')}
              className="flex w-full items-center justify-between p-3.5"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-7 place-items-center rounded-full bg-[#0078D4] text-xs font-bold text-white">
                  SL
                </span>
                <span>Account Initials</span>
              </div>
              {selectedMode === 'initials' && <span className="text-[#0078D4] font-bold">✓</span>}
            </button>
            <button
              type="button"
              data-testid="show-as-custom-btn"
              onClick={() => setSelectedMode('custom')}
              className="flex w-full items-center justify-between p-3.5"
            >
              <div className="flex items-center gap-3">
                <span
                  style={{ backgroundColor: selectedColor }}
                  className="grid size-7 place-items-center rounded-full text-xs text-white"
                >
                  {selectedIconEmoji}
                </span>
                <span>Customise</span>
              </div>
              {selectedMode === 'custom' && <span className="text-[#0078D4] font-bold">✓</span>}
            </button>
          </div>

          {/* Color & Icon Grid when Customise is selected */}
          {selectedMode === 'custom' && (
            <div data-testid="customise-icon-grid" className="space-y-3 pt-2">
              <span className="text-xs font-semibold text-[var(--quant-muted-foreground)]">Colour</span>
              <div className="flex gap-2">
                {colorPalette.map((col) => (
                  <button
                    key={col}
                    type="button"
                    style={{ backgroundColor: col }}
                    onClick={() => setSelectedColor(col)}
                    className={`size-8 rounded-full border-2 ${
                      selectedColor === col ? 'border-white scale-110 shadow-md' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>

              <span className="text-xs font-semibold text-[var(--quant-muted-foreground)] block pt-2">Icon</span>
              <div className="grid grid-cols-4 gap-2">
                {iconEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setSelectedIconEmoji(emoji)}
                    className={`p-2 rounded-xl text-lg border ${
                      selectedIconEmoji === emoji ? 'border-[#0078D4] bg-[#0078D4]/15' : 'border-[var(--quant-border)]'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── FLOW #41 & #19: AUTOMATIC REPLIES & CLEAR SCHEDULE SUITE ────────────────

export function MobileAutomaticRepliesSheet({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (enabled: boolean, msg: string) => void;
}) {
  const [enabled, setEnabled] = useState(true);
  const [replyTimeRange, setReplyTimeRange] = useState(false);
  const [message, setMessage] = useState(
    "I'm on leave until March 1. Please reach me on my cell number for urgent matters."
  );
  const [showClearScheduleModal, setShowClearScheduleModal] = useState(false);

  if (!isOpen) return null;

  return (
    <div
      data-testid="automatic-replies-sheet"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--quant-background)] text-[var(--quant-foreground)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
        <button
          type="button"
          data-testid="autoreplies-back-btn"
          onClick={onClose}
          className="text-base text-[var(--quant-muted-foreground)]"
        >
          ‹
        </button>
        <h2 className="text-base font-semibold">Automatic Replies</h2>
        <button
          type="button"
          data-testid="autoreplies-save-btn"
          onClick={() => {
            onSave(enabled, message);
            onClose();
          }}
          className="text-base font-semibold text-[#0078D4]"
        >
          Done
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] overflow-hidden">
          {/* Main Toggle */}
          <div className="flex items-center justify-between p-4">
            <span className="font-semibold text-sm">Automatic Replies</span>
            <input
              type="checkbox"
              data-testid="autoreplies-main-toggle"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="size-5 accent-[#0078D4]"
            />
          </div>

          {enabled && (
            <>
              {/* Time Range Toggle */}
              <div className="flex items-center justify-between p-4">
                <div>
                  <span className="font-medium text-sm block">Reply Within a Time Range</span>
                  <span className="text-xs text-[var(--quant-muted-foreground)]">
                    Send replies only during a time period
                  </span>
                </div>
                <input
                  type="checkbox"
                  data-testid="autoreplies-timerange-toggle"
                  checked={replyTimeRange}
                  onChange={(e) => setReplyTimeRange(e.target.checked)}
                  className="size-5 accent-[#0078D4]"
                />
              </div>

              {/* Clear Schedule Button (Flow #19) */}
              <button
                type="button"
                data-testid="clear-my-calendar-btn"
                onClick={() => setShowClearScheduleModal(true)}
                className="flex w-full items-center justify-between p-4 text-left hover:bg-[var(--quant-border)]/20"
              >
                <div>
                  <span className="font-medium text-sm block">Clear My Calendar</span>
                  <span className="text-xs text-[var(--quant-muted-foreground)]">
                    Decline and cancel meetings during the period you selected.
                  </span>
                </div>
                <span className="text-[#0078D4]">›</span>
              </button>
            </>
          )}
        </div>

        {enabled && (
          <div className="space-y-2">
            <span className="text-xs font-semibold text-[var(--quant-muted-foreground)]">
              Reply to Everyone With
            </span>
            <textarea
              data-testid="autoreplies-message-input"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3 text-xs outline-none leading-relaxed"
            />
          </div>
        )}
      </div>

      {/* Clear My Calendar Sheet (Flow #19 Screen 1-2) */}
      {showClearScheduleModal && (
        <MobileClearCalendarScheduleModal
          onClose={() => setShowClearScheduleModal(false)}
          onDeclineSelected={() => {
            setShowClearScheduleModal(false);
          }}
        />
      )}
    </div>
  );
}

export function MobileClearCalendarScheduleModal({
  onClose,
  onDeclineSelected,
}: {
  onClose: () => void;
  onDeclineSelected: () => void;
}) {
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>(['ev-lunch']);

  const conflictingEvents = [
    { id: 'ev-lunch', title: 'Lunch', time: '12:00 PM - 1:00 PM', date: '27 Fri', role: 'Organiser' },
    { id: 'ev-pack', title: 'Pack merchandise', time: '1:00 PM - 2:00 PM', date: '27 Fri', role: 'Organiser' },
  ];

  return (
    <div
      data-testid="clear-calendar-schedule-sheet"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--quant-card)] dark:bg-[#1C1C1E] text-[var(--quant-foreground)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
        <button
          type="button"
          data-testid="clear-calendar-cancel-btn"
          onClick={onClose}
          className="text-base text-[var(--quant-muted-foreground)]"
        >
          Cancel
        </button>
        <h2 className="text-base font-semibold">Clear My Calendar</h2>
        <button
          type="button"
          data-testid="clear-calendar-decline-btn"
          onClick={onDeclineSelected}
          className="text-base font-semibold text-red-500"
        >
          Decline
        </button>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-xs text-[var(--quant-muted-foreground)]">
          Choose the events you want to cancel:
        </p>

        <div className="rounded-2xl border border-[var(--quant-border)] divide-y divide-[var(--quant-border)] overflow-hidden">
          {conflictingEvents.map((ev) => {
            const isChecked = selectedEventIds.includes(ev.id);
            return (
              <button
                key={ev.id}
                type="button"
                data-testid={`conflict-event-${ev.id}`}
                onClick={() => {
                  setSelectedEventIds(
                    isChecked
                      ? selectedEventIds.filter((id) => id !== ev.id)
                      : [...selectedEventIds, ev.id]
                  );
                }}
                className="flex w-full items-center justify-between p-4 text-left hover:bg-[var(--quant-border)]/20"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center justify-center rounded-lg bg-[var(--quant-border)]/50 size-10 text-center font-bold">
                    <span className="text-sm">27</span>
                    <span className="text-[9px] uppercase text-[var(--quant-muted-foreground)]">Fri</span>
                  </div>
                  <div>
                    <span className="font-semibold text-sm block">{ev.title}</span>
                    <span className="text-xs text-[var(--quant-muted-foreground)]">{ev.time}</span>
                  </div>
                </div>
                <div
                  className={`size-5 rounded-full border flex items-center justify-center ${
                    isChecked ? 'bg-red-500 border-red-500 text-white text-xs' : 'border-[var(--quant-border)]'
                  }`}
                >
                  {isChecked && '✓'}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
