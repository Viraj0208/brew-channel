// Per-channel delivery profiles (§5.2). Probabilities + base delays drive the
// simulated lifecycle. Delays are ms from accept; jitter is added at emit time.

export type Channel = "whatsapp" | "sms" | "email";
export type EventType = "delivered" | "failed" | "opened" | "read" | "clicked";

export interface Stage {
  type: Exclude<EventType, "failed">;
  /** Probability of reaching this stage GIVEN the previous stage was reached. */
  p: number;
  /** Base offset from accept time, ms. Strictly increasing within a profile. */
  delayMs: number;
}

export interface Profile {
  stages: Stage[];
}

export const PROFILES: Record<Channel, Profile> = {
  // WhatsApp: high engagement, fast.
  whatsapp: {
    stages: [
      { type: "delivered", p: 0.97, delayMs: 400 },
      { type: "opened", p: 0.85, delayMs: 1500 },
      { type: "read", p: 0.7, delayMs: 2600 },
      { type: "clicked", p: 0.25, delayMs: 4200 },
    ],
  },
  // SMS: near-certain delivery, no "read" receipt, medium speed.
  sms: {
    stages: [
      { type: "delivered", p: 0.99, delayMs: 800 },
      { type: "opened", p: 0.4, delayMs: 3000 },
      { type: "clicked", p: 0.1, delayMs: 6000 },
    ],
  },
  // Email: slower, lower engagement.
  email: {
    stages: [
      { type: "delivered", p: 0.95, delayMs: 1500 },
      { type: "opened", p: 0.35, delayMs: 5000 },
      { type: "read", p: 0.25, delayMs: 7000 },
      { type: "clicked", p: 0.08, delayMs: 9000 },
    ],
  },
};
