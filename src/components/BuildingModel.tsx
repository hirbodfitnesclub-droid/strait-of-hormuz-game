"use client";

import type { CSSProperties } from "react";
import type { BuildingId } from "@/lib/game";

type Props = { id: BuildingId; level: number; compact?: boolean };
const attachments: Record<BuildingId, string> = { oil: "tank", tank: "oil", dock: "tank", refinery: "tank", steel: "power", arms: "radar", power: "water", water: "tank", city: "power", welfare: "city", optical: "radar" };
export function buildingTier(level: number) { return level >= 100 ? 5 : level >= 50 ? 4 : level >= 25 ? 3 : level >= 10 ? 2 : 1; }
export default function BuildingModel({ id, level, compact = false }: Props) {
  const tier = buildingTier(level);
  const growth = Math.min(1.18, .73 + Math.log2(level + 1) * .068);
  const progress = level >= 100 ? 10 : (level - 1) % 10 + 1;
  return <div className={`building-model model-${id} evolution-${tier} ${compact ? "model-compact" : ""}`} data-building={id} data-level={level} data-evolution={tier} style={{ "--building-growth": growth, "--evolution-progress": `${progress * 10}%` } as CSSProperties} aria-hidden="true">
    <span className="building-shadow" />
    {tier >= 2 && <img className="building-addon" src={`/assets/buildings/${attachments[id]}.png`} alt="" draggable={false} />}
    <img key={`${id}-${level}`} className="building-main-sprite" src={`/assets/buildings/${id}.png`} alt="" draggable={false} />
    {tier >= 3 && <span className="building-extra-lights"><i /><i /><i /></span>}
    {tier >= 4 && <span className="building-hightech"><i /><i /><i /><i /></span>}
    {tier >= 5 && <span className="building-future-ring" />}
    {(id === "refinery" || id === "steel" || id === "power" || id === "oil") && <span className="building-flare" />}
    <span className="building-level-progress"><i /></span>
  </div>;
}
