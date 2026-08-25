'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDrive } from '../hooks/useDrive';
import type { Attachment } from './EmailComposer';

interface QuantDrivePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFiles: (attachments: Attachment[]) => void;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileEmoji(mimeType: string, type: string) {
  if (type === 'folder') return '📁';
  const m = (mimeType || '').toLowerCase();
  if (m.startsWith('image/')) return '🖼️';
  if (m.includes('pdf')) return '📕';
  if (m.includes('spreadsheet') || m.includes('excel') || m.includes('csv')) return '📊';
  if (m.includes('presentation') || m.includes('powerpoint')) return '📽️';
  if (m.includes('word') || m.includes('document')) return '📄';
  if (m.includes('zip') || m.includes('tar') || m.includes('archive') || m.includes('gz'))
    return '📦';
  if (m.includes('video/')) return '🎬';
  if (m.includes('audio/')) return '🎵';
  return '📎';
}

export function QuantDrivePickerModal({
  isOpen,
  onClose,
  onSelectFiles,
}: QuantDrivePickerModalProps) {
  const { files, loading, fetchFiles } = useDrive();
  const [activeTab, setActiveTab] = useState<'recent' | 'my-drive' | 'shared' | 'upload'>(
    'my-drive',
  );
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
          className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-zinc-800 bg-[#121622] shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <svg
                  className="size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-white">Insert files using QuantDrive</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 text-xs"
            >
              ✕
            </button>
          </div>

          {/* Search bar & Tab Switcher */}
          <div className="px-5 pt-3 pb-2 border-b border-zinc-800/60 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search in QuantDrive..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              {/* View Switcher */}
              <div className="flex items-center rounded-xl bg-zinc-900 border border-zinc-800 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg text-xs transition-all ${
                    viewMode === 'grid'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  title="Grid view"
                >
                  <svg
                    className="size-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect width="7" height="7" x="3" y="3" rx="1" />
                    <rect width="7" height="7" x="14" y="3" rx="1" />
                    <rect width="7" height="7" x="14" y="14" rx="1" />
                    <rect width="7" height="7" x="3" y="14" rx="1" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-lg text-xs transition-all ${
                    viewMode === 'list'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  title="List view"
                >
                  <svg
                    className="size-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="8" x2="21" y1="6" y2="6" />
                    <line x1="8" x2="21" y1="12" y2="12" />
                    <line x1="8" x2="21" y1="18" y2="18" />
                    <line x1="3" x2="3.01" y1="6" y2="6" />
                    <line x1="3" x2="3.01" y1="12" y2="12" />
                    <line x1="3" x2="3.01" y1="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto text-xs pb-1">
              <button
                type="button"
                onClick={() => setActiveTab('my-drive')}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  activeTab === 'my-drive'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                }`}
              >
                My Drive
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('recent')}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  activeTab === 'recent'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                }`}
              >
                Recent
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('shared')}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  activeTab === 'shared'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                }`}
              >
                Shared with me
              </button>
            </div>
          </div>

          {/* Files List/Grid Body */}
          <div className="flex-1 overflow-y-auto p-4 min-h-[220px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 text-zinc-500 text-xs gap-2">
                <div className="size-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span>Loading QuantDrive files...</span>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-zinc-500 text-xs gap-2">
                <svg
                  className="size-8 text-zinc-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                </svg>
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
                      className={`relative flex flex-col items-start p-3 rounded-xl text-left border transition-all ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                          : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-2">
                        <span className="text-xl">{getFileEmoji(file.mimeType, file.type)}</span>
                        {isSelected && (
                          <div className="size-4 rounded-full bg-amber-500 flex items-center justify-center text-black text-[10px] font-bold">
                            ✓
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-white truncate w-full mb-0.5">
                        {file.name}
                      </span>
                      <span className="text-[10px] text-zinc-500">{formatFileSize(file.size)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/60 rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
                {filteredFiles.map((file) => {
                  const isSelected = selectedFileIds.includes(file.id);
                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => toggleSelect(file.id)}
                      className={`flex items-center justify-between w-full px-3.5 py-2.5 text-xs text-left transition-all ${
                        isSelected
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'hover:bg-zinc-800/60 text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="text-sm">{getFileEmoji(file.mimeType, file.type)}</span>
                        <span className="font-medium truncate">{file.name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className="text-[10px] text-zinc-500">
                          {formatFileSize(file.size)}
                        </span>
                        {isSelected ? (
                          <span className="size-4 rounded-full bg-amber-500 flex items-center justify-center text-black text-[10px] font-bold">
                            ✓
                          </span>
                        ) : (
                          <span className="size-4 rounded-full border border-zinc-700" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800 bg-[#0d1017]">
            <span className="text-xs text-zinc-400">
              {selectedFileIds.length > 0 ? (
                <span className="text-amber-400 font-semibold">
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
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={selectedFileIds.length === 0}
                className="px-4 py-1.5 rounded-xl bg-[#FF8C42] hover:bg-[#FF9B5A] text-[#111111] text-xs font-semibold shadow-sm transition-all disabled:opacity-40"
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
