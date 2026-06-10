// Deliver a lifecycle callback to the CRM /receipts webhook with retry +
// exponential backoff. On non-2xx or network error, retry up to maxAttempts;
// after that, drop to a channel-side dead log (the CRM never sees it — that's
// the channel's own reliability boundary).

export interface CallbackPayload {
  event_id: string;
  comm_id: string;
  type: string;
  occurred_at: string;
}

export interface CallbackOpts {
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
  /** Injectable sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function postCallback(
  url: string,
  payload: CallbackPayload,
  opts: CallbackOpts = {},
): Promise<{ ok: boolean; attempts: number }> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const doFetch = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) return { ok: true, attempts: attempt };
      lastErr = `status ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    if (attempt < maxAttempts) {
      await sleep(baseDelayMs * Math.pow(2, attempt - 1)); // 500, 1000, 2000…
    }
  }
  // Channel-side dead log — CRM is poison-tolerant, but a totally unreachable
  // CRM is the channel's problem to record, not to spin on forever.
  console.error(
    `[dead-callback] comm=${payload.comm_id} type=${payload.type} after ${maxAttempts} attempts: ${lastErr}`,
  );
  return { ok: false, attempts: maxAttempts };
}
