// ============================================================================
// Performance Package - Service Worker Generator
// Cache-first, network-first, stale-while-revalidate strategies,
// precache manifest, runtime caching rules, offline fallback
// ============================================================================

import type { ServiceWorkerConfig, RuntimeCachingRule, CacheStrategy } from '../types';

/** Generated service worker code section */
interface CodeSection {
  name: string;
  code: string;
  order: number;
}

/** Precache manifest entry */
interface PrecacheEntry {
  url: string;
  revision: string;
  integrity?: string;
}

/** Cache storage simulation */
interface CacheStorage {
  name: string;
  entries: Map<string, { response: string; timestamp: number; size: number }>;
  maxEntries: number;
  maxAge: number;
}

/**
 * ServiceWorkerGenerator creates service worker code with caching strategies
 * including cache-first, network-first, stale-while-revalidate, precache
 * manifest generation, runtime caching rules, and offline fallback pages.
 */
export class ServiceWorkerGenerator {
  private readonly config: ServiceWorkerConfig;
  private readonly precacheManifest: PrecacheEntry[];
  private readonly cacheStorages: Map<string, CacheStorage>;
  private readonly generatedSections: CodeSection[];

  constructor(config: Partial<ServiceWorkerConfig> = {}) {
    this.config = {
      cacheName: config.cacheName ?? 'app-cache',
      version: config.version ?? '1.0.0',
      precacheUrls: config.precacheUrls ?? [],
      runtimeCachingRules: config.runtimeCachingRules ?? [],
      offlineFallback: config.offlineFallback ?? '/offline.html',
      skipWaiting: config.skipWaiting ?? true,
      clientsClaim: config.clientsClaim ?? true,
    };

    this.precacheManifest = [];
    this.cacheStorages = new Map();
    this.generatedSections = [];

    // Initialize default cache storage
    this.cacheStorages.set(this.config.cacheName, {
      name: this.config.cacheName,
      entries: new Map(),
      maxEntries: 100,
      maxAge: 86400000,
    });

    // Build precache manifest
    this.buildPrecacheManifest();
  }

  /**
   * Generate complete service worker code.
   */
  generate(): string {
    const sections: string[] = [];

    sections.push(this.generateHeader());
    sections.push(this.generateInstallHandler());
    sections.push(this.generateActivateHandler());
    sections.push(this.generateFetchHandler());
    sections.push(this.generateCacheStrategies());
    sections.push(this.generateOfflineFallback());
    sections.push(this.generateMessageHandler());
    sections.push(this.generateUtilities());

    return sections.join('\n\n');
  }

  /**
   * Generate the install event handler with precaching.
   */
  generateInstallHandler(): string {
    const urls = this.precacheManifest.map((e) => `  '${e.url}'`).join(',\n');

    return `// Install Event - Precache critical resources
self.addEventListener('install', (event) => {
  ${this.config.skipWaiting ? 'self.skipWaiting();' : ''}
  event.waitUntil(
    caches.open('${this.config.cacheName}-v${this.config.version}').then((cache) => {
      return cache.addAll([
${urls}
      ]);
    })
  );
});`;
  }

  /**
   * Generate the activate event handler with cache cleanup.
   */
  generateActivateHandler(): string {
    return `// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  ${this.config.clientsClaim ? 'self.clients.claim();' : ''}
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('${this.config.cacheName}-') && name !== '${this.config.cacheName}-v${this.config.version}')
          .map((name) => caches.delete(name))
      );
    })
  );
});`;
  }

  /**
   * Generate the fetch event handler with strategy routing.
   */
  generateFetchHandler(): string {
    const rules = this.config.runtimeCachingRules.map((rule) => {
      return `  if (url.match(${this.patternToRegex(rule.urlPattern)})) {
    return ${this.strategyToFunction(rule.strategy)}(event, '${rule.strategy}', ${rule.maxEntries}, ${rule.maxAge});
  }`;
    }).join('\n');

    return `// Fetch Event - Route requests to appropriate strategy
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  const request = event.request;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Apply runtime caching rules
${rules}

  // Default: network-first for navigation, cache-first for assets
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event, 'navigation', 50, ${86400000}));
  } else {
    event.respondWith(cacheFirst(event, 'assets', 200, ${604800000}));
  }
});`;
  }

  /**
   * Generate cache strategy implementations.
   */
  generateCacheStrategies(): string {
    return `// Cache Strategy: Cache First
async function cacheFirst(event, cacheName, maxEntries, maxAge) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);

  if (cached) {
    // Check if cached response is still valid
    const dateHeader = cached.headers.get('date');
    if (dateHeader) {
      const age = Date.now() - new Date(dateHeader).getTime();
      if (age < maxAge) return cached;
    } else {
      return cached;
    }
  }

  try {
    const response = await fetch(event.request);
    if (response.ok) {
      const responseClone = response.clone();
      cache.put(event.request, responseClone);
      await enforceLimit(cacheName, maxEntries);
    }
    return response;
  } catch (error) {
    if (cached) return cached;
    return offlineFallback(event.request);
  }
}

// Cache Strategy: Network First
async function networkFirst(event, cacheName, maxEntries, maxAge) {
  const cache = await caches.open(cacheName);

  try {
    const response = await Promise.race([
      fetch(event.request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ${this.config.runtimeCachingRules[0]?.networkTimeoutMs ?? 3000}))
    ]);

    if (response.ok) {
      const responseClone = response.clone();
      cache.put(event.request, responseClone);
      await enforceLimit(cacheName, maxEntries);
    }
    return response;
  } catch (error) {
    const cached = await cache.match(event.request);
    if (cached) return cached;
    return offlineFallback(event.request);
  }
}

// Cache Strategy: Stale While Revalidate
async function staleWhileRevalidate(event, cacheName, maxEntries, maxAge) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);

  // Always revalidate in the background
  const fetchPromise = fetch(event.request).then((response) => {
    if (response.ok) {
      cache.put(event.request, response.clone());
      enforceLimit(cacheName, maxEntries);
    }
    return response;
  }).catch(() => cached);

  // Return cached immediately if available, otherwise wait for network
  return cached || fetchPromise;
}

// Cache Strategy: Network Only
async function networkOnly(event, cacheName, maxEntries, maxAge) {
  try {
    return await fetch(event.request);
  } catch (error) {
    return offlineFallback(event.request);
  }
}

// Cache Strategy: Cache Only
async function cacheOnly(event, cacheName, maxEntries, maxAge) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  return cached || offlineFallback(event.request);
}`;
  }

  /**
   * Generate offline fallback handler.
   */
  generateOfflineFallback(): string {
    return `// Offline Fallback
function offlineFallback(request) {
  if (request.mode === 'navigate') {
    return caches.match('${this.config.offlineFallback}');
  }

  // Return appropriate fallback based on content type
  const accept = request.headers.get('accept') || '';
  if (accept.includes('image')) {
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="50%" y="50%" text-anchor="middle">Offline</text></svg>',
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }

  return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
}`;
  }

  /**
   * Add a runtime caching rule.
   */
  addRule(rule: RuntimeCachingRule): void {
    this.config.runtimeCachingRules.push(rule);
  }

  /**
   * Add URLs to precache manifest.
   */
  addPrecacheUrls(urls: string[]): void {
    for (const url of urls) {
      if (!this.precacheManifest.some((e) => e.url === url)) {
        this.precacheManifest.push({
          url,
          revision: this.generateRevision(url),
        });
      }
    }
  }

  /**
   * Simulate cache-first strategy execution.
   */
  async executeCacheFirst(url: string): Promise<{ source: 'cache' | 'network'; hit: boolean }> {
    const cache = this.cacheStorages.get(this.config.cacheName);
    if (!cache) return { source: 'network', hit: false };

    const entry = cache.entries.get(url);
    if (entry) {
      const age = Date.now() - entry.timestamp;
      if (age < cache.maxAge) {
        return { source: 'cache', hit: true };
      }
    }

    // Simulate network fetch and cache
    cache.entries.set(url, { response: url, timestamp: Date.now(), size: 1024 });
    return { source: 'network', hit: false };
  }

  /**
   * Simulate network-first strategy execution.
   */
  async executeNetworkFirst(url: string, networkAvailable: boolean = true): Promise<{ source: 'cache' | 'network'; hit: boolean }> {
    const cache = this.cacheStorages.get(this.config.cacheName);
    if (!cache) return { source: 'network', hit: false };

    if (networkAvailable) {
      cache.entries.set(url, { response: url, timestamp: Date.now(), size: 1024 });
      return { source: 'network', hit: false };
    }

    const entry = cache.entries.get(url);
    if (entry) {
      return { source: 'cache', hit: true };
    }

    return { source: 'network', hit: false };
  }

  /**
   * Simulate stale-while-revalidate strategy.
   */
  async executeStaleWhileRevalidate(url: string): Promise<{ source: 'cache' | 'network'; stale: boolean }> {
    const cache = this.cacheStorages.get(this.config.cacheName);
    if (!cache) return { source: 'network', stale: false };

    const entry = cache.entries.get(url);

    // Always update in background
    cache.entries.set(url, { response: url, timestamp: Date.now(), size: 1024 });

    if (entry) {
      return { source: 'cache', stale: true };
    }
    return { source: 'network', stale: false };
  }

  /**
   * Get precache manifest.
   */
  getPrecacheManifest(): PrecacheEntry[] {
    return [...this.precacheManifest];
  }

  /**
   * Get cache storage statistics.
   */
  getCacheStats(): Map<string, { entries: number; size: number }> {
    const stats = new Map<string, { entries: number; size: number }>();
    for (const [name, cache] of this.cacheStorages) {
      let totalSize = 0;
      for (const entry of cache.entries.values()) {
        totalSize += entry.size;
      }
      stats.set(name, { entries: cache.entries.size, size: totalSize });
    }
    return stats;
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /** Generate service worker header */
  private generateHeader(): string {
    return `// Service Worker - Generated by ServiceWorkerGenerator
// Version: ${this.config.version}
// Cache: ${this.config.cacheName}
// Generated: ${new Date().toISOString()}
'use strict';

const CACHE_NAME = '${this.config.cacheName}-v${this.config.version}';
const OFFLINE_URL = '${this.config.offlineFallback}';`;
  }

  /** Generate message handler for communication with main thread */
  private generateMessageHandler(): string {
    return `// Message Handler - Communication with main thread
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'CACHE_URLS') {
    const urls = event.data.payload;
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urls));
  }
  if (event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME);
  }
});`;
  }

  /** Generate utility functions */
  private generateUtilities(): string {
    return `// Utility: Enforce cache size limit (LRU eviction)
async function enforceLimit(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    const toDelete = keys.slice(0, keys.length - maxEntries);
    await Promise.all(toDelete.map((key) => cache.delete(key)));
  }
}`;
  }

  /** Build precache manifest from config */
  private buildPrecacheManifest(): void {
    for (const url of this.config.precacheUrls) {
      this.precacheManifest.push({
        url,
        revision: this.generateRevision(url),
      });
    }
  }

  /** Generate a revision hash for a URL */
  private generateRevision(url: string): string {
    let hash = 0;
    const str = url + this.config.version;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /** Convert URL pattern to regex string */
  private patternToRegex(pattern: string): string {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return `/${escaped}/`;
  }

  /** Convert strategy enum to function name */
  private strategyToFunction(strategy: CacheStrategy): string {
    switch (strategy) {
      case 'CACHE_FIRST': return 'cacheFirst';
      case 'NETWORK_FIRST': return 'networkFirst';
      case 'STALE_WHILE_REVALIDATE': return 'staleWhileRevalidate';
      case 'NETWORK_ONLY': return 'networkOnly';
      case 'CACHE_ONLY': return 'cacheOnly';
      default: return 'networkFirst';
    }
  }
}
