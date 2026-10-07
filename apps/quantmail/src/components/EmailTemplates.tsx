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
  usageCount: number;
}

interface StoredTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  createdAt: string;
}

interface EmailTemplatesProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: EmailTemplate) => void;
}

function bodyText(bodyHtml: string): string {
  if (typeof window === 'undefined' || !bodyHtml.includes('<')) return bodyHtml;
  const documentValue = new DOMParser().parseFromString(bodyHtml, 'text/html');
  return documentValue.body.textContent || '';
}

export function EmailTemplates({ isOpen, onClose, onSelectTemplate }: EmailTemplatesProps) {
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
        body: bodyText(template.bodyHtml), category: 'custom', createdAt: template.createdAt, usageCount: 0,
      })));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load templates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isOpen) void loadTemplates(); }, [isOpen, loadTemplates]);
  const filteredTemplates = templates.filter((template) => {
    const query = searchQuery.trim().toLowerCase();
    return !query || template.name.toLowerCase().includes(query) || template.subject.toLowerCase().includes(query);
  });

  const handleSelect = useCallback((template: EmailTemplate) => { onSelectTemplate(template); onClose(); }, [onClose, onSelectTemplate]);

  return <AnimatePresence>{isOpen && <motion.div className="templates-panel" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
    <header className="templates-header"><h3>Templates</h3><button type="button" onClick={onClose} aria-label="Close templates">×</button></header>
    <div className="templates-search quant-filter-field"><input type="search" placeholder="Search templates…" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />{searchQuery && <SearchClearButton onClear={() => setSearchQuery('')} />}</div>
    <div className="templates-list">
      {loading && <p className="templates-empty">Loading templates…</p>}
      {error && <div role="alert"><p className="templates-empty">{error}</p><button type="button" className="template-item" onClick={() => void loadTemplates()}>Retry</button></div>}
      {!loading && !error && filteredTemplates.length === 0 && <p className="templates-empty">{templates.length === 0 ? 'No saved templates yet' : 'No templates match your search'}</p>}
      {!loading && !error && filteredTemplates.map((template) => <button key={template.id} type="button" className="template-item" onClick={() => handleSelect(template)}><div className="template-item-header"><span className="template-icon"><IconSparkle size={14} /></span><span className="template-name">{template.name}</span></div><p className="template-subject">{template.subject}</p><p className="template-preview">{template.body.slice(0, 80)}{template.body.length > 80 ? '…' : ''}</p></button>)}
    </div>
  </motion.div>}</AnimatePresence>;
}
