"use client";

import type { CSSProperties } from "react";
import type { TowerKind } from "@/lib/game";

type Props = { kind: TowerKind; tier: number; branch?: number | null; angle?: number; firing?: boolean; preview?: boolean };
export function towerModelUrl(kind: TowerKind, tier: number, branch: number | null = null) {
  const variant = tier >= 4 ? branch === 1 ? "b" : "a" : String(Math.max(1, Math.min(3, tier)));
  return `/assets/models/towers/${kind}-${variant}.png`;
}
export default function TowerModel({ kind, tier, branch = null, angle = -35, firing = false, preview = false }: Props) {
  const level = Math.max(1, Math.min(4, tier)), special = level === 4;
  const facing = !preview && Math.cos(angle * Math.PI / 180) < 0 ? -1 : 1;
  return <div className={`tower-asset asset-${kind} level-${level} ${special ? `special branch-${branch ?? 0}` : ""} ${firing ? "firing" : ""} ${preview ? "preview-model" : ""}`} data-tower-kind={kind} data-tier={level} data-branch={branch ?? "basic"} data-model={towerModelUrl(kind, level, branch)} aria-hidden="true" style={{ "--tower-facing": facing } as CSSProperties}>
    <span className="tower-ground-shadow" />
    <img key={`${kind}-${level}-${branch}`} className="tower-real-sprite" src={towerModelUrl(kind, level, branch)} alt="" draggable={false} />
    {firing && <span className="turret-muzzle-flash" />}
    {special && <span className="tower-special-glint" />}
    {kind === "boat" && <span className="tower-patrol-fleet"><i /><i /><i />{special && branch === 0 && <><i /><i /></>}</span>}
    {(kind === "air" || kind === "ew") && <span className="tower-radar-pulse" />}
  </div>;
}
