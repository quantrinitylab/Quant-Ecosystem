'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal, Avatar, Skeleton, ErrorState } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import {
  useContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
} from '../../hooks/useContacts';
import { useInbox } from '../../hooks/useInbox';
import { useConfirm } from '../../hooks/useConfirm';
import { IconChevronRight, IconStar, IconStarFilled } from '../../components/icons';
import type { Contact } from '../../types';
import { showToast } from '../../components/InboxToast';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');

export default function ContactsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'favorites'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [inspectContact, setInspectContact] = useState<Contact | null>(null);
  const vcardInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    tags: '',
  });

  // Debounce search so we don't hit the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const {
    data: contacts,
    isLoading,
    error,
    refetch,
  } = useContacts({
    q: debouncedQuery || undefined,
    favorites: activeTab === 'favorites' || undefined,
  });
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const { confirm, dialog } = useConfirm();

  const handleOpenCreate = useCallback(() => {
    setFormData({ name: '', email: '', phone: '', company: '', tags: '' });
    setEditingContact(null);
    setShowCreateModal(true);
  }, []);

  useEffect(() => {
    const handler = () => handleOpenCreate();
    window.addEventListener('quant:contacts:create', handler);
    return () => window.removeEventListener('quant:contacts:create', handler);
  }, [handleOpenCreate]);

  const handleOpenEdit = useCallback((contact: Contact, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setFormData({
      name: contact.name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      company: contact.company || '',
      tags: contact.tags?.join(', ') || '',
    });
    setEditingContact(contact);
    setInspectContact(null);
    setShowCreateModal(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!formData.name.trim() || !formData.email.trim()) return;
    const data = {
      name: formData.name.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim() || undefined,
      company: formData.company.trim() || undefined,
      tags: formData.tags
        ? formData.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    };
    try {
      if (editingContact) {
        await updateContact.mutateAsync({ id: editingContact.id, data });
        showToast({ text: `Updated contact ${data.name}`, type: 'success' });
      } else {
        await createContact.mutateAsync(data);
        showToast({ text: `Created contact ${data.name}`, type: 'success' });
      }
      setShowCreateModal(false);
      setEditingContact(null);
    } catch {
      showToast({ text: 'Failed to save contact', type: 'error' });
    }
  }, [formData, editingContact, createContact, updateContact]);

  const handleDelete = useCallback(
    async (id: string, name?: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      const ok = await confirm({
        title: `Delete ${name ? `"${name}"` : 'this contact'}?`,
        message:
          'The contact and its details are removed from your address book. Mail already sent or received is not affected.',
        confirmLabel: 'Delete contact',
        variant: 'destructive',
      });
      if (ok) {
        try {
          await deleteContact.mutateAsync(id);
          setInspectContact(null);
          showToast({ text: 'Contact deleted', type: 'info' });
        } catch {
          showToast({ text: 'Failed to delete contact', type: 'error' });
        }
      }
    },
    [confirm, deleteContact],
  );

  const handleToggleFavorite = useCallback(
    async (contact: Contact, e?: React.MouseEvent) => {
      e?.stopPropagation();
      const next = !contact.isFavorite;
      try {
        await updateContact.mutateAsync({ id: contact.id, data: { isFavorite: next } });
        setInspectContact((prev) =>
          prev && prev.id === contact.id ? { ...prev, isFavorite: next } : prev,
        );
        showToast({
          text: next ? 'Added to favorites' : 'Removed from favorites',
          type: 'success',
        });
      } catch {
        showToast({ text: 'Failed to update favorite', type: 'error' });
      }
    },
    [updateContact],
  );

  // Group contacts alphabetically by first letter
  const groupedContacts = useMemo(() => {
    const list = contacts ?? [];
    const map: Record<string, Contact[]> = {};
    for (const c of list) {
      const letter = (c.name?.[0] || c.email?.[0] || '#').toUpperCase();
      const validKey = /^[A-Z]$/.test(letter) ? letter : '#';
      if (!map[validKey]) map[validKey] = [];
      map[validKey].push(c);
    }
    return Object.keys(map)
      .sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
      .map((letter) => ({
        letter,
        contacts: map[letter].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)),
      }));
  }, [contacts]);

  /**
   * Recent-thread counts, keyed by lowercased address.
   *
   * `useInbox()` with no arguments is the same query the sidebar already runs on
   * every screen, so this is a cache read rather than a second request — and the
   * unified stream it returns holds both received *and* sent messages, which is
   * what makes "threads with this person" the right count instead of "mail from
   * this person". Distinct `threadId`s are counted, so a ten-reply conversation
   * reads as one thread.
   */
  const { data: recentMail } = useInbox();
  const threadCounts = useMemo(() => {
    const threadsByAddress = new Map<string, Set<string>>();
    for (const mail of recentMail ?? []) {
      const conversation = mail.threadId || mail.id;
      const participants = [mail.from, ...(mail.to ?? []), ...(mail.cc ?? [])];
      for (const participant of participants) {
        const address = participant?.email?.toLowerCase();
        if (!address) continue;
        const seen = threadsByAddress.get(address) ?? new Set<string>();
        seen.add(conversation);
        threadsByAddress.set(address, seen);
      }
    }
    const counts: Record<string, number> = {};
    for (const [address, seen] of threadsByAddress) counts[address] = seen.size;
    return counts;
  }, [recentMail]);

  const threadCountFor = useCallback(
    (email?: string) => (email ? threadCounts[email.toLowerCase()] || 0 : 0),
    [threadCounts],
  );

  // Export all contacts as .vcf
  const handleExportVCard = () => {
    const list = contacts ?? [];
    if (list.length === 0) {
      showToast({ text: 'No contacts to export', type: 'info' });
      return;
    }
    let vcf = '';
    for (const c of list) {
      vcf += 'BEGIN:VCARD\r\nVERSION:3.0\r\n';
      vcf += `FN:${c.name || c.email}\r\n`;
      vcf += `EMAIL:${c.email}\r\n`;
      if (c.phone) vcf += `TEL:${c.phone}\r\n`;
      if (c.company) vcf += `ORG:${c.company}\r\n`;
      vcf += 'END:VCARD\r\n';
    }
    const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `QuantContacts_${new Date().toISOString().slice(0, 10)}.vcf`;
    link.click();
    URL.revokeObjectURL(url);
    showToast({ text: `Exported ${list.length} contacts to vCard`, type: 'success' });
  };

  const handleImportVCard = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const cards = text.split(/BEGIN:VCARD/i).slice(1);
    let imported = 0;
    for (const card of cards) {
      const fnMatch = card.match(/FN:(.+)/i);
      const emailMatch = card.match(/EMAIL[^:]*:(.+)/i);
      const telMatch = card.match(/TEL[^:]*:(.+)/i);
      const orgMatch = card.match(/ORG:(.+)/i);
      if (emailMatch && emailMatch[1]) {
        try {
          await createContact.mutateAsync({
            name: fnMatch ? fnMatch[1].trim() : emailMatch[1].trim(),
            email: emailMatch[1].trim(),
            phone: telMatch ? telMatch[1].trim() : undefined,
            company: orgMatch ? orgMatch[1].trim() : undefined,
          });
          imported++;
        } catch {
          // ignore duplicate errors
        }
      }
    }
    showToast({ text: `Imported ${imported} contacts`, type: 'success' });
    e.target.value = '';
  };

  /**
   * The alphabet scrub rail.
   *
   * This used to be a 27-letter strip laid out horizontally above the list, where
   * each target was ~14px wide — unhittable with a thumb, and it stole a whole row
   * of vertical space on the screen that can least afford it. It is now an iOS-style
   * rail pinned to the right edge: one continuous control you drag, with a bubble
   * that magnifies the letter under your finger. `touch-action: none` is what stops
   * the drag from being stolen by the scroll container underneath.
   */
  const streamRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const lastJumpRef = useRef<string | null>(null);
  const [scrub, setScrub] = useState<{ letter: string; y: number } | null>(null);

  const availableLetters = useMemo(
    () => new Set(groupedContacts.map((g) => g.letter)),
    [groupedContacts],
  );

  const jumpToLetter = useCallback((letter: string, smooth: boolean) => {
    const host = streamRef.current;
    const section = document.getElementById(`letter-${letter}`);
    if (!host || !section) return;
    // Rect delta rather than `offsetTop`: the stream is statically positioned, so
    // its children's `offsetParent` is not guaranteed to be the stream itself.
    const delta = section.getBoundingClientRect().top - host.getBoundingClientRect().top;
    host.scrollTo({ top: host.scrollTop + delta - 8, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  /** Empty letters still scrub — they land on the next group that exists. */
  const resolveLetter = useCallback(
    (letter: string) => {
      if (availableLetters.has(letter)) return letter;
      const start = ALPHABET.indexOf(letter);
      for (let i = start; i < ALPHABET.length; i++) {
        if (availableLetters.has(ALPHABET[i])) return ALPHABET[i];
      }
      for (let i = start; i >= 0; i--) {
        if (availableLetters.has(ALPHABET[i])) return ALPHABET[i];
      }
      return null;
    },
    [availableLetters],
  );

  const scrubToClientY = useCallback(
    (clientY: number) => {
      const rail = railRef.current;
      if (!rail) return;
      const rect = rail.getBoundingClientRect();
      const ratio = (clientY - rect.top) / Math.max(1, rect.height);
      const index = Math.min(ALPHABET.length - 1, Math.max(0, Math.floor(ratio * ALPHABET.length)));
      const letter = ALPHABET[index];
      const target = resolveLetter(letter);

      if (target && lastJumpRef.current !== target) {
        lastJumpRef.current = target;
        jumpToLetter(target, false);
        // A short tick per letter crossing, the way a physical detent would feel.
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(6);
        }
      }
      setScrub({ letter, y: clientY });
    },
    [jumpToLetter, resolveLetter],
  );

  const handleRailPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      scrubToClientY(e.clientY);
    },
    [scrubToClientY],
  );

  const handleRailPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      scrubToClientY(e.clientY);
    },
    [scrubToClientY],
  );

  const endScrub = useCallback(() => {
    lastJumpRef.current = null;
    setScrub(null);
  }, []);

  // The rail earns its edge of the screen only once the list is long enough that
  // scrolling to a name is actually work.
  const showScrubRail = (contacts?.length ?? 0) >= 10 && groupedContacts.length > 1;

  return (
    <AppShell
      sidebar={<AppSidebar />}
      theme="dark"
      className="quantmail-shell"
      searchValue={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search contacts by name, email, company…"
    >
      <PageTransition className="workspace-page contacts-workspace flex flex-col h-full bg-[#090A0C]">
        <input
          ref={vcardInputRef}
          type="file"
          accept=".vcf,.vcard"
          className="hidden"
          onChange={handleImportVCard}
        />

        {/* Top Control Bar */}
        <div className="border-b border-[var(--quant-border)] px-4 py-3 sm:px-8 bg-[var(--quant-surface)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-subtle)] p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`inline-flex min-h-11 items-center justify-center rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] sm:min-h-0 ${
                  activeTab === 'all'
                    ? 'bg-[#FF8C42] text-[#111111] font-bold shadow-sm'
                    : 'text-[#A1A4AC] hover:text-white'
                }`}
              >
                All{activeTab === 'all' && contacts ? ` (${contacts.length})` : ''}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('favorites')}
                className={`flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] sm:min-h-0 ${
                  activeTab === 'favorites'
                    ? 'bg-[#2B1A11] text-[#FF8C42] border border-[#5C3016]'
                    : 'text-[#A1A4AC] hover:text-[#F5F5F5]'
                }`}
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill={activeTab === 'favorites' ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <polygon
                    points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>
                  Favorites{activeTab === 'favorites' && contacts ? ` (${contacts.length})` : ''}
                </span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => vcardInputRef.current?.click()}
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-[#282C35] bg-[#16181D] px-3 py-1.5 text-xs text-[#A1A4AC] transition-colors hover:border-[#3A404D] hover:text-[#F5F5F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] sm:min-h-0"
              title="Import vCard .vcf"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              <span>Import</span>
            </button>
            <button
              type="button"
              onClick={handleExportVCard}
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-[#282C35] bg-[#16181D] px-3 py-1.5 text-xs text-[#A1A4AC] transition-colors hover:border-[#3A404D] hover:text-[#F5F5F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] sm:min-h-0"
              title="Export to vCard .vcf"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span>Export</span>
            </button>

            {/*
             * Desktop only. On mobile the shell already floats a create FAB that
             * dispatches `quant:contacts:create` (handled above), so shipping this
             * button too put two identical actions on a 393px screen.
             */}
            <div className="hidden md:block">
              <Button variant="primary" onClick={handleOpenCreate}>
                + New Contact
              </Button>
            </div>
          </div>
        </div>

        {/* Contacts Stream Grouped Alphabetically */}
        <div className="relative flex-1 overflow-hidden">
          <div
            ref={streamRef}
            className={`h-full overflow-y-auto px-4 py-6 sm:px-8 space-y-6 ${
              showScrubRail ? 'pr-9 sm:pr-12' : ''
            }`}
          >
            {isLoading && (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} variant="rect" width="100%" height="72px" />
                ))}
              </div>
            )}

            {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}

            {!isLoading && !error && (!contacts || contacts.length === 0) && (
              <div className="text-center py-16 space-y-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#16181D] border border-[#282C35] mx-auto text-[#6B6E76]">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
                    />
                    <circle cx="9" cy="7" r="4" strokeWidth={1.8} />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-[#F5F5F5]">
                  {searchQuery
                    ? 'No contacts matched your search'
                    : activeTab === 'favorites'
                      ? 'No favorites yet'
                      : 'Your address book is empty'}
                </h3>
                <p className="text-xs text-[#A1A4AC] max-w-sm mx-auto">
                  {activeTab === 'favorites' && !searchQuery
                    ? 'Tap the star on any contact to pin it here for quick access.'
                    : 'Add contacts or import a .vcf file to start emailing and scheduling meetings.'}
                </p>
                <div className="pt-2 flex items-center justify-center gap-2">
                  {activeTab === 'favorites' && !searchQuery ? (
                    <Button variant="secondary" onClick={() => setActiveTab('all')}>
                      Browse all contacts
                    </Button>
                  ) : (
                    <>
                      <Button variant="primary" onClick={handleOpenCreate}>
                        + Add first contact
                      </Button>
                      <Button variant="secondary" onClick={() => vcardInputRef.current?.click()}>
                        Import vCard
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}

            {!isLoading && !error && groupedContacts.length > 0 && (
              <div className="space-y-6">
                {groupedContacts.map((group) => (
                  <section key={group.letter} id={`letter-${group.letter}`} className="space-y-2">
                    <h3 className="sticky top-0 z-10 text-xs font-extrabold uppercase tracking-widest text-[#FF8C42] bg-[#090A0C]/90 backdrop-blur-sm py-1">
                      {group.letter} ({group.contacts.length})
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                      {group.contacts.map((contact) => {
                        const threads = threadCountFor(contact.email);
                        return (
                          <div
                            key={contact.id}
                            onClick={() => setInspectContact(contact)}
                            className="group flex flex-col justify-between p-4 rounded-2xl border border-[#282C35] bg-[#16181D] hover:border-[#FF8C42]/50 hover:bg-[#1C1F26] transition-all shadow-sm cursor-pointer"
                          >
                            <div className="flex items-start gap-3">
                              <Avatar
                                name={contact.name || contact.email}
                                src={contact.avatarUrl}
                                size="md"
                              />
                              <div className="min-w-0 flex-1">
                                <h4 className="text-sm font-semibold text-[#F5F5F5] truncate group-hover:text-[#FF9B5A] transition-colors flex items-center gap-1.5">
                                  <span className="truncate">{contact.name || contact.email}</span>
                                  {contact.isFavorite && (
                                    <svg
                                      className="w-3 h-3 shrink-0 text-[#FFB020]"
                                      fill="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                    </svg>
                                  )}
                                </h4>
                                <p className="text-xs text-[#A1A4AC] truncate">{contact.email}</p>
                                {contact.company && (
                                  <p className="text-[11px] text-[#A1A4AC] mt-0.5 truncate flex items-center gap-1">
                                    <svg
                                      className="w-3 h-3 text-[#6B6E76]"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.8}
                                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                                      />
                                    </svg>
                                    <span>{contact.company}</span>
                                  </p>
                                )}
                                {contact.phone && (
                                  <p className="text-[11px] text-[#A1A4AC] truncate flex items-center gap-1">
                                    <svg
                                      className="w-3 h-3 text-[#6B6E76]"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.8}
                                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                      />
                                    </svg>
                                    <span>{contact.phone}</span>
                                  </p>
                                )}
                                {contact.tags && contact.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {contact.tags.slice(0, 3).map((tag) => (
                                      <span
                                        key={tag}
                                        className="px-1.5 py-0.5 rounded-md bg-[#2B1A11] border border-[#5C3016]/60 text-[10px] font-semibold text-[#FF9B5A]"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                    {contact.tags.length > 3 && (
                                      <span className="px-1.5 py-0.5 rounded-md bg-[#111318] border border-[#282C35] text-[10px] text-[#A1A4AC]">
                                        +{contact.tags.length - 3}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/*
                               * How much history you actually have with this person, read
                               * off the unified stream. Deliberately a label and not a
                               * button: at this size no interactive target could reach
                               * 44px, so the tap belongs to the card, which opens the
                               * dossier where "View N threads" is a proper control.
                               */}
                              {threads > 0 && (
                                <span
                                  className="shrink-0 rounded-md bg-[#111318] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[#A1A4AC] shadow-[inset_0_0_0_1px_#282C35]"
                                  title={`${threads} recent thread${threads === 1 ? '' : 's'} with ${contact.email}`}
                                >
                                  {threads}
                                  <span className="ml-0.5 font-medium text-[#A1A4AC]">
                                    {threads === 1 ? 'thread' : 'threads'}
                                  </span>
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-between border-t border-[#282C35] mt-3 pt-3">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/compose?to=${encodeURIComponent(contact.email)}`);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-[#2B1A11] border border-[#5C3016] text-[#FF9B5A] text-xs font-semibold hover:bg-[#3D2315] transition-colors flex items-center gap-1"
                                >
                                  <svg
                                    className="w-3 h-3"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={1.8}
                                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                    />
                                  </svg>
                                  <span>Email</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(
                                      `/calendar?attendee=${encodeURIComponent(contact.email)}`,
                                    );
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-[#111318] border border-[#282C35] text-[#A1A4AC] text-xs font-medium hover:text-[#F5F5F5] hover:border-[#3A404D] transition-colors flex items-center gap-1"
                                >
                                  <svg
                                    className="w-3 h-3"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <rect
                                      x="3"
                                      y="4"
                                      width="18"
                                      height="18"
                                      rx="2"
                                      strokeWidth={1.8}
                                    />
                                    <line
                                      x1="16"
                                      y1="2"
                                      x2="16"
                                      y2="6"
                                      strokeWidth={1.8}
                                      strokeLinecap="round"
                                    />
                                    <line
                                      x1="8"
                                      y1="2"
                                      x2="8"
                                      y2="6"
                                      strokeWidth={1.8}
                                      strokeLinecap="round"
                                    />
                                    <line x1="3" y1="10" x2="21" y2="10" strokeWidth={1.8} />
                                  </svg>
                                  <span>Meet</span>
                                </button>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => handleToggleFavorite(contact, e)}
                                  className={`p-1.5 rounded-lg transition-colors hover:bg-white/5 ${
                                    contact.isFavorite
                                      ? 'text-[#FFB020]'
                                      : 'text-[#6B6E76] hover:text-[#FFB020]'
                                  }`}
                                  title={
                                    contact.isFavorite
                                      ? 'Remove from favorites'
                                      : 'Add to favorites'
                                  }
                                  aria-label={
                                    contact.isFavorite
                                      ? 'Remove from favorites'
                                      : 'Add to favorites'
                                  }
                                >
                                  <svg
                                    className="w-3.5 h-3.5"
                                    fill={contact.isFavorite ? 'currentColor' : 'none'}
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <polygon
                                      points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                                      strokeWidth={1.8}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenEdit(contact, e)}
                                  className="p-1.5 text-[#6B6E76] hover:text-[#F5F5F5] hover:bg-white/5 rounded-lg transition-colors"
                                  title="Edit contact"
                                >
                                  <svg
                                    className="w-3.5 h-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={1.8}
                                      d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={1.8}
                                      d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                                    />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleDelete(contact.id, contact.name, e)}
                                  className="p-1.5 text-[#6B6E76] hover:text-[#F87171] hover:bg-[#2A1215] rounded-lg transition-colors"
                                  title="Delete contact"
                                >
                                  <svg
                                    className="w-3.5 h-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <polyline
                                      points="3 6 5 6 21 6"
                                      strokeWidth={1.8}
                                      strokeLinecap="round"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={1.8}
                                      d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                                    />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          {/*
           * The rail itself. Every letter is a real button so a keyboard or screen
           * reader can jump without dragging, while pointer capture on the wrapper
           * turns the whole column into one continuous scrub. It stops short of the
           * bottom on mobile because the shell's create FAB lives at `bottom-20`.
           */}
          {showScrubRail && (
            <div
              ref={railRef}
              onPointerDown={handleRailPointerDown}
              onPointerMove={handleRailPointerMove}
              onPointerUp={endScrub}
              onPointerCancel={endScrub}
              onLostPointerCapture={endScrub}
              role="navigation"
              aria-label="Jump to letter"
              className="absolute bottom-24 right-0.5 top-2 z-20 flex w-8 select-none flex-col items-stretch [touch-action:none] sm:right-1.5 md:bottom-3"
            >
              {ALPHABET.map((letter) => {
                /*
                 * A letter with no contacts is still a live jump target —
                 * `resolveLetter` falls through to the nearest section — so it
                 * is not disabled and owes the full 4.5:1. It was #3A404D
                 * (1.91:1), invisible. Both ends move up rather than the quiet
                 * end alone: #A1A4AC is the floor for text, so flattening onto
                 * it would erase the "has contacts" signal the rail exists to
                 * give.
                 */
                const exists = availableLetters.has(letter);
                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => {
                      const target = resolveLetter(letter);
                      if (target) jumpToLetter(target, true);
                    }}
                    aria-label={`Jump to ${letter === '#' ? 'other' : letter}`}
                    className={`flex flex-1 items-center justify-center rounded text-[10px] font-bold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                      exists ? 'text-[#F5F5F5] hover:text-[#FF8C42]' : 'text-[#A1A4AC]'
                    }`}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          )}

          {/* The magnified letter under the finger — the rail's only feedback. */}
          {scrub && (
            <div
              aria-hidden="true"
              className="pointer-events-none fixed right-11 z-40 grid size-14 place-items-center rounded-2xl bg-[#16181D] text-2xl font-black text-[#FF8C42] shadow-[0_4px_16px_rgba(0,0,0,0.6)] sm:right-14"
              style={{ top: scrub.y - 28 }}
            >
              {scrub.letter}
            </div>
          )}
        </div>

        {/* Contact Inspector Modal */}
        <Modal
          isOpen={!!inspectContact}
          onClose={() => setInspectContact(null)}
          title={inspectContact?.name || 'Contact Details'}
        >
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#111318] border border-[#282C35]">
              <Avatar
                name={inspectContact?.name || inspectContact?.email}
                src={inspectContact?.avatarUrl}
                size="lg"
              />
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>{inspectContact?.name}</span>
                  {inspectContact?.isFavorite && (
                    <svg className="w-4 h-4 text-[#FFB020]" fill="currentColor" viewBox="0 0 24 24">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  )}
                </h3>
                <p className="text-xs text-[#A1A4AC]">{inspectContact?.email}</p>
                {inspectContact?.company && (
                  <p className="text-xs text-[#FF8C42] mt-0.5 flex items-center gap-1.5">
                    <svg
                      className="size-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                      <line x1="9" y1="22" x2="9" y2="22.01" />
                      <line x1="15" y1="22" x2="15" y2="22.01" />
                      <line x1="9" y1="18" x2="9" y2="18.01" />
                      <line x1="15" y1="18" x2="15" y2="18.01" />
                      <line x1="9" y1="14" x2="9" y2="14.01" />
                      <line x1="15" y1="14" x2="15" y2="14.01" />
                      <line x1="9" y1="10" x2="9" y2="10.01" />
                      <line x1="15" y1="10" x2="15" y2="10.01" />
                      <line x1="9" y1="6" x2="9" y2="6.01" />
                      <line x1="15" y1="6" x2="15" y2="6.01" />
                    </svg>
                    <span>{inspectContact.company}</span>
                  </p>
                )}
              </div>
            </div>

            {inspectContact?.tags && inspectContact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {inspectContact.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-md bg-[#2B1A11] border border-[#5C3016]/60 text-[10px] font-semibold text-[#FF9B5A]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="space-y-2 text-xs">
              {inspectContact?.phone && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#111318]/60 border border-[#282C35]">
                  <span className="text-[#A1A4AC]">Phone Number</span>
                  <a
                    href={`tel:${inspectContact.phone}`}
                    className="font-mono font-semibold text-[#F5F5F5] hover:text-[#FF8C42]"
                  >
                    {inspectContact.phone}
                  </a>
                </div>
              )}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#111318]/60 border border-[#282C35]">
                <span className="text-[#A1A4AC]">Email Address</span>
                <a
                  href={`mailto:${inspectContact?.email}`}
                  className="font-mono font-semibold text-[#F5F5F5] hover:text-[#FF8C42]"
                >
                  {inspectContact?.email}
                </a>
              </div>

              {/* The card's thread count, here as something you can actually open. */}
              {threadCountFor(inspectContact?.email) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (inspectContact?.email) {
                      router.push(`/search?q=${encodeURIComponent(inspectContact.email)}`);
                    }
                  }}
                  className="flex min-h-touch w-full items-center justify-between rounded-xl bg-[#111318]/60 p-2.5 text-left shadow-[inset_0_0_0_1px_#282C35] transition-colors hover:bg-[#16181D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                >
                  <span className="text-[#A1A4AC]">Recent Conversations</span>
                  <span className="flex items-center gap-1.5 font-semibold text-[#FF8C42]">
                    View {threadCountFor(inspectContact?.email)}{' '}
                    {threadCountFor(inspectContact?.email) === 1 ? 'thread' : 'threads'}
                    <IconChevronRight size={13} />
                  </span>
                </button>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#282C35]">
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    if (inspectContact?.email) {
                      router.push(`/compose?to=${encodeURIComponent(inspectContact.email)}`);
                    }
                  }}
                  className="flex items-center gap-1.5"
                >
                  <svg
                    className="size-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  Compose Email
                </Button>
                {inspectContact && (
                  <Button
                    variant="secondary"
                    onClick={() => handleToggleFavorite(inspectContact)}
                    className="flex items-center gap-1.5"
                  >
                    {inspectContact.isFavorite ? (
                      <IconStarFilled size={14} />
                    ) : (
                      <IconStar size={14} />
                    )}
                    {inspectContact.isFavorite ? 'Favorited' : 'Favorite'}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {inspectContact && (
                  <Button variant="secondary" onClick={(e) => handleOpenEdit(inspectContact, e)}>
                    Edit
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setInspectContact(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </Modal>

        {/* Create / Edit Contact Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setEditingContact(null);
          }}
          title={editingContact ? 'Edit Contact' : 'Create New Contact'}
        >
          <div className="p-4 space-y-3">
            <div>
              <label
                htmlFor="contact-name"
                className="block text-xs font-semibold text-[#A1A4AC] mb-1"
              >
                Full Name *
              </label>
              <input
                id="contact-name"
                name="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Sundar Pichai"
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-[#A1A4AC] focus:outline-none focus:border-[#FF8C42]"
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor="contact-email"
                className="block text-xs font-semibold text-[#A1A4AC] mb-1"
              >
                Email Address *
              </label>
              <input
                id="contact-email"
                name="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="e.g. sundar@quantmail.in"
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-[#A1A4AC] focus:outline-none focus:border-[#FF8C42]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="contact-phone"
                  className="block text-xs font-semibold text-[#A1A4AC] mb-1"
                >
                  Phone
                </label>
                <input
                  id="contact-phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-[#A1A4AC] focus:outline-none focus:border-[#FF8C42]"
                />
              </div>
              <div>
                <label
                  htmlFor="contact-company"
                  className="block text-xs font-semibold text-[#A1A4AC] mb-1"
                >
                  Company
                </label>
                <input
                  id="contact-company"
                  name="company"
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="e.g. Quantrinity"
                  className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-[#A1A4AC] focus:outline-none focus:border-[#FF8C42]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="contact-tags"
                className="block text-xs font-semibold text-[#A1A4AC] mb-1"
              >
                Tags (comma-separated)
              </label>
              <input
                id="contact-tags"
                name="tags"
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="Team, VIP, Client…"
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-[#A1A4AC] focus:outline-none focus:border-[#FF8C42]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingContact(null);
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSave}>
                {editingContact ? 'Save Changes' : 'Create Contact'}
              </Button>
            </div>
          </div>
        </Modal>
        {dialog}
      </PageTransition>
    </AppShell>
  );
}
