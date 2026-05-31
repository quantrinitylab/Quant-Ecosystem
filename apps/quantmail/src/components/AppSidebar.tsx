'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from '@quant/shared-ui';
import type { SidebarItem } from '@quant/shared-ui';
import { useRouter, usePathname } from 'next/navigation';
import { spring } from '@quant/brand';
import { useLabels, useCreateLabel } from '../hooks/useLabels';
import { expandCollapseVariants } from '../lib/motion-variants';
import type { EmailLabel } from '../types';

const PRESET_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#6b7280',
  '#14b8a6',
];

const systemFolders = [
  { id: 'inbox', label: 'Inbox', icon: <span>&#128229;</span>, path: '/' },
  { id: 'compose', label: 'Compose', icon: <span>&#9997;</span>, path: '/compose' },
  { id: 'search', label: 'Search', icon: <span>&#128269;</span>, path: '/search' },
  { id: 'sent', label: 'Sent', icon: <span>&#128228;</span>, path: '/sent' },
  { id: 'drafts', label: 'Drafts', icon: <span>&#128221;</span>, path: '/drafts' },
  { id: 'trash', label: 'Trash', icon: <span>&#128465;</span>, path: '/trash' },
];

const appNavItems = [
  { id: 'calendar', label: 'Calendar', icon: <span>&#128197;</span>, path: '/calendar' },
  { id: 'contacts', label: 'Contacts', icon: <span>&#128101;</span>, path: '/contacts' },
  { id: 'drive', label: 'Drive', icon: <span>&#128193;</span>, path: '/drive' },
  { id: 'repos', label: 'Repos', icon: <span>&#128187;</span>, path: '/repos' },
  { id: 'pipelines', label: 'Pipelines', icon: <span>&#9881;</span>, path: '/pipelines' },
  { id: 'security', label: 'Security', icon: <span>&#128274;</span>, path: '/security' },
  { id: 'settings', label: 'Settings', icon: <span>&#9881;&#65039;</span>, path: '/settings' },
];

function LabelSection() {
  const { data: labels, isLoading } = useLabels();
  const createLabel = useCreateLabel();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(PRESET_COLORS[0]);
  const [labelsExpanded, setLabelsExpanded] = useState(true);

  const handleCreateLabel = useCallback(async () => {
    if (!newLabelName.trim()) return;
    try {
      await createLabel.mutateAsync({ name: newLabelName.trim(), color: newLabelColor });
      setNewLabelName('');
      setNewLabelColor(PRESET_COLORS[0]);
      setShowCreateForm(false);
    } catch {
      // Error handled by react-query
    }
  }, [newLabelName, newLabelColor, createLabel]);

  return (
    <div className="px-3 py-2">
      {/* Labels header */}
      <button
        className="flex items-center justify-between w-full min-h-[44px] px-2 text-xs font-semibold uppercase text-[var(--quant-muted-foreground)] tracking-wider hover:text-[var(--quant-foreground)] transition-colors"
        onClick={() => setLabelsExpanded(!labelsExpanded)}
      >
        <span>Labels</span>
        <span className="text-[10px]">{labelsExpanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      <AnimatePresence>
        {labelsExpanded && (
          <motion.div
            variants={expandCollapseVariants}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
          >
            {/* Label list */}
            {isLoading && (
              <div className="space-y-1 px-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 bg-[var(--quant-muted)] rounded animate-pulse" />
                ))}
              </div>
            )}

            {labels && labels.length > 0 && (
              <div className="space-y-0.5">
                {labels.map((label: EmailLabel) => (
                  <div
                    key={label.id}
                    className="flex items-center gap-2 px-2 py-1.5 min-h-[44px] rounded-md hover:bg-[var(--quant-muted)] transition-colors cursor-pointer"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="text-sm flex-1 truncate">{label.name}</span>
                    {label.unreadCount > 0 && (
                      <span className="text-xs text-[var(--quant-muted-foreground)] font-medium">
                        {label.unreadCount}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Create label button / form */}
            {!showCreateForm ? (
              <button
                className="flex items-center gap-2 w-full px-2 py-1.5 min-h-[44px] mt-1 text-sm text-[var(--quant-primary)] hover:bg-[var(--quant-muted)] rounded-md transition-colors"
                onClick={() => setShowCreateForm(true)}
              >
                <span>+</span>
                <span>Create Label</span>
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 p-2 border border-[var(--quant-border)] rounded-lg bg-[var(--quant-background)]"
              >
                <input
                  type="text"
                  className="w-full px-2 py-1.5 min-h-[44px] text-sm border border-[var(--quant-border)] rounded-md bg-transparent focus:outline-none focus:ring-1 focus:ring-[var(--quant-primary)]"
                  placeholder="Label name"
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateLabel();
                  }}
                  autoFocus
                />
                {/* Color picker */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${
                        newLabelColor === color
                          ? 'border-[var(--quant-foreground)] scale-110'
                          : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setNewLabelColor(color)}
                    />
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    className="flex-1 px-2 py-1 min-h-[44px] text-xs font-medium bg-[var(--quant-primary)] text-white rounded-md hover:opacity-90 transition-opacity"
                    onClick={handleCreateLabel}
                    disabled={!newLabelName.trim() || createLabel.isPending}
                  >
                    {createLabel.isPending ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    className="px-2 py-1 min-h-[44px] text-xs text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewLabelName('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [foldersExpanded, setFoldersExpanded] = useState(true);

  const sidebarItems: SidebarItem[] = [
    ...systemFolders.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      active: item.path === '/' ? pathname === '/' : (pathname ?? '').startsWith(item.path),
      onClick: () => router.push(item.path),
    })),
    ...appNavItems.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      active: (pathname ?? '').startsWith(item.path),
      onClick: () => router.push(item.path),
    })),
  ];

  return (
    <Sidebar
      items={sidebarItems}
      header={
        <motion.div
          className="flex items-center gap-2"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', ...spring.gentle }}
        >
          <div className="w-8 h-8 rounded-full bg-[var(--brand-app-color)] flex items-center justify-center text-white font-bold text-sm">
            Q
          </div>
          <h2 className="text-lg font-semibold">QuantMail</h2>
        </motion.div>
      }
      footer={<LabelSection />}
      className="min-h-touch [&_button]:min-h-[44px] [&_a]:min-h-[44px]"
    />
  );
}
