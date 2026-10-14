/**
 * Version of the engine bundle served under `/engines/docs/<version>/`. Must equal
 * `engines/VERSION` (a test pins this): the Docker build writes the bundle there, and the
 * versioned path is what lets the multi-megabyte .wasm files be cached as immutable.
 */
export const DOCS_ENGINE_VERSION = '0.1.0';

export const DOCS_ENGINE_BASE = `/engines/docs/${DOCS_ENGINE_VERSION}`;

export const DOCS_ENGINE_WORKER_URL = `${DOCS_ENGINE_BASE}/worker.js`;

/** Third-party notices shipped with the bundle (Apache-2.0 §4(d)). */
export const DOCS_ENGINE_NOTICES_URL = `${DOCS_ENGINE_BASE}/licenses/NOTICES.txt`;
