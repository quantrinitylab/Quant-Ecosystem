/**
 * QuantMail — email label mutations (labelId-based).
 *
 * The working label endpoints are POST /api/labels/apply and
 * POST /api/labels/remove (Next proxies to the backend's POST /labels/apply
 * and POST /labels/remove), both taking { emailId, labelId }. The backend
 * stores label IDs in Email.labels, so the optimistic state helpers below
 * operate on IDs, not names.
 *
 * History: useMail's addLabel/removeLabel used to hit
 * POST /api/emails/{id}/labels and DELETE /api/emails/{id}/labels/{name},
 * which had no route on either side and 404'd on every call. They are
 * rewired here to the working labelId-based path (the same endpoints the
 * inbox row's label picker uses via useApplyLabel/useRemoveLabel).
 */

import { browserApiRequest as apiRequest } from '../services/browser-api-request';
import type { Email } from '../types';

/**
 * POST /api/labels/apply { emailId, labelId } — throws on HTTP error.
 *
 * NOTE: apiRequest resolves on HTTP errors (fetch only rejects on network
 * failure), so response.ok MUST be checked explicitly. Without it the caller
 * keeps a "successful" optimistic update the server never stored — the UI
 * shows a label that vanishes on the next refresh.
 */
export async function applyLabelRequest(emailId: string, labelId: string): Promise<void> {
  const response = await apiRequest('/api/labels/apply', {
    method: 'POST',
    body: JSON.stringify({ emailId, labelId }),
  });
  if (!response.ok) {
    throw new Error(`Apply label failed with status ${response.status}`);
  }
}

/**
 * POST /api/labels/remove { emailId, labelId } — throws on HTTP error.
 * Same response.ok discipline as applyLabelRequest.
 */
export async function removeLabelRequest(emailId: string, labelId: string): Promise<void> {
  const response = await apiRequest('/api/labels/remove', {
    method: 'POST',
    body: JSON.stringify({ emailId, labelId }),
  });
  if (!response.ok) {
    throw new Error(`Remove label failed with status ${response.status}`);
  }
}

/**
 * Optimistic add of a labelId to one email's labels. Deduped: adding an ID
 * that is already present is a no-op, matching the backend's idempotent
 * apply. Other emails are untouched.
 */
export function withLabelAdded(emails: Email[], emailId: string, labelId: string): Email[] {
  return emails.map((e) =>
    e.id === emailId && !e.labels.includes(labelId)
      ? { ...e, labels: [...e.labels, labelId] }
      : e,
  );
}

/**
 * Optimistic removal of a labelId from one email's labels. Removing an ID
 * that is not present is a no-op. Other emails are untouched.
 *
 * Also used as the removeLabel rollback target: withLabelAdded dedupes, so a
 * label re-added through another path while the request was in flight is not
 * duplicated by the rollback.
 */
export function withLabelRemoved(emails: Email[], emailId: string, labelId: string): Email[] {
  return emails.map((e) =>
    e.id === emailId ? { ...e, labels: e.labels.filter((l) => l !== labelId) } : e,
  );
}
