'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  AppShell,
  Card,
  Button,
  Modal,
  Input,
  FormField,
  Avatar,
  Badge,
  SearchInput,
  Skeleton,
} from '@quant/shared-ui';
import { ErrorState, EmptyState } from '@quant/shared-ui';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
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
    favorites: favoritesOnly || undefined,
  });
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    return contacts;
  }, [contacts]);

  const handleOpenCreate = useCallback(() => {
    setFormData({ name: '', email: '', phone: '', company: '', tags: '' });
    setEditingContact(null);
    setShowCreateModal(true);
  }, []);

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
    const data = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone || undefined,
      company: formData.company || undefined,
      tags: formData.tags ? formData.tags.split(',').map((t) => t.trim()) : [],
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
      await deleteContact.mutateAsync(id);
    },
    [deleteContact],
  );

  return (
    <AppShell sidebar={<AppSidebar />}>
      <PageTransition className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--quant-border)]">
          <h1 className="text-lg font-semibold">Contacts</h1>
          <Button variant="primary" onClick={handleOpenCreate}>
            Add Contact
          </Button>
        </div>

        {/* Search + filter */}
        <div className="flex items-center gap-3 p-4 border-b border-[var(--quant-border)]">
          <div className="flex-1">
            <SearchInput
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={setSearchQuery}
            />
          </div>
          <Button
            variant={favoritesOnly ? 'primary' : 'secondary'}
            onClick={() => setFavoritesOnly(!favoritesOnly)}
          >
            Favorites
          </Button>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rect" width="100%" height="64px" />
              ))}
            </div>
          )}
          {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}
          {!isLoading && !error && filteredContacts.length === 0 && (
            <EmptyState title="No contacts yet" description="Add contacts to get started" />
          )}
          {!isLoading &&
            !error &&
            filteredContacts.map((contact) => (
              <Card
                key={contact.id}
                padding="none"
                className="mb-2 p-3 cursor-pointer hover:bg-[var(--quant-muted)] transition-colors"
                onClick={() => handleOpenEdit(contact)}
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    src={contact.avatarUrl}
                    name={contact.name || contact.email || '?'}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{contact.name}</span>
                      {contact.isFavorite && <span className="text-yellow-500">&#9733;</span>}
                    </div>
                    <p className="text-xs text-[var(--quant-muted-foreground)] truncate">
                      {contact.email}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {contact.tags?.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="default">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <Button
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(contact.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
        </div>

        {/* Create/Edit Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title={editingContact ? 'Edit Contact' : 'Add Contact'}
        >
          <div className="space-y-4">
            <FormField label="Name" required>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Full name"
              />
            </FormField>
            <FormField label="Email" required>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="email@example.com"
              />
            </FormField>
            <FormField label="Phone">
              <Input
                value={formData.phone}
                onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="+1 (555) 000-0000"
              />
            </FormField>
            <FormField label="Company">
              <Input
                value={formData.company}
                onChange={(e) => setFormData((prev) => ({ ...prev, company: e.target.value }))}
                placeholder="Company name"
              />
            </FormField>
            <FormField label="Tags">
              <Input
                value={formData.tags}
                onChange={(e) => setFormData((prev) => ({ ...prev, tags: e.target.value }))}
                placeholder="tag1, tag2, tag3"
              />
            </FormField>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSave}>
                {editingContact ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </Modal>
      </PageTransition>
    </AppShell>
  );
}
