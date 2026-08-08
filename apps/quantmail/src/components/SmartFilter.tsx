'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { showToast } from './InboxToast';

interface SmartFilterProps {
  onCreateFilter: (filter: FilterRule) => void;
}

export interface FilterRule {
  id: string;
  name: string;
  conditions: FilterCondition[];
  actions: FilterAction[];
}

interface FilterCondition {
  field: 'from' | 'to' | 'subject' | 'has' | 'size';
  operator: 'contains' | 'equals' | 'not_contains' | 'greater_than';
  value: string;
}

interface FilterAction {
  type: 'label' | 'archive' | 'star' | 'mark_read' | 'forward' | 'delete' | 'category';
  value?: string;
}

const CONDITION_FIELDS = [
  { value: 'from', label: 'From' },
  { value: 'to', label: 'To' },
  { value: 'subject', label: 'Subject' },
  { value: 'has', label: 'Has attachment' },
  { value: 'size', label: 'Size greater than' },
] as const;

const ACTION_TYPES = [
  { value: 'label', label: 'Apply label', needsValue: true },
  { value: 'archive', label: 'Skip inbox (archive)', needsValue: false },
  { value: 'star', label: 'Star it', needsValue: false },
  { value: 'mark_read', label: 'Mark as read', needsValue: false },
  { value: 'forward', label: 'Forward to', needsValue: true },
  { value: 'delete', label: 'Delete it', needsValue: false },
  { value: 'category', label: 'Categorize as', needsValue: true },
] as const;

/**
 * Smart Filter Creator — visual filter builder.
 * Gmail has "Create filter" but it's an ugly multi-step form.
 * We make it a clean, visual inline builder with preview.
 */
export function SmartFilter({ onCreateFilter }: SmartFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [conditions, setConditions] = useState<FilterCondition[]>([
    { field: 'from', operator: 'contains', value: '' },
  ]);
  const [actions, setActions] = useState<FilterAction[]>([
    { type: 'label', value: '' },
  ]);

  const addCondition = () => {
    setConditions((prev) => [...prev, { field: 'from', operator: 'contains', value: '' }]);
  };

  const removeCondition = (idx: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateCondition = (idx: number, updates: Partial<FilterCondition>) => {
    setConditions((prev) => prev.map((c, i) => (i === idx ? { ...c, ...updates } : c)));
  };

  const addAction = () => {
    setActions((prev) => [...prev, { type: 'archive' }]);
  };

  const removeAction = (idx: number) => {
    setActions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateAction = (idx: number, updates: Partial<FilterAction>) => {
    setActions((prev) => prev.map((a, i) => (i === idx ? { ...a, ...updates } : a)));
  };

  const handleCreate = () => {
    if (!filterName.trim() || conditions.every((c) => !c.value && c.field !== 'has')) {
      showToast({ text: 'Add a filter name and at least one condition', type: 'warning' });
      return;
    }
    onCreateFilter({
      id: `filter-${Date.now()}`,
      name: filterName.trim(),
      conditions: conditions.filter((c) => c.value || c.field === 'has'),
      actions,
    });
    showToast({ text: `Filter "${filterName}" created`, type: 'success' });
    setIsOpen(false);
    setFilterName('');
    setConditions([{ field: 'from', operator: 'contains', value: '' }]);
    setActions([{ type: 'label', value: '' }]);
  };

  return (
    <div className="smart-filter">
      <button type="button" className="smart-filter-trigger" onClick={() => setIsOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        <span>Create filter</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="smart-filter-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="sf-section">
              <label className="sf-label">Filter name</label>
              <input
                type="text"
                className="sf-input"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                placeholder="e.g. Newsletters → Archive"
              />
            </div>

            <div className="sf-section">
              <label className="sf-label">When email matches</label>
              {conditions.map((cond, idx) => (
                <div key={idx} className="sf-condition-row">
                  <select
                    className="sf-select"
                    value={cond.field}
                    onChange={(e) => updateCondition(idx, { field: e.target.value as FilterCondition['field'] })}
                  >
                    {CONDITION_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                  {cond.field !== 'has' && (
                    <input
                      type="text"
                      className="sf-input sf-input-sm"
                      value={cond.value}
                      onChange={(e) => updateCondition(idx, { value: e.target.value })}
                      placeholder="value"
                    />
                  )}
                  {conditions.length > 1 && (
                    <button type="button" className="sf-remove" onClick={() => removeCondition(idx)}>×</button>
                  )}
                </div>
              ))}
              <button type="button" className="sf-add" onClick={addCondition}>+ Add condition</button>
            </div>

            <div className="sf-section">
              <label className="sf-label">Then do this</label>
              {actions.map((action, idx) => (
                <div key={idx} className="sf-condition-row">
                  <select
                    className="sf-select"
                    value={action.type}
                    onChange={(e) => updateAction(idx, { type: e.target.value as FilterAction['type'] })}
                  >
                    {ACTION_TYPES.map((a) => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                  {ACTION_TYPES.find((a) => a.value === action.type)?.needsValue && (
                    <input
                      type="text"
                      className="sf-input sf-input-sm"
                      value={action.value || ''}
                      onChange={(e) => updateAction(idx, { value: e.target.value })}
                      placeholder="value"
                    />
                  )}
                  {actions.length > 1 && (
                    <button type="button" className="sf-remove" onClick={() => removeAction(idx)}>×</button>
                  )}
                </div>
              ))}
              <button type="button" className="sf-add" onClick={addAction}>+ Add action</button>
            </div>

            <div className="sf-footer">
              <button type="button" className="sf-cancel" onClick={() => setIsOpen(false)}>Cancel</button>
              <button type="button" className="sf-create" onClick={handleCreate}>Create filter</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
