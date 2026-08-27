'use client';

import { ROLE_COPY, type WorkspaceRole } from '../../types/workspace';

/**
 * Segmented role picker — every role shows its blurb so people invite with
 * intent instead of guessing what "Admin" means.
 */
export function RoleSelect({
  value,
  onChange,
  roles,
  disabled,
}: {
  value: WorkspaceRole;
  onChange: (role: WorkspaceRole) => void;
  roles: WorkspaceRole[];
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {roles.map((role) => {
        const active = role === value;
        return (
          <button
            key={role}
            type="button"
            disabled={disabled}
            onClick={() => onChange(role)}
            aria-pressed={active}
            className="rounded-xl border p-3 text-left transition-all disabled:opacity-50"
            style={{
              borderColor: active
                ? 'var(--quant-primary, #7c5cff)'
                : 'var(--quant-border, rgba(255,255,255,.12))',
              background: active
                ? 'color-mix(in oklab, var(--quant-primary, #7c5cff) 14%, transparent)'
                : 'var(--quant-surface, transparent)',
              boxShadow: active ? '0 8px 30px -14px var(--quant-primary, #7c5cff)' : 'none',
            }}
          >
            <span className="block text-sm font-semibold">{ROLE_COPY[role].label}</span>
            <span
              className="mt-1 block text-[11px] leading-snug"
              style={{ color: 'var(--quant-muted-foreground, #9b99a6)' }}
            >
              {ROLE_COPY[role].blurb}
            </span>
          </button>
        );
      })}
    </div>
  );
}
