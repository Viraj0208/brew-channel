import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleLifecycle } from "./scheduler";
import type { CallbackPayload, CallbackOpts } from "./callback";

/** Deterministic RNG: mulberry32, same generator the CRM seed uses. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("scheduleLifecycle (timer wiring)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function run(seed: number) {
    const posts: { payload: CallbackPayload; at: number; opts?: CallbackOpts }[] = [];
    const start = Date.now();
    const post = (
      _url: string,
      payload: CallbackPayload,
      opts?: CallbackOpts,
    ): Promise<{ ok: boolean; attempts: number }> => {
      posts.push({ payload, at: Date.now() - start, opts });
      return Promise.resolve({ ok: true, attempts: 1 });
    };
    scheduleLifecycle("comm-1", "whatsapp", "http://crm/api/receipts", {
      rng: mulberry32(seed),
      post: post as never,
      maxAttempts: 3,
    });
    return posts;
  }

  it("registers one timer per planned event and fires them with the right payload", () => {
    const posts = run(42);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    vi.runAllTimers();
    expect(posts.length).toBeGreaterThan(0);
    for (const p of posts) {
      expect(p.payload.comm_id).toBe("comm-1");
      expect(p.payload.event_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(["delivered", "failed", "opened", "read", "clicked"]).toContain(p.payload.type);
      expect(p.opts?.maxAttempts).toBe(3);
    }
  });

  it("is deterministic given the same seed", () => {
    const a = run(7);
    vi.runAllTimers();
    const typesA = a.map((p) => p.payload.type);

    vi.useFakeTimers();
    const b = run(7);
    vi.runAllTimers();
    const typesB = b.map((p) => p.payload.type);

    expect(typesA).toEqual(typesB);
  });

  it("a seed that inverts emits a lifecycle stage before its predecessor", () => {
    // Sweep seeds for one where the jittered schedule fires e.g. opened before
    // delivered — proving the wire order really can invert end-to-end.
    const RANK: Record<string, number> = { delivered: 2, failed: 2, opened: 3, read: 4, clicked: 5 };
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      vi.useFakeTimers();
      const posts = run(seed);
      vi.runAllTimers();
      let maxRank = 0;
      for (const p of posts) {
        const r = RANK[p.payload.type] ?? 0;
        if (r < maxRank) found = true;
        maxRank = Math.max(maxRank, r);
      }
    }
    expect(found).toBe(true);
  });
});
