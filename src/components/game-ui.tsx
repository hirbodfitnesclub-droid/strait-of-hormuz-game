"use client";

import { Anchor, Crosshair, Radar, Radio, Rocket, Ship, Target, Plane } from "lucide-react";
import { towerSellRefund, TOWERS, type GameState, type Tower, type TowerKind } from "@/lib/game";

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

/** Target icons for the radial build cards (PRD §۸٫۲ / checklist §۱۴):
 *  🚢 surface, ✈️ air, ⚓ subsurface. */
export const TARGET_EMOJI: Record<string, string> = { sea: "🚢", air: "✈️", sub: "⚓" };
export function TargetEmojis({ targets }: { targets: string[] }) {
  return <span className="target-emojis" aria-label="انواع هدف">{targets.map(t => <span key={t} title={t === "sea" ? "دریایی" : t === "air" ? "هوایی" : "زیرسطحی"}>{TARGET_EMOJI[t]}</span>)}</span>;
}

/** UI and reducer share the refund quote, including upgrade investment. */
export const sellRefund = towerSellRefund;

/** Stability components, mirroring the five-part formula in getStats
 *  (game.ts, ruling R8): infrastructure 40 + city 30 + welfare 20 +
 *  security 30 + welfare-research bonuses 10, capped at 100. The five
 *  rows always show their RAW formula values; when the raw total passes
 *  the 100 cap, an explicit "سقف پایداری" row carries the negative
 *  difference so the rows sum exactly to the capped stats.stability the
 *  header shows (QA-UI round 1: at max state the rows summed to 130
 *  against a displayed 100). Under the cap there is no extra row. */
export function stabilityBreakdown(game: GameState, stats: { powerProduced: number; powerUsed: number; waterProduced: number; waterUsed: number }) {
  const infra = 40 * Math.min(1, stats.powerProduced / Math.max(1, stats.powerUsed), stats.waterProduced / Math.max(1, stats.waterUsed));
  const city = 30 * Math.min(1, (game.buildings.city ?? 0) / 2);
  const welfare = Math.min(20, (game.buildings.welfare ?? 0) * 4);
  const security = 30 * game.security / 100;
  const research = (game.research.includes("housing") ? 5 : 0) + (game.research.includes("stability") ? 5 : 0);
  const rows = [
    { label: "زیرساخت برق و آب", value: infra, max: 40 },
    { label: "شهر و سکونت", value: city, max: 30 },
    { label: "رفاه شهری", value: welfare, max: 20 },
    { label: "امنیت آبراه", value: security, max: 30 },
    { label: "پژوهش‌های رفاهی", value: research, max: 10 },
  ];
  const rawTotal = rows.reduce((sum, row) => sum + row.value, 0);
  if (rawTotal > 100.001) rows.push({ label: "سقف پایداری", value: 100 - rawTotal, max: 100 });
  return rows;
}
