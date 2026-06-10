import { describe, it, expect, vi } from "vitest";
import { postCallback } from "./callback";

const payload = {
  event_id: "e1",
  comm_id: "c1",
  type: "delivered",
  occurred_at: "2026-06-10T00:00:00Z",
};
const noSleep = () => Promise.resolve();

describe("postCallback", () => {
  it("succeeds on the first 2xx", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));
    const r = await postCallback("http://crm/receipts", payload, { fetchFn, sleep: noSleep });
    expect(r).toEqual({ ok: true, attempts: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx then succeeds", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const r = await postCallback("http://crm/receipts", payload, { fetchFn, sleep: noSleep });
    expect(r).toEqual({ ok: true, attempts: 2 });
  });

  it("gives up after maxAttempts on persistent failure", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 500 }));
    const r = await postCallback("http://crm/receipts", payload, {
      fetchFn,
      sleep: noSleep,
      maxAttempts: 3,
    });
    expect(r).toEqual({ ok: false, attempts: 3 });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("retries on a thrown network error", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const r = await postCallback("http://crm/receipts", payload, { fetchFn, sleep: noSleep });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(2);
  });
});
