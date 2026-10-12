'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { queryRetryDelay, shouldRetryQuery } from '../lib/query-retry';
import { registerQueryClient } from '../lib/query-client-registry';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30000,
            /*
             * Was `retry: 3` for everything, so a 401 or a 404 cost four
             * requests and seven seconds before the error state appeared, and a
             * backend outage turned every mounted query into a four-shot burst
             * per cycle. `shouldRetryQuery` retries transport and 5xx failures
             * only; see `lib/query-retry.ts` for what counts as transient.
             */
            retry: shouldRetryQuery,
            retryDelay: queryRetryDelay,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  // The public auth shell renders AuthProvider with no QueryClientProvider
  // above it (lean auth shell), and on the app shell AuthProvider is hoisted
  // above this provider — so AuthProvider reaches the client through the
  // module registry instead of `useQueryClient()`. See
  // `lib/query-client-registry.ts`.
  useEffect(() => {
    registerQueryClient(queryClient);
    return () => registerQueryClient(undefined);
  }, [queryClient]);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
