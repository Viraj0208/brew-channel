import { PROFILES, type Channel, type EventType, type Profile } from "./profiles";

export interface PlannedEvent {
  type: EventType;
  /** Base offset from accept, ms (before jitter / reordering). */
  offsetMs: number;
}

/** Injectable RNG so tests are deterministic. Returns [0,1). */
export type Rng = () => number;

/**
 * Walk a profile's stages, rolling each probability. Stops at the first stage
 * not reached. If delivery itself fails (stage 0), emit a single `failed`.
 * Pure given `rng`.
 */
export function planLifecycle(profile: Profile, rng: Rng): PlannedEvent[] {
  const out: PlannedEvent[] = [];
  for (let i = 0; i < profile.stages.length; i++) {
    const s = profile.stages[i];
    if (rng() <= s.p) {
      out.push({ type: s.type, offsetMs: s.delayMs });
    } else {
      if (i === 0) out.push({ type: "failed", offsetMs: s.delayMs });
      break; // engagement dropped off — no further stages
    }
  }
  return out;
}

export function planForChannel(channel: Channel, rng: Rng): PlannedEvent[] {
  return planLifecycle(PROFILES[channel], rng);
}

/**
 * Compute the wire emission order. Adds jitter to each event's offset, then
 * sorts by the jittered time — because jitter can exceed the gap between
 * adjacent stages, a later stage (e.g. opened) sometimes emits BEFORE an earlier
 * one (delivered). This is the deliberate out-of-order behaviour the CRM state
 * machine must tolerate. Pure given `rng`. Returns events with absolute emit
 * delays, ascending.
 *
 * Default jitter is ±2000ms — deliberately wider than every adjacent stage gap
 * in profiles.ts (whatsapp 1100ms, sms 2200–3000ms, email 2000–3500ms) so
 * inversions actually occur on every channel (~26% per adjacent whatsapp pair,
 * ~10% sms, ~1–12% email). At the old ±600ms only whatsapp could ever invert.
 */
export function emissionSchedule(
  events: PlannedEvent[],
  rng: Rng,
  jitterMs = 4000,
): { type: EventType; emitAtMs: number }[] {
  return events
    .map((e) => ({
      type: e.type,
      // jitter in [-jitterMs/2, +jitterMs/2], clamped to >= 0
      emitAtMs: Math.max(0, e.offsetMs + (rng() - 0.5) * jitterMs),
    }))
    .sort((a, b) => a.emitAtMs - b.emitAtMs);
}
