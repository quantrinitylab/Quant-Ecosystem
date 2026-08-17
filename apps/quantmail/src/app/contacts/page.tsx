'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
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

export default function ContactsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'favorites'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
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

  const handleOpenEdit = useCallback((contact: Contact) => {
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
    if (editingContact) {
      await updateContact.mutateAsync({ id: editingContact.id, data });
    } else {
      await createContact.mutateAsync(data);
    }
    setShowCreateModal(false);
    setEditingContact(null);
  }, [formData, editingContact, createContact, updateContact]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (confirm('Are you sure you want to delete this contact?')) {
        await deleteContact.mutateAsync(id);
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
      if (!map[letter]) map[letter] = [];
      map[letter].push(c);
    }
    return Object.keys(map)
      .sort()
      .map((letter) => ({
        letter,
        contacts: map[letter].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)),
      }));
  }, [contacts]);

  return (
    <AppShell
      sidebar={<AppSidebar />}
      theme="dark"
      className="quantmail-shell"
      mobileTitle={<h1 className="text-base font-bold text-white">Contacts & Directory</h1>}
      mobileActions={
        <button
          type="button"
          onClick={handleOpenCreate}
          className="px-3 py-1 text-xs font-semibold rounded-lg bg-[#ff9933] text-[#191008]"
        >
          + Add
        </button>
      }
    >
      <PageTransition className="workspace-page contacts-workspace flex flex-col h-full bg-[#0a0a0c]">
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

            <Button variant="primary" onClick={handleOpenCreate}>
              + New Contact
            </Button>
          </div>
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
                Add contacts to start emailing, scheduling meetings, and collaborating seamlessly.
              </p>
              <div className="pt-2">
                <Button variant="primary" onClick={handleOpenCreate}>
                  + Add first contact
                </Button>
              </div>
            </div>
          )}

          {!isLoading && !error && groupedContacts.length > 0 && (
            <div className="space-y-6">
              {groupedContacts.map((group) => (
                <section key={group.letter} className="space-y-2">
                  <h3 className="sticky top-0 z-10 text-xs font-extrabold uppercase tracking-widest text-[#ff9933] bg-[#0a0a0c]/90 backdrop-blur-sm py-1">
                    {group.letter}
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {group.contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="group flex flex-col justify-between p-4 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] hover:border-[#ff9933]/60 transition-all shadow-sm"
                      >
                        <div className="flex items-start gap-3">
                          <Avatar
                            name={contact.name || contact.email}
                            src={contact.avatarUrl}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-bold text-white truncate">
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
                              onClick={() =>
                                router.push(`/compose?to=${encodeURIComponent(contact.email)}`)
                              }
                              className="px-2.5 py-1 rounded-lg bg-[#ff9933]/15 text-[#ff9933] text-xs font-semibold hover:bg-[#ff9933]/25 transition-colors"
                            >
                              ✉ Email
                            </button>
                            <button
                              type="button"
                              onClick={() => router.push(`/calendar`)}
                              className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium hover:text-white transition-colors"
                            >
                              📅 Meet
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(contact)}
                              className="p-1 text-zinc-400 hover:text-white text-xs"
                              title="Edit contact"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(contact.id)}
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

        {/* Create / Edit Contact Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setEditingContact(null);
          }}
          title={editingContact ? 'Edit Contact' : 'Create New Contact'}
        >
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Full Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Priya Sharma"
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
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="priya@example.com"
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="+91 98765 43210"
                  className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#ff9933]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Company / Organization
                </label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData((prev) => ({ ...prev, company: e.target.value }))}
                  placeholder="Quantrinity Labs"
                  className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#ff9933]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Tags (Comma separated)
              </label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData((prev) => ({ ...prev, tags: e.target.value }))}
                placeholder="Engineering, VIP, Design, Investor…"
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
              <Button
                variant="primary"
                onClick={() => void handleSave()}
                disabled={
                  !formData.name.trim() ||
                  !formData.email.trim() ||
                  createContact.isPending ||
                  updateContact.isPending
                }
              >
                {createContact.isPending || updateContact.isPending ? 'Saving…' : 'Save Contact'}
              </Button>
            </div>
          </div>
        </Modal>
      </PageTransition>
    </AppShell>
  );
}
