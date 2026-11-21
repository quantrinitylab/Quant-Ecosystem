// @vitest-environment jsdom
// ============================================================================
// QuantDrive offline minimal slice — contract pins.
//
// Covers: the cacheability predicate (single source of truth shared with the
// worker), the generated worker script (valid classic-script JS, honest
// offline fallback, same-origin guard, never caches itself), the worker
// route (JS content type, no-store), graceful registration, honest error
// text, and the Drive offline banner (renders only while offline).
// ============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  isDriveReadCacheable,
  getDriveErrorMessage,
  registerDriveOfflineWorker,
  DRIVE_OFFLINE_CACHE_NAME,
  DRIVE_OFFLINE_SW_SCOPE,
} from '../../../../lib/drive-offline';
import { DRIVE_OFFLINE_SW_SOURCE } from '../../../api/drive/offline-sw.js/sw-source';
import { GET as offlineSwRouteGet } from '../../../api/drive/offline-sw.js/route';
import { DriveOfflineBanner } from '../DriveOfflineBanner';

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

afterEach(() => {
  setOnLine(true);
});

describe('isDriveReadCacheable', () => {
  it('caches Drive metadata reads', () => {
    expect(isDriveReadCacheable('/api/drive/files?folderId=abc', 'GET')).toBe(true);
    expect(isDriveReadCacheable('/api/drive/quota', 'GET')).toBe(true);
    expect(isDriveReadCacheable('/api/drive/shares/sent', 'GET')).toBe(true);
    expect(isDriveReadCacheable('/api/drive/search?q=x', 'GET')).toBe(true);
  });

  it('caches file download/preview reads', () => {
    expect(isDriveReadCacheable('/api/drive/files/abc123/download', 'GET')).toBe(true);
  });

  it('treats the method case-insensitively', () => {
    expect(isDriveReadCacheable('/api/drive/files', 'get')).toBe(true);
  });

  it('never caches mutations', () => {
    expect(isDriveReadCacheable('/api/drive/files', 'POST')).toBe(false);
    expect(isDriveReadCacheable('/api/drive/files/abc', 'DELETE')).toBe(false);
    expect(isDriveReadCacheable('/api/drive/files/abc', 'PATCH')).toBe(false);
  });

  it('never caches the worker script itself', () => {
    expect(isDriveReadCacheable('/api/drive/offline-sw.js', 'GET')).toBe(false);
    expect(isDriveReadCacheable('/api/drive/offline-sw.js/', 'GET')).toBe(false);
    expect(isDriveReadCacheable('/api/drive/offline-sw.js?v=2', 'GET')).toBe(false);
  });

  it('never caches the freshness-critical upload-chunk status', () => {
    // GET /api/drive/upload/chunk/<id>/status reports which chunks already
    // landed; a stale-while-revalidate copy would make the uploader skip
    // chunks the server never received. The whole upload subtree is out.
    expect(isDriveReadCacheable('/api/drive/upload/chunk/abc123/status', 'GET')).toBe(false);
    expect(isDriveReadCacheable('/api/drive/upload', 'GET')).toBe(false);
    expect(isDriveReadCacheable('/api/drive/upload/chunk/abc123', 'POST')).toBe(false);
    // Boundary pin: the exclusion is the /upload/ prefix, not the word
    // "upload" anywhere — unrelated paths stay cacheable.
    expect(isDriveReadCacheable('/api/drive/uploads', 'GET')).toBe(true);
  });

  it('controls Drive documents, not Drive API paths — and never the push scope', () => {
    // The control scope is what lets the worker see a Drive page's fetches
    // at all: '/api/drive/' would control no app document (scope matching
    // is a document-URL prefix), and '/' would collide with the push
    // worker. '/drive' (no trailing slash) covers the /drive document
    // itself, which '/drive/' would miss.
    expect(DRIVE_OFFLINE_SW_SCOPE).toBe('/drive');
    expect(DRIVE_OFFLINE_SW_SCOPE).not.toBe('/api/drive/');
    expect(DRIVE_OFFLINE_SW_SCOPE).not.toBe('/');
    expect(DRIVE_OFFLINE_SW_SCOPE).not.toBe('/drive/');
  });

  it('ignores non-Drive paths', () => {
    expect(isDriveReadCacheable('/api/mail/list', 'GET')).toBe(false);
    expect(isDriveReadCacheable('/drive', 'GET')).toBe(false);
    expect(isDriveReadCacheable('/api/drive', 'GET')).toBe(false);
  });

  it('handles absolute same-origin URLs', () => {
    expect(isDriveReadCacheable('https://quantmail.in/api/drive/files', 'GET')).toBe(true);
  });

  it('rejects non-string input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isDriveReadCacheable(null as any, 'GET')).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isDriveReadCacheable('/api/drive/files', null as any)).toBe(false);
  });
});

describe('DRIVE_OFFLINE_SW_SOURCE', () => {
  it('is syntactically valid classic worker JavaScript', () => {
    expect(() => new Function(DRIVE_OFFLINE_SW_SOURCE)).not.toThrow();
    expect(DRIVE_OFFLINE_SW_SOURCE).not.toContain('export ');
    expect(DRIVE_OFFLINE_SW_SOURCE).not.toContain('import ');
  });

  it('embeds the shared cacheability predicate (no drift)', () => {
    expect(DRIVE_OFFLINE_SW_SOURCE).toContain('isDriveReadCacheable');
    expect(DRIVE_OFFLINE_SW_SOURCE).toContain(DRIVE_OFFLINE_CACHE_NAME);
  });

  it('guards same-origin before handling a fetch', () => {
    expect(DRIVE_OFFLINE_SW_SOURCE).toContain('self.location.origin');
  });

  it('answers offline cache misses with an honest 503, never fake data', () => {
    expect(DRIVE_OFFLINE_SW_SOURCE).toContain('OFFLINE_NOT_CACHED');
    expect(DRIVE_OFFLINE_SW_SOURCE).toContain('503');
  });

  it('caps cached download sizes and evicts old cache versions', () => {
    expect(DRIVE_OFFLINE_SW_SOURCE).toContain('MAX_DOWNLOAD_CACHE_BYTES');
    expect(DRIVE_OFFLINE_SW_SOURCE).toContain('quantdrive-offline-');
  });

  it('never caches partial downloads under the full URL', () => {
    // A 206 / Range answer stored under the plain download URL would later
    // be served as if it were the whole file.
    expect(DRIVE_OFFLINE_SW_SOURCE).toContain("get('Range')");
    expect(DRIVE_OFFLINE_SW_SOURCE).toContain('network.status === 200');
  });

  it('states its control scope honestly in the served script', () => {
    expect(DRIVE_OFFLINE_SW_SOURCE).toContain('Controls /drive documents');
    expect(DRIVE_OFFLINE_SW_SOURCE).not.toContain('Scope: /api/drive/.');
  });
});

describe('offline worker route', () => {
  it('serves JavaScript with no-store', async () => {
    const res = await offlineSwRouteGet();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/javascript');
    expect(res.headers.get('cache-control')).toContain('no-store');
    const body = await res.text();
    expect(body).toContain(DRIVE_OFFLINE_CACHE_NAME);
  });

  it('widens the permitted scope to /drive — the load-bearing header', () => {
    // Without Service-Worker-Allowed: /drive, the browser would reject a
    // '/drive' scope for a script served from under /api/drive/, and the
    // worker would fall back to controlling nothing the app uses.
    return offlineSwRouteGet().then((res) => {
      expect(res.headers.get('service-worker-allowed')).toBe('/drive');
    });
  });
});

describe('registerDriveOfflineWorker', () => {
  it('resolves null (never throws, never claims success) when unsupported', async () => {
    // jsdom has no serviceWorker — the honest path is a quiet null.
    await expect(registerDriveOfflineWorker()).resolves.toBeNull();
  });
});

describe('getDriveErrorMessage', () => {
  it('stays honest about outages when offline', () => {
    setOnLine(false);
    const msg = getDriveErrorMessage(new Error('Failed to fetch'), 'Drive is temporarily unavailable.');
    expect(msg.toLowerCase()).toContain('offline');
    expect(msg).not.toContain('temporarily unavailable');
  });

  it('keeps the legacy wording when online', () => {
    const msg = getDriveErrorMessage(new Error('Failed to fetch'), 'Drive is temporarily unavailable.');
    expect(msg).toBe('Drive is temporarily unavailable. Your files are safe.');
  });

  it('keeps the session-expiry wording', () => {
    const msg = getDriveErrorMessage(new Error('401 Unauthorized'), 'fallback');
    expect(msg).toContain('session expired');
  });

  it('falls back honestly on unknown errors', () => {
    expect(getDriveErrorMessage(new Error('weird'), 'fallback text')).toBe('weird');
    expect(getDriveErrorMessage('nope', 'fallback text')).toBe('fallback text');
  });
});

describe('DriveOfflineBanner', () => {
  it('renders nothing while online', () => {
    expect(renderToStaticMarkup(<DriveOfflineBanner cached={false} />)).toBe('');
  });

  it('shows an honest cached-files banner when offline with cache', () => {
    setOnLine(false);
    const html = renderToStaticMarkup(<DriveOfflineBanner cached={true} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('showing cached Drive files');
    expect(html).toContain('Uploads and edits need a connection');
  });

  it('is honest when offline with nothing cached yet', () => {
    setOnLine(false);
    const html = renderToStaticMarkup(<DriveOfflineBanner cached={false} />);
    expect(html).toContain('role="status"');
    // "May", not "will": the worker only caches Drive reads from Drive
    // pages, only full 200 downloads, and nothing before it was installed.
    expect(html).toContain('files you opened while online may be available here');
    expect(html).not.toContain('will be available here');
  });

  it('uses the Drive app accent on a pure-black surface with no divider lines', () => {
    setOnLine(false);
    const html = renderToStaticMarkup(<DriveOfflineBanner cached={true} />);
    expect(html).toContain('var(--app-accent)');
    expect(html).toContain('bg-black');
    expect(html).not.toContain('border');
  });
});
