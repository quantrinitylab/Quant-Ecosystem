'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Avatar, Skeleton } from '@quant/shared-ui';
import { apiClient } from '../../../services/api-client';
import { showToast } from '../../../components/InboxToast';
import type { Contact } from '../../../types';

export interface DuplicateCluster {
  primaryContact: Contact;
  duplicates: Contact[];
  reason: 'email' | 'name';
}

export interface ContactsDedupeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMerged: () => void;
}

export function ContactsDedupeModal({ isOpen, onClose, onMerged }: ContactsDedupeModalProps) {
  const [clusters, setClusters] = useState<DuplicateCluster[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [selectedPrimaries, setSelectedPrimaries] = useState<Record<number, string>>({});

  const loadDuplicates = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.getContactDuplicates();
      if (res.success && res.data) {
        setClusters(res.data);
        // Default each cluster's primary to the server-suggested primary
        const initial: Record<number, string> = {};
        res.data.forEach((group, idx) => {
          initial[idx] = group.primaryContact.id;
        });
        setSelectedPrimaries(initial);
      } else {
        setClusters([]);
      }
    } catch {
      showToast({ text: 'Failed to scan for duplicate contacts', type: 'error' });
      setClusters([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadDuplicates();
    }
  }, [isOpen, loadDuplicates]);

  const handleSelectPrimary = (clusterIndex: number, contactId: string) => {
    setSelectedPrimaries((prev) => ({ ...prev, [clusterIndex]: contactId }));
  };

  const handleMergeCluster = async (clusterIndex: number) => {
    const cluster = clusters[clusterIndex];
    if (!cluster) return;

    const allContacts = [cluster.primaryContact, ...cluster.duplicates];
    const primaryId = selectedPrimaries[clusterIndex] || cluster.primaryContact.id;
    const duplicateIds = allContacts.map((c) => c.id).filter((id) => id !== primaryId);

    if (duplicateIds.length === 0) return;

    setIsMerging(true);
    try {
      const res = await apiClient.mergeContacts(primaryId, duplicateIds);
      if (res.success) {
        showToast({ text: 'Contacts merged successfully', type: 'success' });
        // Remove merged cluster from state
        setClusters((prev) => prev.filter((_, idx) => idx !== clusterIndex));
        onMerged();
      } else {
        showToast({ text: res.error?.message || 'Failed to merge contacts', type: 'error' });
      }
    } catch {
      showToast({ text: 'Failed to merge contacts', type: 'error' });
    } finally {
      setIsMerging(false);
    }
  };

  const handleAutoMergeAll = async () => {
    setIsMerging(true);
    try {
      const res = await apiClient.deduplicateContacts();
      if (res.success) {
        const count = res.data?.mergedCount ?? (res as any).mergedCount ?? 0;
        showToast({
          text: `Merged ${count} duplicate contact${count === 1 ? '' : 's'}`,
          type: 'success',
        });
        setClusters([]);
        onMerged();
        onClose();
      } else {
        showToast({ text: res.error?.message || 'Auto-merge failed', type: 'error' });
      }
    } catch {
      showToast({ text: 'Failed to execute auto-merge', type: 'error' });
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Contact Deduplication Wizard"
      description="Review duplicate contact suggestions and merge them into clean unified records."
      size="xl"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-16 w-full rounded-xl bg-[#16181D]" />
            <Skeleton className="h-24 w-full rounded-xl bg-[#16181D]" />
            <Skeleton className="h-24 w-full rounded-xl bg-[#16181D]" />
          </div>
        ) : clusters.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h4 className="mt-3 text-sm font-semibold text-[#F5F5F5]">No Duplicates Found</h4>
            <p className="mt-1 text-xs text-[#A1A4AC]">
              Your address book is clean. All contacts have unique emails and names.
            </p>
            <div className="mt-5">
              <Button variant="secondary" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl border border-[#282C35] bg-[#16181D] p-3">
              <div>
                <span className="text-xs font-semibold text-[#F5F5F5]">
                  {clusters.length} Duplicate Group{clusters.length === 1 ? '' : 's'} Detected
                </span>
                <p className="text-[11px] text-[#A1A4AC]">
                  Choose which contact to keep as primary for each group, or auto-merge all.
                </p>
              </div>
              <Button variant="primary" size="sm" onClick={handleAutoMergeAll} disabled={isMerging}>
                {isMerging ? 'Merging…' : 'Auto-Merge All'}
              </Button>
            </div>

            <div className="space-y-4">
              {clusters.map((cluster, cIdx) => {
                const allContacts = [cluster.primaryContact, ...cluster.duplicates];
                const activePrimaryId = selectedPrimaries[cIdx] || cluster.primaryContact.id;

                return (
                  <div
                    key={cIdx}
                    className="rounded-xl border border-[#282C35] bg-[#111318] p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-[#FF8C42]/10 text-[#FF8C42] border border-[#FF8C42]/20">
                          {cluster.reason === 'email' ? 'Identical Email' : 'Identical Name'}
                        </span>
                        <span className="text-xs text-[#A1A4AC]">
                          {cluster.reason === 'email'
                            ? cluster.primaryContact.email
                            : cluster.primaryContact.name}
                        </span>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleMergeCluster(cIdx)}
                        disabled={isMerging}
                      >
                        Merge Group ({allContacts.length})
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {allContacts.map((contact) => {
                        const isSelectedPrimary = contact.id === activePrimaryId;
                        return (
                          <div
                            key={contact.id}
                            onClick={() => handleSelectPrimary(cIdx, contact.id)}
                            className={`cursor-pointer rounded-lg border p-3 transition-all ${
                              isSelectedPrimary
                                ? 'border-[#FF8C42]/50 bg-[#FF8C42]/10 ring-1 ring-[#FF8C42]/50 shadow-[0_0_16px_rgba(255,140,66,0.12),inset_0_1px_0_0_rgba(255,255,255,0.06)]'
                                : 'border-white/[0.08] bg-[#111318] hover:border-white/[0.14] hover:bg-white/[0.03]'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2.5">
                                <Avatar
                                  name={contact.name || contact.email}
                                  src={contact.avatar || undefined}
                                  size="sm"
                                />
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-[#F5F5F5]">
                                      {contact.name || 'Unnamed'}
                                    </span>
                                    {isSelectedPrimary && (
                                      <span className="rounded bg-[#FF8C42] px-1 py-0.2 text-[9px] font-bold text-[#111111]">
                                        PRIMARY
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-[#A1A4AC] truncate max-w-[180px]">
                                    {contact.email}
                                  </p>
                                </div>
                              </div>
                              <input
                                type="radio"
                                name={`primary-${cIdx}`}
                                checked={isSelectedPrimary}
                                onChange={() => handleSelectPrimary(cIdx, contact.id)}
                                className="mt-1 h-3.5 w-3.5 accent-[#FF8C42]"
                              />
                            </div>

                            <div className="mt-2.5 space-y-1 text-[11px] text-[#6B6E76]">
                              {contact.phone && <p className="truncate">📞 {contact.phone}</p>}
                              {contact.company && <p className="truncate">🏢 {contact.company}</p>}
                              {contact.tags && contact.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {contact.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="rounded bg-[#282C35] px-1.5 py-0.2 text-[9px] text-[#A1A4AC]"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {contact.frequency !== undefined && (
                                <p className="text-[10px] text-[#A1A4AC] pt-0.5">
                                  {contact.frequency} interaction
                                  {contact.frequency === 1 ? '' : 's'}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
