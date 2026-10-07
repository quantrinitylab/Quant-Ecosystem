import type { AdminOrganization } from '../../services/api-client';
import type { AdminFetchState } from '../../hooks/useAdminMailDomains';

/**
 * Organization picker for the staff admin screens (K9 M19/M20).
 *
 * Admin mutations are org-scoped and fail closed without an explicit
 * organization, so every admin screen starts here. Renders an honest
 * loading/error/empty state — no invented organizations.
 */
export function OrgSelector({
  organizations,
  state,
  error,
  value,
  onChange,
}: {
  organizations: AdminOrganization[] | null;
  state: AdminFetchState;
  error: string | null;
  value: string | null;
  onChange: (organizationId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">Organization</h2>
          <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
            Admin operations are scoped to one organization at a time.
          </p>
        </div>
        {state === 'loading' && (
          <div className="flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-[var(--brand-primary)]/60" />
            Loading organizations…
          </div>
        )}
        {state === 'error' && (
          <div className="text-xs font-medium text-amber-400">
            {error ?? 'Could not load organizations.'}
          </div>
        )}
        {state === 'ready' && (!organizations || organizations.length === 0) && (
          <div className="text-xs text-[var(--quant-muted-foreground)]">
            No organizations exist yet — nothing to administer.
          </div>
        )}
        {state === 'ready' && organizations && organizations.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
            <span className="font-medium">Scope</span>
            <select
              aria-label="Organization scope"
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value)}
              className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-3 py-2 text-xs font-medium text-[var(--quant-foreground)]"
            >
              <option value="" disabled>
                Select organization…
              </option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.slug})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </section>
  );
}
