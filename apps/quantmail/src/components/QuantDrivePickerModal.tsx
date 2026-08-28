'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDrive } from '../hooks/useDrive';
import { formatBytes } from '../lib/format-bytes';
import {
  IconCheck,
  IconFolder,
  IconGrid,
  IconList,
  IconSearch,
  IconX,
  MimeTypeIcon,
} from './icons';
import type { Attachment } from './EmailComposer';

interface QuantDrivePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFiles: (attachments: Attachment[]) => void;
}

type PickerTab = 'recent' | 'my-drive' | 'shared';

const PICKER_TABS: ReadonlyArray<{ id: PickerTab; label: string }> = [
  { id: 'my-drive', label: 'My Drive' },
  { id: 'recent', label: 'Recent' },
  { id: 'shared', label: 'Shared with me' },
];

export function QuantDrivePickerModal({
  isOpen,
  onClose,
  onSelectFiles,
}: QuantDrivePickerModalProps) {
  const { files, loading, fetchFiles } = useDrive();
  const [activeTab, setActiveTab] = useState<PickerTab>('my-drive');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    if (isOpen) {
      fetchFiles();
      setSelectedFileIds([]);
      setSearchQuery('');
    }
  }, [isOpen, fetchFiles]);

  const filteredFiles = useMemo(() => {
    let list = files.filter((f) => f.type === 'file');
    if (activeTab === 'recent') {
      list = [...list].sort(
        (a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime(),
      );
    } else if (activeTab === 'shared') {
      list = list.filter((f) => f.sharedWith && f.sharedWith.length > 0);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(q));
    }
    return list;
  }, [files, activeTab, searchQuery]);

  const toggleSelect = (id: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleConfirm = () => {
    const selected = files.filter((f) => selectedFileIds.includes(f.id));
    const attachments: Attachment[] = selected.map((f) => ({
      id: `drive_${f.id}_${Date.now()}`,
      name: f.name,
      filename: f.name,
      size: f.size || 0,
      type: f.mimeType || 'application/octet-stream',
      mimeType: f.mimeType || 'application/octet-stream',
      url: `/api/drive/files/${f.id}/download`,
    }));
    onSelectFiles(attachments);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-[#282C35] bg-[#16181D] shadow-[0_24px_64px_rgba(0,0,0,0.62)] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#282C35]">
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-items-center rounded-lg bg-[#2B1A11] border border-[#5C3016] text-[#FF8C42]">
                <IconFolder size={15} />
              </span>
              <h3 className="text-sm font-semibold tracking-[-0.01em] text-[#F5F5F5]">
                Insert files using QuantDrive
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close file picker"
              className="grid size-11 place-items-center rounded-lg text-[#A1A4AC] transition-colors hover:text-[#F5F5F5] hover:bg-[#1C1F26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            >
              <IconX size={16} />
            </button>
          </div>

          {/* Search bar & Tab Switcher */}
          <div className="px-5 pt-3 pb-2 border-b border-[#282C35]/60 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6E76]">
                  <IconSearch size={14} />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search in QuantDrive…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#111318] border border-[#282C35] text-xs text-[#F5F5F5] placeholder-[#6B6E76] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] focus:border-[#FF8C42]"
                />
              </div>

              {/* View Switcher */}
              <div className="flex items-center rounded-xl bg-[#111318] border border-[#282C35] p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-pressed={viewMode === 'grid'}
                  className={`grid size-9 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                    viewMode === 'grid'
                      ? 'bg-[#282C35] text-[#F5F5F5]'
                      : 'text-[#6B6E76] hover:text-[#A1A4AC]'
                  }`}
                  title="Grid view"
                >
                  <IconGrid size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-pressed={viewMode === 'list'}
                  className={`grid size-9 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                    viewMode === 'list'
                      ? 'bg-[#282C35] text-[#F5F5F5]'
                      : 'text-[#6B6E76] hover:text-[#A1A4AC]'
                  }`}
                  title="List view"
                >
                  <IconList size={14} />
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div
              role="tablist"
              aria-label="QuantDrive scope"
              className="flex items-center gap-1 overflow-x-auto no-scrollbar text-xs pb-1"
            >
              {PICKER_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                    activeTab === tab.id
                      ? 'bg-[#2B1A11] text-[#FFB875] shadow-[inset_0_0_0_1px_#5C3016]'
                      : 'text-[#A1A4AC] hover:text-[#F5F5F5] hover:bg-[#111318]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Files List/Grid Body */}
          <div className="flex-1 overflow-y-auto p-4 min-h-[220px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#6B6E76] text-xs gap-2">
                <div className="size-5 border-2 border-[#FF8C42] border-t-transparent rounded-full animate-spin" />
                <span>Loading QuantDrive files…</span>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#6B6E76] text-xs gap-2">
                <IconFolder size={32} />
                <span>No files found in QuantDrive</span>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {filteredFiles.map((file) => {
                  const isSelected = selectedFileIds.includes(file.id);
                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => toggleSelect(file.id)}
                      aria-pressed={isSelected}
                      className={`relative flex min-h-touch flex-col items-start p-3 rounded-xl text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                        isSelected
                          ? 'bg-[#2B1A11] shadow-[inset_0_0_0_1px_#FF8C42]'
                          : 'bg-[#111318] shadow-[inset_0_0_0_1px_#282C35] hover:bg-[#1C1F26]'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-2">
                        <MimeTypeIcon mimeType={file.mimeType} kind={file.type} size={20} />
                        {isSelected && (
                          <span className="grid size-4 place-items-center rounded-full bg-[#FF8C42] text-[#111111]">
                            <IconCheck size={11} strokeWidth={2.6} />
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-[#F5F5F5] truncate w-full mb-0.5">
                        {file.name}
                      </span>
                      <span className="text-[10px] text-[#6B6E76]">{formatBytes(file.size)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="divide-y divide-[#282C35]/60 rounded-xl border border-[#282C35] bg-[#111318] overflow-hidden">
                {filteredFiles.map((file) => {
                  const isSelected = selectedFileIds.includes(file.id);
                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => toggleSelect(file.id)}
                      aria-pressed={isSelected}
                      className={`flex min-h-touch items-center justify-between w-full px-3.5 py-2 text-xs text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF8C42] ${
                        isSelected
                          ? 'bg-[#2B1A11] text-[#FFB875]'
                          : 'text-[#F5F5F5] hover:bg-[#1C1F26]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <MimeTypeIcon mimeType={file.mimeType} kind={file.type} size={15} />
                        <span className="font-medium truncate">{file.name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className="text-[10px] text-[#6B6E76]">{formatBytes(file.size)}</span>
                        {isSelected ? (
                          <span className="grid size-4 place-items-center rounded-full bg-[#FF8C42] text-[#111111]">
                            <IconCheck size={11} strokeWidth={2.6} />
                          </span>
                        ) : (
                          <span className="size-4 rounded-full border border-[#3A404D]" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-t border-[#282C35] bg-[#111318]">
            <span className="text-xs text-[#A1A4AC]">
              {selectedFileIds.length > 0 ? (
                <span className="text-[#FF8C42] font-semibold">
                  {selectedFileIds.length} file{selectedFileIds.length > 1 ? 's' : ''} selected
                </span>
              ) : (
                'Select files to attach'
              )}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-touch rounded-xl px-3 text-xs font-medium text-[#A1A4AC] transition-colors hover:text-[#F5F5F5] hover:bg-[#1C1F26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={selectedFileIds.length === 0}
                className="min-h-touch rounded-xl bg-[#FF8C42] px-4 text-xs font-semibold text-[#111111] shadow-[0_4px_16px_rgba(0,0,0,0.6)] transition-colors hover:bg-[#FF9B5A] active:bg-[#E8752F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111318] focus-visible:ring-[#FF8C42] disabled:opacity-40"
              >
                Insert Attached ({selectedFileIds.length})
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
