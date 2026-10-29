'use client';

// ============================================================================
// QuantMail — Universal Search result sections (K10 / M13).
//
// Renders the per-source sections of useUniversalSearch. A source that failed
// renders its failure inline (spec: "partial results must identify which
// domain failed") instead of vanishing. Coverage is labeled honestly: Mail,
// People, Calendar, Drive — and only those.
// ============================================================================

import { useRouter } from 'next/navigation';
import { EmptyState } from '@quant/shared-ui';
import {
  SEARCH_COUNT_BANNER,
  describeSearchCountLabel,
  describeSearchEmpty,
  selectTopResultSlots,
} from '../../lib/search-results-label';
import type {
  UniversalSearchResults,
  UniversalSearchScope,
  DriveFileHit,
  DriveDocumentHit,
} from '../../hooks/useUniversalSearch';
import type { Email, Contact, CalendarEvent } from '../../types';

type IconName = 'mail' | 'user' | 'calendar' | 'file' | 'doc' | 'warn' | 'arrow';
const ICON_PATHS: Record<IconName, React.ReactNode> = {
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5z" />
      <path d="M14 3v5h5" />
    </>
  ),
  doc: (
    <>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  warn: (
    <>
      <path d="M12 3 2.5 20h19L12 3z" />
      <path d="M12 10v4m0 3v.5" />
    </>
  ),
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
};

function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: IconName;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)]">
        <Icon name={icon} className="h-3.5 w-3.5" />
        {title}
        <span className="font-normal normal-case tracking-normal">({count})</span>
      </h3>
      {children}
    </div>
  );
}

function SourceError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-xs text-amber-300" role="alert">
      <Icon name="warn" className="h-4 w-4 shrink-0" />
      <span>Could not search this source right now: {message}</span>
    </div>
  );
}

function relativeDate(value?: string | Date): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (dayDiff === 0) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

function formatBytes(size?: number): string {
  if (size == null || Number.isNaN(size)) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const rowClass =
  'flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/5';

function MailRow({ email, onOpen }: { email: Email; onOpen: (email: Email) => void }) {
  const senderLabel = email.from?.name || email.from?.email || '?';
  return (
    <button type="button" onClick={() => onOpen(email)} className={rowClass}>
      <Icon name="mail" className="h-4 w-4 shrink-0 text-[var(--quant-muted-foreground)]" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 truncate text-sm font-medium">{email.subject || '(no subject)'}</span>
          <span className="ml-auto shrink-0 text-xs text-[var(--quant-muted-foreground)]">
            {relativeDate(email.receivedAt)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-[var(--quant-muted-foreground)]">
          {senderLabel}{email.snippet ? ` — ${email.snippet}` : ''}
        </span>
      </span>
      <Icon name="arrow" className="h-3.5 w-3.5 shrink-0 text-[var(--quant-muted-foreground)]" />
    </button>
  );
}

/**
 * Deep link for a universal-search person hit. Opens the contact's detail pane
 * on /contacts — selected via the ?contact= id param — instead of the bare
 * /contacts list, so the tapped person is never lost (QM 2026-10-19).
 * Falls back to the bare list when the hit carries no id.
 */
export function personDetailHref(person: Contact): string {
  return person.id ? `/contacts?contact=${encodeURIComponent(person.id)}` : '/contacts';
}

/**
 * Deep link for a universal-search drive FILE hit. Opens the file in the
 * drive preview (?file=<id>) instead of the bare /drive root, so the tapped
 * file is never lost — the same never-lose-the-hit pattern as
 * personDetailHref (QM 2026-10-19) and the /drive/doc/<id> document rows.
 * Falls back to the bare list when the hit carries no id.
 */
export function filePreviewHref(file: DriveFileHit): string {
  return file.id ? `/drive?file=${encodeURIComponent(file.id)}` : '/drive';
}

function PersonRow({ person }: { person: Contact }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(personDetailHref(person))}
      className={rowClass}
    >
      <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--quant-border)] bg-black text-sm font-semibold">
        {(person.name || person.email || '?').charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{person.name || person.email}</span>
        <span className="block truncate text-xs text-[var(--quant-muted-foreground)]">
          {[person.email, person.company].filter(Boolean).join(' · ') || 'Contact'}
        </span>
      </span>
      <Icon name="arrow" className="h-3.5 w-3.5 shrink-0 text-[var(--quant-muted-foreground)]" />
    </button>
  );
}

/**
 * Deep link for a universal-search calendar hit. Opens the event detail via
 * /calendar/event/[id] instead of the bare /calendar list, so the tapped
 * event is never lost (QM 2026-10-19). Falls back to the bare list when the
 * hit carries no id — EventRow renders such rows non-clickable (see below)
 * rather than a dead button.
 */
export function eventDetailHref(event: CalendarEvent): string {
  return event.id ? `/calendar/event/${encodeURIComponent(event.id)}` : '/calendar';
}

function EventRow({ event }: { event: CalendarEvent }) {
  const router = useRouter();
  // The interface types startTime as Date, but the wire DTO may carry an ISO
  // string; relativeDate accepts both.
  const start = (event as unknown as { startTime?: string | Date }).startTime;
  // A hit without an id has nowhere to navigate to — the old
  // onClick={() => event.id && router.push(...)} silently no-op'd.
  const canNavigate = Boolean(event.id);
  const body = (
    <>
      <Icon name="calendar" className="h-4 w-4 shrink-0 text-[var(--quant-muted-foreground)]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{event.title || '(no title)'}</span>
        <span className="block truncate text-xs text-[var(--quant-muted-foreground)]">
          {relativeDate(start)}
        </span>
      </span>
    </>
  );
  if (!canNavigate) {
    // No id → no target. Render as a static, non-clickable row: no hover
    // highlight, no arrow icon, muted and marked aria-disabled, so it cannot
    // look like a button that silently ignores the tap.
    return (
      <div className={`${rowClass} cursor-default hover:bg-transparent`} aria-disabled="true">
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => router.push(eventDetailHref(event))}
      className={rowClass}
    >
      {body}
      <Icon name="arrow" className="h-3.5 w-3.5 shrink-0 text-[var(--quant-muted-foreground)]" />
    </button>
  );
}

function FileRow({ file }: { file: DriveFileHit }) {
  const router = useRouter();
  return (
    <button type="button" onClick={() => router.push(filePreviewHref(file))} className={rowClass}>
      <Icon name="file" className="h-4 w-4 shrink-0 text-[var(--quant-muted-foreground)]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{file.name}</span>
        <span className="block truncate text-xs text-[var(--quant-muted-foreground)]">
          {[file.mimeType?.split('/')[1] || file.mimeType, formatBytes(file.size), relativeDate(file.updatedAt)]
            .filter(Boolean)
            .join(' · ') || 'Drive file'}
        </span>
      </span>
      <Icon name="arrow" className="h-3.5 w-3.5 shrink-0 text-[var(--quant-muted-foreground)]" />
    </button>
  );
}

function DocumentRow({ doc }: { doc: DriveDocumentHit }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(`/drive/doc/${encodeURIComponent(doc.id)}`)}
      className={rowClass}
    >
      <Icon name="doc" className="h-4 w-4 shrink-0 text-[var(--quant-muted-foreground)]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{doc.title || '(untitled document)'}</span>
        <span className="block truncate text-xs text-[var(--quant-muted-foreground)]">
          {relativeDate(doc.updatedAt) || 'Document'}
        </span>
      </span>
      <Icon name="arrow" className="h-3.5 w-3.5 shrink-0 text-[var(--quant-muted-foreground)]" />
    </button>
  );
}

const listClass = 'overflow-hidden rounded-xl border border-[var(--quant-border)]';

export function UniversalSearchResults({
  results,
  scope,
  onOpenMail,
  onReset,
}: {
  results: UniversalSearchResults;
  scope: UniversalSearchScope;
  onOpenMail: (email: Email) => void;
  /** Reset action for the no-result state; omitted when the caller has none. */
  onReset?: () => void;
}) {
  const showAll = scope === 'all';
  const sections: React.ReactNode[] = [];

  if (showAll || scope === 'mail') {
    sections.push(
      <Section key="mail" icon="mail" title="Mail" count={results.mail.items.length}>
        {results.mail.error ? (
          <SourceError message={results.mail.error} />
        ) : results.mail.items.length === 0 ? (
          <p className="px-1 text-xs text-[var(--quant-muted-foreground)]">No matching mail.</p>
        ) : (
          <div className={listClass}>
            {results.mail.items.map((email) => (
              <MailRow key={email.id} email={email} onOpen={onOpenMail} />
            ))}
          </div>
        )}
      </Section>,
    );
  }

  if (showAll || scope === 'people') {
    sections.push(
      <Section key="people" icon="user" title="People" count={results.people.items.length}>
        {results.people.error ? (
          <SourceError message={results.people.error} />
        ) : results.people.items.length === 0 ? (
          <p className="px-1 text-xs text-[var(--quant-muted-foreground)]">No matching contacts.</p>
        ) : (
          <div className={listClass}>
            {results.people.items.map((person) => (
              <PersonRow key={person.id} person={person} />
            ))}
          </div>
        )}
      </Section>,
    );
  }

  if (showAll || scope === 'calendar') {
    sections.push(
      <Section key="calendar" icon="calendar" title="Calendar" count={results.calendar.items.length}>
        {results.calendar.error ? (
          <SourceError message={results.calendar.error} />
        ) : results.calendar.items.length === 0 ? (
          <p className="px-1 text-xs text-[var(--quant-muted-foreground)]">No matching events.</p>
        ) : (
          <div className={listClass}>
            {results.calendar.items.map((event, index) => (
              // Id-less hits have no event.id; fall back to a positional key so
              // they cannot collide on key={undefined}.
              <EventRow key={event.id || `event-${index}`} event={event} />
            ))}
          </div>
        )}
      </Section>,
    );
  }

  if (showAll || scope === 'drive') {
    const driveItems = [...results.drive.documents, ...results.drive.files];
    sections.push(
      <Section key="drive" icon="file" title="Drive" count={driveItems.length}>
        {results.drive.error ? (
          <SourceError message={results.drive.error} />
        ) : driveItems.length === 0 ? (
          <p className="px-1 text-xs text-[var(--quant-muted-foreground)]">No matching files or documents.</p>
        ) : (
          <div className={listClass}>
            {results.drive.documents.map((doc) => (
              <DocumentRow key={`doc-${doc.id}`} doc={doc} />
            ))}
            {results.drive.files.map((file) => (
              <FileRow key={`file-${file.id}`} file={file} />
            ))}
          </div>
        )}
      </Section>,
    );
  }

  const totalHits =
    results.mail.items.length +
    results.people.items.length +
    results.calendar.items.length +
    results.drive.files.length +
    results.drive.documents.length;
  const anyError =
    results.mail.error || results.people.error || results.calendar.error || results.drive.error;

  if (totalHits === 0 && !anyError) {
    return (
      <div className="p-4">
        <EmptyState
          title="No results"
          description={describeSearchEmpty({ query: results.query, scope })}
          actionLabel={onReset ? 'Reset search' : undefined}
          onAction={onReset}
        />
      </div>
    );
  }

  // Top Results (scope='all' only): first matches from each source, in
  // source order — there is no ranking signal in this answer, so the
  // caption says exactly that instead of implying "best matches". The
  // per-source sections below stay the full answer; this section is a
  // short head, not a second count (the count line above counts each
  // hit once, across all sections).
  const topSlots = showAll
    ? selectTopResultSlots({
        mail: results.mail.items.length,
        people: results.people.items.length,
        calendar: results.calendar.items.length,
        driveDocuments: results.drive.documents.length,
        driveFiles: results.drive.files.length,
      })
    : null;
  const hasTopResults =
    topSlots !== null &&
    (topSlots.mail > 0 ||
      topSlots.people > 0 ||
      topSlots.calendar > 0 ||
      topSlots.driveDocuments > 0 ||
      topSlots.driveFiles > 0);
  const topSection = hasTopResults && topSlots ? (
    <div className="mb-5">
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)]">
        Top results
      </h3>
      <p className="mb-2 px-1 text-[11px] text-[var(--quant-muted-foreground)]">
        First matches from each source, in source order — not a relevance ranking.
      </p>
      <div className={listClass}>
        {results.mail.items.slice(0, topSlots.mail).map((email) => (
          <MailRow key={`top-mail-${email.id}`} email={email} onOpen={onOpenMail} />
        ))}
        {results.people.items.slice(0, topSlots.people).map((person) => (
          <PersonRow key={`top-person-${person.id}`} person={person} />
        ))}
        {results.calendar.items.slice(0, topSlots.calendar).map((event) => (
          <EventRow key={`top-event-${event.id}`} event={event} />
        ))}
        {results.drive.documents.slice(0, topSlots.driveDocuments).map((doc) => (
          <DocumentRow key={`top-doc-${doc.id}`} doc={doc} />
        ))}
        {results.drive.files.slice(0, topSlots.driveFiles).map((file) => (
          <FileRow key={`top-file-${file.id}`} file={file} />
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div className="p-4">
      <div className="mb-3 px-1" role="status">
        <p className="text-xs text-[var(--quant-muted-foreground)]">
          {describeSearchCountLabel({
            query: results.query,
            scope,
            total: totalHits,
            partial: Boolean(anyError),
          })}
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--quant-muted-foreground)]">
          {SEARCH_COUNT_BANNER}
        </p>
      </div>
      {topSection}
      {sections}
    </div>
  );
}
