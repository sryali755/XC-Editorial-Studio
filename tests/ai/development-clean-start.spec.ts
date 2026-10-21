import { test, expect } from "@playwright/test";
import {
  clearWorkspaceStorage,
  initializeDevelopmentWorkspace,
  isWorkspaceStorageKey,
} from "../../lib/development-clean-start";

test("only known XC workspace keys are erased, never unrelated storage or credentials", () => {
  const entries = new Map([
    ["xc-insight-studio-v1", "campaigns"],
    ["xc-strategy-session-v1", "legacy"],
    ["xc-insight-discovery-v1", "draft"],
    ["xc-insight-discovery-v2:campaign", "approvals and histories"],
    ["xc-saved-project-v1:id", "project"],
    ["unrelated", "keep"],
    ["OPENAI_API_KEY", "synthetic-do-not-delete"],
    ["xc-other-product", "keep"],
  ]);
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    key: (i) => [...entries.keys()][i] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
    clear: () => {
      throw new Error("Must never clear all storage");
    },
  };
  clearWorkspaceStorage(storage);
  expect([...entries.keys()]).toEqual([
    "unrelated",
    "OPENAI_API_KEY",
    "xc-other-product",
  ]);
});

test("non-development initialization does not access document, storage or IndexedDB", async () => {
  expect(process.env.NODE_ENV).not.toBe("development");
  await expect(initializeDevelopmentWorkspace()).resolves.toBeUndefined();
  expect(isWorkspaceStorageKey("xc-saved-project-v1:")).toBe(true);
  expect(isWorkspaceStorageKey("xc-insight-discovery-v2-not-owned")).toBe(
    false,
  );
});
