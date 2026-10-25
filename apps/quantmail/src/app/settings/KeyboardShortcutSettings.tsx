'use client';

/**
 * Settings › Keyboard Shortcuts, now a control instead of documentation.
 *
 * Previously this tab rendered the registry read-only: a user whose OS or
 * browser steals a binding (Ctrl+K, Cmd+/) could read that the key was bound
 * and do nothing about it. Each row now offers Change, Disable and Reset,
 * and every change lands in the override store (`lib/keyboard/`) that the
 * registry reads when it binds — so saving here rebinds the live app in the
 * same tick, not just the text on this page.
 *
 * Capture works by listening on `window` in the capture phase while a row is
 * being edited: the window listener runs before the engine's document
 * listener, and `stopPropagation()` keeps the pressed key from firing its old
 * action mid-edit. Escape cancels (so Escape itself cannot be captured as a
 * new binding — the one key this editor cannot assign). A second key press
 * extends the binding into a two-key sequence (`g i` style); Done confirms.
 * Conflicts are warnings, never blocks: same-scope collisions are the only
 * ones flagged, because cross-scope collisions are the engine's designed
 * shadowing and flagging them would cry wolf on every default row.
 *
 * Overrides are per-browser (see the override module): the section copy in
 * `page.tsx` says so, and nothing here pretends otherwise.
 */

import { useEffect, useMemo, useState } from 'react';
import { ShortcutKeys } from '../../components/ShortcutKeys';
import { helpGroupHeading, type HelpGroup } from '../../lib/keyboard/help-model';
import { useShortcutOverrides } from '../../lib/keyboard/hooks';
import {
  bindingStringFromKeyboardEvent,
  findShortcutConflicts,
  validateBindingStrings,
} from '../../lib/keyboard/shortcut-overrides';

interface ShortcutRow {
  id: string;
  label: string;
  description?: string;
  available: boolean;
  elsewhere: boolean;
  destructive: boolean;
  scope: string;
  defaultKeys: string[];
  /** Effective bindings, or `null` for a disabled command. */
  effectiveKeys: string[] | null;
  state: 'default' | 'custom' | 'disabled';
  conflicts: string[];
}

function SmallButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-[var(--quant-border)] px-2 py-1 text-xs font-medium text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function StatePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-2 rounded-full border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)]">
      {children}
    </span>
  );
}

export function KeyboardShortcutSettings({
  groups,
  helpNote,
}: {
  groups: HelpGroup[];
  helpNote: string;
}) {
  const { overrides, setOverride, clearOverride, clearAll } = useShortcutOverrides();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string[]>([]);

  const rows = useMemo<ShortcutRow[]>(() => {
    const byId = new Map<string, ShortcutRow>();
    for (const group of groups) {
      for (const item of group.items) {
        if (byId.has(item.id)) continue;
        const defaultKeys = Array.isArray(item.keys) ? item.keys : [item.keys];
        const override = overrides[item.id];
        const state =
          override === null ? 'disabled' : override !== undefined ? 'custom' : 'default';
        const effectiveKeys =
          override === null ? null : override !== undefined ? override : defaultKeys;
        byId.set(item.id, {
          id: item.id,
          label: item.label,
          description: item.description,
          available: item.available,
          elsewhere: item.elsewhere,
          destructive: item.destructive,
          scope: item.scope,
          defaultKeys,
          effectiveKeys,
          state,
          conflicts: [],
        });
      }
    }
    const list = [...byId.values()];
    const conflicts = findShortcutConflicts(
      list.map((row) => ({ id: row.id, scope: row.scope, keys: row.effectiveKeys })),
    );
    for (const row of list) row.conflicts = conflicts.get(row.id) ?? [];
    return list;
  }, [groups, overrides]);

  const rowsByGroup = useMemo(() => {
    const order = groups.map((group) => group.group);
    const inGroup = new Map<string, ShortcutRow[]>();
    for (const row of rows) {
      const group = groups.find((entry) => entry.items.some((item) => item.id === row.id));
      const key = group ? group.group : 'View';
      const list = inGroup.get(key);
      if (list) list.push(row);
      else inGroup.set(key, [row]);
    }
    return order
      .filter((group) => inGroup.has(group))
      .map((group) => ({ group, items: inGroup.get(group)! }));
  }, [groups, rows]);

  const labelById = useMemo(() => new Map(rows.map((row) => [row.id, row.label])), [rows]);
  const overrideCount = Object.keys(overrides).length;

  const startEdit = (id: string) => {
    // A focused button would otherwise also receive the captured keypress
    // (Space/Enter activate it); the capture listener below prevents the
    // default anyway, but blurring first removes the ambiguity entirely.
    (document.activeElement as HTMLElement | null)?.blur?.();
    setEditingId(id);
    setCaptured([]);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setCaptured([]);
  };

  const saveCaptured = () => {
    if (editingId === null || captured.length === 0) return;
    const valid = validateBindingStrings(captured);
    if (!valid) return;
    setOverride(editingId, valid);
    cancelEdit();
  };

  // Capture phase on `window` runs before the engine's `document` listener,
  // and stopping propagation keeps the pressed key from firing its old
  // action while the user is choosing its replacement.
  useEffect(() => {
    if (editingId === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        cancelEdit();
        return;
      }
      const binding = bindingStringFromKeyboardEvent(event);
      if (binding === null) return;
      setCaptured((previous) => (previous.length >= 2 ? previous : [...previous, binding]));
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
    // `cancelEdit` is stable in practice (only setState calls); listing it
    // would re-subscribe on every render for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  return (
    <div>
      {overrideCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-xs text-[var(--quant-muted-foreground)]">
            {overrideCount} shortcut{overrideCount === 1 ? '' : 's'} customised in this browser.
          </span>
          <SmallButton onClick={() => clearAll()}>Reset all shortcuts</SmallButton>
        </div>
      )}
      {rowsByGroup.map(({ group, items }) => (
        <div key={group}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--quant-text-muted)]">
            {helpGroupHeading(group)}
          </p>
          <ul className="mt-2 list-none p-0">
            {items.map((row) => {
              const editing = editingId === row.id;
              return (
                <li key={row.id}>
                  <div
                    className={`shortcut-row min-h-11 flex-wrap${
                      row.available ? '' : ' is-unavailable'
                    }`}
                  >
                    <span className="shortcut-desc">
                      {row.label}
                      {row.state === 'custom' && <StatePill>Custom</StatePill>}
                      {row.state === 'disabled' && <StatePill>Disabled</StatePill>}
                    </span>
                    <span className="flex flex-wrap items-center justify-end gap-2">
                      <span className="shortcut-keys">
                        {row.effectiveKeys ? (
                          <ShortcutKeys keys={row.effectiveKeys} aliases />
                        ) : (
                          <span className="text-xs text-[var(--quant-muted-foreground)]">
                            Disabled
                          </span>
                        )}
                      </span>
                      {editing ? null : (
                        <>
                          <SmallButton onClick={() => startEdit(row.id)}>Change</SmallButton>
                          {row.state === 'disabled' ? (
                            <SmallButton onClick={() => clearOverride(row.id)}>
                              Enable
                            </SmallButton>
                          ) : (
                            <SmallButton onClick={() => setOverride(row.id, null)}>
                              Disable
                            </SmallButton>
                          )}
                          {row.state !== 'default' && (
                            <SmallButton onClick={() => clearOverride(row.id)}>
                              Reset
                            </SmallButton>
                          )}
                        </>
                      )}
                    </span>
                  </div>
                  {row.conflicts.length > 0 && (
                    <p className="pb-2 text-xs leading-relaxed text-[var(--quant-primary)]">
                      Same shortcut as{' '}
                      {row.conflicts
                        .map((id) => `“${labelById.get(id) ?? id}”`)
                        .join(', ')}{' '}
                      in this scope — pressing it runs one of them, not both.
                    </p>
                  )}
                  {editing && (
                    <div className="pb-3">
                      <p className="text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
                        Press the new shortcut, then Done. Press a second key for a
                        two-key sequence. Esc cancels.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="shortcut-keys">
                          {captured.length > 0 ? (
                            <ShortcutKeys keys={captured} aliases />
                          ) : (
                            <span className="text-xs text-[var(--quant-muted-foreground)]">
                              Waiting for a key…
                            </span>
                          )}
                        </span>
                        <SmallButton onClick={saveCaptured} disabled={captured.length === 0}>
                          Done
                        </SmallButton>
                        <SmallButton onClick={cancelEdit}>Cancel</SmallButton>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="border-t border-[var(--quant-border)] pt-3 text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
        Press{' '}
        <span className="shortcut-keys inline-flex">
          <kbd>?</kbd>
        </span>{' '}
        anywhere to see this as a sheet.{helpNote}
      </p>
    </div>
  );
}
