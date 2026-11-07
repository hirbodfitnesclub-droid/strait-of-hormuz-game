"use client";

import { Anchor, Crosshair, Radar, Radio, Rocket, Ship, Target, Plane } from "lucide-react";
import type { TowerKind } from "@/lib/game";

export function fa(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits }).format(Number.isFinite(value) ? value : 0);
}
export function compact(value: number) {
  if (value >= 1_000_000) return `${fa(value / 1_000_000, 1)}M`;
  if (value >= 10_000) return `${fa(value / 1000, 1)}K`;
  return fa(Math.floor(value));
}
export function TowerGlyph({ kind, size = 22, className = "" }: { kind: TowerKind; size?: number; className?: string }) {
  const Icon = { cannon: Crosshair, heavy: Target, missile: Rocket, air: Radar, ew: Radio, boat: Ship }[kind];
  return <Icon size={size} strokeWidth={1.8} className={className} />;
}
export function TargetTypes({ targets }: { targets: string[] }) {
  return <span className="target-types" aria-label="انواع هدف">
    {targets.includes("sea") && <span title="دریایی"><Ship size={13} /></span>}
    {targets.includes("air") && <span title="هوایی"><Plane size={13} /></span>}
    {targets.includes("sub") && <span title="زیرسطحی"><Anchor size={13} /></span>}
  </span>;
}
