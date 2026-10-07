import { browserAuthSession } from './browser-auth-session';

export const browserApiRequest = (
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> => {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return browserAuthSession.authenticatedFetch(input, {
    ...init,
    headers,
  });
};
