import { describe, it, expect } from "vitest";
import { planLifecycle, emissionSchedule, type PlannedEvent } from "./simulate";
import { PROFILES } from "./profiles";

// Deterministic RNG: replay a fixed sequence of rolls.
function seq(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("planLifecycle", () => {
  it("emits only `failed` when delivery roll misses", () => {
    // first roll above delivered.p (0.97) → delivery fails
    const events = planLifecycle(PROFILES.whatsapp, seq([0.99]));
    expect(events).toEqual([{ type: "failed", offsetMs: 400 }]);
  });

  it("walks the full path when every roll passes", () => {
    const events = planLifecycle(PROFILES.whatsapp, seq([0]));
    expect(events.map((e) => e.type)).toEqual(["delivered", "opened", "read", "clicked"]);
  });

  it("stops mid-funnel when an engagement roll misses", () => {
    // delivered passes (0), opened passes (0), read misses (0.99) → stop at opened
    const events = planLifecycle(PROFILES.whatsapp, seq([0, 0, 0.99]));
    expect(events.map((e) => e.type)).toEqual(["delivered", "opened"]);
  });

  it("never emits failed after a successful delivery", () => {
    const events = planLifecycle(PROFILES.email, seq([0, 0.99]));
    expect(events.map((e) => e.type)).toEqual(["delivered"]);
    expect(events.some((e) => e.type === "failed")).toBe(false);
  });
});

describe("emissionSchedule", () => {
  it("can place a later stage before an earlier one (out-of-order)", () => {
    const events: PlannedEvent[] = [
      { type: "delivered", offsetMs: 400 },
      { type: "opened", offsetMs: 1500 },
    ];
    // Large jitter, rolls chosen so delivered gets +max and opened gets -max:
    // delivered → 400 + (1-0.5)*4000 = 2400; opened → 1500 + (0-0.5)*4000 = -500→0
    const sched = emissionSchedule(events, seq([1, 0]), 4000);
    expect(sched[0].type).toBe("opened");
    expect(sched[1].type).toBe("delivered");
  });

  it("returns ascending emit times and never negative", () => {
    const events: PlannedEvent[] = [
      { type: "delivered", offsetMs: 400 },
      { type: "opened", offsetMs: 1500 },
      { type: "clicked", offsetMs: 4200 },
    ];
    const sched = emissionSchedule(events, seq([0.5, 0.5, 0.5]), 1200);
    for (let i = 1; i < sched.length; i++) {
      expect(sched[i].emitAtMs).toBeGreaterThanOrEqual(sched[i - 1].emitAtMs);
    }
    expect(sched.every((s) => s.emitAtMs >= 0)).toBe(true);
  });
});
