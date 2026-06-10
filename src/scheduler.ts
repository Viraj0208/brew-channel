// In-process timer scheduler: turns a planned lifecycle into setTimeout'd
// callback posts. Separate from index.ts so tests can drive it with fake
// timers + injected deps without booting the HTTP server.

import { randomUUID } from "node:crypto";
import { planForChannel, emissionSchedule, type Rng } from "./simulate";
import { postCallback } from "./callback";
import type { Channel } from "./profiles";

// Validated: Number("") is 0 and Number("abc") is NaN — either would make the
// retry loop fire zero times or never terminate.
export const CALLBACK_MAX_RETRIES = (() => {
  const n = Number(process.env.CALLBACK_MAX_RETRIES ?? 4);
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : 4;
})();

/** Injectable deps so tests can drive the scheduler deterministically. */
export interface LifecycleDeps {
  rng?: Rng;
  post?: typeof postCallback;
  maxAttempts?: number;
}

export function scheduleLifecycle(
  commId: string,
  channel: Channel,
  callbackUrl: string,
  deps: LifecycleDeps = {},
): void {
  const rng = deps.rng ?? Math.random;
  const post = deps.post ?? postCallback;
  const maxAttempts = deps.maxAttempts ?? CALLBACK_MAX_RETRIES;
  const plan = planForChannel(channel, rng);
  const schedule = emissionSchedule(plan, rng);

  for (const ev of schedule) {
    setTimeout(() => {
      void post(
        callbackUrl,
        {
          event_id: randomUUID(),
          comm_id: commId,
          type: ev.type,
          occurred_at: new Date().toISOString(),
        },
        { maxAttempts, secret: process.env.WORKER_SECRET },
      );
    }, Math.round(ev.emitAtMs));
  }
}
