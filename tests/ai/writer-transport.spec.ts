import { expect, test } from "@playwright/test";
import {
  requestWriter, createWriterTransportContext, WRITER_MAX_CONCURRENT_REQUESTS,
} from "../../lib/ai/writer-transport";

const originalFetch = globalThis.fetch;
const metadata = { requestId: "transport-test", agent: "discovery", generationAttempt: 1 };
test.afterEach(() => { globalThis.fetch = originalFetch; });

test("five concurrent requests hold at most two slots through body consumption", async () => {
  let active = 0;
  let peak = 0;
  globalThis.fetch = async (_url, init) => {
    expect(new Headers(init?.headers).get("connection")).toBe("close");
    active++;
    peak = Math.max(peak, active);
    return new Response(new ReadableStream({
      start(controller) {
        setTimeout(() => {
          controller.enqueue(new TextEncoder().encode('{"ok":true}'));
          active--;
          controller.close();
        }, 20);
      },
    }), { headers: { "Content-Type": "application/json" } });
  };
  const result = await Promise.all(Array.from({ length: 5 }, () =>
    requestWriter("https://writer.test/chat", {}, createWriterTransportContext(), metadata),
  ));
  expect(result).toEqual(Array.from({ length: 5 }, () => ({ ok: true })));
  expect(peak).toBe(WRITER_MAX_CONCURRENT_REQUESTS);
  expect(active).toBe(0);
});

for (const code of ["EPIPE", "UND_ERR_SOCKET"])
  test(`recovers ${code} during a corrective generation`, async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      if (++calls === 1) throw new TypeError("fetch failed", { cause: Object.assign(new Error("closed"), { code }) });
      return Response.json({ ok: true });
    };
    await expect(requestWriter("https://writer.test/chat", {}, createWriterTransportContext(), metadata)).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
  });

test("one connection allowance is shared across initial and corrective calls", async () => {
  const context = createWriterTransportContext();
  let calls = 0;
  globalThis.fetch = async () => {
    if (++calls !== 2) throw new TypeError("fetch failed", { cause: Object.assign(new Error("closed"), { code: "EPIPE" }) });
    return Response.json({ ok: true });
  };
  await requestWriter("https://writer.test/chat", {}, context, { ...metadata, generationAttempt: 0 });
  expect(calls).toBe(2);
  await expect(requestWriter("https://writer.test/chat", {}, context, metadata)).rejects.toMatchObject({ code: "writer_connection_error" });
  expect(calls).toBe(3);
});

test("a truncated HTTP envelope can recover without changing model repair state", async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? new Response("{") : Response.json({ ok: true });
  await expect(requestWriter("https://writer.test/chat", {}, createWriterTransportContext(), metadata)).resolves.toEqual({ ok: true });
  expect(calls).toBe(2);
});

test("an expired request never reaches the network", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}); };
  await expect(requestWriter("https://writer.test/chat", {}, { deadline: Date.now() - 1, retriesRemaining: 1 }, metadata)).rejects.toMatchObject({ code: "provider_timeout" });
  expect(calls).toBe(0);
});

test("queued deadlines expire without leaking a concurrency slot", async () => {
  let unlock!: () => void;
  const gate = new Promise<void>(resolve => { unlock = resolve; });
  let calls = 0;
  globalThis.fetch = async () => { calls++; await gate; return Response.json({ ok: true }); };
  const first = requestWriter("https://writer.test/chat", {}, createWriterTransportContext(), metadata);
  const second = requestWriter("https://writer.test/chat", {}, createWriterTransportContext(), metadata);
  const queued = requestWriter("https://writer.test/chat", {}, { deadline: Date.now() + 40, retriesRemaining: 1 }, metadata);
  await expect(queued).rejects.toMatchObject({ code: "provider_timeout" });
  expect(calls).toBe(2);
  unlock();
  await Promise.all([first, second]);
  await requestWriter("https://writer.test/chat", {}, createWriterTransportContext(), metadata);
  expect(calls).toBe(3);
});
