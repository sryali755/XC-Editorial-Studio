import { expect, test } from "@playwright/test";
import { emptyStudio, studioStorageKey } from "../../lib/discovery-studio";
import { compactStringify } from "../../lib/discovery-persistence";
import { developmentServerEpochKey } from "../../lib/development-clean-start";

test("local server restart clears XC history while a same-run refresh restores work", async ({
  page,
}) => {
  const aiCalls: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/ai/agent"))
      aiCalls.push(request.url());
  });
  await page.goto("/");
  const brief = page.getByRole("textbox", { name: "IMC output brief" });
  await expect(brief).toHaveValue("");
  expect(
    await page.evaluate(
      (key) => sessionStorage.getItem(key),
      developmentServerEpochKey,
    ),
  ).toBeTruthy();

  const session = emptyStudio();
  session.preparation.upstreamDraft = "Source brief that must survive refresh.";
  await page.evaluate(
    async ({ key, raw }) => {
      sessionStorage.setItem(key, raw);
      localStorage.setItem("xc-saved-project-v1:test", "old saved project");
      localStorage.setItem("unrelated-preference", "keep");
      await new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("xc-insight-workspace", 1);
        opening.onupgradeneeded = () =>
          opening.result.createObjectStore("entries", { keyPath: "key" });
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const transaction = database.transaction("entries", "readwrite");
          transaction.objectStore("entries").put({ key, raw });
          transaction.objectStore("entries").put({
            key: "unrelated-entry",
            raw: "keep",
          });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    },
    { key: studioStorageKey, raw: compactStringify(session) },
  );
  await page.reload();
  await expect(brief).toHaveValue(session.preparation.upstreamDraft);

  await page.evaluate((key) => {
    sessionStorage.setItem(key, "previous-server-run");
    localStorage.setItem(key, "previous-server-run");
  }, developmentServerEpochKey);
  await page.reload();
  await expect(brief).toHaveValue("");
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), studioStorageKey),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("xc-saved-project-v1:test")),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("unrelated-preference")),
  ).toBe("keep");
  const indexed = await page.evaluate(async (key) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open("xc-insight-workspace", 1);
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      return await new Promise<{ workspace: unknown; unrelated: unknown }>(
        (resolve, reject) => {
          const transaction = database.transaction("entries", "readonly");
          const entries = transaction.objectStore("entries");
          const workspace = entries.get(key);
          const unrelated = entries.get("unrelated-entry");
          transaction.oncomplete = () =>
            resolve({
              workspace: workspace.result,
              unrelated: unrelated.result,
            });
          transaction.onerror = () => reject(transaction.error);
        },
      );
    } finally {
      database.close();
    }
  }, studioStorageKey);
  expect(indexed.workspace).toBeUndefined();
  expect(indexed.unrelated).toEqual({ key: "unrelated-entry", raw: "keep" });
  expect(aiCalls).toEqual([]);
});
