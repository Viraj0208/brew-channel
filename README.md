# brew-channel

**Repo B** of [Brew](https://github.com/Viraj0208/brew-crm) — a standalone
channel-simulation service. It simulates sending over whatsapp/sms/email and
fires lifecycle callbacks (delivered / failed / opened / read / clicked) back to
the CRM's `/api/receipts` webhook — **deliberately out-of-order, with retries** —
so the CRM's idempotent, ordering-tolerant ingestion is exercised for real.

- **Live:** https://brew-channel.onrender.com
- Kept a separate deploy on purpose: the brief grades how volume, ordering,
  retries, and failures are handled. An HTTP callback across a process boundary is
  the honest way to show it (the CRM can't share memory with the channel).

## How it works
- `POST /send` — `{ comm_id, recipient, message, channel, callback_url }` → **202**.
  Dedupes on `comm_id` (channel-side idempotency), then schedules a simulated
  lifecycle. Shared-secret guarded (`x-worker-secret` = the CRM's `WORKER_SECRET`).
- **Profiles** (`src/profiles.ts`) — per-channel deliver/open/read/click
  probabilities + speeds (WhatsApp fast/high-engagement, SMS near-certain delivery
  no read receipt, Email slow/lower engagement).
- **Simulation** (`src/simulate.ts`) — walks the profile rolling each probability;
  adds jitter to each stage's emit time and **sorts by the jittered time**, so a
  later stage (`opened`) can emit before an earlier one (`delivered`). This drives
  the CRM's ordering test. Pure given an injected RNG → deterministic unit tests.
- **Callbacks** (`src/callback.ts`) — `POST {callback_url}` with
  `{ event_id, comm_id, type, occurred_at }`; non-2xx → exponential-backoff retry
  up to `CALLBACK_MAX_RETRIES`, then a channel-side dead log.
- `GET /healthz` — liveness.

## Stack
Hono on Node (`@hono/node-server`) · TypeScript (ESM) · tsx · vitest. **No
database** — in-process scheduler (a durable timer store would be the scale move).

## Quickstart
```bash
pnpm install
pnpm test                   # 10 tests: lifecycle planning, out-of-order emission, callback retry
WORKER_SECRET=dev pnpm dev  # watch-mode server on :8080
# self-contained loop smoke (no DB, no CRM): boots channel + a mock sink
npx tsx scripts/smoke.ts
```

## Deploy (Render, free)
`render.yaml` is a one-click blueprint: Render → New → Blueprint → connect this
repo. Build `pnpm install --prod=false`, start `pnpm start`, health `/healthz`.
Set `WORKER_SECRET` equal to the CRM's. (Do **not** run `corepack enable` on
Render — its `/usr/bin` is read-only.)

## Scripts
| Command | Purpose |
|---|---|
| `pnpm dev` | watch-mode server |
| `pnpm start` | run server |
| `pnpm build` | typecheck (`tsc --noEmit`) |
| `pnpm test` | vitest |
