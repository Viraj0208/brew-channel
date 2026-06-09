import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/healthz", (c) => c.json({ status: "ok", service: "brew-channel" }));

// POST /send — accept a comm to deliver. Day 1: stub that 202-accepts.
// Day 3 wires the simulated per-channel lifecycle + out-of-order callbacks.
app.post("/send", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.comm_id !== "string") {
    return c.json({ error: "comm_id required" }, 400);
  }
  // TODO(day3): dedupe on comm_id, schedule simulated lifecycle, emit callbacks.
  return c.json({ accepted: true, comm_id: body.comm_id }, 202);
});

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`brew-channel listening on :${info.port}`);
});

export { app };
