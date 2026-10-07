'use client';

// ============================================================================
// Shared UI - Enhanced Notification Panel Component
// ============================================================================

import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { nextRovingIndex, rovingTabIndex } from '../../utils/roving-focus';

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  app: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  actions?: NotificationAction[];
}

export interface NotificationAction {
  id: string;
  label: string;
  onClick: () => void;
}

export interface NotificationPanelProps {
  notifications: NotificationItem[];
  isOpen: boolean;
  onClose: () => void;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  onDismiss?: (id: string) => void;
  onSnooze?: (id: string) => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
  notifications,
  isOpen,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onDismiss,
  onSnooze,
}) => {
  const [filterApp, setFilterApp] = useState<string | null>(null);

  // Get unique apps for filter
  const apps = useMemo(() => {
    const appSet = new Set(notifications.map((n) => n.app));
    return Array.from(appSet);
  }, [notifications]);

  // Badge counts per app
  const badgeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of notifications) {
      if (!n.read) {
        counts[n.app] = (counts[n.app] ?? 0) + 1;
      }
    }
    return counts;
  }, [notifications]);

  // Filtered notifications
  const filteredNotifications = useMemo(() => {
    if (!filterApp) return notifications;
    return notifications.filter((n) => n.app === filterApp);
  }, [notifications, filterApp]);

  // Grouped notifications by app
  const groupedNotifications = useMemo(() => {
    const groups: Record<string, NotificationItem[]> = {};
    for (const n of filteredNotifications) {
      if (!groups[n.app]) groups[n.app] = [];
      groups[n.app]!.push(n);
    }
    return groups;
  }, [filteredNotifications]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  /*
    `aria-modal="true"` tells a screen reader that nothing outside this node
    exists. That was a promise the panel could not keep: nothing moved focus into
    it on open, Tab walked straight back out into the page it had just hidden, and
    Escape did nothing — the only way out was a mouse click on the backdrop, which
    is `aria-hidden` and unreachable by keyboard by design. `useFocusTrap` is the
    package's one answer to all three.
  */
  const trapRef = useFocusTrap<HTMLDivElement>({ active: isOpen, onEscape: onClose });

  /*
    The filter row declared `role="tablist"` with `aria-selected` on each chip and
    stopped there: no `aria-controls`, no `role="tabpanel"` anywhere in the file,
    every chip in the tab sequence, and no arrow keys — a tablist in name only.

    The list below IS the panel; it is the thing that changes when a chip is
    picked. So the fix finishes the contract rather than demoting the role, which
    is also where QuantMail's inbox lens row landed.

    The "All" chip used to be hand-written above the map with the same twenty
    lines. Folding it in as a leading `null` is what makes "every chip gets the
    same id, the same tab stop and the same key handler" true by construction
    rather than by two blocks staying in step.
  */
  const baseId = useId();
  const listId = `${baseId}-list`;
  const filters = useMemo<Array<string | null>>(() => [null, ...apps], [apps]);
  const filterIndex = filters.indexOf(filterApp);
  const filterId = (index: number) => `${baseId}-filter-${index}`;
  const filterRefs = useRef<Array<HTMLButtonElement | null>>([]);
  /*
    No chips means no tabs to point at, so the list must not claim to be anyone's
    panel — a `role="tabpanel"` with an `aria-labelledby` that resolves to nothing
    is the defect this edit exists to remove, not a smaller version of it. The
    index check covers a `filterApp` whose app disappeared from the incoming list.
  */
  const panelWired = apps.length > 1 && filterIndex >= 0;

  const onFilterKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const next = nextRovingIndex(event.key, index, filters.length);
      if (next === null) return;
      event.preventDefault();
      setFilterApp(filters[next] ?? null);
      filterRefs.current[next]?.focus();
    },
    [filters],
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        ref={trapRef}
        className="fixed inset-0 z-50"
        role="dialog"
        aria-modal="true"
        aria-label="Notification panel"
      >
        <div className="fixed inset-0 bg-black/20" onClick={onClose} aria-hidden="true" />
        <motion.div
          className="fixed top-16 right-4 w-full max-w-md max-h-[32rem] rounded-xl shadow-xl flex flex-col overflow-hidden"
          style={{
            background: 'var(--quant-surface, #ffffff)',
            border: '1px solid var(--quant-border, #e5e7eb)',
          }}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between p-4"
            style={{ borderBottom: '1px solid var(--quant-border, #e5e7eb)' }}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--quant-text, #111827)' }}>
                Notifications
              </h2>
              {unreadCount > 0 && (
                <>
                  {/*
                    The count sat in a `<span aria-label="2 unread">2</span>`. A
                    span maps to `role="generic"`, where ARIA 1.2 prohibits
                    `aria-label` and the browser drops it — so the label reached
                    nobody and the badge announced a bare "2". Same defect and same
                    fix as Avatar's status dot: hide the decoration, put the words
                    in an `sr-only` sibling.
                  */}
                  <span
                    className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-600 rounded-full"
                    aria-hidden="true"
                  >
                    {unreadCount}
                  </span>
                  <span className="sr-only">{unreadCount} unread</span>
                </>
              )}
            </div>
            {unreadCount > 0 && (
              /*
                `aria-label="Mark all as read"` over the visible "Mark all read"
                was a WCAG 2.5.3 failure in the one direction that matters: the
                accessible name did not contain the visible text, so a speech-input
                user saying "click Mark all read" got nothing. The visible text is
                already a perfectly good name.
              */
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-sm text-blue-600 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* App filter tabs */}
          {apps.length > 1 && (
            <div
              className="flex items-center gap-1 px-4 py-2 overflow-x-auto"
              role="tablist"
              aria-label="Filter by app"
              style={{ borderBottom: '1px solid var(--quant-border, #e5e7eb)' }}
            >
              {filters.map((app, index) => (
                <button
                  key={app ?? '__all__'}
                  type="button"
                  ref={(node) => {
                    filterRefs.current[index] = node;
                  }}
                  id={filterId(index)}
                  role="tab"
                  aria-selected={filterApp === app}
                  aria-controls={panelWired ? listId : undefined}
                  tabIndex={rovingTabIndex(index, filterIndex)}
                  onClick={() => setFilterApp(app)}
                  onKeyDown={(event) => onFilterKeyDown(event, index)}
                  className="px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{
                    background:
                      filterApp === app ? 'var(--quant-surface-hover, #f3f4f6)' : 'transparent',
                    color: 'var(--quant-text, #111827)',
                  }}
                >
                  {app ?? 'All'}
                  {app && badgeCounts[app] ? ` (${badgeCounts[app]})` : ''}
                </button>
              ))}
            </div>
          )}

          {/* Notification list */}
          <div
            className="flex-1 overflow-y-auto"
            // Focusable whether or not the tabs above exist: a scroll container
            // that cannot take focus cannot be scrolled from the keyboard at all.
            tabIndex={0}
            id={panelWired ? listId : undefined}
            role={panelWired ? 'tabpanel' : undefined}
            aria-labelledby={panelWired ? filterId(filterIndex) : undefined}
          >
            <div role="list" aria-label="Notifications">
              {filteredNotifications.length === 0 ? (
                <div
                  className="p-8 text-center text-sm"
                  style={{ color: 'var(--quant-text-secondary, #6b7280)' }}
                >
                  No notifications
                </div>
              ) : (
                Object.entries(groupedNotifications).map(([app, items]) => (
                  <div key={app}>
                    <div
                      className="px-4 py-1 text-xs font-semibold uppercase"
                      style={{ color: 'var(--quant-text-secondary, #6b7280)' }}
                    >
                      {app}
                    </div>
                    {items.map((notification) => {
                      /*
                        The row is a `role="listitem"` whose `onClick` marks it
                        read, and that was the only route to the action: no
                        tabindex, no key handler, and `cursor-pointer` on every row
                        whether `onMarkRead` had been passed at all. The row cannot
                        become a `<button>` — it holds the action buttons, and a
                        button inside a button is invalid — so the keyboard route
                        joins the controls that are already here, and the row click
                        goes back to being what it should always have been: a
                        pointer shortcut for something reachable another way.
                      */
                      const canMarkRead = !notification.read && !!onMarkRead;
                      const hasActions =
                        canMarkRead || !!notification.actions?.length || !!onSnooze || !!onDismiss;
                      return (
                        <div
                          key={notification.id}
                          className={`px-4 py-3${onMarkRead ? ' cursor-pointer' : ''}`}
                          style={{
                            borderBottom: '1px solid var(--quant-border, #e5e7eb)',
                            background: !notification.read
                              ? 'var(--quant-surface-hover, #f3f4f6)'
                              : 'transparent',
                          }}
                          role="listitem"
                          onClick={() => onMarkRead?.(notification.id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              {/*
                                Unread was a tinted background plus a blue dot whose
                                `aria-label` sat on an empty span — dropped, because a
                                contentless span is `role="generic"`. Colour-only in
                                both channels at once, so the dot becomes what it
                                looks like and the word goes in the text.
                              */}
                              {!notification.read && <span className="sr-only">Unread. </span>}
                              <p
                                className="text-sm font-medium truncate"
                                style={{ color: 'var(--quant-text, #111827)' }}
                              >
                                {notification.title}
                              </p>
                              <p
                                className="text-sm mt-0.5 line-clamp-2"
                                style={{ color: 'var(--quant-text-secondary, #6b7280)' }}
                              >
                                {notification.body}
                              </p>
                              <span
                                className="text-xs mt-1 inline-block"
                                style={{ color: 'var(--quant-text-secondary, #6b7280)' }}
                              >
                                {notification.time}
                              </span>
                            </div>
                            {!notification.read && (
                              <span
                                className="flex-shrink-0 w-2 h-2 mt-2 bg-blue-500 rounded-full"
                                aria-hidden="true"
                              />
                            )}
                          </div>

                          {/* Inline actions */}
                          {hasActions && (
                            <div className="flex items-center gap-2 mt-2">
                              {notification.actions?.map((action) => (
                                <button
                                  key={action.id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    action.onClick();
                                  }}
                                  className="text-xs px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  style={{
                                    background: 'var(--quant-surface-hover, #f3f4f6)',
                                    color: 'var(--quant-text, #111827)',
                                  }}
                                >
                                  {action.label}
                                </button>
                              ))}
                              {canMarkRead && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onMarkRead?.(notification.id);
                                  }}
                                  className="text-xs px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  style={{
                                    background: 'var(--quant-surface-hover, #f3f4f6)',
                                    color: 'var(--quant-text-secondary, #6b7280)',
                                  }}
                                  aria-label={`Mark as read: ${notification.title}`}
                                >
                                  Mark read
                                </button>
                              )}
                              {onSnooze && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSnooze(notification.id);
                                  }}
                                  className="text-xs px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  style={{
                                    background: 'var(--quant-surface-hover, #f3f4f6)',
                                    color: 'var(--quant-text-secondary, #6b7280)',
                                  }}
                                  aria-label={`Snooze notification: ${notification.title}`}
                                >
                                  Snooze
                                </button>
                              )}
                              {onDismiss && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDismiss(notification.id);
                                  }}
                                  className="text-xs px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  style={{
                                    background: 'var(--quant-surface-hover, #f3f4f6)',
                                    color: 'var(--quant-text-secondary, #6b7280)',
                                  }}
                                  aria-label={`Dismiss notification: ${notification.title}`}
                                >
                                  Dismiss
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
