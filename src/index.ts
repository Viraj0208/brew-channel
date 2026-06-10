import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { scheduleLifecycle } from "./scheduler";
import type { Channel } from "./profiles";

const app = new Hono();

// Channel-side idempotency: a comm_id is simulated at most once. The CRM uses
// communication_id as the natural idempotency key, so a worker retry of an
// already-accepted send must not start a second lifecycle.
//
// Bounded: Set iteration order is insertion order, so evicting the first entry
// is FIFO. At this scope the cap is never hit; a real channel would use a
// TTL'd store (Redis SETEX) — dedupe only needs to outlive the worker's retry
// window, not all of history.
const MAX_SEEN = 50_000;
const seen = new Set<string>();
function rememberComm(commId: string): void {
  if (seen.size >= MAX_SEEN) {
    const oldest = seen.values().next().value;
    if (oldest !== undefined) seen.delete(oldest);
  }
  seen.add(commId);
}

const CHANNELS: Channel[] = ["whatsapp", "sms", "email"];

app.get("/healthz", (c) => c.json({ status: "ok", service: "brew-channel" }));

/**
 * POST /send — accept a comm, dedupe on comm_id, schedule a simulated lifecycle
 * whose callbacks fire (deliberately out-of-order) at the CRM callback_url.
 * Returns 202 immediately. Shared-secret guarded when WORKER_SECRET is set.
 */
app.post("/send", async (c) => {
  const secret = process.env.WORKER_SECRET;
  if (secret && c.req.header("x-worker-secret") !== secret) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const commId = body?.comm_id;
  const channel = body?.channel;
  const callbackUrl = body?.callback_url;

  if (
    typeof commId !== "string" ||
    typeof callbackUrl !== "string" ||
    !CHANNELS.includes(channel)
  ) {
    return c.json({ error: "comm_id, channel, callback_url required" }, 400);
  }

  if (seen.has(commId)) {
    return c.json({ accepted: true, comm_id: commId, duplicate: true }, 202);
  }
  rememberComm(commId);

  scheduleLifecycle(commId, channel, callbackUrl);
  return c.json({ accepted: true, comm_id: commId }, 202);
});

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`brew-channel listening on :${info.port}`);
});

export { app };
