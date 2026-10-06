// ============================================================================
// SettingsRow / SettingsCard — Muse-style settings list primitives.
// Dark card, icon tile, label + optional subtitle, right-side chevron /
// status text / "Soon" badge. Destructive variant for Log out.
// ============================================================================
import React from 'react';
import { ChevronRightIcon } from './SettingsIcons';

export interface SettingsRowProps {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  /** Right-side affordance. Defaults to a chevron. */
  trailing?: React.ReactNode;
  /** Honest marker for rows whose backend isn't live yet. */
  comingSoon?: boolean;
  destructive?: boolean;
  onClick?: () => void;
  testId?: string;
}

export function SettingsRow({
  icon,
  label,
  subtitle,
  trailing,
  comingSoon,
  destructive,
  onClick,
  testId,
}: SettingsRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          destructive ? 'bg-red-500/10 text-red-400' : 'bg-white/[0.06] text-white/80'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`flex items-center gap-2 text-[15px] font-medium ${
            destructive ? 'text-red-400' : 'text-white'
          }`}
        >
          {label}
          {comingSoon && (
            <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] font-semibold text-white/50">
              Soon
            </span>
          )}
        </span>
        {subtitle && <span className="mt-0.5 block truncate text-[13px] text-white/45">{subtitle}</span>}
      </span>
      {trailing ?? <ChevronRightIcon />}
    </button>
  );
}

export function SettingsCard({ children, testId }: { children: React.ReactNode; testId?: string }) {
  const items = React.Children.toArray(children);
  return (
    <div data-testid={testId} className="overflow-hidden rounded-3xl bg-zinc-900/70 backdrop-blur">
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 && <div className="mx-4 h-px bg-white/[0.06]" />}
          {child}
        </React.Fragment>
      ))}
    </div>
  );
}
