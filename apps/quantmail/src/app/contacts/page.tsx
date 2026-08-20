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
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page contacts-workspace flex flex-col h-full bg-[#0a0a0c]">
        <input
          ref={vcardInputRef}
          type="file"
          accept=".vcf,.vcard"
          className="hidden"
          onChange={handleImportVCard}
        />

        {/* Top Control Bar */}
        <div className="border-b border-[var(--quant-border)] px-4 py-3.5 sm:px-8 bg-[var(--quant-surface)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-[240px] max-w-md">
            <div className="relative w-full">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contacts by name, email, company…"
                className="w-full bg-[var(--quant-surface-subtle)] border border-[var(--quant-border)] rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
              />
              <span className="absolute left-3 top-2.5 text-zinc-500 text-xs">🔍</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-subtle)] p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  activeTab === 'all'
                    ? 'bg-[#ff9933] text-[#191008] font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                All ({contacts?.length ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('favorites')}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  activeTab === 'favorites'
                    ? 'bg-[#ff9933] text-[#191008] font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Favorites ★
              </button>
            </div>

            <button
              type="button"
              onClick={() => vcardInputRef.current?.click()}
              className="px-2.5 py-1.5 text-xs rounded-xl border border-[var(--quant-border)] text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
              title="Import vCard .vcf"
            >
              📥 Import
            </button>
            <button
              type="button"
              onClick={handleExportVCard}
              className="px-2.5 py-1.5 text-xs rounded-xl border border-[var(--quant-border)] text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
              title="Export to vCard .vcf"
            >
              📤 Export
            </button>

            <Button variant="primary" onClick={handleOpenCreate}>
              + New Contact
            </Button>
          </div>
        </div>

        {/* Alphabet Quick Jump Bar */}
        <div className="flex items-center justify-center gap-1 py-1.5 px-4 bg-zinc-950 border-b border-zinc-900 overflow-x-auto text-[10px] font-bold text-zinc-500">
          {ALPHABET.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => scrollToLetter(l)}
              className="px-1.5 py-0.5 rounded hover:text-[#ff9933] hover:bg-zinc-800 transition-colors"
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
              <span className="text-5xl block">👥</span>
              <h3 className="text-lg font-bold text-white">
                {searchQuery ? 'No contacts matched your search' : 'Your address book is empty'}
              </h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
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
                  <h3 className="sticky top-0 z-10 text-xs font-extrabold uppercase tracking-widest text-[#ff9933] bg-[#0a0a0c]/90 backdrop-blur-sm py-1">
                    {group.letter} ({group.contacts.length})
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {group.contacts.map((contact) => (
                      <div
                        key={contact.id}
                        onClick={() => setInspectContact(contact)}
                        className="group flex flex-col justify-between p-4 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] hover:border-[#ff9933]/60 transition-all shadow-sm cursor-pointer"
                      >
                        <div className="flex items-start gap-3">
                          <Avatar
                            name={contact.name || contact.email}
                            src={contact.avatarUrl}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-bold text-white truncate group-hover:text-[#ff9933] transition-colors">
                              {contact.name || contact.email}
                            </h4>
                            <p className="text-xs text-zinc-400 truncate">{contact.email}</p>
                            {contact.company && (
                              <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                                🏢 {contact.company}
                              </p>
                            )}
                            {contact.phone && (
                              <p className="text-[11px] text-zinc-500 truncate">
                                📞 {contact.phone}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Quick Actions Bar */}
                        <div className="flex items-center justify-between border-t border-zinc-800/80 mt-3 pt-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/compose?to=${encodeURIComponent(contact.email)}`);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#ff9933]/15 text-[#ff9933] text-xs font-semibold hover:bg-[#ff9933]/25 transition-colors"
                            >
                              ✉ Email
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/calendar`);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium hover:text-white transition-colors"
                            >
                              📅 Meet
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => handleOpenEdit(contact, e)}
                              className="p-1 text-zinc-400 hover:text-white text-xs"
                              title="Edit contact"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDelete(contact.id, contact.name, e)}
                              className="p-1 text-rose-400 hover:text-rose-300 text-xs"
                              title="Delete contact"
                            >
                              🗑
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
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Full Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Sundar Pichai"
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Email Address *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="e.g. sundar@quantmail.in"
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Company</label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="e.g. Quantrinity"
                  className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Tags (comma-separated)
              </label>
              <input
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
