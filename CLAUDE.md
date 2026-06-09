# brew-channel — Claude Code context

**Repo B** of the Brew Mini-CRM (Xeno take-home). A standalone **channel-simulation
service**: a separate process/deploy that simulates sending messages over whatsapp/sms/email
and fires lifecycle callbacks back to the CRM's `/api/receipts` webhook. Deploys to Render
(free). Kept separate on purpose — the brief grades how volume, ordering, retries, and
failures are handled, and a separate service with an HTTP callback is the honest way to show it.

## Stack
- Hono on Node (`@hono/node-server`), TypeScript (ESM), tsx, vitest
- No database — in-process scheduler only (durable timer store would be the scale move)

## What it does (full design — built Day 3)
- `POST /send` → 202, **dedupe on `comm_id`**, schedule a simulated lifecycle.
- Per-channel profiles (`src/profiles.ts`): delivery/open/read/click probabilities + speed.
- `src/simulate.ts`: emit stages with base delay + jitter, **deliberately out-of-order**
  (some `opened` callbacks arrive before `delivered`) to exercise the CRM ordering guard.
- `src/callback.ts`: `POST {callback_url}` with `{ event_id (uuid), comm_id, type, occurred_at }`;
  on non-2xx → exponential-backoff retry up to `CALLBACK_MAX_RETRIES`, then a channel-side dead log.
- `GET /healthz` → liveness (Vercel Cron pings every 10m to fight Render cold starts).

## Conventions
- Seeded RNG for the simulator so out-of-order tests are deterministic/stable.
- Conventional-commit messages. No AI co-author attribution in commits.

## Commands
- `pnpm dev` — watch-mode server
- `pnpm start` — run server
- `pnpm build` — typecheck (`tsc --noEmit`)
- `pnpm test` — vitest

See `Xeno-Mini-CRM-Plan.md` in the parent workspace for the full build plan.
