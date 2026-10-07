'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { queryRetryDelay, shouldRetryQuery } from '../lib/query-retry';

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
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
