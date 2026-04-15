import { EventType, ProctorEvent } from "@anticheat/shared-types";

const penaltyMap: Record<EventType, number> = {
  no_face: 1.4,
  multi_face: 2.0,
  suspicious_head_motion: 1.2,
  window_focus_lost: 0.8,
  context_switch_attempt: 1.0,
  screen_share_interrupted: 1.5
};

const cooldownMs = 15000;

export const computeHonestyScore = (events: ProctorEvent[]): number => {
  let score = 10;
  const lastAppliedByType = new Map<EventType, number>();

  const sortedEvents = [...events].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );

  for (const event of sortedEvents) {
    const ts = Date.parse(event.timestamp);
    const prevTs = lastAppliedByType.get(event.eventType) ?? 0;
    if (ts - prevTs < cooldownMs) {
      continue;
    }
    score -= penaltyMap[event.eventType];
    lastAppliedByType.set(event.eventType, ts);
  }

  return Math.max(0, Math.min(10, Number(score.toFixed(1))));
};

export const getRiskBand = (score: number): "low" | "medium" | "high" => {
  if (score >= 8) {
    return "low";
  }
  if (score >= 5) {
    return "medium";
  }
  return "high";
};

interface HeadSample {
  timestamp: number;
  yaw: number;
}

export class HeadMotionTracker {
  private readonly buffer: HeadSample[] = [];

  addSample(yaw: number, timestamp = Date.now()): void {
    this.buffer.push({ yaw, timestamp });
    this.dropOld(timestamp);
  }

  isSuspicious(windowMs = 60000): boolean {
    if (this.buffer.length < 10) {
      return false;
    }

    const recent = this.buffer.filter((x) => x.timestamp >= Date.now() - windowMs);
    if (recent.length < 10) {
      return false;
    }

    let flips = 0;
    for (let i = 1; i < recent.length; i += 1) {
      const prev = recent[i - 1];
      const curr = recent[i];
      if ((prev.yaw <= -15 && curr.yaw >= 15) || (prev.yaw >= 15 && curr.yaw <= -15)) {
        flips += 1;
      }
    }
    return flips >= 12;
  }

  private dropOld(now: number): void {
    const keepAfter = now - 120000;
    while (this.buffer.length > 0 && this.buffer[0].timestamp < keepAfter) {
      this.buffer.shift();
    }
  }
}
