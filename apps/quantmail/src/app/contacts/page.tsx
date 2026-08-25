'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button, Modal, Avatar, Badge, Skeleton, ErrorState } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import {
  useContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
} from '../../hooks/useContacts';
import type { Contact } from '../../types';
import { showToast } from '../../components/InboxToast';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');

export default function ContactsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
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

  const {
    data: contacts,
    isLoading,
    error,
    refetch,
  } = useContacts({
    q: searchQuery || undefined,
    favorites: activeTab === 'favorites' || undefined,
  });
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

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
      if (confirm(`Are you sure you want to delete ${name ? `"${name}"` : 'this contact'}?`)) {
        try {
          await deleteContact.mutateAsync(id);
          setInspectContact(null);
          showToast({ text: 'Contact deleted', type: 'info' });
        } catch {
          showToast({ text: 'Failed to delete contact', type: 'error' });
        }
      }
    },
    [deleteContact],
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

  const scrollToLetter = (letter: string) => {
    const el = document.getElementById(`letter-${letter}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <AppShell
      sidebar={<AppSidebar />}
      theme="dark"
      className="quantmail-shell"
      searchValue={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search contacts by name, email, company…"
    >
      <PageTransition className="workspace-page contacts-workspace flex flex-col h-full bg-[#0a0a0c]">
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
                className={`px-3.5 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  activeTab === 'all'
                    ? 'bg-[#ff9933] text-[#191008] font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                All ({contacts?.length ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('favorites')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
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
                <span>Favorites</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => vcardInputRef.current?.click()}
              className="px-3 py-1.5 text-xs rounded-xl border border-[#282C35] bg-[#16181D] text-[#A1A4AC] hover:text-[#F5F5F5] hover:border-[#3A404D] transition-colors flex items-center gap-1.5"
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
              className="px-3 py-1.5 text-xs rounded-xl border border-[#282C35] bg-[#16181D] text-[#A1A4AC] hover:text-[#F5F5F5] hover:border-[#3A404D] transition-colors flex items-center gap-1.5"
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

            <Button variant="primary" onClick={handleOpenCreate}>
              + New Contact
            </Button>
          </div>
        </div>

        {/* Alphabet Quick Jump Bar */}
        <div className="flex items-center justify-center gap-1 py-1.5 px-4 bg-[#090A0C] border-b border-[#282C35] overflow-x-auto no-scrollbar text-[10px] font-bold text-[#6B6E76]">
          {ALPHABET.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => scrollToLetter(l)}
              className="px-1.5 py-0.5 rounded hover:text-[#FF8C42] hover:bg-white/5 transition-colors"
            >
              {l}
            </button>
          ))}
        </div>

        {/* Contacts Stream Grouped Alphabetically */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 space-y-6">
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
                {searchQuery ? 'No contacts matched your search' : 'Your address book is empty'}
              </h3>
              <p className="text-xs text-[#A1A4AC] max-w-sm mx-auto">
                Add contacts or import a .vcf file to start emailing and scheduling meetings.
              </p>
              <div className="pt-2 flex items-center justify-center gap-2">
                <Button variant="primary" onClick={handleOpenCreate}>
                  + Add first contact
                </Button>
                <Button variant="secondary" onClick={() => vcardInputRef.current?.click()}>
                  Import vCard
                </Button>
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
                    {group.contacts.map((contact) => (
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
                            <h4 className="text-sm font-semibold text-[#F5F5F5] truncate group-hover:text-[#FF9B5A] transition-colors">
                              {contact.name || contact.email}
                            </h4>
                            <p className="text-xs text-[#A1A4AC] truncate">{contact.email}</p>
                            {contact.company && (
                              <p className="text-[11px] text-[#6B6E76] mt-0.5 truncate flex items-center gap-1">
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
                              <p className="text-[11px] text-[#6B6E76] truncate flex items-center gap-1">
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
                          </div>
                        </div>

                        {/* Quick Actions Bar */}
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
                                router.push(`/calendar`);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#111318] border border-[#282C35] text-[#A1A4AC] text-xs font-medium hover:text-[#F5F5F5] hover:border-[#3A404D] transition-colors flex items-center gap-1"
                            >
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={1.8} />
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
                    ))}
                  </div>
                </section>
              ))}
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
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
              <Avatar
                name={inspectContact?.name || inspectContact?.email}
                src={inspectContact?.avatarUrl}
                size="lg"
              />
              <div>
                <h3 className="text-base font-bold text-white">{inspectContact?.name}</h3>
                <p className="text-xs text-zinc-400">{inspectContact?.email}</p>
                {inspectContact?.company && (
                  <p className="text-xs text-[#ff9933] mt-0.5">🏢 {inspectContact?.company}</p>
                )}
              </div>
            </div>

            <div className="space-y-2 text-xs">
              {inspectContact?.phone && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <span className="text-zinc-400">Phone Number</span>
                  <a
                    href={`tel:${inspectContact.phone}`}
                    className="font-mono font-semibold text-white hover:text-[#ff9933]"
                  >
                    {inspectContact.phone}
                  </a>
                </div>
              )}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <span className="text-zinc-400">Email Address</span>
                <a
                  href={`mailto:${inspectContact?.email}`}
                  className="font-mono font-semibold text-white hover:text-[#ff9933]"
                >
                  {inspectContact?.email}
                </a>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <Button
                variant="primary"
                onClick={() => {
                  if (inspectContact?.email) {
                    router.push(`/compose?to=${encodeURIComponent(inspectContact.email)}`);
                  }
                }}
              >
                ✉ Compose Email
              </Button>
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
                className="block text-xs font-semibold text-zinc-300 mb-1"
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
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor="contact-email"
                className="block text-xs font-semibold text-zinc-300 mb-1"
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
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="contact-phone"
                  className="block text-xs font-semibold text-zinc-300 mb-1"
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
                  className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
                />
              </div>
              <div>
                <label
                  htmlFor="contact-company"
                  className="block text-xs font-semibold text-zinc-300 mb-1"
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
                  className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="contact-tags"
                className="block text-xs font-semibold text-zinc-300 mb-1"
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
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
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
      </PageTransition>
    </AppShell>
  );
}
