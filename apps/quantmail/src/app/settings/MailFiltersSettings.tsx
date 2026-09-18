'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, FormField, Input, Modal } from '@quant/shared-ui';
import {
  apiClient,
  type MailFilterItem,
  type CreateMailFilterInput,
  type MailFilterCondition,
  type MailFilterAction,
} from '../../services/api-client';
import { SettingsSection } from './SettingsPrimitives';
import { showToast } from '../../components/InboxToast';

export function MailFiltersSettings() {
  const [filters, setFilters] = useState<MailFilterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState<MailFilterItem | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  // Form state for creating a new filter
  const [filterName, setFilterName] = useState('');
  const [fromPattern, setFromPattern] = useState('');
  const [toPattern, setToPattern] = useState('');
  const [subjectPattern, setSubjectPattern] = useState('');
  const [bodyPattern, setBodyPattern] = useState('');
  const [hasAttachment, setHasAttachment] = useState(false);

  // Actions
  const [markRead, setMarkRead] = useState(false);
  const [star, setStar] = useState(false);
  const [archive, setArchive] = useState(false);
  const [markSpam, setMarkSpam] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState(false);
  const [applyExistingOnCreate, setApplyExistingOnCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Test filter form state
  const [testFrom, setTestFrom] = useState('');
  const [testSubject, setTestSubject] = useState('');
  const [testBody, setTestBody] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ matches: boolean } | null>(null);

  const loadFilters = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.getMailFilters();
    setLoading(false);
    if (res.success && res.data) {
      setFilters(res.data);
    } else {
      showToast({ text: res.error?.message || 'Failed to load mail filters', type: 'error' });
    }
  }, []);

  useEffect(() => {
    void loadFilters();
  }, [loadFilters]);

  const resetForm = () => {
    setFilterName('');
    setFromPattern('');
    setToPattern('');
    setSubjectPattern('');
    setBodyPattern('');
    setHasAttachment(false);
    setMarkRead(false);
    setStar(false);
    setArchive(false);
    setMarkSpam(false);
    setDeleteMsg(false);
    setApplyExistingOnCreate(false);
  };

  const handleCreateFilter = async () => {
    const name = filterName.trim();
    if (!name) {
      showToast({ text: 'Filter name is required', type: 'error' });
      return;
    }

    const conditions: MailFilterCondition[] = [];
    const condition: MailFilterCondition = {};
    if (fromPattern.trim()) condition.from = fromPattern.trim();
    if (toPattern.trim()) condition.to = toPattern.trim();
    if (subjectPattern.trim()) condition.subjectContains = subjectPattern.trim();
    if (bodyPattern.trim()) condition.bodyContains = bodyPattern.trim();
    if (hasAttachment) condition.hasAttachment = true;

    if (Object.keys(condition).length === 0) {
      showToast({ text: 'At least one condition is required', type: 'error' });
      return;
    }
    conditions.push(condition);

    const action: MailFilterAction = {};
    if (markRead) action.markRead = true;
    if (star) action.star = true;
    if (archive) action.archive = true;
    if (markSpam) action.markSpam = true;
    if (deleteMsg) action.delete = true;

    if (Object.keys(action).length === 0) {
      showToast({ text: 'At least one action is required', type: 'error' });
      return;
    }
    const actions: MailFilterAction[] = [action];

    setCreating(true);
    const payload: CreateMailFilterInput = {
      name,
      enabled: true,
      matchAll: true,
      conditions,
      actions,
    };

    const res = await apiClient.createMailFilter(payload);
    setCreating(false);

    if (!res.success || !res.data) {
      showToast({ text: res.error?.message || 'Failed to create filter', type: 'error' });
      return;
    }

    const newFilter = res.data;
    showToast({ text: `Filter "${name}" created successfully`, type: 'success' });
    setShowCreateModal(false);
    resetForm();

    if (applyExistingOnCreate) {
      void handleApplyFilter(newFilter.id, newFilter.name);
    }

    void loadFilters();
  };

  const handleDeleteFilter = async (id: string, name: string) => {
    const res = await apiClient.deleteMailFilter(id);
    if (res.success) {
      showToast({ text: `Filter "${name}" deleted`, type: 'success' });
      void loadFilters();
    } else {
      showToast({ text: res.error?.message || 'Failed to delete filter', type: 'error' });
    }
  };

  const handleApplyFilter = async (id: string, name: string) => {
    setApplyingId(id);
    showToast({ text: `Applying filter "${name}" to existing messages…`, type: 'info' });
    const res = await apiClient.applyMailFilter(id);
    setApplyingId(null);

    if (res.success && res.data) {
      showToast({
        text: `Applied "${name}": scanned ${res.data.processedCount} messages, updated ${res.data.affectedCount}`,
        type: 'success',
      });
    } else {
      showToast({ text: res.error?.message || 'Failed to apply filter', type: 'error' });
    }
  };

  const handleTestFilter = async () => {
    if (!showTestModal) return;
    setTesting(true);
    setTestResult(null);

    const res = await apiClient.testMailFilter(showTestModal.id, {
      fromAddress: testFrom.trim(),
      subject: testSubject.trim(),
      bodyPlain: testBody.trim() || undefined,
    });
    setTesting(false);

    if (res.success && res.data) {
      setTestResult(res.data);
    } else {
      showToast({ text: res.error?.message || 'Failed to test filter', type: 'error' });
    }
  };

  const formatConditions = (conditions: MailFilterCondition[]) => {
    const parts: string[] = [];
    for (const c of conditions) {
      if (c.from) parts.push(`From: "${c.from}"`);
      if (c.to) parts.push(`To: "${c.to}"`);
      if (c.subjectContains) parts.push(`Subject contains: "${c.subjectContains}"`);
      if (c.bodyContains) parts.push(`Body contains: "${c.bodyContains}"`);
      if (c.domain) parts.push(`Domain: "${c.domain}"`);
      if (c.hasAttachment) parts.push('Has attachment');
    }
    return parts.length > 0 ? parts.join(' · ') : 'No conditions specified';
  };

  const formatActions = (actions: MailFilterAction[]) => {
    const parts: string[] = [];
    for (const a of actions) {
      if (a.markRead) parts.push('Mark as read');
      if (a.star) parts.push('Star');
      if (a.archive) parts.push('Archive');
      if (a.markSpam) parts.push('Mark as spam');
      if (a.delete) parts.push('Move to trash');
      if (a.addLabelId) parts.push(`Label: ${a.addLabelId}`);
      if (a.moveToFolderId) parts.push(`Folder: ${a.moveToFolderId}`);
      if (a.forwardTo) parts.push(`Forward to ${a.forwardTo}`);
    }
    return parts.length > 0 ? parts.join(', ') : 'No actions specified';
  };

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Mail Filters & Routing Rules"
        description="Automatically organize, label, star, archive, or trash incoming emails based on sender, subject, or content rules."
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
          >
            + Create Filter
          </Button>
        }
      >
        {loading ? (
          <div className="p-8 text-center text-xs text-[var(--quant-muted-foreground)]">
            <div className="w-5 h-5 border-2 border-[var(--brand-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading filters…
          </div>
        ) : filters.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)]">
            <div className="w-10 h-10 rounded-full bg-[var(--quant-surface-elevated)] border border-[var(--quant-border)] flex items-center justify-center mx-auto mb-3 text-[var(--quant-muted-foreground)]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <polygon
                  points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h4 className="text-sm font-semibold text-[var(--quant-foreground)] mb-1">
              No mail filters created
            </h4>
            <p className="text-xs text-[var(--quant-muted-foreground)] max-w-sm mx-auto mb-4">
              Set up rules to automatically process incoming emails from newsletters, alerts, or
              specific senders.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}
            >
              Create your first filter
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filters.map((filter) => (
              <div
                key={filter.id}
                className="p-4 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] hover:border-[var(--quant-border-hover)] transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-[var(--quant-foreground)] truncate">
                        {filter.name}
                      </h4>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                          filter.enabled
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        }`}
                      >
                        {filter.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
                      <strong className="text-[var(--quant-foreground)]">When:</strong>{' '}
                      {formatConditions(filter.conditions)}
                    </p>
                    <p className="text-xs text-[var(--quant-muted-foreground)] mt-0.5">
                      <strong className="text-[var(--brand-primary)]">Do:</strong>{' '}
                      {formatActions(filter.actions)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleApplyFilter(filter.id, filter.name)}
                      disabled={applyingId === filter.id}
                    >
                      {applyingId === filter.id ? 'Applying…' : 'Apply Now'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setShowTestModal(filter);
                        setTestResult(null);
                        setTestFrom('');
                        setTestSubject('');
                        setTestBody('');
                      }}
                    >
                      Test
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleDeleteFilter(filter.id, filter.name)}
                      className="text-rose-400 hover:text-rose-300"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      {/* Create Filter Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Mail Filter"
      >
        <div className="p-4 space-y-4">
          <FormField label="Filter Name">
            <Input
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              placeholder="e.g. Newsletters to Read Later, GitHub Notifications"
              autoFocus
            />
          </FormField>

          <div className="border-t border-[var(--quant-border)] pt-3">
            <h5 className="text-xs font-bold uppercase tracking-wider text-[var(--quant-muted-foreground)] mb-3">
              Matching Criteria
            </h5>
            <div className="space-y-3">
              <FormField label="From (address or domain)">
                <Input
                  value={fromPattern}
                  onChange={(e) => setFromPattern(e.target.value)}
                  placeholder="e.g. notifications@github.com, @stripe.com"
                />
              </FormField>

              <FormField label="To (address)">
                <Input
                  value={toPattern}
                  onChange={(e) => setToPattern(e.target.value)}
                  placeholder="e.g. dev-team@quantmail.in"
                />
              </FormField>

              <FormField label="Subject contains">
                <Input
                  value={subjectPattern}
                  onChange={(e) => setSubjectPattern(e.target.value)}
                  placeholder="e.g. Invoice, Pull Request, Weekly Digest"
                />
              </FormField>

              <FormField label="Has words (in body)">
                <Input
                  value={bodyPattern}
                  onChange={(e) => setBodyPattern(e.target.value)}
                  placeholder="e.g. unsubscribe, statement, payment confirmed"
                />
              </FormField>

              <label className="flex items-center gap-2 text-xs text-[var(--quant-foreground)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasAttachment}
                  onChange={(e) => setHasAttachment(e.target.checked)}
                  className="accent-[var(--brand-primary)] rounded"
                />
                <span>Has attachment</span>
              </label>
            </div>
          </div>

          <div className="border-t border-[var(--quant-border)] pt-3">
            <h5 className="text-xs font-bold uppercase tracking-wider text-[var(--quant-muted-foreground)] mb-3">
              Actions
            </h5>
            <div className="grid grid-cols-2 gap-2.5 text-xs text-[var(--quant-foreground)]">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={markRead}
                  onChange={(e) => setMarkRead(e.target.checked)}
                  className="accent-[var(--brand-primary)] rounded"
                />
                <span>Mark as read</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={star}
                  onChange={(e) => setStar(e.target.checked)}
                  className="accent-[var(--brand-primary)] rounded"
                />
                <span>Star message</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={archive}
                  onChange={(e) => setArchive(e.target.checked)}
                  className="accent-[var(--brand-primary)] rounded"
                />
                <span>Archive (skip inbox)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={markSpam}
                  onChange={(e) => setMarkSpam(e.target.checked)}
                  className="accent-[var(--brand-primary)] rounded"
                />
                <span>Mark as spam</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deleteMsg}
                  onChange={(e) => setDeleteMsg(e.target.checked)}
                  className="accent-rose-500 rounded"
                />
                <span className="text-rose-400">Move to trash</span>
              </label>
            </div>
          </div>

          <div className="border-t border-[var(--quant-border)] pt-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--brand-primary)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={applyExistingOnCreate}
                onChange={(e) => setApplyExistingOnCreate(e.target.checked)}
                className="accent-[var(--brand-primary)] rounded"
              />
              <span>Also apply filter to existing matching messages in Inbox</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--quant-border)]">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateFilter} disabled={creating}>
              {creating ? 'Creating…' : 'Create Filter'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Test Filter Modal */}
      <Modal
        isOpen={Boolean(showTestModal)}
        onClose={() => setShowTestModal(null)}
        title={`Test Filter "${showTestModal?.name}"`}
      >
        <div className="p-4 space-y-4">
          <p className="text-xs text-[var(--quant-muted-foreground)]">
            Enter sample email attributes to verify whether this filter’s criteria would trigger.
          </p>

          <FormField label="Sample From Address">
            <Input
              value={testFrom}
              onChange={(e) => setTestFrom(e.target.value)}
              placeholder="e.g. sender@example.com"
            />
          </FormField>

          <FormField label="Sample Subject">
            <Input
              value={testSubject}
              onChange={(e) => setTestSubject(e.target.value)}
              placeholder="e.g. Urgent security notification"
            />
          </FormField>

          <FormField label="Sample Body Text">
            <Input
              value={testBody}
              onChange={(e) => setTestBody(e.target.value)}
              placeholder="e.g. Please click the link to confirm your account"
            />
          </FormField>

          {testResult !== null && (
            <div
              className={`p-3 rounded-lg text-xs font-semibold border ${
                testResult.matches
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-zinc-800/50 text-zinc-400 border-zinc-700'
              }`}
            >
              {testResult.matches ? (
                <span>Filter Matched: This email satisfies all matching criteria.</span>
              ) : (
                <span>Filter Did Not Match: This email does not meet the filter criteria.</span>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--quant-border)]">
            <Button variant="secondary" onClick={() => setShowTestModal(null)}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={handleTestFilter}
              disabled={testing || !testFrom.trim()}
            >
              {testing ? 'Testing…' : 'Evaluate Sample'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
