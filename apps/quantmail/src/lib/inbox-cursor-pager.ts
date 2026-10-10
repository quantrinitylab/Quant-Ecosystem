import type { Email } from '../types';

/**
 * QM-UIUX-040: cursor tail for mailbox lists.
 *
 * The first page of a mailbox comes from the React Query cache (its shape is
 * `Email[]` and mutations patch it in place). Pages fetched afterwards via
 * the backend's keyset cursor accumulate here, in this small state machine,
 * so the accumulation rules are testable without a DOM:
 *
 * - `syncFirstPage` publishes the chain head when the first page (re)loads —
 *   but only until `extend` has deepened the chain. A background refetch of
 *   page 1 (the 30s poll, a focus refetch) must not rewind a chain the user
 *   has already paged down: its cursor belongs to the tail, not the head.
 * - `merge` appends the tail behind the first page, deduped by id. New mail
 *   arriving at the head can shift a row from the tail into page 1; the row
 *   is shown once, at its page-1 position.
 * - `reset` starts over (a different mailbox view, an explicit refresh).
 */
export class InboxCursorPager {
  private tail: Email[] = [];
  private nextCursor: string | null = null;
  private extended = false;

  syncFirstPage(nextCursor: string | null): void {
    if (this.extended) return;
    this.nextCursor = nextCursor;
  }

  get hasMore(): boolean {
    return this.nextCursor !== null;
  }

  get cursor(): string | null {
    return this.nextCursor;
  }

  get tailEmails(): readonly Email[] {
    return this.tail;
  }

  extend(emails: Email[], nextCursor: string | null): void {
    this.extended = true;
    if (emails.length > 0) {
      this.tail = [...this.tail, ...emails];
    }
    this.nextCursor = nextCursor;
  }

  reset(): void {
    this.tail = [];
    this.nextCursor = null;
    this.extended = false;
  }

  merge(firstPage: Email[]): Email[] {
    if (this.tail.length === 0) return firstPage;
    const seen = new Set(firstPage.map((email) => email.id));
    const merged = [...firstPage];
    for (const email of this.tail) {
      if (seen.has(email.id)) continue;
      seen.add(email.id);
      merged.push(email);
    }
    return merged;
  }
}
