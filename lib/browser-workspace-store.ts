// IndexedDB holds drafts that exceed sessionStorage's small per-origin quota.
// Existing entries remain readable until the user explicitly confirms a reset.
import {
  clearWorkspaceStorage,
  isWorkspaceStorageKey,
} from "./development-clean-start";
const databaseName = "xc-insight-workspace";
const objectStoreName = "entries";

type Entry = { key: string; raw: string };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(objectStoreName, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("Browser storage upgrade is blocked."));
    } catch (error) {
      reject(error);
    }
  });
}

async function storedEntries(): Promise<Map<string, string>> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(objectStoreName, "readonly");
      const request = transaction.objectStore(objectStoreName).getAll();
      request.onsuccess = () =>
        resolve(
          new Map(
            (request.result as Entry[]).map(({ key, raw }) => [key, raw]),
          ),
        );
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function storeEntry(key: string, raw: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(objectStoreName, "readwrite");
      transaction
        .objectStore(objectStoreName)
        .put({ key, raw } satisfies Entry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function clearIndexedWorkspace(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(objectStoreName, "readwrite");
      const cursor = transaction.objectStore(objectStoreName).openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        if (typeof entry.key === "string" && isWorkspaceStorageKey(entry.key))
          entry.delete();
        entry.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

function savedAt(raw: string | null): number {
  if (!raw) return 0;
  try {
    const value = JSON.parse(raw);
    return typeof value.$savedAt === "number" ? value.$savedAt : 0;
  } catch {
    return 0;
  }
}

export async function openWorkspaceStore(storage: Storage) {
  let resetting = false;
  let replacing = false;
  const entries = await storedEntries().catch(() => new Map<string, string>());
  const inFlight = new Map<
    string,
    {
      latest: string | null;
      waiters: { resolve: () => void; reject: (error: unknown) => void }[];
    }
  >();

  async function flush(key: string) {
    const pending = inFlight.get(key)!;
    try {
      while (pending.latest !== null) {
        const raw = pending.latest;
        pending.latest = null;
        await storeEntry(key, raw);
      }
      inFlight.delete(key);
      pending.waiters.forEach(({ resolve }) => resolve());
    } catch (error) {
      inFlight.delete(key);
      pending.waiters.forEach(({ reject }) => reject(error));
    }
  }

  return {
    indexedKeys: new Set(entries.keys()),
    getItem(key: string) {
      if (resetting) return null;
      let browserValue: string | null = null;
      try {
        browserValue = storage.getItem(key);
      } catch {
        // IndexedDB may remain available when Web Storage is disabled.
      }
      const indexedValue = entries.get(key) ?? null;
      return savedAt(indexedValue) > savedAt(browserValue)
        ? indexedValue
        : (browserValue ?? indexedValue);
    },
    save(key: string, raw: string): Promise<void> {
      if (resetting || replacing)
        return Promise.reject(
          new Error("The workspace is being reset; late writes are blocked."),
        );
      entries.set(key, raw); // Source changes can read the latest in-memory draft immediately.
      try {
        storage.setItem(key, raw);
        return Promise.resolve();
      } catch {
        return new Promise<void>((resolve, reject) => {
          const pending = inFlight.get(key);
          if (pending) {
            pending.latest = raw;
            pending.waiters.push({ resolve, reject });
          } else {
            inFlight.set(key, { latest: raw, waiters: [{ resolve, reject }] });
            queueMicrotask(() => void flush(key));
          }
        });
      }
    },
    async replaceCampaign(
      baseKey: string,
      replacements: Record<string, string>,
    ): Promise<void> {
      if (resetting || replacing)
        throw Error("A workspace replacement is already in progress.");
      if (!/^xc-insight-discovery-v2:[a-f0-9]{8}$/.test(baseKey))
        throw Error("Invalid campaign storage identity.");
      replacing = true;
      const owns = (key: string) =>
        key === baseKey || key.startsWith(`${baseKey}:build:`);
      try {
        await Promise.all(
          [...inFlight.values()].map(
            (pending) =>
              new Promise<void>((resolve, reject) =>
                pending.waiters.push({ resolve, reject }),
              ),
          ),
        );
        const database = await openDatabase();
        try {
          await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction(
              objectStoreName,
              "readwrite",
            );
            transaction.oncomplete = () => resolve();
            transaction.onerror = transaction.onabort = () =>
              reject(
                transaction.error ?? Error("Campaign replacement was aborted."),
              );
            try {
              const store = transaction.objectStore(objectStoreName);
              const cursor = store.openCursor();
              cursor.onsuccess = () => {
                const item = cursor.result;
                if (!item) return;
                if (
                  typeof item.key === "string" &&
                  owns(item.key) &&
                  !(item.key in replacements)
                )
                  item.delete();
                item.continue();
              };
              for (const [key, raw] of Object.entries(replacements))
                store.put({ key, raw } satisfies Entry);
            } catch (failure) {
              transaction.abort();
              reject(failure);
            }
          });
        } finally {
          database.close();
        }
        // IndexedDB is the atomic authority. Web Storage is only a cache; an
        // unavailable/quota-limited cache cannot undo a committed replacement.
        for (const key of entries.keys()) if (owns(key)) entries.delete(key);
        try {
          for (let index = storage.length - 1; index >= 0; index--) {
            const key = storage.key(index);
            if (key && owns(key)) storage.removeItem(key);
          }
        } catch {
          /* Durable replacement remains authoritative. */
        }
        for (const [key, raw] of Object.entries(replacements)) {
          entries.set(key, raw);
          try {
            storage.setItem(key, raw);
          } catch {
            /* Reload reads the newer durable entry. */
          }
        }
      } finally {
        replacing = false;
      }
    },
    async reset(local: Storage): Promise<void> {
      if (resetting || replacing)
        throw new Error("A workspace reset is already in progress.");
      resetting = true;
      try {
        // Finish already queued quota-fallback writes before deletion, so they
        // cannot resurrect the workspace after the confirmation has completed.
        await Promise.allSettled(
          [...inFlight.values()].map(
            (pending) =>
              new Promise<void>((resolve, reject) =>
                pending.waiters.push({ resolve, reject }),
              ),
          ),
        );
        await clearIndexedWorkspace();
        clearWorkspaceStorage(local);
        clearWorkspaceStorage(storage);
        entries.clear();
      } catch (error) {
        resetting = false;
        throw error;
      }
      // Keep this store sealed until the page reloads, rejecting late responses.
    },
  };
}

export type WorkspaceStore = Awaited<ReturnType<typeof openWorkspaceStore>>;
