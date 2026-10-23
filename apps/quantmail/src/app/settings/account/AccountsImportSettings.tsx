'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  apiClient,
  type ContactImportResult,
  type OAuthGrant,
  type SendAsIdentity,
} from '../../../services/api-client';
import { SettingsSection } from '../SettingsPrimitives';
import { showToast } from '../../../components/InboxToast';

/**
 * Accounts and Import (fix/qm-accounts-import).
 *
 * Gmail's Settings → Accounts and Import has three jobs: send mail as other
 * addresses, see what is connected to the account, and bring mail & contacts
 * in. QuantMail had none of the three as a surface. This is that surface,
 * built only on calls the backend actually answers:
 *
 * - Send mail as → GET/POST/DELETE /settings/send-as (+ /verify). An address
 *   only becomes a usable From after the 6-digit code mailed to it is
 *   confirmed; unverified rows are inert and the composer never offers them.
 * - Connected accounts → GET /oauth/grants (+ DELETE revoke). These are the
 *   apps and services the user authorized against this QuantMail account —
 *   rendered verbatim, empty state included. They are NOT external mailboxes:
 *   QuantMail does not continuously fetch other providers' mail, and the copy
 *   says so rather than implying it.
 * - Import mail & contacts → POST /emails/import/mbox, /emails/import/imap
 *   and /contacts/import/vcard|csv. The endpoints existed with zero UI; this
 *   is their first UI. Results are the server's counts, quoted verbatim.
 *
 * A control that does not change the product is worse than a missing one, so
 * every button here calls the API and every list is re-read after its
 * mutation. What is not wired says so in words.
 */

type LoadStatus = 'loading' | 'idle' | 'error';

const PRIMARY_BUTTON_CLASSES =
  'inline-flex items-center justify-center rounded-lg border border-[var(--brand-soft-border)] bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary)] hover:text-black disabled:cursor-not-allowed disabled:opacity-50';

const SUBTLE_BUTTON_CLASSES =
  'inline-flex items-center justify-center rounded-lg border border-[var(--quant-border)] px-3 py-1.5 text-xs font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)] disabled:opacity-60';

const INPUT_CLASSES =
  'w-full rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] px-3.5 py-2.5 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-[var(--quant-muted-foreground)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20 disabled:opacity-60';

function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return <p className="text-xs text-[var(--quant-destructive)]">{message}</p>;
}

function StatusPill({ children, tone }: { children: React.ReactNode; tone: 'ok' | 'warn' }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        tone === 'ok'
          ? 'border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] text-[var(--quant-muted-foreground)]'
          : 'border-[var(--brand-soft-border)] bg-[var(--brand-soft)] text-[var(--brand-primary)]'
      }`}
    >
      {children}
    </span>
  );
}

// ─── 1. Send mail as ─────────────────────────────────────────────────────────

export function SendAsSection() {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState('');
  const [identities, setIdentities] = useState<SendAsIdentity[]>([]);
  const [draftEmail, setDraftEmail] = useState('');
  const [draftName, setDraftName] = useState('');
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [actionNote, setActionNote] = useState('');

  const load = useCallback(async () => {
    setLoadStatus('loading');
    setLoadError('');
    const response = await apiClient.getSendAsIdentities();
    if (response.success && Array.isArray(response.data)) {
      setIdentities(response.data);
      setLoadStatus('idle');
    } else {
      setLoadError(response.error?.message || 'Your send-as addresses could not be loaded.');
      setLoadStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(async () => {
    const email = draftEmail.trim();
    if (!email || adding) return;
    setAdding(true);
    setActionError('');
    setActionNote('');
    const response = await apiClient.addSendAsIdentity(email, draftName.trim() || undefined);
    setAdding(false);
    if (response.success && response.data) {
      await load();
      setPendingId(response.data.pendingVerification ? response.data.id : null);
      setCode('');
      setDraftEmail('');
      setDraftName('');
      setActionNote(
        response.data.pendingVerification
          ? response.data.codeDelivered === false
            ? `We could not send the verification code to ${response.data.email} right now. Check the address and add it again.`
            : `We sent a 6-digit code to ${response.data.email}. Enter it below — the address cannot be used as a From until you confirm it.`
          : `${response.data.email} is ready to use as a From address.`,
      );
      showToast({ text: 'Address added — confirm the code to activate it', type: 'success' });
    } else {
      setActionError(response.error?.message || 'The address could not be added.');
    }
  }, [draftEmail, draftName, adding, load]);

  const verify = useCallback(async () => {
    if (!pendingId || !code.trim() || verifying) return;
    setVerifying(true);
    setActionError('');
    setActionNote('');
    const response = await apiClient.verifySendAsIdentity(pendingId, code.trim());
    setVerifying(false);
    if (response.success && response.data) {
      await load();
      setPendingId(null);
      setCode('');
      setActionNote(
        `${response.data.email} is verified — pick it in the composer’s From field to send as it.`,
      );
      showToast({ text: 'Address verified', type: 'success' });
    } else {
      setActionError(response.error?.message || 'The code could not be verified.');
    }
  }, [pendingId, code, verifying, load]);

  const resend = useCallback(async () => {
    const pending = identities.find((identity) => identity.id === pendingId);
    if (!pending) return;
    setAdding(true);
    setActionError('');
    setActionNote('');
    // Re-POST the address: the backend replaces the pending code with a fresh
    // one. This is a new mutation with its own rate limit.
    const response = await apiClient.addSendAsIdentity(
      pending.email,
      pending.displayName ?? undefined,
    );
    setAdding(false);
    if (response.success && response.data) {
      setCode('');
      setActionNote(
        response.data.codeDelivered === false
          ? `We could not send a new code to ${pending.email} right now. Try again in a moment.`
          : `A new 6-digit code is on its way to ${pending.email}.`,
      );
    } else {
      setActionError(response.error?.message || 'A new code could not be sent.');
    }
  }, [identities, pendingId]);

  const remove = useCallback(
    async (id: string) => {
      setBusyId(id);
      setActionError('');
      setActionNote('');
      const response = await apiClient.deleteSendAsIdentity(id);
      setBusyId(null);
      if (response.success) {
        if (pendingId === id) {
          setPendingId(null);
          setCode('');
        }
        await load();
        showToast({ text: 'Address removed', type: 'info' });
      } else {
        setActionError(response.error?.message || 'The address could not be removed.');
      }
    },
    [pendingId, load],
  );

  const pending = identities.find((identity) => identity.id === pendingId && !identity.verified);

  return (
    <SettingsSection
      title="Send mail as"
      description="Extra From addresses for the composer. An address only becomes usable after you confirm the 6-digit code sent to it — an unconfirmed address can never send. Mail sent as an alias goes out through QuantMail's servers; some providers treat mail whose From domain does not authorize us with suspicion, so prefer addresses whose domain lets you authorize senders."
    >
      {loadStatus === 'loading' ? (
        <p className="pt-1 text-xs text-[var(--quant-muted-foreground)]">
          Loading your send-as addresses…
        </p>
      ) : loadStatus === 'error' ? (
        <div className="pt-1">
          <ErrorNote message={loadError} />
          <button
            type="button"
            onClick={() => void load()}
            className={`${SUBTLE_BUTTON_CLASSES} mt-2`}
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="pt-1">
          {identities.length === 0 ? (
            <p className="text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
              No extra addresses yet. Every message you send uses your QuantMail address until you
              add and confirm one here.
            </p>
          ) : (
            <ul className="space-y-2">
              {identities.map((identity) => (
                <li
                  key={identity.id}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-[var(--quant-foreground)]">
                      {identity.displayName ? `${identity.displayName} ` : ''}
                      <span className="font-normal text-[var(--quant-muted-foreground)]">
                        &lt;{identity.email}&gt;
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-none items-center gap-2">
                    {identity.verified ? (
                      <StatusPill tone="ok">Verified</StatusPill>
                    ) : (
                      <StatusPill tone="warn">Awaiting code</StatusPill>
                    )}
                    <button
                      type="button"
                      disabled={busyId === identity.id}
                      onClick={() => void remove(identity.id)}
                      className="text-[11px] font-medium text-[var(--quant-destructive)] hover:underline disabled:opacity-50"
                    >
                      {busyId === identity.id ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {pending && (
            <div className="mt-3 rounded-lg border border-[var(--brand-soft-border)] bg-[var(--brand-soft)]/40 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--quant-muted-foreground)]">
                Confirm {pending.email}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--quant-muted-foreground)]">
                Enter the 6-digit code we sent to this address. It expires in 15 minutes and works
                once.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  aria-label="Verification code"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  className="w-32 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] px-3 py-1.5 text-sm outline-none placeholder:text-[var(--quant-muted-foreground)] focus:border-[var(--brand-primary)]"
                />
                <button
                  type="button"
                  onClick={() => void verify()}
                  disabled={verifying || code.trim().length !== 6}
                  className={PRIMARY_BUTTON_CLASSES}
                >
                  {verifying ? 'Confirming…' : 'Confirm address'}
                </button>
                <button
                  type="button"
                  onClick={() => void resend()}
                  disabled={adding}
                  className={SUBTLE_BUTTON_CLASSES}
                >
                  {adding ? 'Sending…' : 'Resend code'}
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--quant-muted-foreground)]">
              Add another address
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                type="email"
                placeholder="you@other-domain.com"
                aria-label="Address to send mail as"
                value={draftEmail}
                onChange={(event) => setDraftEmail(event.target.value)}
                className={INPUT_CLASSES}
              />
              <input
                type="text"
                placeholder="Display name (optional)"
                aria-label="Display name for the address"
                maxLength={80}
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                className={INPUT_CLASSES}
              />
            </div>
            <button
              type="button"
              onClick={() => void add()}
              disabled={adding || !draftEmail.trim()}
              className={`${PRIMARY_BUTTON_CLASSES} mt-2`}
            >
              {adding ? 'Adding…' : 'Add address'}
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--quant-muted-foreground)]">
              Your QuantMail address needs no row — it is always the default From.
            </p>
          </div>

          <ErrorNote message={actionError} />
          {actionNote && (
            <p className="text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
              {actionNote}
            </p>
          )}
        </div>
      )}
    </SettingsSection>
  );
}

// ─── 2. Connected accounts ───────────────────────────────────────────────────

export function ConnectedAccountsSection() {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState('');
  const [grants, setGrants] = useState<OAuthGrant[]>([]);
  const [busyClientId, setBusyClientId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoadStatus('loading');
    setLoadError('');
    const response = await apiClient.getOAuthGrants();
    if (response.success && Array.isArray(response.data)) {
      setGrants(response.data);
      setLoadStatus('idle');
    } else {
      setLoadError(response.error?.message || 'Your connected accounts could not be loaded.');
      setLoadStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = useCallback(
    async (clientId: string) => {
      setBusyClientId(clientId);
      setActionError('');
      const response = await apiClient.revokeOAuthGrant(clientId);
      setBusyClientId(null);
      if (response.success) {
        await load();
        showToast({ text: 'Access revoked', type: 'info' });
      } else {
        setActionError(response.error?.message || 'Access could not be revoked.');
      }
    },
    [load],
  );

  return (
    <SettingsSection
      title="Connected accounts"
      description="Apps and services you have authorized against this QuantMail account — the same list the Security page shows. Revoking removes the grant; the app must ask again before it can act for you. This is not a mailbox fetcher: QuantMail does not continuously pull mail from other providers. To move old mail in once, use Import below."
      action={
        <Link
          href="/security"
          className="inline-flex items-center justify-center rounded-lg border border-[var(--quant-border)] px-3 py-1.5 text-xs font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)]"
        >
          Open Security →
        </Link>
      }
    >
      {loadStatus === 'loading' ? (
        <p className="pt-1 text-xs text-[var(--quant-muted-foreground)]">
          Loading your connected accounts…
        </p>
      ) : loadStatus === 'error' ? (
        <div className="pt-1">
          <ErrorNote message={loadError} />
          <button
            type="button"
            onClick={() => void load()}
            className={`${SUBTLE_BUTTON_CLASSES} mt-2`}
          >
            Try again
          </button>
        </div>
      ) : grants.length === 0 ? (
        <p className="pt-1 text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
          Nothing is connected. No app or service currently holds an authorization on this account.
        </p>
      ) : (
        <ul className="space-y-2 pt-1">
          {grants.map((grant) => (
            <li
              key={grant.clientId}
              className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-[var(--quant-foreground)]">
                  {grant.clientName}
                  {grant.isFirstParty && (
                    <span className="ml-2 rounded-full border border-[var(--quant-border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--quant-muted-foreground)]">
                      QuantMail
                    </span>
                  )}
                </p>
                <p className="truncate text-[11px] text-[var(--quant-muted-foreground)]">
                  {grant.scopes.length > 0
                    ? `Can: ${grant.scopes.join(', ')}`
                    : 'No scopes recorded'}
                </p>
              </div>
              <button
                type="button"
                disabled={busyClientId === grant.clientId}
                onClick={() => void revoke(grant.clientId)}
                className="flex-none text-[11px] font-medium text-[var(--quant-destructive)] hover:underline disabled:opacity-50"
              >
                {busyClientId === grant.clientId ? 'Revoking…' : 'Revoke access'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote message={actionError} />
    </SettingsSection>
  );
}

// ─── 3. Import mail & contacts ───────────────────────────────────────────────

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}

function ImportResultLine({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2.5 py-1 text-[11px] text-[var(--quant-muted-foreground)]">
      <strong className="font-semibold text-[var(--quant-foreground)]">{value}</strong> {label}
    </span>
  );
}

export function ImportSection() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [mailResult, setMailResult] = useState<{
    imported: number;
    skipped: number;
    total: number;
  } | null>(null);
  const [contactResult, setContactResult] = useState<ContactImportResult | null>(null);
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState('993');
  const [imapUser, setImapUser] = useState('');
  const [imapPassword, setImapPassword] = useState('');
  const [imapTls, setImapTls] = useState(true);
  const mboxInputRef = useRef<HTMLInputElement>(null);
  const vcardInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const importMboxFile = useCallback(async (file: File) => {
    setBusy('mbox');
    setError('');
    setMailResult(null);
    try {
      const text = await readFileText(file);
      if (!text.trim()) throw new Error('That file is empty.');
      const response = await apiClient.importMbox(text, { folder: 'inbox', maxMessages: 500 });
      if (response.success && response.data) {
        setMailResult({
          imported: response.data.importedCount,
          skipped: response.data.skippedCount,
          total: response.data.totalFound,
        });
        showToast({
          text: `${response.data.importedCount} messages imported`,
          type: 'success',
        });
      } else {
        setError(response.error?.message || 'The mailbox file could not be imported.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The mailbox file could not be read.');
    }
    setBusy(null);
  }, []);

  const importImapNow = useCallback(async () => {
    const host = imapHost.trim();
    const username = imapUser.trim();
    if (!host || !username || busy) return;
    setBusy('imap');
    setError('');
    setMailResult(null);
    const port = Number.parseInt(imapPort, 10);
    const response = await apiClient.importImap({
      host,
      port: Number.isFinite(port) && port > 0 ? port : undefined,
      tls: imapTls,
      username,
      password: imapPassword || undefined,
      maxMessages: 500,
      folder: 'inbox',
    });
    setBusy(null);
    if (response.success && response.data) {
      setMailResult({
        imported: response.data.importedCount,
        skipped: response.data.skippedCount,
        total: response.data.totalFound,
      });
      setImapPassword('');
      showToast({
        text: `${response.data.importedCount} messages imported from ${response.data.mailbox || host}`,
        type: 'success',
      });
    } else {
      setError(response.error?.message || 'The mailbox could not be imported.');
    }
  }, [imapHost, imapPort, imapUser, imapPassword, imapTls, busy]);

  const importContactsFile = useCallback(async (file: File, kind: 'vcard' | 'csv') => {
    const key = kind === 'vcard' ? 'vcard' : 'csv';
    setBusy(key);
    setError('');
    setContactResult(null);
    try {
      const text = await readFileText(file);
      if (!text.trim()) throw new Error('That file is empty.');
      const response =
        kind === 'vcard'
          ? await apiClient.importContactsVCard(text)
          : await apiClient.importContactsCsv(text);
      if (response.success && response.data) {
        setContactResult(response.data);
        showToast({
          text: `${response.data.imported} contacts imported`,
          type: 'success',
        });
      } else {
        setError(response.error?.message || 'The contacts file could not be imported.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The contacts file could not be read.');
    }
    setBusy(null);
  }, []);

  return (
    <SettingsSection
      title="Import mail & contacts"
      description="Bring your old mailbox and address book into QuantMail. Mail imports land in your inbox as ordinary messages; contacts merge into your address book. Counts below are the server's, quoted as returned."
    >
      <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--quant-muted-foreground)]">
          Import mail
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            ref={mboxInputRef}
            type="file"
            accept=".mbox,.mbx,text/plain"
            className="hidden"
            aria-label="Choose an mbox file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importMboxFile(file);
            }}
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => mboxInputRef.current?.click()}
            className={SUBTLE_BUTTON_CLASSES}
          >
            {busy === 'mbox' ? 'Importing…' : 'Upload mbox file'}
          </button>
          <p className="w-full text-[11px] leading-relaxed text-[var(--quant-muted-foreground)]">
            A Google Takeout / Thunderbird mbox export (up to 500 messages per file). The file is
            read in your browser and sent to the import endpoint — nothing is uploaded before you
            choose it.
          </p>
        </div>

        <div className="mt-3 border-t border-[var(--quant-border)] pt-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--quant-muted-foreground)]">
            Import from another provider (IMAP)
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              placeholder="IMAP host, e.g. imap.gmail.com"
              aria-label="IMAP host"
              value={imapHost}
              onChange={(event) => setImapHost(event.target.value)}
              className={INPUT_CLASSES}
            />
            <input
              type="number"
              placeholder="Port (993)"
              aria-label="IMAP port"
              value={imapPort}
              onChange={(event) => setImapPort(event.target.value)}
              className={INPUT_CLASSES}
            />
            <input
              type="text"
              placeholder="Username"
              aria-label="IMAP username"
              autoComplete="username"
              value={imapUser}
              onChange={(event) => setImapUser(event.target.value)}
              className={INPUT_CLASSES}
            />
            <input
              type="password"
              placeholder="Password or app password"
              aria-label="IMAP password"
              autoComplete="off"
              value={imapPassword}
              onChange={(event) => setImapPassword(event.target.value)}
              className={INPUT_CLASSES}
            />
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
            <input
              type="checkbox"
              checked={imapTls}
              onChange={(event) => setImapTls(event.target.checked)}
              className="size-4 accent-[var(--brand-primary)]"
            />
            Use TLS (recommended — port 993)
          </label>
          <button
            type="button"
            disabled={busy !== null || !imapHost.trim() || !imapUser.trim()}
            onClick={() => void importImapNow()}
            className={`${PRIMARY_BUTTON_CLASSES} mt-2`}
          >
            {busy === 'imap' ? 'Importing…' : 'Import mailbox'}
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--quant-muted-foreground)]">
            Your password is used once, over an encrypted connection, to read the mailbox for this
            import — it is not stored. Gmail and most providers need an app password for this, not
            your login password.
          </p>
        </div>

        {mailResult && (
          <div className="mt-3 flex flex-wrap gap-2">
            <ImportResultLine label="imported" value={mailResult.imported} />
            <ImportResultLine label="skipped (already here)" value={mailResult.skipped} />
            <ImportResultLine label="found" value={mailResult.total} />
          </div>
        )}
      </div>

      <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] p-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--quant-muted-foreground)]">
          Import contacts
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            ref={vcardInputRef}
            type="file"
            accept=".vcf,.vcard,text/vcard"
            className="hidden"
            aria-label="Choose a vCard file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importContactsFile(file, 'vcard');
            }}
          />
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            aria-label="Choose a CSV file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importContactsFile(file, 'csv');
            }}
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => vcardInputRef.current?.click()}
            className={SUBTLE_BUTTON_CLASSES}
          >
            {busy === 'vcard' ? 'Importing…' : 'Upload vCard (.vcf)'}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => csvInputRef.current?.click()}
            className={SUBTLE_BUTTON_CLASSES}
          >
            {busy === 'csv' ? 'Importing…' : 'Upload CSV (.csv)'}
          </button>
          <p className="w-full text-[11px] leading-relaxed text-[var(--quant-muted-foreground)]">
            A vCard export (Apple Contacts, Google Contacts) or a CSV with name/email columns. The
            file is read in your browser and sent to the import endpoint.
          </p>
        </div>
        {contactResult && (
          <div className="mt-3 flex flex-wrap gap-2">
            <ImportResultLine label="imported" value={contactResult.imported} />
            <ImportResultLine label="duplicates skipped" value={contactResult.duplicates} />
            <ImportResultLine label="errors" value={contactResult.errors} />
            <ImportResultLine label="rows read" value={contactResult.total} />
          </div>
        )}
      </div>

      <ErrorNote message={error} />
    </SettingsSection>
  );
}

/**
 * The Accounts and Import surface, mounted on Settings → Account Management.
 * Three sections, each backed by a real endpoint — nothing here is a
 * placeholder control.
 */
export function AccountsImportSettings() {
  return (
    <>
      <SendAsSection />
      <ConnectedAccountsSection />
      <ImportSection />
    </>
  );
}
