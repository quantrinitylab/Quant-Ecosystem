/**
 * Shared loading / error / empty states for the staff admin screens (K9).
 * Matches the visual language of `src/app/admin/page.tsx`: card, muted copy,
 * never an invented value.
 */

export function LoadingBlock({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-4 py-10">
      <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-[var(--brand-primary)]/60" />
      <span className="text-sm text-[var(--quant-muted-foreground)]">{text}</span>
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-8 text-center">
      <div className="text-sm font-medium text-amber-300">Couldn’t load this section</div>
      <p className="mx-auto mt-1 max-w-md text-xs text-[var(--quant-muted-foreground)]">
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-4 py-2 text-xs font-medium text-[var(--quant-foreground)] hover:opacity-90"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyBlock({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-4 py-10 text-center">
      <div className="text-sm font-medium text-[var(--quant-muted-foreground)]">{title}</div>
      <p className="mt-1 max-w-md text-xs text-[var(--quant-muted-foreground)]">{hint}</p>
    </div>
  );
}

export function SectionCard({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">{title}</h2>
          {hint && (
            <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">{hint}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
