'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { browserApiRequest } from '../services/browser-api-request';
import { SearchClearButton } from './SearchClearButton';
import { IconSparkle } from './icons';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: 'custom';
  createdAt: string;
  // Display-only identifier (e.g. ":intro") shown next to the template name.
  // Nothing in any composer recalls a template by typing — a template is
  // inserted by selecting it in this picker. Never promise typing-recall.
  shortcut: string | null;
}

interface StoredTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  shortcut: string | null;
  createdAt: string;
}

interface EmailTemplatesProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: EmailTemplate) => void;
  /**
   * 'drawer' (default) keeps the original absolute right-side dock. 'popover'
   * renders the same panel as a fixed-size card so a composer can anchor it
   * above its toolbar without a positioned ancestor (see
   * .templates-panel--popover in globals.css).
   */
  variant?: 'drawer' | 'popover';
}

/**
 * Picker search predicate. A query matches a template when it appears in the
 * name, the subject, or the display-only shortcut badge (e.g. ":intro") shown
 * on the row — previously the shortcut was not searched, so typing ":intro"
 * in the picker search never matched the ":intro" badge on the row.
 * Substring matching means "intro" also matches ":intro"; the shortcut is
 * display-only (typing it in the composer does nothing), this only affects
 * picker search.
 */
export function matchesTemplateSearch(template: EmailTemplate, searchQuery: string): boolean {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return true;
  return template.name.toLowerCase().includes(query)
    || template.subject.toLowerCase().includes(query)
    || (template.shortcut ?? '').toLowerCase().includes(query);
}

function bodyText(bodyHtml: string): string {
  if (typeof window === 'undefined' || !bodyHtml.includes('<')) return bodyHtml;
  const documentValue = new DOMParser().parseFromString(bodyHtml, 'text/html');
  return documentValue.body.textContent || '';
}

export function EmailTemplates({ isOpen, onClose, onSelectTemplate, variant = 'drawer' }: EmailTemplatesProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await browserApiRequest('/api/email-templates');
      const payload = await response.json().catch(() => null) as { success?: boolean; data?: StoredTemplate[]; error?: { message?: string } } | null;
      if (!response.ok || !payload?.success || !payload.data) throw new Error(payload?.error?.message || 'Could not load templates.');
      setTemplates(payload.data.map((template) => ({
        id: template.id, name: template.name, subject: template.subject,
        body: bodyText(template.bodyHtml), category: 'custom', createdAt: template.createdAt,
        shortcut: template.shortcut ?? null,
      })));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load templates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isOpen) void loadTemplates(); }, [isOpen, loadTemplates]);

  // Escape closes the picker — both variants (drawer and portaled popover)
  // and all three call sites (EmailComposer, DockedComposer, ThreadComposer)
  // share this component, so one listener here covers them all. Previously
  // only the backdrop click and the X button dismissed it. The listener is
  // on document (not the panel) so Escape also works while focus is in the
  // picker's search field, and it is removed on close/unmount. No caret
  // guard: Escape is not a typing key, unlike single-letter shortcuts.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);
  const filteredTemplates = templates.filter((template) => matchesTemplateSearch(template, searchQuery));

  const handleSelect = useCallback((template: EmailTemplate) => { onSelectTemplate(template); onClose(); }, [onClose, onSelectTemplate]);

  return <AnimatePresence>{isOpen && <motion.div
    className={variant === 'popover' ? 'templates-panel templates-panel--popover' : 'templates-panel'}
    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
  >
    <header className="templates-header"><h3>Templates</h3><button type="button" onClick={onClose} aria-label="Close templates">×</button></header>
    <div className="templates-search quant-filter-field"><input type="search" placeholder="Search templates…" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />{searchQuery && <SearchClearButton onClear={() => setSearchQuery('')} />}</div>
    <div className="templates-list">
      {loading && <p className="templates-empty">Loading templates…</p>}
      {error && <div role="alert"><p className="templates-empty">{error}</p><button type="button" className="template-item" onClick={() => void loadTemplates()}>Retry</button></div>}
      {!loading && !error && filteredTemplates.length === 0 && <p className="templates-empty">{templates.length === 0 ? 'No saved templates yet' : 'No templates match your search'}</p>}
      {!loading && !error && filteredTemplates.map((template) => <button key={template.id} type="button" className="template-item" onClick={() => handleSelect(template)}><div className="template-item-header"><span className="template-icon"><IconSparkle size={14} /></span><span className="template-name">{template.name}</span>{template.shortcut && <span className="template-shortcut" title="Display-only shortcut — typing it in the composer does nothing; select the template to insert it">{template.shortcut}</span>}</div><p className="template-subject">{template.subject}</p><p className="template-preview">{template.body.slice(0, 80)}{template.body.length > 80 ? '…' : ''}</p></button>)}
    </div>
  </motion.div>}</AnimatePresence>;
}
