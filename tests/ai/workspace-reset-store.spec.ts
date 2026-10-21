import { test, expect } from "@playwright/test";
import { openWorkspaceStore } from "../../lib/browser-workspace-store";

class MemoryStorage implements Storage {
  records = new Map<string, string>();
  quota = false;
  get length() {
    return this.records.size;
  }
  getItem(key: string) {
    return this.records.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.quota) throw new Error("Synthetic quota failure");
    this.records.set(key, value);
  }
  removeItem(key: string) {
    this.records.delete(key);
  }
  key(index: number) {
    return [...this.records.keys()][index] ?? null;
  }
  clear() {
    throw new Error("Must not clear unrelated storage");
  }
}

// Minimal deterministic IndexedDB boundary for write-order testing. Real
// IndexedDB deletion and unrelated-record retention are exercised in Chrome.
function indexedFixture() {
  const records = new Map<string, string>();
  let hold = false,
    release: (() => void) | undefined,
    started: (() => void) | undefined;
  const putStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const database = {
    close() {},
    transaction() {
      const transaction = {
        oncomplete: undefined as (() => void) | undefined,
        objectStore() {
          return {
            getAll() {
              const request = {
                result: [] as { key: string; raw: string }[],
                onsuccess: undefined as (() => void) | undefined,
              };
              queueMicrotask(() => {
                request.result = [...records].map(([key, raw]) => ({
                  key,
                  raw,
                }));
                request.onsuccess?.();
              });
              return request;
            },
            put(entry: { key: string; raw: string }) {
              const complete = () => {
                records.set(entry.key, entry.raw);
                queueMicrotask(() => transaction.oncomplete?.());
              };
              started?.();
              if (hold) release = complete;
              else queueMicrotask(complete);
            },
            openCursor() {
              const keys = [...records.keys()];
              let index = 0;
              const request = {
                result: null as null | {
                  key: string;
                  delete: () => void;
                  continue: () => void;
                },
                onsuccess: undefined as (() => void) | undefined,
              };
              const next = () =>
                queueMicrotask(() => {
                  const key = keys[index++];
                  request.result =
                    key === undefined
                      ? null
                      : {
                          key,
                          delete: () => {
                            records.delete(key);
                          },
                          continue: next,
                        };
                  request.onsuccess?.();
                  if (key === undefined)
                    queueMicrotask(() => transaction.oncomplete?.());
                });
              next();
              return request;
            },
          };
        },
      };
      return transaction;
    },
  };
  const factory = {
    open() {
      const request = {
        result: database,
        onsuccess: undefined as (() => void) | undefined,
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
  return {
    records,
    factory,
    putStarted,
    hold: () => {
      hold = true;
    },
    release: () => release?.(),
  };
}

test("explicit reset clears only XC records and seals the old store against late writes", async () => {
  const fixture = indexedFixture(),
    previous = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: fixture.factory,
  });
  try {
    fixture.records.set("xc-insight-discovery-v2:old", "saved findings");
    fixture.records.set("unrelated-record", "keep");
    const storage = new MemoryStorage(),
      local = new MemoryStorage();
    storage.setItem("xc-strategy-session-v1", "legacy work");
    local.setItem("xc-saved-project-v1:old", "saved project");
    local.setItem("unrelated-preference", "keep");
    local.setItem("OPENAI_API_KEY", "synthetic unrelated value");
    const store = await openWorkspaceStore(storage);
    await store.save("xc-insight-studio-v1", "current work");
    await store.reset(local);
    expect([...fixture.records]).toEqual([["unrelated-record", "keep"]]);
    expect([...storage.records]).toEqual([]);
    expect([...local.records.keys()]).toEqual([
      "unrelated-preference",
      "OPENAI_API_KEY",
    ]);
    expect(store.getItem("xc-insight-studio-v1")).toBeNull();
    await expect(
      store.save("xc-insight-studio-v1", "late response must not reappear"),
    ).rejects.toThrow("late writes are blocked");
    expect(storage.getItem("xc-insight-studio-v1")).toBeNull();
  } finally {
    if (previous) Object.defineProperty(globalThis, "indexedDB", previous);
    else Reflect.deleteProperty(globalThis, "indexedDB");
  }
});

test("reset drains a pending IndexedDB quota-fallback write before deleting it", async () => {
  const fixture = indexedFixture(),
    previous = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: fixture.factory,
  });
  try {
    const storage = new MemoryStorage(),
      local = new MemoryStorage();
    storage.quota = true;
    const store = await openWorkspaceStore(storage);
    fixture.hold();
    const saving = store.save("xc-insight-studio-v1", "queued work");
    await fixture.putStarted;
    let cleared = false;
    const clearing = store.reset(local).then(() => {
      cleared = true;
    });
    await Promise.resolve();
    expect(cleared).toBe(false);
    await expect(
      store.save("xc-insight-studio-v1", "late work"),
    ).rejects.toThrow("late writes are blocked");
    fixture.release();
    await Promise.all([saving, clearing]);
    expect(fixture.records.has("xc-insight-studio-v1")).toBe(false);
    expect(store.getItem("xc-insight-studio-v1")).toBeNull();
  } finally {
    if (previous) Object.defineProperty(globalThis, "indexedDB", previous);
    else Reflect.deleteProperty(globalThis, "indexedDB");
  }
});
