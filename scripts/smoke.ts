// Standalone live smoke test for the channel loop — no DB required.
// Boots the channel app + a mock /receipts sink, fires one /send per channel,
// then prints the WIRE ORDER of callbacks to prove out-of-order emission.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { app } from "../src/index.js";

const CH_PORT = 8090;
const SINK_PORT = 8091;
const received: { comm: string; type: string; t: number }[] = [];

const sink = new Hono();
sink.post("/receipts", async (c) => {
  const b = await c.req.json();
  received.push({ comm: b.comm_id, type: b.type, t: Date.now() });
  return c.json({ ok: true });
});

serve({ fetch: sink.fetch, port: SINK_PORT });
serve({ fetch: app.fetch, port: CH_PORT });

const callbackUrl = `http://localhost:${SINK_PORT}/receipts`;

async function main() {
  for (const [comm, channel] of [
    ["wa-1", "whatsapp"],
    ["sms-1", "sms"],
    ["em-1", "email"],
  ] as const) {
    await fetch(`http://localhost:${CH_PORT}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comm_id: comm, channel, recipient: "x", message: "hi", callback_url: callbackUrl }),
    });
  }
  // duplicate send — must be deduped (no second lifecycle)
  await fetch(`http://localhost:${CH_PORT}/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ comm_id: "wa-1", channel: "whatsapp", recipient: "x", message: "hi", callback_url: callbackUrl }),
  });

  await new Promise((r) => setTimeout(r, 12000));

  console.log("\n=== callbacks in WIRE order ===");
  for (const r of received) console.log(`${r.comm.padEnd(7)} ${r.type}`);

  // Report any out-of-order arrival (opened/read/clicked before delivered per comm)
  const RANK: Record<string, number> = { delivered: 2, failed: 2, opened: 3, read: 4, clicked: 5 };
  const byComm: Record<string, number[]> = {};
  let outOfOrder = 0;
  for (const r of received) {
    const arr = (byComm[r.comm] ??= []);
    const rank = RANK[r.type] ?? 0;
    if (arr.length && rank < arr[arr.length - 1]) outOfOrder++;
    arr.push(rank);
  }
  console.log(`\ntotal callbacks: ${received.length}, out-of-order arrivals: ${outOfOrder}`);
  process.exit(0);
}
main();
