'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { isUnauthorizedError } from '../lib/auth-errors';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30000,
            // Auth failures are final: retrying a 401 only stretches the
            // skeleton loaders before the user sees an error. Fail fast so
            // the UI can show the friendly sign-in state immediately.
            retry: (failureCount, error) => {
              if (isUnauthorizedError(error)) return false;
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
