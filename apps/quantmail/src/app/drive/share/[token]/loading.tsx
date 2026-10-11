import { Skeleton } from '@quant/shared-ui';

export default function DriveShareLoading() {
  return (
    <main
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: '#000', color: '#f5f3f7' }}
    >
      <div className="w-full max-w-md">
        <Skeleton variant="rect" width="100%" height="320px" />
      </div>
    </main>
  );
}
