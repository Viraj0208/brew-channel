# brew-channel

**Repo B** of the Brew Mini-CRM. A standalone channel-simulation service: it simulates
sending messages over whatsapp/sms/email and fires lifecycle callbacks (delivered / failed /
opened / read / clicked) back to the CRM's `/api/receipts` webhook — deliberately out-of-order,
with retries — so the CRM's idempotent, ordering-tolerant ingestion can be demonstrated.

Kept as a separate service/deploy on purpose: the brief grades how volume, ordering, retries,
and failures are handled.

## Stack
Hono on Node · TypeScript (ESM) · tsx · vitest. No database (in-process scheduler).

## Quickstart
```bash
pnpm install
cp .env.example .env        # set CRM_RECEIPTS_URL
pnpm dev                    # watch-mode server on :8080
```

## Endpoints
- `GET /healthz` — liveness
- `POST /send` — `{ comm_id, recipient, message, channel, callback_url }` → 202; schedules a
  simulated lifecycle (full behaviour built Day 3).

## Scripts
| Command | Purpose |
|---|---|
| `pnpm dev` | watch-mode server |
| `pnpm start` | run server |
| `pnpm build` | typecheck (`tsc --noEmit`) |
| `pnpm test` | vitest |
