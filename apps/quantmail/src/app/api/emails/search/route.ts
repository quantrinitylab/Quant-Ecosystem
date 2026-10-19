import { NextRequest } from 'next/server';

import { proxyToBackend } from '../../_lib/proxy';

/**
 * fix/qm-emails-search-proxy: this route hand-rolled its own `fetch` and
 * forwarded only the Authorization header — dropping Cookie/Origin and never
 * relaying Set-Cookie — so cookie-authenticated search requests (the browser
 * client always sends credentials:'include') 401'd here while the sibling
 * search routes worked. It also hand-rolled the param mapping.
 *
 * Now it delegates to `proxyToBackend` like the sibling search routes, so
 * auth header/cookie/origin forwarding and Set-Cookie relay are identical.
 * GET query params are forwarded verbatim by the helper; the one frontend
 * alias (`query`, which apiClient.searchEmails historically sends) is
 * renamed to the backend schema's required `q` before delegating — matching
 * the previous mapping's precedence (`query` wins when both are present).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get('query');
  if (query) {
    params.set('q', query);
    params.delete('query');
  }
  return proxyToBackend(request, '/emails/search');
}
