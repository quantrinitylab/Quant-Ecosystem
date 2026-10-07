/**
 * A minimal promise wrapper over IndexedDB.
 *
 * Hand-rolled rather than pulling in `idb` for the same reason as the
 * virtualizer: the deploy pipeline ships a pinned lockfile to EKS, and the
 * surface QuantMail actually needs is small enough to own.
 *
 * Every entry point degrades to a no-op instead of throwing. IndexedDB is absent
 * during server rendering, blocked outright in Safari private browsing, and can
 * fail mid-session if the user clears site data — none of which should be able
 * to take down the inbox. Callers treat this as a cache, never as the source of
 * truth.
 */

export interface StoreDefinition {
  name: string;
  keyPath: string;
  autoIncrement?: boolean;
  indexes?: Array<{ name: string; keyPath: string | string[]; unique?: boolean }>;
}

/** True when this environment can persist at all. */
export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    // Accessing the global itself throws in some locked-down embeddings.
    return false;
  }
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/**
 * A single database handle, opened lazily and shared.
 *
 * Holding one connection avoids the `versionchange` deadlock you get when two
 * tabs each open their own handle and one triggers an upgrade.
 */
export class Database {
  private handle: IDBDatabase | null = null;
  private opening: Promise<IDBDatabase | null> | null = null;
  private unavailable = false;

  constructor(
    private readonly name: string,
    private readonly version: number,
    private readonly stores: StoreDefinition[],
  ) {}

  private async open(): Promise<IDBDatabase | null> {
    if (this.handle) return this.handle;
    if (this.unavailable || !isIndexedDbAvailable()) return null;
    if (this.opening) return this.opening;

    this.opening = new Promise<IDBDatabase | null>((resolve) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(this.name, this.version);
      } catch {
        this.unavailable = true;
        resolve(null);
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of this.stores) {
          const objectStore = db.objectStoreNames.contains(store.name)
            ? request.transaction!.objectStore(store.name)
            : db.createObjectStore(store.name, {
                keyPath: store.keyPath,
                autoIncrement: store.autoIncrement,
              });

          for (const index of store.indexes ?? []) {
            if (!objectStore.indexNames.contains(index.name)) {
              objectStore.createIndex(index.name, index.keyPath, { unique: index.unique });
            }
          }
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        // Another tab wants to upgrade: release the handle so it can proceed.
        db.onversionchange = () => {
          db.close();
          this.handle = null;
          this.opening = null;
        };
        this.handle = db;
        resolve(db);
      };

      request.onerror = () => {
        this.unavailable = true;
        resolve(null);
      };
      // Blocked by another tab holding an older version; give up quietly rather
      // than hanging the caller forever.
      request.onblocked = () => resolve(null);
    }).finally(() => {
      this.opening = null;
    });

    return this.opening;
  }

  /**
   * Run `body` inside a transaction. Resolves to `fallback` when the database is
   * unavailable or the transaction aborts, so callers never need a try/catch.
   */
  async transact<T>(
    storeNames: string | string[],
    mode: IDBTransactionMode,
    body: (stores: Record<string, IDBObjectStore>) => Promise<T> | T,
    fallback: T,
  ): Promise<T> {
    const db = await this.open();
    if (!db) return fallback;

    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    try {
      const tx = db.transaction(names, mode);
      const stores: Record<string, IDBObjectStore> = {};
      for (const name of names) stores[name] = tx.objectStore(name);

      const result = await body(stores);

      if (mode !== 'readonly') {
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
          tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'));
        });
      }
      return result;
    } catch {
      return fallback;
    }
  }

  get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
    return this.transact(
      store,
      'readonly',
      (stores) => promisify<T | undefined>(stores[store].get(key)),
      undefined,
    );
  }

  getAll<T>(store: string): Promise<T[]> {
    return this.transact(store, 'readonly', (stores) => promisify<T[]>(stores[store].getAll()), []);
  }

  put<T>(store: string, value: T): Promise<boolean> {
    return this.transact(
      store,
      'readwrite',
      async (stores) => {
        await promisify(stores[store].put(value));
        return true;
      },
      false,
    );
  }

  putMany<T>(store: string, values: T[]): Promise<boolean> {
    if (values.length === 0) return Promise.resolve(true);
    return this.transact(
      store,
      'readwrite',
      async (stores) => {
        const objectStore = stores[store];
        // Queue every write synchronously, then let the transaction commit them
        // together — awaiting between puts would let the transaction auto-close.
        await Promise.all(values.map((value) => promisify(objectStore.put(value))));
        return true;
      },
      false,
    );
  }

  delete(store: string, key: IDBValidKey): Promise<boolean> {
    return this.transact(
      store,
      'readwrite',
      async (stores) => {
        await promisify(stores[store].delete(key));
        return true;
      },
      false,
    );
  }

  clear(store: string): Promise<boolean> {
    return this.transact(
      store,
      'readwrite',
      async (stores) => {
        await promisify(stores[store].clear());
        return true;
      },
      false,
    );
  }

  /** Close the handle. Used on sign-out, alongside clearing the stores. */
  close(): void {
    this.handle?.close();
    this.handle = null;
  }
}
