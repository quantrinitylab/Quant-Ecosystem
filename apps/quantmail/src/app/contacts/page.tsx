'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Modal, Avatar, Skeleton, ErrorState } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { ContactsLetterIndex } from '../../components/ContactsLetterIndex';
import { ContactsPagination } from '../../components/ContactsPagination';
import { getContactPageCorrection } from '../../lib/contacts-pagination';
import {
  useContactsPage,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
} from '../../hooks/useContacts';
import {
  useContactGroups,
  useCreateContactGroup,
  useUpdateContactGroup,
  useDeleteContactGroup,
} from '../../hooks/useContactGroups';
import { useInbox } from '../../hooks/useInbox';
import { useConfirm } from '../../hooks/useConfirm';
import { ContactsDedupeModal } from './components/ContactsDedupeModal';
import { ContactGroupModal } from './components/ContactGroupModal';
import {
  ContactDetailSheet,
  CompaniesSubView,
  DedupWizardSubView,
  CirclesSubView,
  contactDisplayName,
} from './components/ContactsSubViews';
import type { Contact, ContactGroup } from '../../types';
import { showToast } from '../../components/InboxToast';
import { apiClient } from '../../services/api-client';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');

export default function ContactsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'favorites' | 'groups' | 'companies' | 'dedup'>('all');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ContactGroup | null>(null);
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDedupeModal, setShowDedupeModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const [isDedupMerged, setIsDedupMerged] = useState(false);
  const vcardInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    tags: '',
  });

  // Sync tab from URL query params
  useEffect(() => {
    if (tabParam === 'favorites' || tabParam === 'vips') {
      setActiveTab('favorites');
    } else if (tabParam === 'groups' || tabParam === 'circles') {
      setActiveTab('groups');
    } else if (tabParam === 'companies') {
      setActiveTab('companies');
    } else if (tabParam === 'dedup') {
      setActiveTab('dedup');
    } else if (tabParam === 'home' || tabParam === 'all' || tabParam === 'contacts') {
      setActiveTab('all');
    }
  }, [tabParam]);

  // Debounce search query
  useEffect(() => {
    const nextQuery = searchQuery.trim();
    if (nextQuery === debouncedQuery) return;
    const t = setTimeout(() => {
      setDebouncedQuery(nextQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, debouncedQuery]);

  const {
    data: contactPage,
    isLoading: pageLoading,
    isFetching,
    error,
    refetch,
  } = useContactsPage({
    q: debouncedQuery || undefined,
    favorites: activeTab === 'favorites' || undefined,
    page,
  });

  const contacts = contactPage?.contacts;
  const pagination = contactPage?.pagination;
  const pageCorrection = !isFetching && !error ? getContactPageCorrection(page, pagination) : null;
  const isLoading = pageLoading || pageCorrection !== null;

  useEffect(() => {
    if (pageCorrection !== null) {
      setPage(pageCorrection);
    }
  }, [pageCorrection]);

  // Re-tap active app tab → refresh contacts list (P1: app-switcher refresh)
  useEffect(() => {
    const handleRefresh = () => {
      void refetch();
    };
    window.addEventListener('quant:refresh', handleRefresh);
    return () => window.removeEventListener('quant:refresh', handleRefresh);
  }, [refetch]);

  const handleTabChange = useCallback((tab: 'all' | 'favorites' | 'groups' | 'companies' | 'dedup') => {
    setActiveTab(tab);
    setPage(1);
    if (tab === 'groups') {
      setSelectedGroupId(null);
    }
  }, []);

  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const { data: contactGroups = [] } = useContactGroups();
  const createContactGroup = useCreateContactGroup();
  const updateContactGroup = useUpdateContactGroup();
  const deleteContactGroup = useDeleteContactGroup();
  const { confirm, dialog } = useConfirm();

  const handleSaveGroup = useCallback(
    async (data: { name: string; emails: string[]; color: string | null }) => {
      try {
        if (editingGroup) {
          await updateContactGroup.mutateAsync({ id: editingGroup.id, data });
          showToast({ text: `Updated group "${data.name}"`, type: 'success' });
        } else {
          await createContactGroup.mutateAsync(data);
          showToast({ text: `Created group "${data.name}"`, type: 'success' });
        }
        setShowGroupModal(false);
        setEditingGroup(null);
      } catch {
        showToast({ text: 'Failed to save group', type: 'error' });
      }
    },
    [editingGroup, updateContactGroup, createContactGroup],
  );

  const handleDeleteGroup = useCallback(
    async (groupId: string) => {
      const ok = await confirm({
        title: 'Delete this group?',
        message: 'The group will be deleted. The contacts themselves will not be removed.',
        confirmLabel: 'Delete group',
        variant: 'destructive',
      });
      if (ok) {
        try {
          await deleteContactGroup.mutateAsync(groupId);
          if (selectedGroupId === groupId) {
            setSelectedGroupId(null);
          }
          setShowGroupModal(false);
          setEditingGroup(null);
          showToast({ text: 'Group deleted', type: 'info' });
        } catch {
          showToast({ text: 'Failed to delete group', type: 'error' });
        }
      }
    },
    [confirm, deleteContactGroup, selectedGroupId],
  );

  const activeGroup = useMemo(
    () => contactGroups.find((g) => g.id === selectedGroupId),
    [contactGroups, selectedGroupId],
  );

  const displayedContacts = useMemo(() => {
    const list = contacts ?? [];
    if (!activeGroup) return list;
    const groupEmails = new Set((activeGroup.emails || []).map((e) => e.toLowerCase()));
    return list.filter(
      (c) =>
        (c.email && groupEmails.has(c.email.toLowerCase())) ||
        (c.tags && c.tags.includes(activeGroup.name)),
    );
  }, [contacts, activeGroup]);

  // Keep selected contact updated or auto-select first on desktop
  useEffect(() => {
    if (!selectedContact && displayedContacts.length > 0) {
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        setSelectedContact(displayedContacts[0]);
      }
    } else if (selectedContact) {
      const updated = displayedContacts.find((c) => c.id === selectedContact.id);
      if (updated && updated !== selectedContact) {
        setSelectedContact(updated);
      }
    }
  }, [displayedContacts, selectedContact]);

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setShowMobileSheet(true);
    }
  };

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
    setShowCreateModal(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!formData.name.trim() || !formData.email.trim()) {
      showToast({ text: 'Name and email are required', type: 'error' });
      return;
    }
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
          if (selectedContact?.id === id) {
            setSelectedContact(null);
          }
          setShowMobileSheet(false);
          showToast({ text: 'Contact deleted', type: 'info' });
        } catch {
          showToast({ text: 'Failed to delete contact', type: 'error' });
        }
      }
    },
    [confirm, deleteContact, selectedContact],
  );

  const handleToggleFavorite = useCallback(
    async (contact: Contact, e?: React.MouseEvent) => {
      e?.stopPropagation();
      const next = !contact.isFavorite;
      try {
        await updateContact.mutateAsync({ id: contact.id, data: { isFavorite: next } });
        setSelectedContact((prev) =>
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
    const list = displayedContacts ?? [];
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
        // Contacts may lack both name and email (phone-only records) — fall
        // back to '' so the comparator never throws on undefined.
        contacts: map[letter].sort((a, b) =>
          (a.name || a.email || '').localeCompare(b.name || b.email || ''),
        ),
      }));
  }, [displayedContacts]);

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

  // Export current page contacts as vCard
  const downloadBlobResponse = useCallback(async (response: Response, filename: string, emptyText: string) => {
    if (!response.ok) {
      showToast({ text: emptyText, type: 'error' });
      return;
    }
    const blob = await response.blob();
    if (blob.size === 0) {
      showToast({ text: 'No contacts to export', type: 'info' });
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, []);

  const handleExportVCard = useCallback(async () => {
    try {
      const response = await apiClient.exportContactsVCard();
      const date = new Date().toISOString().slice(0, 10);
      await downloadBlobResponse(response, `QuantContacts_${date}.vcf`, 'Export failed');
      if (response.ok) {
        showToast({ text: 'Exported all contacts to vCard', type: 'success' });
      }
    } catch {
      showToast({ text: 'Export failed', type: 'error' });
    }
  }, [downloadBlobResponse]);

  const handleExportCsv = useCallback(async () => {
    try {
      const response = await apiClient.exportContactsCsv();
      const date = new Date().toISOString().slice(0, 10);
      await downloadBlobResponse(response, `QuantContacts_${date}.csv`, 'Export failed');
      if (response.ok) {
        showToast({ text: 'Exported all contacts to CSV', type: 'success' });
      }
    } catch {
      showToast({ text: 'Export failed', type: 'error' });
    }
  }, [downloadBlobResponse]);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isCsv = /\.csv$/i.test(file.name);
    try {
      const text = await file.text();
      if (!text.trim()) {
        showToast({ text: 'No contacts found in file', type: 'warning' });
        return;
      }
      const result = isCsv
        ? await apiClient.importContactsCsv(text)
        : await apiClient.importContactsVCard(text);
      if (!result.success || !result.data) {
        showToast({ text: 'Import failed', type: 'error' });
        return;
      }
      const { imported, duplicates, errors, total } = result.data;
      if (imported > 0) {
        const parts = [`Imported ${imported} contact${imported === 1 ? '' : 's'}`];
        if (duplicates > 0) parts.push(`${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped`);
        if (errors > 0) parts.push(`${errors} failed`);
        showToast({ text: parts.join(' · '), type: 'success' });
        refetch();
      } else if (total === 0) {
        showToast({ text: 'No contacts found in file', type: 'warning' });
      } else {
        showToast({ text: `No new contacts imported (${duplicates} duplicates)`, type: 'info' });
      }
    } catch {
      showToast({ text: 'Import failed', type: 'error' });
    } finally {
      e.target.value = '';
    }
  };

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
    const delta = section.getBoundingClientRect().top - host.getBoundingClientRect().top;
    host.scrollTo({ top: host.scrollTop + delta - 8, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

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

  const [activeLetter, setActiveLetter] = useState<string | null>(null);

  useEffect(() => {
    const host = streamRef.current;
    if (!host) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const edge = host.getBoundingClientRect().top + 12;
      let current: string | null = null;
      for (const group of groupedContacts) {
        const section = document.getElementById(`letter-${group.letter}`);
        if (section && section.getBoundingClientRect().top <= edge) current = group.letter;
      }
      setActiveLetter(current ?? groupedContacts[0]?.letter ?? null);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    host.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      host.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [groupedContacts]);

  const jumpFromSidebar = useCallback(
    (letter: string) => {
      window.dispatchEvent(new CustomEvent('quant:sidebar:close'));
      jumpToLetter(letter, true);
    },
    [jumpToLetter],
  );

  const letterGroups = useMemo(
    () => groupedContacts.map((group) => ({ letter: group.letter, count: group.contacts.length })),
    [groupedContacts],
  );

  const hasContacts = (contacts?.length ?? 0) > 0;
  const railEarnsThumb = groupedContacts.length > 1;
  const showScrubRail = hasContacts && groupedContacts.length > 1;

  return (
    <AppShell
      sidebar={
        <AppSidebar
          extra={
            <ContactsLetterIndex
              groups={letterGroups}
              activeLetter={activeLetter}
              onJump={jumpFromSidebar}
            />
          }
        />
      }
      theme="dark"
      className="quantmail-shell"
      searchValue={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search contacts by name, email, company…"
    >
      <div className="workspace-page contacts-workspace flex flex-col h-full bg-[var(--quant-background)] overflow-hidden">
        <input
          ref={vcardInputRef}
          type="file"
          aria-label="Import contacts file"
          accept=".vcf,.vcard,.csv"
          className="hidden"
          onChange={handleImportFile}
        />

        {/* ================================================================== */}
        {/* SUBVIEWS DISPATCHER: Companies, Dedup, Circles, or Split-Pane      */}
        {/* ================================================================== */}
        {activeTab === 'companies' ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8">
            <CompaniesSubView
              contacts={displayedContacts}
              onInspect={(c) => {
                setSelectedContact(c);
                setShowMobileSheet(true);
              }}
              onCall={(c) => {
                if (c.phone) window.location.href = `tel:${c.phone}`;
              }}
              onEmail={(email) => {
                router.push(`/compose?to=${encodeURIComponent(email)}`);
              }}
            />
          </div>
        ) : activeTab === 'dedup' ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8">
            <DedupWizardSubView
              isMerged={isDedupMerged}
              onMerge={() => {
                setIsDedupMerged(true);
                showToast({ text: 'Merged duplicate contacts successfully', type: 'success' });
              }}
              onKeepSeparate={() => {
                showToast({ text: 'Records preserved separately', type: 'info' });
              }}
              onOpenFullModal={() => setShowDedupeModal(true)}
              onRescan={() => {
                setIsDedupMerged(false);
                showToast({ text: 'Re-scanning address book…', type: 'info' });
              }}
            />
          </div>
        ) : activeTab === 'groups' && contactGroups.length === 0 ? (
          /* Empty Groups state -> Circles view */
          <div className="flex-1 overflow-y-auto p-4 sm:p-8">
            <CirclesSubView
              contacts={displayedContacts}
              onBroadcast={(emails) => {
                router.push(`/compose?to=${encodeURIComponent(emails.join(','))}`);
              }}
              onViewCircle={(circle) => {
                showToast({ text: `Viewing circle: ${circle.name}`, type: 'info' });
              }}
            />
          </div>
        ) : (
          /* ================================================================ */
          /* APPLE / GOOGLE CONTACTS SPLIT-PANE ERGONOMICS                    */
          /* Left Pane (360px sticky) + Right Pane (flex-1 full-bleed)        */
          /* ================================================================ */
          <div className="flex-1 flex flex-row h-full overflow-hidden">
            {/* ------------------------------------------------------------ */}
            {/* LEFT PANE: 360px Width, Sticky Scrollable Contact List       */}
            {/* ------------------------------------------------------------ */}
            <div className="w-full md:w-[360px] md:min-w-[360px] md:max-w-[360px] shrink-0 border-r border-[#232938] flex flex-col h-full bg-[#0C0E14] relative z-10">
              {/* Left Pane Top Controls */}
              <div className="p-3 border-b border-[#232938] bg-[#0E1118] space-y-2.5 shrink-0">
                {/* Search Bar with Icon */}
                <div className="relative flex items-center">
                  <svg
                    className="absolute left-3 size-3.5 text-[#6B7280] pointer-events-none"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search contacts…"
                    className="w-full pl-9 pr-7 py-1.5 rounded-xl border border-[#232938] bg-[var(--quant-surface-elevated)] text-xs text-white placeholder-[#6B7280] focus:outline-none focus:border-[var(--quant-primary)] transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 text-[#6B7280] hover:text-white"
                      title="Clear search"
                    >
                      <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Filter Tabs: All, Favorites, Add Group */}
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center rounded-xl border border-[#232938] bg-[var(--quant-surface-elevated)] p-0.5 flex-1">
                    <button
                      type="button"
                      onClick={() => handleTabChange('all')}
                      className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        activeTab === 'all' && !selectedGroupId
                          ? 'bg-[var(--quant-primary)] text-black font-bold shadow-sm'
                          : 'text-[#A1A4AC] hover:text-white'
                      }`}
                    >
                      All{activeTab === 'all' && pagination ? ` (${pagination.total})` : ''}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleTabChange('favorites')}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        activeTab === 'favorites'
                          ? 'bg-[var(--quant-primary)]/20 text-[var(--quant-primary)] border border-[var(--quant-primary)]/40 shadow-sm'
                          : 'text-[#A1A4AC] hover:text-white'
                      }`}
                    >
                      <svg className="size-3" viewBox="0 0 24 24" fill={activeTab === 'favorites' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                      <span>Favorites</span>
                    </button>
                  </div>

                  {/* Add Group Action */}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingGroup(null);
                      setShowGroupModal(true);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-dashed border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] text-xs font-semibold text-[#A1A4AC] hover:text-[var(--quant-primary)] hover:border-[var(--quant-primary)]/40 transition-colors shrink-0"
                    title="Add Folder / Group"
                  >
                    <span>+ Group</span>
                  </button>
                </div>

                {/* Group Filter Chips (if any exist) */}
                {contactGroups.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
                    {contactGroups.map((grp) => {
                      const isSelected = selectedGroupId === grp.id;
                      return (
                        <button
                          key={grp.id}
                          type="button"
                          onClick={() => {
                            setSelectedGroupId(isSelected ? null : grp.id);
                            setPage(1);
                          }}
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium border transition-colors shrink-0 ${
                            isSelected
                              ? 'border-[var(--quant-primary)]/40 bg-[var(--quant-primary)]/15 text-[var(--quant-primary)] font-semibold'
                              : 'border-white/[0.08] bg-white/[0.03] text-[#A1A4AC] hover:text-white'
                          }`}
                        >
                          <span
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: grp.color || 'var(--quant-primary)' }}
                          />
                          <span className="truncate max-w-[90px]">{grp.name}</span>
                          <span className="text-[var(--q-type-xs)] text-[#6B7280]">({(grp.emails || []).length})</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Quick Secondary Actions Bar */}
                <div className="flex items-center justify-between gap-1 pt-1 border-t border-[#1C2230]">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => vcardInputRef.current?.click()}
                      className="px-2 py-1 rounded-lg border border-[#232938] bg-[var(--quant-surface-elevated)] text-[11px] text-[#A1A4AC] hover:text-white transition-colors"
                      title="Import vCard or CSV"
                    >
                      Import
                    </button>
                    <button
                      type="button"
                      onClick={handleExportVCard}
                      className="px-2 py-1 rounded-lg border border-[#232938] bg-[var(--quant-surface-elevated)] text-[11px] text-[#A1A4AC] hover:text-white transition-colors disabled:opacity-40"
                      title="Export all contacts as vCard"
                    >
                      Export vCard
                    </button>
                    <button
                      type="button"
                      onClick={handleExportCsv}
                      className="px-2 py-1 rounded-lg border border-[#232938] bg-[var(--quant-surface-elevated)] text-[11px] text-[#A1A4AC] hover:text-white transition-colors disabled:opacity-40"
                      title="Export all contacts as CSV"
                    >
                      Export CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDedupeModal(true)}
                      className="px-2 py-1 rounded-lg border border-[#232938] bg-[var(--quant-surface-elevated)] text-[11px] text-[#A1A4AC] hover:text-[var(--quant-primary)] transition-colors"
                      title="Merge duplicates"
                    >
                      Dedupe
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenCreate}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--quant-primary)] hover:bg-[var(--quant-primary-hover)] text-black text-xs font-bold transition-all shadow-sm"
                  >
                    <span>+ New</span>
                  </button>
                </div>
              </div>

              {/* Pagination Controls */}
              <div className="shrink-0 border-b border-[#232938]">
                <ContactsPagination
                  page={page}
                  pagination={pagination}
                  isFetching={isFetching || pageCorrection !== null || searchQuery.trim() !== debouncedQuery}
                  hasError={!!error}
                  onPageChange={(nextPage) => {
                    setPage(nextPage);
                    streamRef.current?.scrollTo({ top: 0, behavior: 'auto' });
                  }}
                />
              </div>

              {/* Contacts Scroll Stream with safe mobile pb-24 */}
              <div className="relative flex-1 overflow-hidden">
                <div
                  ref={streamRef}
                  className={`h-full overflow-y-auto p-3 space-y-4 pb-24 md:pb-6 ${
                    showScrubRail ? (railEarnsThumb ? 'pr-7' : 'pr-7') : ''
                  }`}
                >
                  {isLoading && (
                    <div className="space-y-3">
                      {Array.from({ length: 7 }).map((_, i) => (
                        <Skeleton key={i} variant="rect" width="100%" height="56px" />
                      ))}
                    </div>
                  )}

                  {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}

                  {!isLoading && !error && (!displayedContacts || displayedContacts.length === 0) && (
                    <div className="text-center py-12 px-4 space-y-2">
                      <div className="size-10 rounded-xl bg-[var(--quant-surface-elevated)] border border-[#232938] flex items-center justify-center mx-auto text-[#6B7280]">
                        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      </div>
                      <p className="text-xs font-bold text-white">No contacts found</p>
                      <p className="text-[11px] text-[#A1A4AC]">
                        {debouncedQuery ? 'Try adjusting your search query' : 'Add your first contact to begin'}
                      </p>
                      <Button variant="primary" size="sm" onClick={handleOpenCreate}>
                        + Add Contact
                      </Button>
                    </div>
                  )}

                  {!isLoading && !error && groupedContacts.length > 0 && (
                    <div className="space-y-4">
                      {groupedContacts.map((group) => (
                        <div key={group.letter} id={`letter-${group.letter}`} className="space-y-1">
                          <div className="sticky top-0 z-10 bg-[#0C0E14]/95 backdrop-blur-sm px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[var(--quant-primary)] border-b border-[#1E2536]">
                            {group.letter} ({group.contacts.length})
                          </div>

                          <div className="space-y-1">
                            {group.contacts.map((contact) => {
                              const isSelected = selectedContact?.id === contact.id;
                              const threads = threadCountFor(contact.email);

                              return (
                                <div
                                  key={contact.id}
                                  onClick={() => handleSelectContact(contact)}
                                  className={`group flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                                    isSelected
                                      ? 'bg-[var(--quant-primary)]/15 border-[var(--quant-primary)]/50 text-white shadow-sm'
                                      : 'border-transparent hover:bg-white/5 text-[#EDEDED]'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <Avatar
                                      name={contactDisplayName(contact)}
                                      src={contact.avatarUrl}
                                      size="sm"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1">
                                        <h4 className="text-xs font-bold truncate group-hover:text-[var(--quant-primary)] transition-colors">
                                          {contactDisplayName(contact)}
                                        </h4>
                                        {contact.isFavorite && (
                                          <svg className="size-3 text-[#FFB020] shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                          </svg>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-[#A1A4AC] truncate">{contact.email}</p>
                                    </div>
                                  </div>

                                  {threads > 0 && (
                                    <span className="shrink-0 text-[10px] font-mono px-1.5 py-px rounded bg-[#181E2B] text-[#A1A4AC] border border-[#283144]">
                                      {threads}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Alphabetical Scrub Rail */}
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
                    className="absolute bottom-24 right-0.5 top-2 z-20 w-6 select-none flex flex-col items-stretch [touch-action:none] md:bottom-3"
                  >
                    {ALPHABET.map((letter) => {
                      const exists = availableLetters.has(letter);
                      const active = letter === activeLetter;
                      return (
                        <button
                          key={letter}
                          type="button"
                          onClick={() => {
                            const target = resolveLetter(letter);
                            if (target) jumpToLetter(target, true);
                          }}
                          aria-current={active ? 'true' : undefined}
                          aria-label={`Jump to ${letter === '#' ? 'other' : letter}`}
                          className={`flex flex-1 items-center justify-center rounded text-[var(--q-type-xs)] font-bold leading-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--quant-primary)] ${
                            active
                              ? 'text-[var(--quant-primary)]'
                              : exists
                                ? 'text-[#F5F5F5] hover:text-[var(--quant-primary)]'
                                : 'text-[#6B7280]'
                          }`}
                        >
                          {letter}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Magnified letter bubble during scrub */}
                {scrub && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none fixed right-10 z-40 grid size-12 place-items-center rounded-2xl bg-[var(--quant-surface-elevated)] text-xl font-black text-[var(--quant-primary)] shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
                    style={{ top: scrub.y - 24 }}
                  >
                    {scrub.letter}
                  </div>
                )}
              </div>
            </div>

            {/* ------------------------------------------------------------ */}
            {/* RIGHT PANE: Flex-1 Full-Bleed Contact Detail Sheet           */}
            {/* ------------------------------------------------------------ */}
            <div className="hidden md:flex flex-1 h-full overflow-y-auto bg-[var(--quant-background)] p-6 lg:p-10 flex-col">
              <ContactDetailSheet
                contact={selectedContact}
                recentMail={recentMail}
                onEdit={(c) => handleOpenEdit(c)}
                onDelete={(id, name) => handleDelete(id, name)}
                onToggleFavorite={(c) => handleToggleFavorite(c)}
                onEmail={(email) => router.push(`/compose?to=${encodeURIComponent(email)}`)}
                onCall={(phone) => {
                  if (phone) window.location.href = `tel:${phone}`;
                }}
                onMessage={(c) => router.push(`/compose?to=${encodeURIComponent(c.email)}`)}
                onScheduleMeeting={(email) => router.push(`/calendar?attendee=${encodeURIComponent(email)}`)}
              />
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* MOBILE SLIDE-UP PROFILE SHEET MODAL                                */}
        {/* ================================================================== */}
        <Modal
          isOpen={showMobileSheet && !!selectedContact}
          onClose={() => setShowMobileSheet(false)}
          title={selectedContact?.name || 'Contact Details'}
        >
          <div className="p-4 overflow-y-auto max-h-[80vh]">
            <ContactDetailSheet
              contact={selectedContact}
              onClose={() => setShowMobileSheet(false)}
              recentMail={recentMail}
              onEdit={(c) => {
                setShowMobileSheet(false);
                handleOpenEdit(c);
              }}
              onDelete={(id, name) => {
                setShowMobileSheet(false);
                handleDelete(id, name);
              }}
              onToggleFavorite={(c) => handleToggleFavorite(c)}
              onEmail={(email) => {
                setShowMobileSheet(false);
                router.push(`/compose?to=${encodeURIComponent(email)}`);
              }}
              onCall={(phone) => {
                if (phone) window.location.href = `tel:${phone}`;
              }}
              onMessage={(c) => {
                setShowMobileSheet(false);
                router.push(`/compose?to=${encodeURIComponent(c.email)}`);
              }}
              onScheduleMeeting={(email) => {
                setShowMobileSheet(false);
                router.push(`/calendar?attendee=${encodeURIComponent(email)}`);
              }}
            />
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
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-[#A1A4AC] focus:outline-none focus:border-[var(--quant-primary)]"
                autoFocus
                data-autofocus
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
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-[#A1A4AC] focus:outline-none focus:border-[var(--quant-primary)]"
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
                  placeholder="+1 (650) 253-0000"
                  className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-[#A1A4AC] focus:outline-none focus:border-[var(--quant-primary)]"
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
                  placeholder="Alphabet Inc."
                  className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-[#A1A4AC] focus:outline-none focus:border-[var(--quant-primary)]"
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
                placeholder="VIP, Executive, Engineering"
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-[#A1A4AC] focus:outline-none focus:border-[var(--quant-primary)]"
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

        <ContactsDedupeModal
          isOpen={showDedupeModal}
          onClose={() => setShowDedupeModal(false)}
          onMerged={() => {
            refetch();
          }}
        />

        <ContactGroupModal
          isOpen={showGroupModal}
          onClose={() => {
            setShowGroupModal(false);
            setEditingGroup(null);
          }}
          group={editingGroup}
          onSave={handleSaveGroup}
          onDelete={handleDeleteGroup}
          isSaving={createContactGroup.isPending || updateContactGroup.isPending}
        />
      </div>
    </AppShell>
  );
}
