'use client';

/**
 * Settings' shared surfaces: one card, one toggle row, one choice group.
 *
 * The page had eleven hand-rolled versions of the same card — `rounded-2xl`
 * beside `rounded-xl`, `bg-[#121622]` beside `bg-[#111318]`, `shadow-xl` beside
 * `shadow-sm`, headings at three sizes — and thirteen hand-rolled checkbox rows,
 * of which the ones wrapped in a `<label>` were tappable and the ones without
 * were a 16px box on a phone. ART LAW 18: a pattern repeated more than twice
 * stops being markup and becomes a component.
 *
 * The AI engine-mode radiogroup in `page.tsx` is deliberately NOT folded in
 * here. It is already a correct `role="radiogroup"` with per-option copy and a
 * layout of its own, and rewriting a control that already works in order to
 * reach a shared abstraction is how working things break.
 *
 * Every colour here is a `--quant-*` / `--brand-*` token rather than the hex it
 * resolves to in the dark theme. The theme picker lives on this page, so a
 * hardcoded `#111318` card meant the one control that switches to light mode
 * left its own surroundings black — the cheapest possible way for a setting to
 * be a lie. The dark values are byte-identical to the hexes they replaced.
 */

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

interface SettingsSectionProps {
  title: string;
  description?: string;
  /** Rendered at the right of the header row — a Save button, a status pill. */
  action?: ReactNode;
  children: ReactNode;
}

/**
 * The card every settings group sits in. One radius, one surface, one shadow,
 * one heading size — so the next section cannot invent a twelfth.
 */
export function SettingsSection({ title, description, action, children }: SettingsSectionProps) {
  return (
    <section className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-5 shadow-[var(--quant-shadow-card)]">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--quant-border)] pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">{title}</h2>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
              {description}
            </p>
          )}
        </div>
        {action && <div className="flex flex-none items-center gap-2">{action}</div>}
      </header>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

interface SettingsToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /**
   * Sits after the label — "Blocked in this browser", "Not supported here".
   *
   * A disabled toggle with no explanation reads as a broken toggle. The caller
   * knows *why* it is disabled and the row does not, so the reason arrives as a
   * node rather than being guessed at from `disabled`.
   */
  status?: ReactNode;
}

/**
 * A checkbox whose hit area is the whole row.
 *
 * The `<label>` wraps everything, so the copy is the target and a thumb never
 * has to find the 16px box; `min-h-11` is the 44px floor. The native input is
 * kept rather than a styled `div` because it already announces as a checkbox and
 * already toggles on Space — the two things a re-implementation gets wrong.
 */
export function SettingsToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  status,
}: SettingsToggleRowProps) {
  return (
    <label
      className={`flex min-h-11 items-start gap-3 py-3 ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 flex-none accent-[var(--brand-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--quant-card)]"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-[var(--quant-foreground)]">
          {label}
          {status}
        </span>
        {description && (
          <span className="mt-1 block text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

export interface SettingsChoiceOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  /** Class that paints the preview block — the theme cards' own canvas colour. */
  swatch?: string;
}

interface SettingsChoiceProps<T extends string> {
  legend: string;
  value: T;
  options: readonly SettingsChoiceOption<T>[];
  onChange: (next: T) => void;
  /** Across on desktop; always two on a phone. */
  columns?: 2 | 3 | 4;
}

const COLUMN_CLASS: Record<2 | 3 | 4, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
};

/**
 * One choice out of a few, as a real radiogroup.
 *
 * The theme grid and the density pills were plain `<button>`s wearing an orange
 * border: to a screen reader, four buttons that each say "Obsidian OLED" and
 * nothing about belonging to a set, with no way to tell which one is current —
 * the border is the entire state and a border has no accessible name. These are
 * `role="radio"` with `aria-checked`, and they move under the arrow keys on a
 * roving tabindex, so the group is one Tab stop instead of four.
 */
export function SettingsChoice<T extends string>({
  legend,
  value,
  options,
  onChange,
  columns = 3,
}: SettingsChoiceProps<T>) {
  const labelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  const activeIndex = options.findIndex((option) => option.value === value);
  // A value that matches nothing must still leave the group reachable, or Tab
  // skips it entirely and the only way in is a mouse.
  const tabbableIndex = activeIndex >= 0 ? activeIndex : 0;

  const move = (delta: number) => {
    if (options.length === 0) return;
    const next = options[(tabbableIndex + delta + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    // Focus follows selection, which is what a radiogroup does. Without this the
    // ring stays on the option you left while a different one is checked.
    containerRef.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    }
  };

  return (
    <div>
      <p
        id={labelId}
        className="text-[11px] font-semibold uppercase tracking-wider text-[var(--quant-text-muted)]"
      >
        {legend}
      </p>
      <div
        ref={containerRef}
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={onKeyDown}
        className={`mt-3 grid gap-2 ${COLUMN_CLASS[columns]}`}
      >
        {options.map((option, index) => {
          const selected = index === activeIndex;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              data-value={option.value}
              tabIndex={index === tabbableIndex ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={`flex min-h-11 flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)] ${
                selected
                  ? 'border-[var(--brand-primary)] bg-[var(--brand-soft)]'
                  : 'border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] hover:border-[var(--quant-border-strong)]'
              }`}
            >
              {option.swatch && (
                <span
                  aria-hidden="true"
                  className={`h-8 w-full rounded-md border border-[var(--quant-border)] ${option.swatch}`}
                />
              )}
              <span
                className={`text-[13px] font-medium ${selected ? 'text-[var(--brand-primary)]' : 'text-[var(--quant-foreground)]'}`}
              >
                {option.label}
              </span>
              {option.description && (
                <span className="text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
                  {option.description}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
