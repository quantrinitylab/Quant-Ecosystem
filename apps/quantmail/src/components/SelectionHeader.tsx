'use client';

// ============================================================================
// SelectionHeader — the inbox's bulk-action bar
// ============================================================================
// Replaces the shell header while a selection exists (`AppShell`'s `customHeader`),
// so the two never compete for the same 56px band.
//
// The layout is arithmetic, not taste. A finger needs 44px, and six 44px controls
// plus a count do not fit a 375px phone: 6x44 = 264, plus ~122 of left group and
// 24 of padding, is 410. Neither a tighter gap nor thinner padding closes a 35px
// deficit — so an overflow menu is a precondition, not an embellishment, and four
// controls stay on the bar:
//
//   [x] N selected                    [Archive] [Delete] [Snooze] [More]
//
// Left 12 + 44 + 8 + ~70 = 134; right 4x44 + 3x4 = 188; total 334 <= 375, with
// ~41px of slack under `justify-between`. Overflow is made structurally
// impossible rather than arithmetically unlikely: `min-w-0` plus `truncate` on the
// count, `shrink-0` on the right group and on every single control.
//
// The old bar's inline "Select all N" pill is not duplicated into the menu — it
// moved there. A control that exists twice at one width is the duplicate
// affordance this audit is removing everywhere else.

import { AnchoredMenu } from './AnchoredMenu';
import { EmailSnooze } from './EmailSnooze';
import { MailIcon } from './MailIcon';

/**
 * 36px under a mouse, 44px under a finger — gated on the pointer, never on the
 * width, because a 768px tablet has the same finger a 375px phone does.
 *
 * `min-h`/`min-w` rather than `size-11`: a minimum beats a fixed size by property
 * semantics, so there is no dependence on which rule Tailwind emits last.
 */
const ACTION_BUTTON =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-[#A1A4AC] transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11';

export interface SelectionHeaderProps {
  /** Conversations selected. The bar is only mounted when this is > 0. */
  count: number;
  /** Rows currently rendered, for the menu's "Select all N". */
  totalVisible: number;
  /** Drives Pin/Unpin, which is one toggle rather than two menu rows. */
  allPinned: boolean;
  onDeselectAll: () => void;
  onSelectAllVisible: () => void;
  onTogglePin: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onSnooze: (until: Date) => void;
}

export function SelectionHeader({
  count,
  totalVisible,
  allPinned,
  onDeselectAll,
  onSelectAllVisible,
  onTogglePin,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onDelete,
  onSnooze,
}: SelectionHeaderProps) {
  return (
    <header className="sticky top-0 z-50 flex min-h-14 flex-none select-none items-center justify-between gap-3 border-b border-[#282C35] bg-[#121622] px-3 shadow-xl sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onDeselectAll}
          className={`${ACTION_BUTTON} hover:bg-[#282C35] hover:text-[#F5F5F5]`}
          aria-label="Clear selection"
          title="Clear selection (Esc)"
        >
          <MailIcon name="close" className="size-5" />
        </button>
        {/* Announced, because the count changes under the keyboard as well as the
            pointer and nothing else on screen reports it. */}
        <span
          className="truncate text-[13px] font-semibold text-[#F5F5F5]"
          aria-live="polite"
          aria-atomic="true"
        >
          {count} selected
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <button
          type="button"
          onClick={onArchive}
          className={`${ACTION_BUTTON} hover:bg-[#282C35] hover:text-emerald-400`}
          aria-label={`Archive ${count} selected`}
          title="Archive"
        >
          <MailIcon name="archive" className="size-5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className={`${ACTION_BUTTON} hover:bg-[#282C35] hover:text-rose-400`}
          aria-label={`Delete ${count} selected`}
          title="Move to trash"
        >
          <MailIcon name="trash" className="size-5" />
        </button>
        <EmailSnooze
          onSnooze={onSnooze}
          triggerClassName={`${ACTION_BUTTON} hover:bg-[#282C35] hover:text-[#FF8C42]`}
          triggerLabel={`Snooze ${count} selected`}
        />
        <AnchoredMenu
          icon={<MailIcon name="more" className="size-5" />}
          triggerLabel="More actions"
          triggerClassName={`${ACTION_BUTTON} hover:bg-[#282C35] hover:text-[#F5F5F5]`}
          menuLabel="More selection actions"
          menuClassName="snooze-menu"
          scope="selection-more"
          // Four rows plus a divider. Only used to keep the menu on screen when the
          // trigger sits near the bottom edge, which this one never does.
          height={220}
        >
          {(close) => {
            // "Select all" is a selection command; the rest act on what is already
            // selected. The rule between them only exists when the first group does.
            const canSelectAll = count < totalVisible;
            return (
              <>
                {canSelectAll && (
                  <button
                    type="button"
                    role="menuitem"
                    className="snooze-option"
                    onClick={() => {
                      onSelectAllVisible();
                      close();
                    }}
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <MailIcon name="check" className="size-4 shrink-0" />
                      Select all
                    </span>
                    <span className="snooze-option-date">{totalVisible}</span>
                  </button>
                )}
                <div
                  className={`flex flex-col gap-1${
                    canSelectAll ? ' mt-1 border-t border-white/[0.08] pt-1.5' : ''
                  }`}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="snooze-option"
                    onClick={() => {
                      onTogglePin();
                      close();
                    }}
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <MailIcon name="pin" className="size-4 shrink-0" />
                      {allPinned ? 'Unpin' : 'Pin to top'}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="snooze-option"
                    onClick={() => {
                      onMarkRead();
                      close();
                    }}
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <MailIcon name="mail" className="size-4 shrink-0" />
                      Mark as read
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="snooze-option"
                    onClick={() => {
                      onMarkUnread();
                      close();
                    }}
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <MailIcon name="mail-unread" className="size-4 shrink-0" />
                      Mark as unread
                    </span>
                  </button>
                </div>
              </>
            );
          }}
        </AnchoredMenu>
      </div>
    </header>
  );
}
