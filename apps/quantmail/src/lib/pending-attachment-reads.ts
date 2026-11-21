/**
 * Pending attachment FileReader reads — the gate behind the 2026-10-22 P1
 * send race and its 2026-10-25 corrective (PR #1572).
 *
 * The defect: both composers tracked in-flight reads in a closure-local
 * counter inside the file input's onChange, so Send never knew a read was
 * running and snapshotted `attachments` without the still-reading file.
 * PR #1572 fixed Send (button disabled + `handleSend` refuses while reads
 * are pending) but left save draft, autosave and close/back snapshotting
 * before those bytes existed.
 *
 * The corrective contract, applied uniformly by both composers:
 * - SEND (click, Cmd/Ctrl+Enter, schedule-send): REFUSE while any read is
 *   pending. The guard is checked at entry AND re-checked immediately
 *   before the send snapshot, because `handleSend` awaits confirm dialogs
 *   and the Drive permission check — a file picked while a dialog was open
 *   starts a read the entry guard never saw.
 * - SAVE DRAFT / AUTOSAVE / BACK (keep-the-work close): WAIT for pending
 *   reads, then snapshot. The snapshot reads a synchronous attachments
 *   mirror (see below), never the `attachments` state closure: a
 *   `setAttachments` issued by a FileReader onload does not re-render
 *   synchronously, so a save that waits and then reads the closure would
 *   still miss the file.
 * - DISCARD / CLOSE-that-deletes (DockedComposer's X, both trash paths):
 *   EXPLICIT CONFIRMATION naming the still-attaching files, so discarding
 *   them is a choice, never a silent loss. No wait: discard means discard.
 *
 * Framework-free (same pattern as DraftAutosaveController): all
 * timing/state logic lives here so it is unit-testable without a DOM.
 * Reads are keyed by an incrementing id, NOT by filename, so two picks of
 * `report.pdf` settle one at a time — settling one must never clear both.
 * Every terminal FileReader outcome settles exactly once: load, error,
 * abort, and a synchronous throw from `readAsDataURL` itself. A read that
 * never settles would block Send forever and hang every save wait, so the
 * composers settle on all four paths (with a double-settle guard).
 */
export class PendingAttachmentReads {
  /** In-flight reads: id -> filename, insertion-ordered. */
  private inFlight = new Map<number, string>();
  private waiters = new Set<() => void>();
  private nextId = 1;

  /** Register a new read. Returns its id; pass it to `settle`. */
  begin(name: string): number {
    const id = this.nextId;
    this.nextId += 1;
    this.inFlight.set(id, name);
    return id;
  }

  /**
   * Settle one read. Returns its filename, or null when the id was not
   * pending (a double settle is a no-op, never a negative count and never
   * a phantom wake of waiters).
   */
  settle(id: number): string | null {
    const name = this.inFlight.get(id);
    if (name === undefined) return null;
    this.inFlight.delete(id);
    if (this.inFlight.size === 0) {
      const waiters = [...this.waiters];
      this.waiters.clear();
      for (const wake of waiters) wake();
    }
    return name;
  }

  /** Filenames still being read, in pick order; duplicates appear twice. */
  pendingNames(): string[] {
    return [...this.inFlight.values()];
  }

  pendingCount(): number {
    return this.inFlight.size;
  }

  hasPending(): boolean {
    return this.inFlight.size > 0;
  }

  /**
   * Resolves once no read is in flight. Loops rather than awaiting a single
   * snapshot: a read begun while waiting (the user picks another file
   * during a save wait) is awaited too, so a snapshot taken after this
   * resolves can never predate bytes that exist by then. Resolves
   * immediately when nothing is pending.
   */
  async waitForSettled(): Promise<void> {
    while (this.inFlight.size > 0) {
      await new Promise<void>((resolve) => {
        this.waiters.add(resolve);
      });
    }
  }
}
