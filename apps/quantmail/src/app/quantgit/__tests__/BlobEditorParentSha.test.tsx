/**
 * fix/qm-blob-editor-parent-sha — regression tests for the blob-editor
 * parentSha contract.
 *
 * Root cause: the client sent the wrong value as the backend's `parentSha`
 * optimistic-concurrency token, so EVERY blob-editor commit failed:
 * - raw ref string ("main") → 400 "parentSha must be a 40-char SHA"
 * - blob (content) hash → 409 STALE_PARENT_SHA (never equals branch head)
 * - '' → null → 409 on any non-empty branch
 *
 * The fixed wire: GET /:id/file returns `headSha` (ref resolved server-side
 * to the commit SHA); the client stores it at load time and sends it back as
 * `parentSha`. Uses renderToStaticMarkup (the apps/quantmail suite has no
 * @testing-library/react dependency — CI installs with --frozen-lockfile).
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  headShaFromBlobError,
  headShaFromBlobPayload,
  toParentShaParam,
} from '../blobHeadSha';
import { BlobEditor } from '../../../components/BlobEditor';

const HEAD = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

describe('headShaFromBlobPayload', () => {
  it('returns data.headSha, not the raw ref in data.sha', () => {
    // Regression: openBlobEditor used `payload.data.sha` (the raw ref, e.g.
    // "main") → backend 400 "parentSha must be a 40-char SHA".
    const payload = { success: true, data: { sha: 'main', headSha: HEAD } };
    expect(headShaFromBlobPayload(payload)).toBe(HEAD);
  });

  it('returns empty string when the backend predates headSha', () => {
    expect(headShaFromBlobPayload({ success: true, data: { sha: 'main' } })).toBe('');
  });

  it('returns empty string for null/garbage payloads', () => {
    expect(headShaFromBlobPayload(null)).toBe('');
    expect(headShaFromBlobPayload({})).toBe('');
    expect(headShaFromBlobPayload({ data: { headSha: 42 } })).toBe('');
  });
});

describe('headShaFromBlobError', () => {
  it('reads the resolved head from 404 FILE_NOT_FOUND details', () => {
    // New-file template path: the file does not exist yet, but the 404
    // still carries the head so the create-commit sends a valid parentSha.
    const payload = {
      success: false,
      error: { code: 'FILE_NOT_FOUND', details: { headSha: HEAD } },
    };
    expect(headShaFromBlobError(payload)).toBe(HEAD);
  });

  it('returns empty string when details carry no headSha', () => {
    expect(headShaFromBlobError({ success: false, error: { code: 'FILE_NOT_FOUND' } })).toBe(
      '',
    );
    expect(headShaFromBlobError(null)).toBe('');
  });
});

describe('toParentShaParam', () => {
  it('passes a captured head SHA through unchanged', () => {
    expect(toParentShaParam(HEAD)).toBe(HEAD);
  });

  it('maps empty/unknown head to null (unborn-branch create)', () => {
    expect(toParentShaParam('')).toBeNull();
    expect(toParentShaParam(null)).toBeNull();
    expect(toParentShaParam(undefined)).toBeNull();
  });
});

describe('blob-editor parentSha wire (end to end at unit level)', () => {
  it('a file read at a branch head produces a committable parentSha', () => {
    // Simulates: openBlobEditor stores the head, handleCommitBlob sends it.
    const loadPayload = { success: true, data: { sha: 'main', headSha: HEAD } };
    const viewingHeadSha = headShaFromBlobPayload(loadPayload);
    expect(toParentShaParam(viewingHeadSha)).toBe(HEAD);
    expect(toParentShaParam(viewingHeadSha)).toMatch(/^[0-9a-f]{40}$/);
  });

  it('a new-file 404 still produces a committable parentSha', () => {
    const notFoundPayload = {
      success: false,
      error: { code: 'FILE_NOT_FOUND', details: { headSha: HEAD } },
    };
    const viewingHeadSha = headShaFromBlobError(notFoundPayload);
    expect(toParentShaParam(viewingHeadSha)).toBe(HEAD);
  });
});

describe('BlobEditor base-commit display', () => {
  it('renders the 12-char base commit from expectedHeadSha', () => {
    const html = renderToStaticMarkup(
      <BlobEditor
        path="src/index.ts"
        branch="main"
        initialContent="export const x = 1;"
        expectedHeadSha={HEAD}
        onClose={vi.fn()}
        onCommit={vi.fn()}
      />,
    );
    expect(html).toContain(HEAD.slice(0, 12));
    expect(html).toContain(`Base commit ${HEAD}`);
  });

  it('degrades honestly when no head SHA is known', () => {
    const html = renderToStaticMarkup(
      <BlobEditor
        path="src/index.ts"
        branch="main"
        initialContent="export const x = 1;"
        expectedHeadSha=""
        onClose={vi.fn()}
        onCommit={vi.fn()}
      />,
    );
    expect(html).toContain('no base commit');
  });
});
