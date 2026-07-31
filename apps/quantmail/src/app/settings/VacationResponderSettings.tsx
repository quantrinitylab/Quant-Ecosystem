'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, FormField, Input, TextArea } from '@quant/shared-ui';
import { apiClient, type UpsertVacationResponderPreference, type VacationResponderPreference } from '../../services/api-client';

type Draft = { subject: string; message: string; startAt: string; endAt: string; onlyContacts: boolean; intervalDays: number };
type Status = 'loading' | 'idle' | 'saving' | 'saved' | 'error';
const EMPTY: Draft = { subject: '', message: '', startAt: '', endAt: '', onlyContacts: false, intervalDays: 1 };

function localDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function draftFrom(value: VacationResponderPreference | null): Draft {
  return value ? { subject: value.subject, message: value.message, startAt: localDate(value.startAt), endAt: localDate(value.endAt), onlyContacts: value.onlyContacts, intervalDays: value.intervalDays } : EMPTY;
}
function payloadFrom(value: Draft): UpsertVacationResponderPreference {
  return { subject: value.subject.trim(), message: value.message.trim(), startAt: value.startAt ? new Date(value.startAt).toISOString() : null, endAt: value.endAt ? new Date(value.endAt).toISOString() : null, onlyContacts: value.onlyContacts, intervalDays: value.intervalDays };
}

export function VacationResponderSettings() {
  const [responder, setResponder] = useState<VacationResponderPreference | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loaded, setLoaded] = useState<Draft>(EMPTY);
  const [status, setStatus] = useState<Status>('loading');
  const [requestError, setRequestError] = useState('');
  const changed = useMemo(() => JSON.stringify(draft) !== JSON.stringify(loaded), [draft, loaded]);
  const validationError = useMemo(() => {
    if (!draft.subject.trim()) return 'Add a subject before saving or enabling auto-reply.';
    if (!draft.message.trim()) return 'Add a message before saving or enabling auto-reply.';
    if (!Number.isInteger(draft.intervalDays) || draft.intervalDays < 0) return 'Reply interval must be zero days or greater.';
    if (draft.startAt && draft.endAt && new Date(draft.startAt) >= new Date(draft.endAt)) return 'The start date must be before the end date.';
    return '';
  }, [draft]);
  const apply = useCallback((value: VacationResponderPreference) => {
    const next = draftFrom(value);
    setResponder(value); setDraft(next); setLoaded(next);
  }, []);

  useEffect(() => { void (async () => {
    const response = await apiClient.getVacationResponder();
    if (response.success) {
      const value = response.data ?? null; const next = draftFrom(value);
      setResponder(value); setDraft(next); setLoaded(next); setStatus('idle');
    } else {
      setRequestError(response.error?.message || 'Vacation responder could not be loaded.'); setStatus('error');
    }
  })(); }, []);

  useEffect(() => {
    if ((status === 'saved' || status === 'error') && changed) { setStatus('idle'); setRequestError(''); }
  }, [changed, status]);

  const save = useCallback(async () => {
    if (validationError || !changed || status === 'saving') return;
    setStatus('saving'); setRequestError('');
    const response = await apiClient.upsertVacationResponder(payloadFrom(draft));
    if (response.success && response.data) { apply(response.data); setStatus('saved'); }
    else { setRequestError(response.error?.message || 'Vacation responder could not be saved.'); setStatus('error'); }
  }, [apply, changed, draft, status, validationError]);

  const toggle = useCallback(async (enabled: boolean) => {
    if (status === 'saving' || (enabled && validationError)) return;
    setStatus('saving'); setRequestError('');
    if (enabled) {
      const saved = await apiClient.upsertVacationResponder(payloadFrom(draft));
      if (!saved.success || !saved.data) { setRequestError(saved.error?.message || 'Vacation responder could not be saved.'); setStatus('error'); return; }
      apply(saved.data);
      const response = await apiClient.enableVacationResponder();
      if (response.success && response.data) { apply(response.data); setStatus('saved'); }
      else { setRequestError(response.error?.message || 'Auto-reply could not be enabled.'); setStatus('error'); }
      return;
    }
    if (!responder) { setStatus('idle'); return; }
    const response = await apiClient.disableVacationResponder();
    if (response.success && response.data) { apply(response.data); setStatus('saved'); }
    else { setRequestError(response.error?.message || 'Auto-reply could not be disabled.'); setStatus('error'); }
  }, [apply, draft, responder, status, validationError]);

  const busy = status === 'loading' || status === 'saving';
  return <div className="space-y-4 border-t border-[var(--quant-border)] pt-4">
    <label className="flex items-start justify-between gap-4">
      <div><span className="text-sm font-medium text-[var(--quant-foreground)]">Vacation auto-reply</span><p className="text-xs text-[var(--quant-muted-foreground)]">Automatically respond to incoming messages while you are away.</p></div>
      <input type="checkbox" checked={responder?.enabled ?? false} disabled={busy || (status === 'error' && !responder)} onChange={(event) => void toggle(event.target.checked)} aria-label="Enable vacation auto-reply" className="mt-1 h-4 w-4 rounded accent-[var(--brand-primary)]" />
    </label>
    {status === 'loading' ? <p className="text-xs text-[var(--quant-muted-foreground)]">Loading live vacation responder…</p> : <div className="space-y-4">
      <FormField label="Auto-reply subject"><Input value={draft.subject} disabled={status === 'saving'} maxLength={500} onChange={(event) => setDraft((value) => ({ ...value, subject: event.target.value }))} placeholder="Out of office" /></FormField>
      <FormField label="Auto-reply message"><TextArea value={draft.message} disabled={status === 'saving'} maxLength={20000} rows={4} onChange={(event) => setDraft((value) => ({ ...value, message: event.target.value }))} placeholder="Share when you will return and who to contact meanwhile." /></FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Starts (optional)"><Input type="datetime-local" value={draft.startAt} disabled={status === 'saving'} onChange={(event) => setDraft((value) => ({ ...value, startAt: event.target.value }))} /></FormField>
        <FormField label="Ends (optional)"><Input type="datetime-local" value={draft.endAt} disabled={status === 'saving'} onChange={(event) => setDraft((value) => ({ ...value, endAt: event.target.value }))} /></FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-3 text-sm text-[var(--quant-foreground)]"><input type="checkbox" checked={draft.onlyContacts} disabled={status === 'saving'} onChange={(event) => setDraft((value) => ({ ...value, onlyContacts: event.target.checked }))} className="h-4 w-4 rounded accent-[var(--brand-primary)]" />Reply only to known contacts</label>
        <FormField label="Reply interval (days)"><Input type="number" min={0} step={1} value={draft.intervalDays} disabled={status === 'saving'} onChange={(event) => setDraft((value) => ({ ...value, intervalDays: Number(event.target.value) }))} /></FormField>
      </div>
      {(validationError || requestError) && <p className="text-xs text-[var(--quant-destructive)]" role="alert">{requestError || validationError}</p>}
      <div className="flex items-center gap-3"><Button variant="primary" onClick={save} disabled={busy || !changed || Boolean(validationError)}>{status === 'saving' ? 'Saving vacation responder…' : changed ? 'Save vacation responder' : 'Vacation responder up to date'}</Button><span className="text-xs text-[var(--quant-muted-foreground)]">{status === 'saved' ? 'Your live vacation responder is synced.' : 'Changes apply to live incoming mail.'}</span></div>
    </div>}
  </div>;
}
