import economy from "../data/reopening/economy.json";
import type { Merchant } from "../lib/game";

export function trafficFraction(remainder: number, elapsedMs: number): number {
  return Math.max(0, Math.min(1, remainder + Math.max(0, elapsedMs) / 1000));
}

export function merchantProgress(
  ship: Pick<Merchant, "kind" | "progress">,
  fraction: number,
) {
  return Math.min(
    1,
    ship.progress + fraction / economy.trade.standard_crossing_s[ship.kind],
  );
}

export function berthProgress(
  stage: "approach" | "loading" | "depart",
  position: number,
  fraction: number,
) {
  if (stage === "loading") return position;
  return stage === "approach"
    ? Math.min(1, position + fraction / economy.trade.arrival_seconds)
    : Math.max(0, position - fraction / economy.trade.departure_seconds);
}
