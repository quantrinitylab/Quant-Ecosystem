import { Skeleton } from '@quant/shared-ui';

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6" aria-label="Loading event">
      <Skeleton variant="rect" width="60%" height="28px" />
      <Skeleton variant="rect" width="100%" height="120px" />
      <Skeleton variant="rect" width="100%" height="160px" />
    </div>
  );
}
