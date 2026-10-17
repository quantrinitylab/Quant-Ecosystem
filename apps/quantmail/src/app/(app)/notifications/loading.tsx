import { Skeleton } from '@quant/shared-ui';

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-2 p-4 sm:p-6" aria-label="Loading notifications">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} variant="rect" width="100%" height="76px" />
      ))}
    </div>
  );
}
