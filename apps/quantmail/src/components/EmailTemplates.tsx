'use client';

import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SearchClearButton } from './SearchClearButton';
import {
  IconCalendar,
  IconHandshake,
  IconRefresh,
  IconSparkle,
  IconWave,
  type IconProps,
} from './icons';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: 'follow-up' | 'introduction' | 'thank-you' | 'scheduling' | 'custom';
  createdAt: string;
  usageCount: number;
}

const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    id: 'tpl-follow-up',
    name: 'Gentle Follow-up',
    subject: 'Following up on our conversation',
    body: "Hi,\n\nJust wanted to follow up on our previous conversation. Let me know if there's anything else I can help with or if you have any questions.\n\nBest regards",
    category: 'follow-up',
    createdAt: new Date().toISOString(),
    usageCount: 0,
  },
  {
    id: 'tpl-intro',
    name: 'Introduction',
    subject: 'Introduction — ',
    body: "Hi,\n\nI wanted to reach out and introduce myself. I'm [your name] and I [context].\n\nI'd love to connect and [purpose]. Would you be open to a brief chat?\n\nBest,",
    category: 'introduction',
    createdAt: new Date().toISOString(),
    usageCount: 0,
  },
  {
    id: 'tpl-thanks',
    name: 'Thank You',
    subject: 'Thank you!',
    body: 'Hi,\n\nThank you so much for [reason]. I really appreciate your time and effort.\n\nLooking forward to [next step].\n\nWarm regards',
    category: 'thank-you',
    createdAt: new Date().toISOString(),
    usageCount: 0,
  },
  {
    id: 'tpl-schedule',
    name: 'Schedule Meeting',
    subject: "Let's find a time to meet",
    body: "Hi,\n\nWould you be available for a quick call this week? I'm free:\n\n- [Day 1], [Time range]\n- [Day 2], [Time range]\n\nLet me know what works best for you, or feel free to suggest another time.\n\nBest",
    category: 'scheduling',
    createdAt: new Date().toISOString(),
    usageCount: 0,
  },
  {
    id: 'tpl-not-interested',
    name: 'Polite Decline',
    subject: 'Re: ',
    body: "Hi,\n\nThank you for reaching out. I appreciate the opportunity, but this isn't something I'm looking to pursue right now.\n\nWishing you all the best.\n\nRegards",
    category: 'custom',
    createdAt: new Date().toISOString(),
    usageCount: 0,
  },
];

interface EmailTemplatesProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: EmailTemplate) => void;
}

const CATEGORY_LABELS: Record<EmailTemplate['category'], string> = {
  'follow-up': 'Follow-up',
  introduction: 'Introduction',
  'thank-you': 'Thank You',
  scheduling: 'Scheduling',
  custom: 'Custom',
};

const CATEGORY_ICONS: Record<EmailTemplate['category'], ComponentType<IconProps>> = {
  'follow-up': IconRefresh,
  introduction: IconWave,
  'thank-you': IconHandshake,
  scheduling: IconCalendar,
  custom: IconSparkle,
};

/**
 * Email template picker — slides in from the side of the compose view.
 * One-click to fill subject + body. Way better than Gmail's hidden "canned responses".
 */
export function EmailTemplates({ isOpen, onClose, onSelectTemplate }: EmailTemplatesProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>(DEFAULT_TEMPLATES);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<EmailTemplate['category'] | 'all'>('all');

  // Load custom templates from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('quant-email-templates');
      if (saved) {
        const custom = JSON.parse(saved) as EmailTemplate[];
        setTemplates([...DEFAULT_TEMPLATES, ...custom]);
      }
    } catch {
      // ignore
    }
  }, []);

  const filteredTemplates = templates.filter((t) => {
    if (activeCategory !== 'all' && t.category !== activeCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q);
    }
    return true;
  });

  const handleSelect = useCallback(
    (template: EmailTemplate) => {
      // Track usage
      setTemplates((prev) =>
        prev.map((t) => (t.id === template.id ? { ...t, usageCount: t.usageCount + 1 } : t)),
      );
      onSelectTemplate(template);
      onClose();
    },
    [onSelectTemplate, onClose],
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="templates-panel"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <header className="templates-header">
            <h3>Templates</h3>
            <button type="button" onClick={onClose} aria-label="Close templates">
              ×
            </button>
          </header>

          <div className="templates-search quant-filter-field">
            <input
              type="search"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && <SearchClearButton onClear={() => setSearchQuery('')} />}
          </div>

          <nav className="templates-categories">
            <button
              type="button"
              className={activeCategory === 'all' ? 'is-active' : ''}
              onClick={() => setActiveCategory('all')}
            >
              All
            </button>
            {(Object.keys(CATEGORY_LABELS) as EmailTemplate['category'][]).map((cat) => {
              const Icon = CATEGORY_ICONS[cat];
              return (
                <button
                  key={cat}
                  type="button"
                  className={activeCategory === cat ? 'is-active' : ''}
                  onClick={() => setActiveCategory(cat)}
                >
                  <Icon size={13} />
                  {CATEGORY_LABELS[cat]}
                </button>
              );
            })}
          </nav>

          <div className="templates-list">
            {filteredTemplates.length === 0 && (
              <p className="templates-empty">No templates match your search</p>
            )}
            {filteredTemplates.map((template) => {
              const Icon = CATEGORY_ICONS[template.category];
              return (
                <button
                  key={template.id}
                  type="button"
                  className="template-item"
                  onClick={() => handleSelect(template)}
                >
                  <div className="template-item-header">
                    <span className="template-icon">
                      <Icon size={14} />
                    </span>
                    <span className="template-name">{template.name}</span>
                  </div>
                  <p className="template-subject">{template.subject}</p>
                  <p className="template-preview">{template.body.slice(0, 80)}...</p>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
